import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Transaction,
  TransactionDocument,
} from '../schemas/transaction.schema';
import { Product } from '../../products/schemas/product.schema';
import { ClientsService } from '../../clients/services/clients.service';
import { ProductsService } from '../../products/services/products.service';
import { StockOperation } from '../../products/dto/product.dto';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  QueryTransactionsDto,
  CalculateTransactionDto,
} from '../dto/transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
    private readonly clientsService: ClientsService,
    private readonly productsService: ProductsService,
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}

  async create(
    createTransactionDto: CreateTransactionDto,
    userId: string,
  ): Promise<Transaction & { clientBalance?: number }> {
    let clientId: Types.ObjectId | undefined = undefined;
    let walkInClient: any = undefined;

    if (createTransactionDto.clientId) {
      // Registered client
      const client = await this.clientsService.findById(
        createTransactionDto.clientId,
      );
      clientId = (client as any)._id;
    } else if (
      createTransactionDto.walkInClient &&
      createTransactionDto.walkInClient.name
    ) {
      // Walk-in client
      walkInClient = {
        name: createTransactionDto.walkInClient.name,
        phone: createTransactionDto.walkInClient.phone,
        address: createTransactionDto.walkInClient.address,
      };
    } else {
      throw new BadRequestException(
        'Either clientId or walkInClient details (name) must be provided',
      );
    }

    // Process items and calculate totals
    let subtotal = 0;
    const processedItems = await Promise.all(
      createTransactionDto.items.map(async (item) => {
        const product = await this.productsService.findById(item.productId);

        // Validate unit matches product category
        if (item.unit !== product.unit) {
          throw new BadRequestException(
            `Invalid unit ${item.unit} for product ${product.name}. This product only accepts ${product.unit}`,
          );
        }

        // Validate stock availability
        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${product.name}. Available: ${product.stock} ${product.unit}`,
          );
        } // Calculate price
        const price = product.unitPrice * item.quantity;
        const itemSubtotal = price - (item.discount || 0);
        subtotal += itemSubtotal;

        return {
          productId: product._id,
          productName: product.name,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: price / item.quantity,
          discount: item.discount || 0,
          subtotal: itemSubtotal,
        };
      }),
    );

    const total = subtotal - (createTransactionDto.discount || 0);
    const amountPaid = createTransactionDto.amountPaid || 0;

    // Create transaction
    let status = 'PENDING';
    if (clientId) {
      // Registered client
      const type = createTransactionDto.type || 'PURCHASE';
      if (type === 'PICKUP') {
        status = 'COMPLETED';
      } else if (type === 'PURCHASE') {
        // Fetch client balance
        const client = await this.clientsService.findById(
          createTransactionDto.clientId,
        );
        const clientBalance = client.balance || 0;
        const requiredPayment = total - (clientBalance > 0 ? clientBalance : 0);
        if (requiredPayment < 0) {
          // Client has more than enough balance, no payment needed
          if (amountPaid !== 0) {
            throw new BadRequestException(
              `No payment required. Client already has enough balance.`,
            );
          }
        } else {
          if (amountPaid !== requiredPayment) {
            throw new BadRequestException(
              `Insufficient payment. Client must pay exactly ${requiredPayment} to complete this purchase. Current balance: ${clientBalance}`,
            );
          }
        }
        status = 'COMPLETED';
      }
    } else {
      // Walk-in client
      status = amountPaid >= total ? 'COMPLETED' : 'PENDING';
    }

    const transaction = new this.transactionModel({
      invoiceNumber: await this.generateInvoiceNumber(),
      clientId,
      walkInClient,
      userId: new Types.ObjectId(userId),
      items: processedItems,
      subtotal,
      discount: createTransactionDto.discount || 0,
      total,
      amountPaid,
      paymentMethod: createTransactionDto.paymentMethod,
      notes: createTransactionDto.notes,
      status,
      branchId: createTransactionDto.branchId,
      type: createTransactionDto.type,
      isPickedUp: createTransactionDto.type === 'PICKUP',
    });

    // Update client balance only for registered clients
    if (clientId) {
      const ledgerType =
        createTransactionDto.type === 'PICKUP' ? 'PICKUP' : 'PURCHASE';
      await this.clientsService.addTransaction(clientId.toString(), {
        type: ledgerType,
        amount: total,
        description: `Invoice #${transaction.invoiceNumber}`,
        reference: transaction._id.toString(),
      });
    }

    // Update stock levels
    await Promise.all(
      transaction.items.map(async (item) => {
        await this.productsService.updateStock(item.productId.toString(), {
          quantity: item.quantity,
          unit: item.unit,
          operation: StockOperation.SUBTRACT,
        });
      }),
    );

    const savedTransaction = await transaction.save();

    // Log transaction creation activity
    try {
      const clientName = clientId
        ? (await this.clientsService.findById(createTransactionDto.clientId))
            .name
        : createTransactionDto.walkInClient.name;

      await this.systemActivityLogService.createLog({
        action: 'TRANSACTION_CREATED',
        details: `Transaction ${savedTransaction.invoiceNumber} created for ${clientName} (${createTransactionDto.type}) - Total: ${total}`,
        performedBy: userId,
        role: 'STAFF', // Default role, could be improved by fetching actual user role
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log transaction creation:', logError);
      // Don't fail transaction creation if logging fails
    }

    // Get updated client balance for registered clients
    let clientBalance = null;
    if (clientId) {
      try {
        const updatedClient = await this.clientsService.findById(
          createTransactionDto.clientId,
        );
        clientBalance = updatedClient.balance || 0;
      } catch (error) {
        console.error('Failed to fetch updated client balance:', error);
      }
    }

    return {
      ...savedTransaction.toJSON(),
      clientBalance,
    };
  }

  async findAll(query: QueryTransactionsDto): Promise<Transaction[]> {
    const filter: any = {};

    if (query.clientId) filter.clientId = query.clientId;
    if (query.invoiceNumber)
      filter.invoiceNumber = new RegExp(query.invoiceNumber, 'i');
    if (query.status) filter.status = query.status;
    if (query.isPickedUp !== undefined) filter.isPickedUp = query.isPickedUp;

    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = query.startDate;
      if (query.endDate) filter.createdAt.$lte = query.endDate;
    }

    return this.transactionModel
      .find(filter)
      .populate('clientId', 'name phone')
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string): Promise<Transaction> {
    const transaction = await this.transactionModel
      .findById(id)
      .populate('clientId', 'name phone')
      .populate('userId', 'name');

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async update(
    id: string,
    updateTransactionDto: UpdateTransactionDto,
  ): Promise<Transaction> {
    const transaction = await this.transactionModel.findById(id);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // Handle payment updates
    if (updateTransactionDto.amountPaid !== undefined) {
      const newAmountPaid =
        transaction.amountPaid + updateTransactionDto.amountPaid;
      if (newAmountPaid > transaction.total) {
        throw new BadRequestException('Payment amount exceeds total');
      }
      transaction.amountPaid = newAmountPaid;
      transaction.status =
        newAmountPaid >= transaction.total ? 'COMPLETED' : 'PENDING';
    }

    // Handle pickup status
    if (updateTransactionDto.isPickedUp && !transaction.isPickedUp) {
      transaction.isPickedUp = true;
      transaction.pickupDate = updateTransactionDto.pickupDate || new Date();

      // Add pickup transaction to client ledger
      await this.clientsService.addTransaction(
        transaction.clientId.toString(),
        {
          type: 'PICKUP',
          amount: transaction.total,
          description: `Pickup for Invoice #${transaction.invoiceNumber}`,
          reference: transaction._id.toString(),
        },
      );
    }

    Object.assign(transaction, updateTransactionDto);
    const savedTransaction = await transaction.save();

    // Log transaction update activity
    try {
      const changes = Object.keys(updateTransactionDto).join(', ');
      await this.systemActivityLogService.createLog({
        action: 'TRANSACTION_UPDATED',
        details: `Transaction ${savedTransaction.invoiceNumber} updated - Changes: ${changes}`,
        performedBy: 'System',
        role: 'STAFF',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log transaction update:', logError);
    }

    return savedTransaction;
  }

  async generateInvoiceNumber(): Promise<string> {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `INV${year}${month}`;

    const lastInvoice = await this.transactionModel
      .findOne({ invoiceNumber: new RegExp(`^${prefix}`) })
      .sort({ invoiceNumber: -1 });

    const sequence = lastInvoice
      ? parseInt(lastInvoice.invoiceNumber.slice(-4)) + 1
      : 1;

    return `${prefix}${sequence.toString().padStart(4, '0')}`;
  }

  async generateReport(startDate: Date, endDate: Date) {
    const transactions = await this.transactionModel.find({
      createdAt: { $gte: startDate, $lte: endDate },
    });

    const report = {
      totalSales: 0,
      totalDiscount: 0,
      totalReceived: 0,
      productsReport: new Map<
        string,
        {
          quantity: number;
          revenue: number;
          units: Map<string, number>;
        }
      >(),
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

  async calculateTransaction(
    calculateTransactionDto: CalculateTransactionDto,
  ): Promise<any> {
    let clientBalance = 0;

    // Get client balance if it's a registered client
    if (calculateTransactionDto.clientId) {
      const client = await this.clientsService.findById(
        calculateTransactionDto.clientId,
      );
      clientBalance = client.balance || 0;
    } else if (
      !calculateTransactionDto.walkInClient ||
      !calculateTransactionDto.walkInClient.name
    ) {
      throw new BadRequestException(
        'Either clientId or walkInClient details (name) must be provided',
      );
    }

    // Process items and calculate totals
    let subtotal = 0;
    const processedItems = await Promise.all(
      calculateTransactionDto.items.map(async (item) => {
        const product = await this.productsService.findById(item.productId);

        // Validate unit matches product category
        if (item.unit !== product.unit) {
          throw new BadRequestException(
            `Invalid unit ${item.unit} for product ${product.name}. This product only accepts ${product.unit}`,
          );
        }

        // Validate stock availability
        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${product.name}. Available: ${product.stock} ${product.unit}`,
          );
        }

        // Calculate price
        const price = product.unitPrice * item.quantity;
        const itemSubtotal = price - (item.discount || 0);
        subtotal += itemSubtotal;

        return {
          productId: product._id,
          productName: product.name,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: price / item.quantity,
          discount: item.discount || 0,
          subtotal: itemSubtotal,
        };
      }),
    );

    const total = subtotal - (calculateTransactionDto.discount || 0);

    // Calculate required payment based on client type and transaction type
    let requiredPayment = total;
    const paymentDetails = {
      subtotal,
      discount: calculateTransactionDto.discount || 0,
      total,
      clientBalance,
      requiredPayment,
      canUseCreditBalance: false,
      message: '',
    };

    if (calculateTransactionDto.clientId) {
      // Registered client
      if (calculateTransactionDto.type === 'PICKUP') {
        requiredPayment = 0;
        paymentDetails.message = 'No payment required for pickup transactions';
      } else if (calculateTransactionDto.type === 'PURCHASE') {
        requiredPayment = total - (clientBalance > 0 ? clientBalance : 0);
        paymentDetails.canUseCreditBalance = clientBalance > 0;

        if (requiredPayment <= 0) {
          paymentDetails.message = `No payment required. Client has sufficient balance (${clientBalance})`;
          requiredPayment = 0;
        } else {
          paymentDetails.message = `Client must pay ${requiredPayment}. Current balance: ${clientBalance}`;
        }
      }
    } else {
      // Walk-in client
      paymentDetails.message = `Walk-in client must pay full amount: ${total}`;
    }

    paymentDetails.requiredPayment = requiredPayment;

    return {
      ...paymentDetails,
      items: processedItems,
    };
  }

  async assignWaybillNumber(id: string): Promise<Transaction> {
    const transaction = await this.transactionModel.findById(id);
    if (!transaction) throw new NotFoundException('Transaction not found');
    // Auto-generate waybill number
    const date = new Date();
    const prefix = `WB${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
    const count = await this.transactionModel.countDocuments({
      waybillNumber: { $regex: `^${prefix}` },
    });
    transaction.waybillNumber = `${prefix}-${(count + 1).toString().padStart(4, '0')}`;
    const savedTransaction = await transaction.save();

    // Log waybill assignment activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'WAYBILL_ASSIGNED',
        details: `Waybill number ${savedTransaction.waybillNumber} assigned to transaction ${savedTransaction.invoiceNumber}`,
        performedBy: 'System',
        role: 'STAFF',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log waybill assignment:', logError);
    }

    return savedTransaction;
  }
}
