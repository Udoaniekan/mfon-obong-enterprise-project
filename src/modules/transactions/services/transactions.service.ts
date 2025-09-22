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
import { RealtimeEventService } from '../../websocket/realtime-event.service';
import { UserRole } from '../../../common/enums';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  QueryTransactionsDto,
  CalculateTransactionDto,
} from '../dto/transaction.dto';
import { extractDeviceInfo } from 'src/modules/system-activity-logs/utils/device-extractor.util';
import { DatabaseTransactionService } from '../../../common/services/database-transaction.service';
import { DecimalService } from '../../../common/services/decimal.service';

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
    private readonly dbTransactionService: DatabaseTransactionService,
    private readonly decimalService: DecimalService,
  ) {}

  async create(
    createTransactionDto: CreateTransactionDto,
    user: { userId: string; role: string; email?: string; name?: string; branch?: string },
    userAgent: string
  ): Promise<Transaction & { clientBalance?: number }> {
    return this.dbTransactionService.executeInTransaction(async (session) => {
      let clientId: any = undefined;
      let walkInClient: any = undefined;

      // Step 1: Validate and prepare client information
      if (createTransactionDto.clientId) {
        const client = await this.clientsService.findById(
          createTransactionDto.clientId,
        );
        
        if (!client.isActive) {
          throw new BadRequestException(
            `Transaction blocked: Client "${client.name}" is currently suspended. Please contact admin to reactivate this client.`
          );
        }
        
        clientId = client._id;
      } else if (
        createTransactionDto.walkInClient &&
        createTransactionDto.walkInClient.name
      ) {
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

      // Step 2: Process items and calculate totals using decimal arithmetic
      const processedItems = [];
      let subtotalDecimal = this.decimalService.new(0);

      for (const item of createTransactionDto.items) {
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

        // Calculate price using decimal arithmetic
        const unitPriceDecimal = this.decimalService.new(product.unitPrice);
        const quantityDecimal = this.decimalService.new(item.quantity);
        const discountDecimal = this.decimalService.new(item.discount || 0);
        
        const itemPriceDecimal = this.decimalService.multiply(unitPriceDecimal, quantityDecimal);
        const itemSubtotalDecimal = this.decimalService.subtract(itemPriceDecimal, discountDecimal);
        
        // Ensure subtotal is not negative
        if (this.decimalService.isLessThan(itemSubtotalDecimal, 0)) {
          throw new BadRequestException(
            `Discount for ${product.name} cannot exceed item price. Item price: ${this.decimalService.toFixed(itemPriceDecimal, 2)}, Discount: ${this.decimalService.toFixed(discountDecimal, 2)}`
          );
        }

        subtotalDecimal = this.decimalService.add(subtotalDecimal, itemSubtotalDecimal);

        processedItems.push({
          productId: product._id,
          productName: product.name,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: this.decimalService.toNumber(unitPriceDecimal),
          discount: this.decimalService.toNumber(discountDecimal),
          subtotal: this.decimalService.toNumber(itemSubtotalDecimal),
        });
      }

      // Step 3: Calculate transaction totals
      const globalDiscountDecimal = this.decimalService.new(createTransactionDto.discount || 0);
      const totalDecimal = this.decimalService.subtract(subtotalDecimal, globalDiscountDecimal);
      const amountPaidDecimal = this.decimalService.new(createTransactionDto.amountPaid || 0);

      // Ensure total is not negative
      if (this.decimalService.isLessThan(totalDecimal, 0)) {
        throw new BadRequestException(
          `Global discount cannot exceed subtotal. Subtotal: ${this.decimalService.toFixed(subtotalDecimal, 2)}, Discount: ${this.decimalService.toFixed(globalDiscountDecimal, 2)}`
        );
      }

      // Step 4: Validate payment based on client type
      let status = 'PENDING';
      
      if (clientId) {
        // Registered client
        const type = createTransactionDto.type || 'PURCHASE';
        
        if (type === 'PICKUP') {
          status = 'COMPLETED';
        } else if (type === 'PURCHASE') {
          const client = await this.clientsService.findById(
            createTransactionDto.clientId,
          );
          
          const clientBalanceDecimal = this.decimalService.new(client.balance || 0);
          const requiredPaymentDecimal = this.decimalService.subtract(
            totalDecimal, 
            this.decimalService.isGreaterThan(clientBalanceDecimal, 0) ? clientBalanceDecimal : this.decimalService.new(0)
          );

          if (this.decimalService.isLessThanOrEqual(requiredPaymentDecimal, 0)) {
            // Client has sufficient balance
            if (!this.decimalService.isZero(amountPaidDecimal)) {
              throw new BadRequestException(
                `No payment required. Client has sufficient balance (${this.decimalService.toFixed(clientBalanceDecimal, 2)}) to cover transaction total (${this.decimalService.toFixed(totalDecimal, 2)}).`
              );
            }
          } else {
            // Client needs to pay additional amount
            if (!this.decimalService.isEqual(amountPaidDecimal, requiredPaymentDecimal)) {
              throw new BadRequestException(
                `Insufficient payment. Client must pay exactly ${this.decimalService.toFixed(requiredPaymentDecimal, 2)} to complete this purchase. Current balance: ${this.decimalService.toFixed(clientBalanceDecimal, 2)}, Transaction total: ${this.decimalService.toFixed(totalDecimal, 2)}`
              );
            }
          }
          status = 'COMPLETED';
        }
      } else {
        // Walk-in client - STRICT payment validation
        if (this.decimalService.isLessThan(amountPaidDecimal, totalDecimal)) {
          throw new BadRequestException(
            `Insufficient payment for walk-in client. Required: ${this.decimalService.toFixed(totalDecimal, 2)}, Provided: ${this.decimalService.toFixed(amountPaidDecimal, 2)}. Walk-in clients must pay the full amount upfront.`
          );
        }
        if (this.decimalService.isGreaterThan(amountPaidDecimal, totalDecimal)) {
          throw new BadRequestException(
            `Amount provided exceeds transaction total. Required: ${this.decimalService.toFixed(totalDecimal, 2)}, Provided: ${this.decimalService.toFixed(amountPaidDecimal, 2)}. Walk-in clients must pay exactly the transaction amount.`
          );
        }
        status = 'COMPLETED';
      }

      // Step 5: Create transaction with session
      const transaction = new this.transactionModel({
        invoiceNumber: await this.generateInvoiceNumber(),
        clientId,
        walkInClient,
        userId: new Types.ObjectId(user.userId),
        items: processedItems,
        subtotal: this.decimalService.toNumber(subtotalDecimal),
        discount: this.decimalService.toNumber(globalDiscountDecimal),
        total: this.decimalService.toNumber(totalDecimal),
        amountPaid: this.decimalService.toNumber(amountPaidDecimal),
        paymentMethod: createTransactionDto.paymentMethod,
        notes: createTransactionDto.notes,
        status,
        branchId: createTransactionDto.branchId,
        type: createTransactionDto.type,
        isPickedUp: createTransactionDto.type === 'PICKUP',
      });

      const savedTransaction = await transaction.save({ session });

      // Step 6: Update client balance (for registered clients only)
      if (clientId) {
        const ledgerType =
          createTransactionDto.type === 'PICKUP' ? 'PICKUP' : 'PURCHASE';
        
        await this.clientsService.addTransaction(
          clientId.toString(), 
          {
            type: ledgerType,
            amount: this.decimalService.toNumber(totalDecimal),
            description: `Invoice #${savedTransaction.invoiceNumber}`,
            reference: savedTransaction._id.toString(),
          }, 
          session, // Pass session for transaction
          undefined, // currentUser - we're in a system context
          extractDeviceInfo(userAgent)
        );
      }

      // Step 7: Update stock levels atomically
      for (const item of savedTransaction.items) {
        await this.productsService.updateStock(
          item.productId.toString(),
          {
            quantity: item.quantity,
            unit: item.unit,
            operation: StockOperation.SUBTRACT,
          },
          undefined, // currentUser - we're in a system context
          extractDeviceInfo(userAgent),
          session, // Pass session for transaction
        );
      }

      // Step 8: Log transaction creation (within transaction)
      try {
        await this.systemActivityLogService.createLog({
          action: 'TRANSACTION_CREATED',
          details: `Transaction created: Invoice #${savedTransaction.invoiceNumber}, Total: ${this.decimalService.toFixed(totalDecimal, 2)}, Items: ${savedTransaction.items.length}`,
          performedBy: user.email || user.name || 'System',
          role: user.role || 'SYSTEM',
          device: extractDeviceInfo(userAgent) || '',
        }, { session });
      } catch (logError) {
        console.error('Failed to log transaction creation:', logError);
        // Don't throw error - logging failure shouldn't fail the transaction
      }

      // Step 9: Emit real-time events (after successful transaction)
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
        console.error('Failed to emit real-time event:', realtimeError);
        // Don't throw error - real-time event failure shouldn't fail the transaction
      }

      // Return transaction with client balance for registered clients
      if (clientId) {
        const updatedClient = await this.clientsService.findById(clientId.toString());
        return {
          ...savedTransaction.toObject(),
          clientBalance: updatedClient.balance,
        };
      }

      return savedTransaction.toObject();
    });
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

  async findByBranchId(branchId: string): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ branchId })
      .populate('clientId', 'name phone')
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    return transactions;
  }

  async findByUserId(userId: string): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('clientId', 'name phone')
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    return transactions;
  }

  async findByClientId(clientId: string): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ clientId: new Types.ObjectId(clientId) })
      .populate('clientId', 'name phone')
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

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
      type: { $in: ['PURCHASE', 'PICKUP'] },
      status: { $ne: 'CANCELLED' }
    };

    if (branchId) {
      filter.branchId = branchId; // Keep as string since it's stored as string in DB
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = startDate;
      if (endDate) filter.createdAt.$lte = endDate;
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
      .sort({ createdAt: -1 })
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
      type: { $in: ['PURCHASE', 'PICKUP'] },
      status: { $ne: 'CANCELLED' },
      createdAt: { $gte: dateRange.start, $lt: dateRange.end }
    };

    if (branchId) {
      filter.branchId = branchId; // Keep as string since it's stored as string in DB
    }

    const dailyData = await this.transactionModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
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
      type: { $in: ['PURCHASE', 'PICKUP'] },
      status: { $ne: 'CANCELLED' },
      createdAt: { $gte: dateRange.start, $lt: dateRange.end }
    };

    if (branchId) {
      filter.branchId = branchId; // Keep as string since it's stored as string in DB
    }

    const monthlyData = await this.transactionModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
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
      type: { $in: ['PURCHASE', 'PICKUP'] },
      status: { $ne: 'CANCELLED' },
      createdAt: { $gte: dateRange.start, $lt: dateRange.end }
    };

    if (branchId) {
      filter.branchId = branchId; // Keep as string since it's stored as string in DB
    }

    const yearlyData = await this.transactionModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { year: { $year: '$createdAt' } },
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
