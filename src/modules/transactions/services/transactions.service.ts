import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
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
import { RealtimeEventService } from '../../websocket/realtime-event.service';
import { UserRole } from '../../../common/enums';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  QueryTransactionsDto,
  CalculateTransactionDto,
} from '../dto/transaction.dto';
import { extractDeviceInfo } from 'src/modules/system-activity-logs/utils/device-extractor.util';

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
    private readonly realtimeEventService: RealtimeEventService,
  ) {}

  async create(
    createTransactionDto: CreateTransactionDto,
    user: { userId: string; role: string; email?: string; name?: string; branch?:string },
    userAgent: string
  ): Promise<Transaction & { clientBalance?: number }> {
    let clientId: Types.ObjectId | undefined = undefined;
    let walkInClient: any = undefined;

    if (createTransactionDto.clientId) {
      // Registered client
      const client = await this.clientsService.findById(
        createTransactionDto.clientId,
      );
      
      // Check if client is blocked/suspended
      if (!client.isActive) {
        throw new BadRequestException(
          `Transaction blocked: Client "${client.name}" is currently suspended. Please contact admin to reactivate this client.`
        );
      }
      
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

    // Process items and calculate totals (skip for DEPOSIT transactions)
    let subtotal = 0;
    let processedItems: any[] = [];
    
    if (createTransactionDto.type === 'DEPOSIT') {
      // For deposits, use amountPaid as the total, no items needed
      if (!createTransactionDto.amountPaid || createTransactionDto.amountPaid <= 0) {
        throw new BadRequestException('Deposit amount must be greater than 0');
      }
      subtotal = createTransactionDto.amountPaid;
      processedItems = []; // No items for deposits
    } else {
      // For PURCHASE and PICKUP, process items normally
      if (!createTransactionDto.items || createTransactionDto.items.length === 0) {
        throw new BadRequestException('Items are required for PURCHASE and PICKUP transactions');
      }
      
      processedItems = await Promise.all(
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
    }

    const total = subtotal - (createTransactionDto.discount || 0);
    const amountPaid = createTransactionDto.amountPaid || 0;

    // Create transaction
    let status = 'PENDING';
    if (clientId) {
      // Registered client
      const client = await this.clientsService.findById(
        createTransactionDto.clientId,
      );
      const clientBalance = client.balance || 0;
      const type = createTransactionDto.type || 'PURCHASE';

      if (type === 'DEPOSIT') {
        // Deposit transaction - always completed, no items validation needed
        status = 'COMPLETED';
      } else if (type === 'PURCHASE') {
        // PURCHASE: Any transaction that will NOT result in debt
        // (amountPaid + balance) >= total
        const totalAvailable = amountPaid + clientBalance;

        if (totalAvailable >= total) {
          // Payment is sufficient - no debt created
          status = 'COMPLETED';
        } else {
          // Would create debt - reject
          throw new BadRequestException(
            `Insufficient funds for PURCHASE. Total: ${total}, Amount Paid: ${amountPaid}, Balance: ${clientBalance}. You need at least ${total - clientBalance - amountPaid} more to complete this purchase without going into debt.`
          );
        }
      } else if (type === 'PICKUP') {
        // PICKUP: Any transaction that WILL result in debt
        // (amountPaid + balance) < total
        const totalAvailable = amountPaid + clientBalance;

        if (totalAvailable < total) {
          // Will create debt - this is valid for PICKUP
          status = 'COMPLETED';
        } else {
          // Would not create debt - should be PURCHASE instead
          throw new BadRequestException(
            `This transaction should be a PURCHASE, not a PICKUP. The payment (${amountPaid}) + balance (${clientBalance}) covers the total (${total}). PICKUP is only for transactions that result in debt.`
          );
        }
      }
    } else {
      // Walk-in client - STRICT payment validation (not allowed for deposits)
      if (createTransactionDto.type === 'DEPOSIT') {
        throw new BadRequestException(
          'Deposit transactions are only allowed for registered clients.'
        );
      }
      
      if (amountPaid < total ) {
        throw new BadRequestException(
          `Insufficient payment for walk-in client. Required: ${total}, Provided: ${amountPaid}. Walk-in clients must pay the full amount upfront.`
        );
      }
      if (amountPaid > total ) {
        throw new BadRequestException(
          `Amount provided is more than the required payment for this transaction. Required: ${total}, Provided: ${amountPaid}. Walk-in clients must pay exactly ${total}.`
        );
      }
      status = 'COMPLETED';
    }

    // Determine accounting date (used both for transaction.date and invoice prefix)
    const accountingDate = createTransactionDto.date ? new Date(createTransactionDto.date) : new Date();

    const transaction = new this.transactionModel({
      invoiceNumber: await this.generateInvoiceNumber(accountingDate),
      clientId,
      walkInClient,
      userId: new Types.ObjectId(user.userId),
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
      // Use provided accounting date (backdate) or default to now
      date: accountingDate,
    });

    // Save transaction with retry-on-duplicate (invoiceNumber collisions)
    const maxSaveAttempts = 5;
    let saveAttempt = 0;
    let savedTransaction = null as any;
    while (saveAttempt < maxSaveAttempts) {
      try {
        saveAttempt++;
        savedTransaction = await transaction.save();
        break;
      } catch (err: any) {
        // Mongo duplicate key error (look for invoiceNumber anywhere in error shape)
        const isDuplicateInvoice =
          err?.code === 11000 && (
            (err.keyPattern && err.keyPattern.invoiceNumber) ||
            (err.keyValue && err.keyValue.invoiceNumber) ||
            (typeof err.message === 'string' && err.message.includes('invoiceNumber'))
          );

        if (isDuplicateInvoice) {
          // regenerate invoice number and retry
          if (saveAttempt >= maxSaveAttempts) {
            throw new ConflictException('Duplicate entry');
          }
          const newInv = await this.generateInvoiceNumber(accountingDate);
          transaction.invoiceNumber = newInv;
          continue;
        }
        // rethrow other errors
        throw err;
      }
    }

    if (!savedTransaction) {
      throw new ConflictException('Duplicate entry');
    }

    // After successful save, perform side-effects (stock updates and client ledger)
    // Update stock levels (and be able to revert on failure) - Skip for DEPOSIT transactions
    const updatedProducts: Array<{ productId: string; quantity: number; unit: string }> = [];
    if (createTransactionDto.type !== 'DEPOSIT') {
      try {
        for (const item of transaction.items) {
          await this.productsService.updateStock(item.productId.toString(), {
            quantity: item.quantity,
            unit: item.unit,
            operation: StockOperation.SUBTRACT,
          });
          updatedProducts.push({ productId: item.productId.toString(), quantity: item.quantity, unit: item.unit });
        }
      } catch (stockErr) {
        // Attempt to revert any already-updated stock
        for (const upd of updatedProducts) {
          try {
            await this.productsService.updateStock(upd.productId.toString(), {
              quantity: upd.quantity,
              unit: upd.unit,
              operation: StockOperation.ADD,
            });
          } catch (revertErr) {
            console.error('Failed to revert stock for', upd.productId, revertErr);
          }
        }
        // Remove saved transaction to avoid inconsistent state
        try {
          await this.transactionModel.deleteOne({ _id: savedTransaction._id });
        } catch (delErr) {
          console.error('Failed to delete transaction after stock update failure', delErr);
        }
        throw new BadRequestException('Failed to update stock. Transaction aborted.');
      }
    }

    // Update client balance only for registered clients
    if (clientId) {
      let ledgerType: 'DEPOSIT' | 'PICKUP' | 'PURCHASE';
      if (createTransactionDto.type === 'PICKUP') {
        ledgerType = 'PICKUP';
      } else if (createTransactionDto.type === 'DEPOSIT') {
        ledgerType = 'DEPOSIT';
      } else {
        ledgerType = 'PURCHASE';
      }
      
      try {
        let ledgerAmount = 0;
        let ledgerDescription = `Invoice #${transaction.invoiceNumber}`;
        const client = await this.clientsService.findById(clientId.toString());
        const clientBalance = client.balance || 0;

        // For PURCHASE transactions: (amountPaid + balance) >= total
        if (createTransactionDto.type === 'PURCHASE') {
          const totalAvailable = amountPaid + clientBalance;

          if (amountPaid >= total) {
            // Paid full or more - balance untouched
            if (amountPaid > total) {
              // Overpaid - add excess as credit
              const excess = amountPaid - total;
              ledgerAmount = -excess; // Negative means adding credit
              ledgerDescription += ` (Overpaid by ${excess} - added as credit)`;
            } else {
              // Paid exactly - no balance change
              ledgerAmount = 0;
              ledgerDescription += ` (Paid in full - balance untouched)`;
            }
          } else {
            // Used balance to complete purchase
            // Deduct only what's needed from balance
            const neededFromBalance = total - amountPaid;
            ledgerAmount = neededFromBalance; // Positive means deducting from balance
            ledgerDescription += ` (Used ${neededFromBalance} from balance + ${amountPaid} payment)`;
          }
        } else if (createTransactionDto.type === 'PICKUP') {
          // PICKUP: (amountPaid + balance) < total - creates debt
          // First, use all available balance, then create debt
          const totalAvailable = amountPaid + clientBalance;
          const debt = total - totalAvailable;

          // Deduct all balance and add the debt
          ledgerAmount = total - amountPaid; // This will use balance and create debt
          ledgerDescription += ` (Used ${clientBalance > 0 ? clientBalance : 0} from balance, paid ${amountPaid}, debt ${debt})`;
        }
        
        await this.clientsService.addTransaction(clientId.toString(), {
          type: ledgerType,
          amount: ledgerAmount,
          description: ledgerDescription,
          reference: transaction._id.toString(),
          date: transaction.date || new Date(),
        });
      } catch (ledgerErr) {
        // Attempt to revert stock only if it was updated
        if (createTransactionDto.type !== 'DEPOSIT') {
          for (const upd of updatedProducts) {
            try {
              await this.productsService.updateStock(upd.productId.toString(), {
                quantity: upd.quantity,
                unit: upd.unit,
                operation: StockOperation.ADD,
              });
            } catch (revertErr) {
              console.error('Failed to revert stock after ledger failure for', upd.productId, revertErr);
            }
          }
        }
        // Delete the saved transaction
        try {
          await this.transactionModel.deleteOne({ _id: savedTransaction._id });
        } catch (delErr) {
          console.error('Failed to delete transaction after ledger failure', delErr);
        }
        throw new BadRequestException('Failed to update client ledger. Transaction aborted.');
      }
    }

    // Log transaction creation activity
    try {
      const clientName = clientId
        ? (await this.clientsService.findById(createTransactionDto.clientId))
            .name
        : createTransactionDto.walkInClient.name;

      await this.systemActivityLogService.createLog({
        action: 'TRANSACTION_CREATED',
        details: `Transaction ${savedTransaction.invoiceNumber} created for ${clientName} (${createTransactionDto.type}) - Total: ${total}`,
        performedBy: user.email || user.name || user.userId,
        role: user.role,
        device: extractDeviceInfo(userAgent) || "",
      });
    } catch (logError) {
      console.error('Failed to log transaction creation:', logError);
      // Don't fail transaction creation if logging fails
    }

    // Emit real-time event for transaction creation
    try {
      const eventData = this.realtimeEventService.createEventData(
        'created',
        'transaction',
        savedTransaction._id.toString(),
        savedTransaction,
        {
          id: user.userId,
          email: user.email || 'unknown@system.com',
          role: user.role as UserRole,
          branchId: createTransactionDto.branchId,
          branch: user.branch || 'System Branch', 
        }
      );
      
      this.realtimeEventService.emitTransactionCreated(eventData);
    } catch (realtimeError) {
      console.error('❌ Failed to emit real-time transaction event:', realtimeError);
      // Don't fail transaction creation if real-time event fails
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
      filter.date = {};
      if (query.startDate) filter.date.$gte = query.startDate;
      if (query.endDate) filter.date.$lte = query.endDate;
    }

    return this.transactionModel
      .find(filter)
      .populate('clientId', 'name phone balance')
      .populate('userId', 'name')
      .sort({ date: -1 })
      .exec();
  }

  async findById(id: string): Promise<Transaction> {
    const transaction = await this.transactionModel
      .findById(id)
      .populate('clientId', 'name phone balance')
      .populate('userId', 'name');

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async findByBranchId(branchId: string): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ branchId })
      .populate('clientId', 'name phone balance')
      .populate('userId', 'name')
      .sort({ date: -1 });

    return transactions;
  }

  async findByUserId(userId: string): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('clientId', 'name phone')
      .populate('userId', 'name')
      .sort({ date: -1 });

    return transactions;
  }

  async findByClientId(clientId: string): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ clientId: new Types.ObjectId(clientId) })
      .populate('clientId', 'name phone')
      .populate('userId', 'name')
      .sort({ date: -1 });

    return transactions;
  }

  async update(
    id: string,
    updateTransactionDto: UpdateTransactionDto,
    user: { userId: string; role: string; email?: string; name?: string },
    userAgent?: string
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
        performedBy: user.email || user.name || user.userId,
        role: user.role,
        device: extractDeviceInfo(userAgent) || '',
      });
    } catch (logError) {
      console.error('Failed to log transaction update:', logError);
    }

    return savedTransaction;
  }

  async generateInvoiceNumber(date?: Date): Promise<string> {
    const useDate = date ? new Date(date) : new Date();
    const year = useDate.getFullYear().toString().slice(-2);
    const month = (useDate.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `INV${year}${month}`;
    try {
      // Use a dedicated counters collection to atomically increment sequence per prefix
      const countersCollection = this.transactionModel.db.collection('invoice_counters');

      const res = await countersCollection.findOneAndUpdate(
        // cast to any to avoid strict driver types in TS
        { _id: prefix } as any,
        { $inc: { seq: 1 } } as any,
        { upsert: true, returnDocument: 'after' } as any,
      );

      // Some driver versions/edge cases may not return the updated doc in `res.value`.
      let seq = (res as any).value?.seq;
      if (!seq) {
        // Read the counter document to get the current seq value
        try {
          const doc = await countersCollection.findOne({ _id: prefix } as any);
          seq = (doc as any)?.seq;
        } catch (readErr) {
          // Silent failure - fallback to default
        }
      }

      // If still undefined, default to 1
      seq = seq || 1;
      return `${prefix}${seq.toString().padStart(4, '0')}`;
    } catch (err) {
      // Fallback to previous strategy if counters collection unavailable
      const lastInvoice = await this.transactionModel
        .findOne({ invoiceNumber: new RegExp(`^${prefix}`) })
        .sort({ invoiceNumber: -1 });

      const sequence = lastInvoice
        ? parseInt(lastInvoice.invoiceNumber.slice(-4)) + 1
        : 1;

      // Try to update counters collection to at least this sequence to avoid future duplicates
      try {
        const countersCollection = this.transactionModel.db.collection('invoice_counters');
        await countersCollection.updateOne(
          { _id: prefix } as any,
          { $max: { seq: sequence } } as any,
          { upsert: true } as any,
        );
      } catch (syncErr) {
        // Silent failure - counters sync is best effort
      }

      return `${prefix}${sequence.toString().padStart(4, '0')}`;
    }
  }

  async generateReport(startDate: Date, endDate: Date) {
    const transactions = await this.transactionModel.find({
      date: { $gte: startDate, $lte: endDate },
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

    // Process items and calculate totals (skip for DEPOSIT transactions)
    let subtotal = 0;
    let processedItems: any[] = [];
    
    if (calculateTransactionDto.type === 'DEPOSIT') {
      // For deposits, use amountPaid as the total, no items needed
      if (!calculateTransactionDto.amountPaid || calculateTransactionDto.amountPaid <= 0) {
        throw new BadRequestException('Deposit amount must be greater than 0');
      }
      subtotal = calculateTransactionDto.amountPaid;
      processedItems = []; // No items for deposits
    } else {
      // For PURCHASE and PICKUP, process items normally
      if (!calculateTransactionDto.items || calculateTransactionDto.items.length === 0) {
        throw new BadRequestException('Items are required for PURCHASE and PICKUP transactions');
      }
      
      processedItems = await Promise.all(
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
    }

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
      if (calculateTransactionDto.type === 'DEPOSIT') {
        requiredPayment = total;
        paymentDetails.message = `Deposit amount: ${total}`;
      } else if (calculateTransactionDto.type === 'PURCHASE') {
        // PURCHASE: Any payment where (amountPaid + balance) >= total
        // Minimum payment needed = total - balance (or 0 if balance covers all)
        const minimumPayment = Math.max(0, total - clientBalance);
        requiredPayment = minimumPayment;

        if (clientBalance >= total) {
          paymentDetails.message = `PURCHASE: You can pay 0 (balance ${clientBalance} covers all) up to any amount. Excess becomes credit.`;
        } else {
          paymentDetails.message = `PURCHASE: Minimum payment ${minimumPayment} (to avoid debt). You can pay more, excess becomes credit. Current balance: ${clientBalance}`;
        }
        paymentDetails.canUseCreditBalance = true;
      } else if (calculateTransactionDto.type === 'PICKUP') {
        // PICKUP: Only for transactions that will create debt
        // Any payment where (amountPaid + balance) < total
        requiredPayment = 0; // No minimum - can pay 0 if going into debt
        paymentDetails.message = `PICKUP: Pay any amount less than ${total - clientBalance} to create debt. Balance: ${clientBalance}`;
      }
    } else {
      // Walk-in client - not allowed for deposits
      if (calculateTransactionDto.type === 'DEPOSIT') {
        throw new BadRequestException('Deposit transactions are only allowed for registered clients.');
      }
      paymentDetails.message = `Walk-in client must pay full amount: ${total}`;
    }

    paymentDetails.requiredPayment = requiredPayment;

    return {
      ...paymentDetails,
      items: processedItems,
    };
  }

  /**
   * Generates a new waybill number (does not save to DB)
   */
  async generateWaybillNumber(): Promise<string> {
    const date = new Date();
    const prefix = `WB${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
    const count = await this.transactionModel.countDocuments({
      waybillNumber: { $regex: `^${prefix}` },
    });
    return `${prefix}-${(count + 1).toString().padStart(4, '0')}`;
  }

  /**
   * Assigns a provided waybill number to a transaction and saves it
   */
  async assignWaybillNumber(
    id: string,
    waybillNumber: string,
    user: { userId: string; role: string; email?: string; name?: string },
  ): Promise<Transaction> {
    const transaction = await this.transactionModel.findById(id);
    if (!transaction) throw new NotFoundException('Transaction not found');
    transaction.waybillNumber = waybillNumber;
    const savedTransaction = await transaction.save();

    // Log waybill assignment activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'WAYBILL_ASSIGNED',
        details: `Waybill number ${savedTransaction.waybillNumber} assigned to transaction ${savedTransaction.invoiceNumber}`,
        performedBy: user.email || user.name || user.userId,
        role: user.role,
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log waybill assignment:', logError);
    }

    return savedTransaction;
  }

  // Revenue Analytics Methods
  async getTotalRevenue(branchId?: string, startDate?: Date, endDate?: Date) {
    const filter: any = {
      type: { $in: ['PURCHASE', 'PICKUP', 'DEPOSIT'] },
      status: { $ne: 'CANCELLED' }
    };

    if (branchId) {
      filter.branchId = branchId; // Keep as string since it's stored as string in DB
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    const result = await this.transactionModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          transactionCount: { $sum: 1 },
          totalAmountPaid: { $sum: '$amountPaid' },
          totalDiscount: { $sum: '$discount' }
        }
      }
    ]);

    const transactions = await this.transactionModel
      .find(filter)
      .populate('branchId', 'name')
      .sort({ date: -1 })
      .limit(10);

    return {
      totalRevenue: result[0]?.totalRevenue || 0,
      transactionCount: result[0]?.transactionCount || 0,
      totalAmountPaid: result[0]?.totalAmountPaid || 0,
      totalDiscount: result[0]?.totalDiscount || 0,
      period: this.formatPeriod(startDate, endDate),
      recentTransactions: transactions
    };
  }

  async getDailyRevenue(branchId?: string, date?: Date, startDate?: Date, endDate?: Date) {
    const targetDate = date || new Date();
    let dateRange: { start: Date; end: Date };

    if (startDate && endDate) {
      dateRange = { start: startDate, end: endDate };
    } else {
      // Single day range
      dateRange = {
        start: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
        end: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1)
      };
    }

    const filter: any = {
      type: { $in: ['PURCHASE', 'PICKUP', 'DEPOSIT'] },
      status: { $ne: 'CANCELLED' },
      date: { $gte: dateRange.start, $lt: dateRange.end }
    };

    if (branchId) {
      filter.branchId = branchId; // Keep as string since it's stored as string in DB
    }

    const dailyData = await this.transactionModel.aggregate([
      { $match: filter },
      {
        $group: {
      _id: {
        year: { $year: '$date' },
        month: { $month: '$date' },
        day: { $dayOfMonth: '$date' }
          },
          totalRevenue: { $sum: '$total' },
          transactionCount: { $sum: 1 },
          totalAmountPaid: { $sum: '$amountPaid' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    return {
      totalRevenue: dailyData.reduce((sum, day) => sum + day.totalRevenue, 0),
      transactionCount: dailyData.reduce((sum, day) => sum + day.transactionCount, 0),
      totalAmountPaid: dailyData.reduce((sum, day) => sum + day.totalAmountPaid, 0),
      period: startDate && endDate ? this.formatPeriod(startDate, endDate) : targetDate.toISOString().split('T')[0],
      breakdown: dailyData.map(day => ({
        date: `${day._id.year}-${day._id.month.toString().padStart(2, '0')}-${day._id.day.toString().padStart(2, '0')}`,
        revenue: day.totalRevenue,
        transactions: day.transactionCount,
        amountPaid: day.totalAmountPaid
      }))
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
        end: new Date(targetYear, targetMonth, 1)
      };
    }

      const filter: any = {
      type: { $in: ['PURCHASE', 'PICKUP', 'DEPOSIT'] },
      status: { $ne: 'CANCELLED' },
      date: { $gte: dateRange.start, $lt: dateRange.end }
    };

    if (branchId) {
      filter.branchId = branchId; // Keep as string since it's stored as string in DB
    }

    const monthlyData = await this.transactionModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          totalRevenue: { $sum: '$total' },
          transactionCount: { $sum: 1 },
          totalAmountPaid: { $sum: '$amountPaid' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    return {
      totalRevenue: monthlyData.reduce((sum, month) => sum + month.totalRevenue, 0),
      transactionCount: monthlyData.reduce((sum, month) => sum + month.transactionCount, 0),
      totalAmountPaid: monthlyData.reduce((sum, month) => sum + month.totalAmountPaid, 0),
      period: startDate && endDate ? this.formatPeriod(startDate, endDate) : `${targetYear}-${targetMonth.toString().padStart(2, '0')}`,
      breakdown: monthlyData.map(month => ({
        month: `${month._id.year}-${month._id.month.toString().padStart(2, '0')}`,
        revenue: month.totalRevenue,
        transactions: month.transactionCount,
        amountPaid: month.totalAmountPaid
      }))
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
        end: new Date(targetYear + 1, 0, 1)
      };
    }

    const filter: any = {
      type: { $in: ['PURCHASE', 'PICKUP', 'DEPOSIT'] },
      status: { $ne: 'CANCELLED' },
      date: { $gte: dateRange.start, $lt: dateRange.end }
    };

    if (branchId) {
      filter.branchId = branchId; // Keep as string since it's stored as string in DB
    }

    const yearlyData = await this.transactionModel.aggregate([
      { $match: filter },
      {
        $group: {
      _id: { year: { $year: '$date' } },
          totalRevenue: { $sum: '$total' },
          transactionCount: { $sum: 1 },
          totalAmountPaid: { $sum: '$amountPaid' }
        }
      },
      { $sort: { '_id.year': 1 } }
    ]);

    return {
      totalRevenue: yearlyData.reduce((sum, year) => sum + year.totalRevenue, 0),
      transactionCount: yearlyData.reduce((sum, year) => sum + year.transactionCount, 0),
      totalAmountPaid: yearlyData.reduce((sum, year) => sum + year.totalAmountPaid, 0),
      period: startDate && endDate ? this.formatPeriod(startDate, endDate) : targetYear.toString(),
      breakdown: yearlyData.map(year => ({
        year: year._id.year.toString(),
        revenue: year.totalRevenue,
        transactions: year.transactionCount,
        amountPaid: year.totalAmountPaid
      }))
    };
  }

  private formatPeriod(startDate?: Date, endDate?: Date): string {
    if (startDate && endDate) {
      return `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`;
    }
    if (startDate) {
      return `From ${startDate.toISOString().split('T')[0]}`;
    }
    if (endDate) {
      return `Until ${endDate.toISOString().split('T')[0]}`;
    }
    return 'All time';
  }
}
