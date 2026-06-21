import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClientsService } from '../../clients/services/clients.service';
import { ProductsService } from '../../products/services/products.service';
import { CategoriesService } from '../../categories/services/categories.service';
import { StockOperation } from '../../products/dto/product.dto';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { RealtimeEventService } from '../../websocket/realtime-event.service';
import { UserRole } from '../../../common/enums';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  QueryTransactionsDto,
  CalculateTransactionDto,
  TransactionType,
} from '../dto/transaction.dto';
import { extractDeviceInfo } from '../../system-activity-logs/utils/device-extractor.util';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly systemActivityLogService: SystemActivityLogService,
    private readonly realtimeEventService: RealtimeEventService,
  ) {}

  private readonly transactionInclude = {
    items: true,
    extraCharges: true,
    clientRef: { select: { id: true, name: true, phone: true, balance: true } },
    userRef: { select: { id: true, name: true, role: true } },
    branchRef: { select: { id: true, name: true } },
  };

  private transformTransaction(t: any) {
    if (!t) return t;
    const { clientRef, userRef, branchRef, walkInClientName, walkInClientPhone, walkInClientAddress, ...rest } = t;
    return {
      ...rest,
      _id: t.id,
      clientId: clientRef ? { _id: clientRef.id, ...clientRef } : t.clientId,
      userId: userRef ? { _id: userRef.id, ...userRef } : t.userId,
      branchId: branchRef ? { _id: branchRef.id, ...branchRef } : t.branchId,
      walkInClient: walkInClientName
        ? { name: walkInClientName, phone: walkInClientPhone, address: walkInClientAddress }
        : undefined,
    };
  }

  async generateInvoiceNumber(date?: Date): Promise<string> {
    const useDate = date ? new Date(date) : new Date();
    const year = useDate.getFullYear().toString().slice(-2);
    const month = (useDate.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `INV${year}${month}`;

    const result = await this.prisma.$queryRaw<Array<{ value: number }>>`
      INSERT INTO "Counter" (name, value) VALUES (${prefix}, 1)
      ON CONFLICT (name) DO UPDATE SET value = "Counter".value + 1
      RETURNING value
    `;

    const seq = Number(result[0].value);
    return `${prefix}${seq.toString().padStart(4, '0')}`;
  }

  async generateWaybillNumber(): Promise<string> {
    const date = new Date();
    const prefix = `WB${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;

    const result = await this.prisma.$queryRaw<Array<{ value: number }>>`
      INSERT INTO "Counter" (name, value) VALUES (${prefix}, 1)
      ON CONFLICT (name) DO UPDATE SET value = "Counter".value + 1
      RETURNING value
    `;

    const seq = Number(result[0].value);
    return `${prefix}-${seq.toString().padStart(4, '0')}`;
  }

  async create(
    createTransactionDto: CreateTransactionDto,
    user: { userId: string; role: string; email?: string; name?: string; branch?: string; branchId?: string },
    userAgent: string,
  ): Promise<any> {
    if (createTransactionDto.type === 'RETURN') {
      return this.createReturnTransaction(createTransactionDto, user, userAgent);
    }
    if (createTransactionDto.type === 'WHOLESALE') {
      return this.createWholesaleTransaction(createTransactionDto, user, userAgent);
    }
    if ((createTransactionDto.type as any) === 'PICKUP') {
      throw new BadRequestException(
        'PICKUP transaction type is deprecated and can no longer be created. Please use PURCHASE instead.',
      );
    }

    let clientId: string | undefined;
    let walkInClientName: string | undefined;
    let walkInClientPhone: string | undefined;
    let walkInClientAddress: string | undefined;

    if (createTransactionDto.clientId) {
      const client = await this.clientsService.findById(createTransactionDto.clientId);
      if (!client.isActive) {
        throw new BadRequestException(
          `Transaction blocked: Client "${client.name}" is currently suspended. Please contact admin to reactivate this client.`,
        );
      }
      clientId = client.id;
    } else if (createTransactionDto.walkInClient?.name) {
      walkInClientName = createTransactionDto.walkInClient.name;
      walkInClientPhone = createTransactionDto.walkInClient.phone;
      walkInClientAddress = createTransactionDto.walkInClient.address;
    } else {
      throw new BadRequestException('Either clientId or walkInClient details (name) must be provided');
    }

    const loadingCharge = createTransactionDto.loading || 0;
    const loadingAndOffloadingCharge = createTransactionDto.loadingAndOffloading || 0;
    if (loadingCharge > 0 && loadingAndOffloadingCharge > 0) {
      throw new BadRequestException(
        'Cannot have both "loading" and "loadingAndOffloading" charges in the same transaction. Please use only one.',
      );
    }

    if (createTransactionDto.type === 'DEPOSIT') {
      const transportFare = createTransactionDto.transportFare || 0;
      const hasExtraCharges = (createTransactionDto.extraCharges || []).length > 0;
      if (transportFare > 0 || loadingCharge > 0 || loadingAndOffloadingCharge > 0 || hasExtraCharges) {
        throw new BadRequestException(
          'Transport fare, loading, loadingAndOffloading, and extra charges cannot be applied to DEPOSIT transactions.',
        );
      }
    }

    let subtotal = 0;
    let processedItems: any[] = [];

    if (createTransactionDto.type === 'DEPOSIT') {
      if (!createTransactionDto.amountPaid || createTransactionDto.amountPaid <= 0) {
        throw new BadRequestException('Deposit amount must be greater than 0');
      }
      subtotal = createTransactionDto.amountPaid;
      processedItems = [];
    } else {
      if (!createTransactionDto.items || createTransactionDto.items.length === 0) {
        throw new BadRequestException('Items are required for PURCHASE transactions');
      }
      processedItems = await Promise.all(
        createTransactionDto.items.map(async (item) => {
          const product = await this.productsService.findById(item.productId);
          if (item.unit !== product.unit) {
            throw new BadRequestException(
              `Invalid unit ${item.unit} for product ${product.name}. This product only accepts ${product.unit}`,
            );
          }
          if (product.stock < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for ${product.name}. Available: ${product.stock} ${product.unit}`,
            );
          }
          const effectiveUnitPrice = item.unitPrice && item.unitPrice > 0 ? item.unitPrice : product.unitPrice;
          const price = effectiveUnitPrice * item.quantity;
          const itemSubtotal = price - (item.discount || 0);
          subtotal += itemSubtotal;
          return {
            productId: product.id || product._id,
            productName: product.name,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: effectiveUnitPrice,
            discount: item.discount || 0,
            subtotal: itemSubtotal,
          };
        }),
      );
    }

    const discount = createTransactionDto.discount || 0;
    const transportFare = createTransactionDto.transportFare || 0;
    const loadingAndOffloading = createTransactionDto.loadingAndOffloading || 0;
    const loading = createTransactionDto.loading || 0;
    const extraCharges = createTransactionDto.extraCharges || [];
    const extraChargesTotal = extraCharges.reduce((sum, c) => sum + (c.amount || 0), 0);
    const total = subtotal - discount + transportFare + loadingAndOffloading + loading + extraChargesTotal;
    const amountPaid = createTransactionDto.amountPaid || 0;

    if (!clientId) {
      if (createTransactionDto.type === 'DEPOSIT') {
        throw new BadRequestException('Deposit transactions are only allowed for registered clients.');
      }
      if (amountPaid < total) {
        throw new BadRequestException(
          `Insufficient payment for walk-in client. Required: ${total}, Provided: ${amountPaid}. Walk-in clients must pay the full amount upfront.`,
        );
      }
      if (amountPaid > total) {
        throw new BadRequestException(
          `Amount provided is more than the required payment for this transaction. Required: ${total}, Provided: ${amountPaid}.`,
        );
      }
    }

    const accountingDate = createTransactionDto.date ? new Date(createTransactionDto.date) : new Date();

    let waybillNumber: string | undefined;
    if (createTransactionDto.type === 'PURCHASE') {
      if (createTransactionDto.waybillNumber) {
        const existing = await this.prisma.transaction.findFirst({
          where: { waybillNumber: createTransactionDto.waybillNumber },
        });
        if (existing) {
          throw new ConflictException(`Waybill number "${createTransactionDto.waybillNumber}" is already in use`);
        }
        waybillNumber = createTransactionDto.waybillNumber;
      } else {
        waybillNumber = await this.generateWaybillNumber();
      }
    }

    const invoiceNumber = await this.generateInvoiceNumber(accountingDate);

    let newBalance = 0;
    let savedTransaction: any;

    try {
      savedTransaction = await this.prisma.$transaction(async (tx) => {
        const txn = await tx.transaction.create({
          data: {
            invoiceNumber,
            type: createTransactionDto.type as any,
            clientId,
            walkInClientName,
            walkInClientPhone,
            walkInClientAddress,
            userId: user.userId,
            branchId: createTransactionDto.branchId,
            items: {
              create: processedItems.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                unit: item.unit,
                unitPrice: item.unitPrice,
                discount: item.discount,
                subtotal: item.subtotal,
              })),
            },
            extraCharges: extraCharges.length > 0
              ? { create: extraCharges.map((c) => ({ name: c.name, amount: c.amount })) }
              : undefined,
            subtotal,
            discount,
            transportFare,
            loadingAndOffloading,
            loading,
            total,
            amountPaid,
            paymentMethod: createTransactionDto.paymentMethod,
            notes: createTransactionDto.notes,
            status: 'COMPLETED',
            isPickedUp: false,
            date: accountingDate,
            waybillNumber,
            clientBalanceAfterTransaction: null,
          },
          include: this.transactionInclude,
        });

        // Stock updates within the transaction
        if (createTransactionDto.type !== TransactionType.DEPOSIT) {
          for (const item of processedItems) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (!product) throw new BadRequestException(`Product ${item.productId} not found`);
            if (product.stock < item.quantity) {
              throw new BadRequestException(
                `Insufficient stock for ${item.productName}. Available: ${product.stock}`,
              );
            }
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: product.stock - item.quantity },
            });
          }
        }

        // Client balance update
        if (clientId) {
          const client = await tx.client.findUnique({ where: { id: clientId } });
          if (!client) throw new BadRequestException('Client not found');
          const currentBalance = client.balance || 0;

          if (createTransactionDto.type === 'DEPOSIT') {
            newBalance = currentBalance + amountPaid;
          } else {
            const outstanding = total - amountPaid;
            newBalance = currentBalance - outstanding;
          }

          await tx.client.update({
            where: { id: clientId },
            data: { balance: newBalance, lastTransactionDate: accountingDate },
          });
          await tx.transaction.update({
            where: { id: txn.id },
            data: { clientBalanceAfterTransaction: newBalance },
          });
        }

        return txn;
      });
    } catch (error: any) {
      if (error?.code === 'P2002' && error?.meta?.target?.includes('invoiceNumber')) {
        throw new ConflictException('Duplicate invoice number, please retry');
      }
      throw error;
    }

    this.systemActivityLogService.createLog({
      action: 'TRANSACTION_CREATED',
      details: `Transaction ${savedTransaction.invoiceNumber} created (${createTransactionDto.type}) - Total: ${total}`,
      performedBy: user.email || user.name || user.userId,
      role: user.role,
      device: extractDeviceInfo(userAgent) || '',
      branchId: user.branchId?.toString(),
    }).catch(() => {});

    try {
      const eventData = this.realtimeEventService.createEventData(
        'created', 'transaction', savedTransaction.id, savedTransaction,
        { id: user.userId, email: user.email || '', role: user.role as UserRole, branchId: createTransactionDto.branchId, branch: user.branch || '' },
      );
      this.realtimeEventService.emitTransactionCreated(eventData);
    } catch {}

    return {
      ...this.transformTransaction(savedTransaction),
      clientBalance: clientId ? newBalance : null,
      clientBalanceAfterTransaction: clientId ? newBalance : null,
    };
  }

  async createReturnTransaction(
    createTransactionDto: CreateTransactionDto,
    user: { userId: string; role: string; email?: string; name?: string; branch?: string; branchId?: string },
    userAgent: string,
  ): Promise<any> {
    if (!createTransactionDto.referenceTransactionId) {
      throw new BadRequestException('Please select the original purchase transaction to return items from.');
    }
    if (!createTransactionDto.reason) {
      throw new BadRequestException('Please provide a reason for this return.');
    }
    if (!createTransactionDto.items || createTransactionDto.items.length === 0) {
      throw new BadRequestException('Please select at least one item to return.');
    }
    if (createTransactionDto.actualAmountReturned === undefined || createTransactionDto.actualAmountReturned < 0) {
      throw new BadRequestException(
        'Please enter the amount being returned to the customer (can be 0 if no cash refund).',
      );
    }

    const originalTransaction = await this.prisma.transaction.findUnique({
      where: { id: createTransactionDto.referenceTransactionId },
      include: { items: true },
    });
    if (!originalTransaction) {
      throw new NotFoundException('The original purchase transaction could not be found.');
    }
    if (originalTransaction.type === 'DEPOSIT' || originalTransaction.type === 'RETURN') {
      throw new BadRequestException(
        'You can only return items from purchase transactions, not deposits or previous returns.',
      );
    }

    const previousReturns = await this.prisma.transaction.findMany({
      where: { referenceTransactionId: originalTransaction.id, type: 'RETURN' },
      include: { items: true },
    });

    const returnedQuantitiesMap = new Map<string, number>();
    for (const prevReturn of previousReturns) {
      for (const item of prevReturn.items) {
        const current = returnedQuantitiesMap.get(item.productId) || 0;
        returnedQuantitiesMap.set(item.productId, current + item.quantity);
      }
    }

    let totalRefundedAmount = 0;
    const processedReturnedItems: any[] = [];

    for (const returnItem of createTransactionDto.items) {
      const originalItem = originalTransaction.items.find((i) => i.productId === returnItem.productId);
      if (!originalItem) {
        throw new BadRequestException('This product was not included in the original purchase.');
      }
      if (returnItem.unit !== originalItem.unit) {
        throw new BadRequestException(
          `Unit mismatch for ${originalItem.productName}. Originally sold in ${originalItem.unit}, but you're trying to return in ${returnItem.unit}.`,
        );
      }

      const alreadyReturnedQty = returnedQuantitiesMap.get(returnItem.productId) || 0;
      const remainingReturnableQty = originalItem.quantity - alreadyReturnedQty;
      if (returnItem.quantity > remainingReturnableQty) {
        const alreadyReturnedText = alreadyReturnedQty > 0 ? ` (${alreadyReturnedQty} already returned)` : '';
        throw new BadRequestException(
          `You can only return ${remainingReturnableQty} more ${originalItem.unit} of ${originalItem.productName} from this purchase.${alreadyReturnedText}`,
        );
      }

      const currentProduct = await this.productsService.findById(returnItem.productId);
      const originalPricePerUnit = originalItem.unitPrice;
      const currentPricePerUnit = currentProduct.unitPrice;
      const refundPricePerUnit = currentPricePerUnit < originalPricePerUnit ? currentPricePerUnit : originalPricePerUnit;
      const itemRefundAmount = refundPricePerUnit * returnItem.quantity;
      totalRefundedAmount += itemRefundAmount;

      processedReturnedItems.push({
        productId: returnItem.productId,
        productName: originalItem.productName,
        quantity: returnItem.quantity,
        unit: returnItem.unit,
        unitPrice: refundPricePerUnit,
        originalUnitPrice: originalPricePerUnit,
        currentUnitPrice: currentPricePerUnit,
        refundUnitPrice: refundPricePerUnit,
        subtotal: itemRefundAmount,
        discount: 0,
      });

      if (!createTransactionDto.skipStockRestore) {
        await this.productsService.updateStock(returnItem.productId, {
          quantity: returnItem.quantity,
          unit: returnItem.unit,
          operation: StockOperation.ADD,
        });
      }
    }

    const accountingDate = createTransactionDto.date ? new Date(createTransactionDto.date) : new Date();
    const invoiceNumber = await this.generateInvoiceNumber(accountingDate);
    let newBalance = 0;

    const savedTransaction = await this.prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.create({
        data: {
          invoiceNumber,
          type: 'RETURN',
          clientId: originalTransaction.clientId,
          walkInClientName: originalTransaction.walkInClientName,
          walkInClientPhone: originalTransaction.walkInClientPhone,
          walkInClientAddress: originalTransaction.walkInClientAddress,
          userId: user.userId,
          items: { create: processedReturnedItems },
          subtotal: totalRefundedAmount,
          discount: 0,
          transportFare: 0,
          loadingAndOffloading: 0,
          loading: 0,
          total: totalRefundedAmount,
          amountPaid: 0,
          status: 'COMPLETED',
          branchId: createTransactionDto.branchId || originalTransaction.branchId,
          referenceTransactionId: originalTransaction.id,
          reason: createTransactionDto.reason,
          totalRefundedAmount,
          actualAmountReturned: createTransactionDto.actualAmountReturned,
          date: accountingDate,
          notes: createTransactionDto.notes,
          clientBalanceAfterTransaction: null,
        },
        include: this.transactionInclude,
      });

      if (originalTransaction.clientId) {
        const client = await tx.client.findUnique({ where: { id: originalTransaction.clientId } });
        const currentBalance = client?.balance || 0;
        newBalance = currentBalance + createTransactionDto.actualAmountReturned;
        await tx.client.update({
          where: { id: originalTransaction.clientId },
          data: { balance: newBalance, lastTransactionDate: accountingDate },
        });
        await tx.transaction.update({
          where: { id: txn.id },
          data: { clientBalanceAfterTransaction: newBalance },
        });
      }

      return txn;
    });

    this.systemActivityLogService.createLog({
      action: 'RETURN_TRANSACTION_CREATED',
      details: `Return transaction ${savedTransaction.invoiceNumber} created for original ${originalTransaction.invoiceNumber}. Total Refunded: ${totalRefundedAmount}, Actual Returned: ${createTransactionDto.actualAmountReturned}`,
      performedBy: user.email || user.name || user.userId,
      role: user.role,
      device: extractDeviceInfo(userAgent) || '',
      branchId: user.branchId?.toString(),
    }).catch(() => {});

    try {
      const eventData = this.realtimeEventService.createEventData(
        'created', 'transaction', savedTransaction.id, savedTransaction,
        { id: user.userId, email: user.email || '', role: user.role as UserRole, branchId: savedTransaction.branchId, branch: user.branch || '' },
      );
      this.realtimeEventService.emitTransactionCreated(eventData);
    } catch {}

    return {
      ...this.transformTransaction(savedTransaction),
      clientBalance: newBalance,
      clientBalanceAfterTransaction: newBalance,
    };
  }

  async createWholesaleTransaction(
    createTransactionDto: CreateTransactionDto,
    user: { userId: string; role: string; email?: string; name?: string; branch?: string; branchId?: string },
    userAgent: string,
  ): Promise<any> {
    if (!createTransactionDto.clientId) {
      throw new BadRequestException('WHOLESALE transactions are only allowed for registered clients');
    }
    if (!createTransactionDto.items || createTransactionDto.items.length === 0) {
      throw new BadRequestException('Items are required for WHOLESALE transactions');
    }

    const client = await this.clientsService.findById(createTransactionDto.clientId);
    if (!client.isActive) {
      throw new BadRequestException(
        `Transaction blocked: Client "${client.name}" is currently suspended.`,
      );
    }

    const loadingCharge = createTransactionDto.loading || 0;
    const loadingAndOffloadingCharge = createTransactionDto.loadingAndOffloading || 0;
    if (loadingCharge > 0 && loadingAndOffloadingCharge > 0) {
      throw new BadRequestException(
        'Cannot have both "loading" and "loadingAndOffloading" charges in the same transaction. Please use only one.',
      );
    }

    let subtotal = 0;
    const processedItems = await Promise.all(
      createTransactionDto.items.map(async (item) => {
        const product = await this.productsService.findById(item.productId);
        const categoryName =
          typeof product.categoryId === 'object'
            ? product.categoryId?.name
            : (await this.categoriesService.findById(product.categoryId)).name;
        if (categoryName?.toLowerCase() !== 'cement') {
          throw new BadRequestException(
            `WHOLESALE transactions are only allowed for cement products. "${product.name}" is not a cement product.`,
          );
        }
        if (item.unit !== product.unit) {
          throw new BadRequestException(
            `Invalid unit ${item.unit} for product ${product.name}. This product only accepts ${product.unit}`,
          );
        }
        const wholesaleUnitPrice = item.unitPrice ?? item.wholesalePrice;
        if (!wholesaleUnitPrice || wholesaleUnitPrice <= 0) {
          throw new BadRequestException(
            `Wholesale unit price is required and must be greater than 0 for product ${product.name}`,
          );
        }
        const price = wholesaleUnitPrice * item.quantity;
        const itemSubtotal = price - (item.discount || 0);
        subtotal += itemSubtotal;
        return {
          productId: product.id || product._id,
          productName: product.name,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: wholesaleUnitPrice,
          discount: item.discount || 0,
          subtotal: itemSubtotal,
          wholesalePrice: wholesaleUnitPrice,
        };
      }),
    );

    const discount = createTransactionDto.discount || 0;
    const transportFare = createTransactionDto.transportFare || 0;
    const loadingAndOffloading = createTransactionDto.loadingAndOffloading || 0;
    const loading = createTransactionDto.loading || 0;
    const total = subtotal - discount + transportFare + loadingAndOffloading + loading;
    const amountPaid = createTransactionDto.amountPaid || 0;

    const accountingDate = createTransactionDto.date ? new Date(createTransactionDto.date) : new Date();

    let waybillNumber: string;
    if (createTransactionDto.waybillNumber) {
      const existing = await this.prisma.transaction.findFirst({
        where: { waybillNumber: createTransactionDto.waybillNumber },
      });
      if (existing) {
        throw new ConflictException(`Waybill number "${createTransactionDto.waybillNumber}" is already in use`);
      }
      waybillNumber = createTransactionDto.waybillNumber;
    } else {
      waybillNumber = await this.generateWaybillNumber();
    }

    const invoiceNumber = await this.generateInvoiceNumber(accountingDate);
    let newBalance = 0;

    const savedTransaction = await this.prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.create({
        data: {
          invoiceNumber,
          type: 'WHOLESALE',
          clientId: client.id,
          userId: user.userId,
          items: { create: processedItems },
          subtotal,
          discount,
          transportFare,
          loadingAndOffloading,
          loading,
          total,
          amountPaid,
          paymentMethod: createTransactionDto.paymentMethod,
          notes: createTransactionDto.notes,
          status: 'COMPLETED',
          branchId: createTransactionDto.branchId,
          isPickedUp: false,
          date: accountingDate,
          waybillNumber,
          clientBalanceAfterTransaction: null,
        },
        include: this.transactionInclude,
      });

      const freshClient = await tx.client.findUnique({ where: { id: client.id } });
      const currentBalance = freshClient?.balance || 0;
      const outstanding = total - amountPaid;
      newBalance = currentBalance - outstanding;

      await tx.client.update({
        where: { id: client.id },
        data: { balance: newBalance, lastTransactionDate: accountingDate },
      });
      await tx.transaction.update({
        where: { id: txn.id },
        data: { clientBalanceAfterTransaction: newBalance },
      });

      return txn;
    });

    this.systemActivityLogService.createLog({
      action: 'WHOLESALE_TRANSACTION_CREATED',
      details: `Wholesale transaction ${savedTransaction.invoiceNumber} created for ${client.name} - Total: ${total}`,
      performedBy: user.email || user.name || user.userId,
      role: user.role,
      device: extractDeviceInfo(userAgent) || '',
      branchId: user.branchId?.toString(),
    }).catch(() => {});

    try {
      const eventData = this.realtimeEventService.createEventData(
        'created', 'transaction', savedTransaction.id, savedTransaction,
        { id: user.userId, email: user.email || '', role: user.role as UserRole, branchId: createTransactionDto.branchId, branch: user.branch || '' },
      );
      this.realtimeEventService.emitTransactionCreated(eventData);
    } catch {}

    return {
      ...this.transformTransaction(savedTransaction),
      clientBalance: newBalance,
      clientBalanceAfterTransaction: newBalance,
    };
  }

  async findAll(query: QueryTransactionsDto): Promise<any[]> {
    const where: any = {};
    if (query.clientId) where.clientId = query.clientId;
    if (query.invoiceNumber) where.invoiceNumber = { contains: query.invoiceNumber, mode: 'insensitive' };
    if (query.status) where.status = query.status;
    if (query.isPickedUp !== undefined) where.isPickedUp = query.isPickedUp;
    if (query.branchId) where.branchId = query.branchId;
    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = query.startDate;
      if (query.endDate) where.date.lte = query.endDate;
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      include: this.transactionInclude,
      orderBy: { date: 'desc' },
    });

    return transactions.map((t) => this.transformTransaction(t));
  }

  async findById(id: string): Promise<any> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: this.transactionInclude,
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return this.transformTransaction(transaction);
  }

  async findByBranchId(branchId: string): Promise<any[]> {
    const transactions = await this.prisma.transaction.findMany({
      where: { branchId },
      include: this.transactionInclude,
      orderBy: { date: 'desc' },
    });
    return transactions.map((t) => this.transformTransaction(t));
  }

  async findByUserId(userId: string): Promise<any[]> {
    const transactions = await this.prisma.transaction.findMany({
      where: { userId },
      include: this.transactionInclude,
      orderBy: { date: 'desc' },
    });
    return transactions.map((t) => this.transformTransaction(t));
  }

  async findByClientId(clientId: string): Promise<any[]> {
    const transactions = await this.prisma.transaction.findMany({
      where: { clientId },
      include: this.transactionInclude,
      orderBy: { date: 'desc' },
    });
    return transactions.map((t) => this.transformTransaction(t));
  }

  async update(
    id: string,
    updateTransactionDto: UpdateTransactionDto,
    user: { userId: string; role: string; email?: string; name?: string; branchId?: string },
    userAgent?: string,
  ): Promise<any> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    if (
      updateTransactionDto.loading !== undefined ||
      updateTransactionDto.loadingAndOffloading !== undefined
    ) {
      const newLoading = updateTransactionDto.loading !== undefined ? updateTransactionDto.loading : transaction.loading;
      const newLoadingAndOffloading =
        updateTransactionDto.loadingAndOffloading !== undefined
          ? updateTransactionDto.loadingAndOffloading
          : transaction.loadingAndOffloading;
      if (newLoading > 0 && newLoadingAndOffloading > 0) {
        throw new BadRequestException(
          'Cannot have both "loading" and "loadingAndOffloading" charges in the same transaction. Please use only one.',
        );
      }
    }

    if (transaction.type === 'DEPOSIT') {
      if (updateTransactionDto.transportFare || updateTransactionDto.loading || updateTransactionDto.loadingAndOffloading) {
        throw new BadRequestException(
          'Transport fare, loading, and loadingAndOffloading charges cannot be applied to DEPOSIT transactions.',
        );
      }
    }

    const updateData: any = {};

    // Recalculate total if charges change
    if (
      updateTransactionDto.transportFare !== undefined ||
      updateTransactionDto.loadingAndOffloading !== undefined ||
      updateTransactionDto.loading !== undefined
    ) {
      const newTransportFare = updateTransactionDto.transportFare !== undefined ? updateTransactionDto.transportFare : transaction.transportFare;
      const newLoadingAndOffloading = updateTransactionDto.loadingAndOffloading !== undefined ? updateTransactionDto.loadingAndOffloading : transaction.loadingAndOffloading;
      const newLoading = updateTransactionDto.loading !== undefined ? updateTransactionDto.loading : transaction.loading;
      updateData.total = transaction.subtotal - transaction.discount + newTransportFare + newLoadingAndOffloading + newLoading;
      updateData.transportFare = newTransportFare;
      updateData.loadingAndOffloading = newLoadingAndOffloading;
      updateData.loading = newLoading;
    }

    // Handle amountPaid (additive delta)
    if (updateTransactionDto.amountPaid !== undefined) {
      const newAmountPaid = transaction.amountPaid + updateTransactionDto.amountPaid;
      const effectiveTotal = updateData.total ?? transaction.total;
      if (newAmountPaid > effectiveTotal) {
        throw new BadRequestException('Payment amount exceeds total');
      }
      updateData.status = newAmountPaid >= effectiveTotal ? 'COMPLETED' : 'PENDING';
    }

    // Handle pickup
    if (updateTransactionDto.isPickedUp && !transaction.isPickedUp) {
      updateData.isPickedUp = true;
      updateData.pickupDate = updateTransactionDto.pickupDate || new Date();
      if (transaction.clientId) {
        await this.clientsService.addTransaction(
          transaction.clientId,
          {
            type: 'PURCHASE',
            amount: transaction.total,
            description: `Pickup for Invoice #${transaction.invoiceNumber}`,
            reference: transaction.id,
          },
        );
      }
    }

    // Apply remaining DTO fields (Object.assign equivalent - preserves original behavior)
    const directFields = ['amountPaid', 'paymentMethod', 'status', 'notes', 'branchId', 'isPickedUp', 'pickupDate'];
    for (const field of directFields) {
      if ((updateTransactionDto as any)[field] !== undefined) {
        updateData[field] = (updateTransactionDto as any)[field];
      }
    }

    const saved = await this.prisma.transaction.update({
      where: { id },
      data: updateData,
      include: this.transactionInclude,
    });

    const changes = Object.keys(updateTransactionDto).join(', ');
    this.systemActivityLogService.createLog({
      action: 'TRANSACTION_UPDATED',
      details: `Transaction ${saved.invoiceNumber} updated - Changes: ${changes}`,
      performedBy: user.email || user.name || user.userId,
      role: user.role,
      device: extractDeviceInfo(userAgent || '') || '',
      branchId: user.branchId?.toString(),
    }).catch(() => {});

    return this.transformTransaction(saved);
  }

  async assignWaybillNumber(
    id: string,
    waybillNumber: string,
    user: { userId: string; role: string; email?: string; name?: string; branchId?: string },
  ): Promise<any> {
    const transaction = await this.prisma.transaction.findUnique({ where: { id } });
    if (!transaction) throw new NotFoundException('Transaction not found');

    const saved = await this.prisma.transaction.update({
      where: { id },
      data: { waybillNumber },
      include: this.transactionInclude,
    });

    this.systemActivityLogService.createLog({
      action: 'WAYBILL_ASSIGNED',
      details: `Waybill number ${waybillNumber} assigned to transaction ${saved.invoiceNumber}`,
      performedBy: user.email || user.name || user.userId,
      role: user.role,
      device: 'System',
      branchId: user.branchId?.toString(),
    }).catch(() => {});

    try {
      const eventData = this.realtimeEventService.createEventData(
        'updated', 'transaction', saved.id, saved,
        { id: user.userId, email: user.email || '', role: user.role as UserRole, branchId: saved.branchId, branch: '' },
      );
      this.realtimeEventService.emitTransactionUpdated(eventData);
    } catch {}

    return this.transformTransaction(saved);
  }

  async generateReport(startDate: Date, endDate: Date) {
    const transactions = await this.prisma.transaction.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: { items: true },
    });

    const report = {
      totalSales: 0,
      totalDiscount: 0,
      totalReceived: 0,
      productsReport: new Map<string, { quantity: number; revenue: number; units: Map<string, number> }>(),
    };

    transactions.forEach((transaction) => {
      report.totalSales += transaction.total;
      report.totalDiscount += transaction.discount;
      report.totalReceived += transaction.amountPaid;

      transaction.items.forEach((item) => {
        const productStats = report.productsReport.get(item.productId) || {
          quantity: 0,
          revenue: 0,
          units: new Map<string, number>(),
        };
        productStats.quantity += item.quantity;
        productStats.revenue += item.subtotal;
        const unitCount = productStats.units.get(item.unit) || 0;
        productStats.units.set(item.unit, unitCount + item.quantity);
        report.productsReport.set(item.productId, productStats);
      });
    });

    return report;
  }

  async calculateTransaction(calculateTransactionDto: CalculateTransactionDto): Promise<any> {
    let clientBalance = 0;

    const loadingCharge = calculateTransactionDto.loading || 0;
    const loadingAndOffloadingCharge = calculateTransactionDto.loadingAndOffloading || 0;
    if (loadingCharge > 0 && loadingAndOffloadingCharge > 0) {
      throw new BadRequestException(
        'Cannot have both "loading" and "loadingAndOffloading" charges in the same transaction. Please use only one.',
      );
    }

    if (calculateTransactionDto.type === 'DEPOSIT') {
      const transportFare = calculateTransactionDto.transportFare || 0;
      if (transportFare > 0 || loadingCharge > 0 || loadingAndOffloadingCharge > 0) {
        throw new BadRequestException(
          'Transport fare, loading, and loadingAndOffloading charges cannot be applied to DEPOSIT transactions.',
        );
      }
    }

    if (calculateTransactionDto.clientId) {
      const client = await this.clientsService.findById(calculateTransactionDto.clientId);
      clientBalance = client.balance || 0;
    } else if (!calculateTransactionDto.walkInClient?.name) {
      throw new BadRequestException('Either clientId or walkInClient details (name) must be provided');
    }

    let subtotal = 0;
    let processedItems: any[] = [];

    if (calculateTransactionDto.type === 'DEPOSIT') {
      if (!calculateTransactionDto.amountPaid || calculateTransactionDto.amountPaid <= 0) {
        throw new BadRequestException('Deposit amount must be greater than 0');
      }
      subtotal = calculateTransactionDto.amountPaid;
    } else if (calculateTransactionDto.type === 'WHOLESALE') {
      if (!calculateTransactionDto.clientId) {
        throw new BadRequestException('WHOLESALE transactions are only allowed for registered clients');
      }
      if (!calculateTransactionDto.items || calculateTransactionDto.items.length === 0) {
        throw new BadRequestException('Items are required for WHOLESALE transactions');
      }
      processedItems = await Promise.all(
        calculateTransactionDto.items.map(async (item) => {
          const product = await this.productsService.findById(item.productId);
          const categoryName =
            typeof product.categoryId === 'object'
              ? product.categoryId?.name
              : (await this.categoriesService.findById(product.categoryId)).name;
          if (categoryName?.toLowerCase() !== 'cement') {
            throw new BadRequestException(
              `WHOLESALE transactions are only allowed for cement products. "${product.name}" is not a cement product.`,
            );
          }
          if (item.unit !== product.unit) {
            throw new BadRequestException(
              `Invalid unit ${item.unit} for product ${product.name}. This product only accepts ${product.unit}`,
            );
          }
          const wholesaleUnitPrice = item.unitPrice ?? item.wholesalePrice;
          if (!wholesaleUnitPrice || wholesaleUnitPrice <= 0) {
            throw new BadRequestException(
              `Wholesale unit price is required and must be greater than 0 for product ${product.name}`,
            );
          }
          const price = wholesaleUnitPrice * item.quantity;
          const itemSubtotal = price - (item.discount || 0);
          subtotal += itemSubtotal;
          return {
            productId: product.id || product._id,
            productName: product.name,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: wholesaleUnitPrice,
            discount: item.discount || 0,
            subtotal: itemSubtotal,
            wholesalePrice: wholesaleUnitPrice,
          };
        }),
      );
    } else {
      if (!calculateTransactionDto.items || calculateTransactionDto.items.length === 0) {
        throw new BadRequestException('Items are required for PURCHASE transactions');
      }
      processedItems = await Promise.all(
        calculateTransactionDto.items.map(async (item) => {
          const product = await this.productsService.findById(item.productId);
          if (item.unit !== product.unit) {
            throw new BadRequestException(
              `Invalid unit ${item.unit} for product ${product.name}. This product only accepts ${product.unit}`,
            );
          }
          if (product.stock < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for ${product.name}. Available: ${product.stock} ${product.unit}`,
            );
          }
          const price = product.unitPrice * item.quantity;
          const itemSubtotal = price - (item.discount || 0);
          subtotal += itemSubtotal;
          return {
            productId: product.id || product._id,
            productName: product.name,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: product.unitPrice,
            discount: item.discount || 0,
            subtotal: itemSubtotal,
          };
        }),
      );
    }

    const discount = calculateTransactionDto.discount || 0;
    const transportFare = calculateTransactionDto.transportFare || 0;
    const loadingAndOffloading = calculateTransactionDto.loadingAndOffloading || 0;
    const loading = calculateTransactionDto.loading || 0;
    const total = subtotal - discount + transportFare + loadingAndOffloading + loading;

    let requiredPayment = total;
    const paymentDetails: any = {
      subtotal,
      discount,
      transportFare,
      loadingAndOffloading,
      loading,
      total,
      clientBalance,
      requiredPayment,
      canUseCreditBalance: false,
      message: '',
    };

    if (calculateTransactionDto.clientId) {
      if (calculateTransactionDto.type === 'DEPOSIT') {
        paymentDetails.message = `Deposit amount: ${total}`;
      } else if (calculateTransactionDto.type === 'PURCHASE' || calculateTransactionDto.type === 'WHOLESALE') {
        const minimumPayment = Math.max(0, total - clientBalance);
        requiredPayment = minimumPayment;
        const label = calculateTransactionDto.type === 'WHOLESALE' ? 'WHOLESALE' : 'PURCHASE';
        if (clientBalance >= total) {
          paymentDetails.message = `${label}: You can pay 0 (balance ${clientBalance} covers all) up to any amount. Excess becomes credit.`;
        } else {
          const shortfall = total - clientBalance;
          paymentDetails.message = `${label}: You can pay any amount from 0 to ${total}. Paying less than ${shortfall} will create debt. Current balance: ${clientBalance}`;
        }
        paymentDetails.canUseCreditBalance = true;
      }
    } else {
      if (calculateTransactionDto.type === 'DEPOSIT') {
        throw new BadRequestException('Deposit transactions are only allowed for registered clients.');
      }
      if (calculateTransactionDto.type === 'WHOLESALE') {
        throw new BadRequestException('WHOLESALE transactions are only allowed for registered clients.');
      }
      paymentDetails.message = `Walk-in client must pay full amount: ${total}`;
    }

    paymentDetails.requiredPayment = requiredPayment;
    return { ...paymentDetails, items: processedItems };
  }

  async getTotalRevenue(branchId?: string, startDate?: Date, endDate?: Date) {
    const where: any = {
      type: { in: ['PURCHASE', 'DEPOSIT', 'WHOLESALE'] },
      status: { not: 'CANCELLED' },
    };
    if (branchId) where.branchId = branchId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const agg = await this.prisma.transaction.aggregate({
      _sum: { total: true, amountPaid: true, discount: true },
      _count: { id: true },
      where,
    });

    const recentTransactions = await this.prisma.transaction.findMany({
      where,
      include: this.transactionInclude,
      orderBy: { date: 'desc' },
      take: 10,
    });

    return {
      totalRevenue: agg._sum.total || 0,
      transactionCount: agg._count.id || 0,
      totalAmountPaid: agg._sum.amountPaid || 0,
      totalDiscount: agg._sum.discount || 0,
      period: this.formatPeriod(startDate, endDate),
      recentTransactions: recentTransactions.map((t) => this.transformTransaction(t)),
    };
  }

  async getDailyRevenue(branchId?: string, date?: Date, startDate?: Date, endDate?: Date) {
    const targetDate = date || new Date();
    let dateRange: { start: Date; end: Date };

    if (startDate && endDate) {
      dateRange = { start: startDate, end: endDate };
    } else {
      dateRange = {
        start: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
        end: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1),
      };
    }

    const transactions = await this.prisma.transaction.findMany({
      where: {
        type: { in: ['PURCHASE', 'DEPOSIT'] as any },
        status: { not: 'CANCELLED' as any },
        date: { gte: dateRange.start, lt: dateRange.end },
        ...(branchId ? { branchId } : {}),
      },
    });

    const dayMap = new Map<string, { revenue: number; count: number; amountPaid: number }>();
    transactions.forEach((t) => {
      const day = t.date ? new Date(t.date).toISOString().split('T')[0] : 'unknown';
      const existing = dayMap.get(day) || { revenue: 0, count: 0, amountPaid: 0 };
      existing.revenue += t.total;
      existing.count += 1;
      existing.amountPaid += t.amountPaid;
      dayMap.set(day, existing);
    });

    const breakdown = Array.from(dayMap.entries()).map(([d, v]) => ({
      date: d,
      revenue: v.revenue,
      transactions: v.count,
      amountPaid: v.amountPaid,
    }));

    return {
      totalRevenue: transactions.reduce((s, t) => s + t.total, 0),
      transactionCount: transactions.length,
      totalAmountPaid: transactions.reduce((s, t) => s + t.amountPaid, 0),
      period: startDate && endDate ? this.formatPeriod(startDate, endDate) : targetDate.toISOString().split('T')[0],
      breakdown,
    };
  }

  async getMonthlyRevenue(branchId?: string, month?: number, year?: number, startDate?: Date, endDate?: Date) {
    const targetDate = new Date();
    const targetMonth = month || (targetDate.getMonth() + 1);
    const targetYear = year || targetDate.getFullYear();

    let dateRange: { start: Date; end: Date };
    if (startDate && endDate) {
      dateRange = { start: startDate, end: endDate };
    } else {
      dateRange = {
        start: new Date(targetYear, targetMonth - 1, 1),
        end: new Date(targetYear, targetMonth, 1),
      };
    }

    const transactions = await this.prisma.transaction.findMany({
      where: {
        type: { in: ['PURCHASE', 'DEPOSIT', 'WHOLESALE'] as any },
        status: { not: 'CANCELLED' as any },
        date: { gte: dateRange.start, lt: dateRange.end },
        ...(branchId ? { branchId } : {}),
      },
    });

    const monthMap = new Map<string, { revenue: number; count: number; amountPaid: number }>();
    transactions.forEach((t) => {
      const d = t.date ? new Date(t.date) : new Date();
      const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      const existing = monthMap.get(key) || { revenue: 0, count: 0, amountPaid: 0 };
      existing.revenue += t.total;
      existing.count += 1;
      existing.amountPaid += t.amountPaid;
      monthMap.set(key, existing);
    });

    const breakdown = Array.from(monthMap.entries()).map(([m, v]) => ({
      month: m,
      revenue: v.revenue,
      transactions: v.count,
      amountPaid: v.amountPaid,
    }));

    return {
      totalRevenue: transactions.reduce((s, t) => s + t.total, 0),
      transactionCount: transactions.length,
      totalAmountPaid: transactions.reduce((s, t) => s + t.amountPaid, 0),
      period: startDate && endDate ? this.formatPeriod(startDate, endDate) : `${targetYear}-${targetMonth.toString().padStart(2, '0')}`,
      breakdown,
    };
  }

  async getYearlyRevenue(branchId?: string, year?: number, startDate?: Date, endDate?: Date) {
    const targetYear = year || new Date().getFullYear();

    let dateRange: { start: Date; end: Date };
    if (startDate && endDate) {
      dateRange = { start: startDate, end: endDate };
    } else {
      dateRange = {
        start: new Date(targetYear, 0, 1),
        end: new Date(targetYear + 1, 0, 1),
      };
    }

    const transactions = await this.prisma.transaction.findMany({
      where: {
        type: { in: ['PURCHASE', 'DEPOSIT'] as any },
        status: { not: 'CANCELLED' as any },
        date: { gte: dateRange.start, lt: dateRange.end },
        ...(branchId ? { branchId } : {}),
      },
    });

    const yearMap = new Map<string, { revenue: number; count: number; amountPaid: number }>();
    transactions.forEach((t) => {
      const d = t.date ? new Date(t.date) : new Date();
      const key = d.getFullYear().toString();
      const existing = yearMap.get(key) || { revenue: 0, count: 0, amountPaid: 0 };
      existing.revenue += t.total;
      existing.count += 1;
      existing.amountPaid += t.amountPaid;
      yearMap.set(key, existing);
    });

    const breakdown = Array.from(yearMap.entries()).map(([y, v]) => ({
      year: y,
      revenue: v.revenue,
      transactions: v.count,
      amountPaid: v.amountPaid,
    }));

    return {
      totalRevenue: transactions.reduce((s, t) => s + t.total, 0),
      transactionCount: transactions.length,
      totalAmountPaid: transactions.reduce((s, t) => s + t.amountPaid, 0),
      period: startDate && endDate ? this.formatPeriod(startDate, endDate) : targetYear.toString(),
      breakdown,
    };
  }

  private formatPeriod(startDate?: Date, endDate?: Date): string {
    if (startDate && endDate) {
      return `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`;
    }
    if (startDate) return `From ${startDate.toISOString().split('T')[0]}`;
    if (endDate) return `Until ${endDate.toISOString().split('T')[0]}`;
    return 'All time';
  }
}
