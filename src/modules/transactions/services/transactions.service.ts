import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import {
  Transaction,
  TransactionDocument,
} from '../schemas/transaction.schema';
import { Product } from '../../products/schemas/product.schema';
import { Client, ClientDocument } from '../../clients/schemas/client.schema';
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
import { extractDeviceInfo } from 'src/modules/system-activity-logs/utils/device-extractor.util';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly clientsService: ClientsService,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly systemActivityLogService: SystemActivityLogService,
    private readonly realtimeEventService: RealtimeEventService,
  ) {}

  async create(
    createTransactionDto: CreateTransactionDto,
    user: { userId: string; role: string; email?: string; name?: string; branch?:string },
    userAgent: string
  ): Promise<Transaction & { clientBalance?: number }> {
    // Handle RETURN transactions separately
    if (createTransactionDto.type === 'RETURN') {
      return this.createReturnTransaction(createTransactionDto, user, userAgent);
    }

    // Handle WHOLESALE transactions separately
    if (createTransactionDto.type === 'WHOLESALE') {
      return this.createWholesaleTransaction(createTransactionDto, user, userAgent);
    }

    // Reject PICKUP transactions - deprecated type (historical data still supported)
    if ((createTransactionDto.type as any) === 'PICKUP') {
      throw new BadRequestException(
        'PICKUP transaction type is deprecated and can no longer be created. Please use PURCHASE instead.'
      );
    }

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

    // Validate mutual exclusivity of loading charges
    const loadingCharge = createTransactionDto.loading || 0;
    const loadingAndOffloadingCharge = createTransactionDto.loadingAndOffloading || 0;
    
    if (loadingCharge > 0 && loadingAndOffloadingCharge > 0) {
      throw new BadRequestException(
        'Cannot have both "loading" and "loadingAndOffloading" charges in the same transaction. Please use only one.'
      );
    }

    // Validate that additional charges are not applied to DEPOSIT transactions
    if (createTransactionDto.type === 'DEPOSIT') {
      const transportFare = createTransactionDto.transportFare || 0;
      if (transportFare > 0 || loadingCharge > 0 || loadingAndOffloadingCharge > 0) {
        throw new BadRequestException(
          'Transport fare, loading, and loadingAndOffloading charges cannot be applied to DEPOSIT transactions.'
        );
      }
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
      // For PURCHASE, process items normally
      if (!createTransactionDto.items || createTransactionDto.items.length === 0) {
        throw new BadRequestException('Items are required for PURCHASE transactions');
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

    // Calculate total with additional charges
    const discount = createTransactionDto.discount || 0;
    const transportFare = createTransactionDto.transportFare || 0;
    const loadingAndOffloading = createTransactionDto.loadingAndOffloading || 0;
    const loading = createTransactionDto.loading || 0;
    
    const total = subtotal - discount + transportFare + loadingAndOffloading + loading;
    const amountPaid = createTransactionDto.amountPaid || 0;

    // Create transaction
    const session = await this.connection.startSession();
    session.startTransaction();
    
    let newBalance = 0; // Track new balance for return value
    
    try {
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
        // PURCHASE: Registered clients have full flexibility - can go into debt
        // Balance can go negative if (amountPaid + balance) < total
        status = 'COMPLETED';
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
      transportFare: createTransactionDto.transportFare || 0,
      loadingAndOffloading: createTransactionDto.loadingAndOffloading || 0,
      loading: createTransactionDto.loading || 0,
      total,
      amountPaid,
      paymentMethod: createTransactionDto.paymentMethod,
      notes: createTransactionDto.notes,
      status,
      branchId: createTransactionDto.branchId,
      type: createTransactionDto.type,
      isPickedUp: false,
      // Use provided accounting date (backdate) or default to now
      date: accountingDate,
      clientBalanceAfterTransaction: null, // Will be updated after client ledger update
    });

    // Save transaction with retry-on-duplicate (invoiceNumber collisions)
    const maxSaveAttempts = 5;
    let saveAttempt = 0;
    let savedTransaction = null as any;
    while (saveAttempt < maxSaveAttempts) {
      try {
        saveAttempt++;
        savedTransaction = await transaction.save({ session });
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
    if (createTransactionDto.type !== TransactionType.DEPOSIT) {
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
          await this.transactionModel.deleteOne({ _id: savedTransaction._id }, { session });
        } catch (delErr) {
          console.error('Failed to delete transaction after stock update failure', delErr);
        }
        throw new BadRequestException('Failed to update stock. Transaction aborted.');
      }
    }

    // Update client balance only for registered clients
    if (clientId) {
      // Initialize ledger tracking variables (declared outside try for catch block access)
      let ledgerType: 'DEPOSIT' | 'PURCHASE';
      let ledgerAmount = 0;
      let ledgerDescription = `Invoice #${transaction.invoiceNumber}`;
      
      try {
        // LEDGER APPROACH: Calculate new balance based on transaction type
        // Fetch current balance before transaction
        const client = await this.clientsService.findById(clientId.toString());
        const currentBalance = client.balance || 0;
        let newBalance = currentBalance;
        
        if (createTransactionDto.type === 'DEPOSIT') {
          // DEPOSIT: Add payment to balance
          ledgerType = 'DEPOSIT';
          ledgerAmount = amountPaid;
          newBalance = currentBalance + amountPaid;
          ledgerDescription = `Deposit of ${amountPaid} added to account`;
        } else if (createTransactionDto.type === 'PURCHASE') {
          // PURCHASE: Deduct outstanding amount from balance (total - amountPaid)
          ledgerType = 'PURCHASE';
          ledgerAmount = total - amountPaid; // How much is outstanding
          newBalance = currentBalance - ledgerAmount;
          
          if (amountPaid > total) {
            const excess = amountPaid - total;
            ledgerDescription += ` (Overpaid by ${excess} - added as credit)`;
          } else if (amountPaid === total) {
            ledgerDescription += ` (Paid in full)`;
          } else {
            const outstanding = total - amountPaid;
            ledgerDescription += ` (Outstanding: ${outstanding})`;
          }
        }

        // Update client balance atomically within the transaction session
        const updateResult = await this.clientModel.updateOne(
          { _id: clientId },
          { 
            balance: newBalance,
            lastTransactionDate: transaction.date || new Date()
          },
          { session }
        );

        if (updateResult.matchedCount === 0) {
          throw new Error('Client not found during balance update');
        }

        // Update transaction with balance snapshot
        await this.transactionModel.updateOne(
          { _id: savedTransaction._id },
          { clientBalanceAfterTransaction: newBalance },
          { session }
        );

        // Validation: Verify the balance was updated correctly
        const updatedClient = await this.clientModel.findById(clientId).session(session);
        if (updatedClient.balance !== newBalance) {
          throw new Error(
            `Balance validation failed. Expected: ${newBalance}, Got: ${updatedClient.balance}`
          );
        }
      } catch (ledgerErr) {
        // Log the actual error for debugging
        console.error('❌ Client ledger update failed:', ledgerErr);
        console.error('Ledger details:', {
          clientId: clientId.toString(),
          ledgerType,
          ledgerAmount,
          ledgerDescription,
        });
        
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
          await this.transactionModel.deleteOne({ _id: savedTransaction._id }, { session });
        } catch (delErr) {
          console.error('Failed to delete transaction after ledger failure', delErr);
        }
        throw new BadRequestException(`Failed to update client ledger: ${ledgerErr.message}. Transaction aborted.`);
      }
    }

    // Log transaction creation activity (non-blocking)
    this.clientsService
      .findById(createTransactionDto.clientId)
      .then((client) => {
        const clientName = clientId ? client.name : createTransactionDto.walkInClient.name;
        return this.systemActivityLogService.createLog({
          action: 'TRANSACTION_CREATED',
          details: `Transaction ${savedTransaction.invoiceNumber} created for ${clientName} (${createTransactionDto.type}) - Total: ${total}`,
          performedBy: user.email || user.name || user.userId,
          role: user.role,
          device: extractDeviceInfo(userAgent) || "",
        });
      })
      .catch((logError) => {
        console.error('Failed to log transaction creation:', logError);
      });

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

    // Commit the session
    await session.commitTransaction();

    // Return transaction with balance snapshot
    const clientBalance = clientId ? newBalance : null;
    return {
      ...savedTransaction.toJSON(),
      clientBalance,
      clientBalanceAfterTransaction: clientBalance,
    };
    } catch (error) {
      // Rollback transaction on error
      await session.abortTransaction();
      console.error('❌ Transaction creation failed:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async createReturnTransaction(
    createTransactionDto: CreateTransactionDto,
    user: { userId: string; role: string; email?: string; name?: string; branch?: string },
    userAgent: string
  ): Promise<Transaction & { clientBalance?: number }> {
    // Validate required fields for RETURN transactions
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
      throw new BadRequestException('Please enter the amount being returned to the customer (can be 0 if no cash refund).');
    }

    // Fetch the original transaction
    const originalTransaction = await this.transactionModel.findById(createTransactionDto.referenceTransactionId);
    if (!originalTransaction) {
      throw new NotFoundException('The original purchase transaction could not be found. It may have been deleted.');
    }

    // Validate that the original transaction is not a DEPOSIT or RETURN
    if (originalTransaction.type === 'DEPOSIT' || originalTransaction.type === 'RETURN') {
      throw new BadRequestException('You can only return items from purchase transactions, not deposits or previous returns.');
    }

    // Fetch all previous returns for this transaction to calculate remaining returnable quantities
    const previousReturns = await this.transactionModel.find({
      referenceTransactionId: originalTransaction._id,
      type: 'RETURN',
    });

    // Build map of already returned quantities per product
    const returnedQuantitiesMap = new Map<string, number>();
    for (const prevReturn of previousReturns) {
      for (const item of prevReturn.items) {
        const productId = item.productId.toString();
        const currentReturned = returnedQuantitiesMap.get(productId) || 0;
        returnedQuantitiesMap.set(productId, currentReturned + item.quantity);
      }
    }

    // Process returned items and calculate refunds
    let totalRefundedAmount = 0;
    const processedReturnedItems: any[] = [];

    for (const returnItem of createTransactionDto.items) {
      // Find the item in the original transaction
      const originalItem = originalTransaction.items.find(
        (item: any) => item.productId.toString() === returnItem.productId
      );

      if (!originalItem) {
        throw new BadRequestException(
          `This product was not included in the original purchase.`
        );
      }

      // Validate unit matches
      if (returnItem.unit !== originalItem.unit) {
        throw new BadRequestException(
          `Unit mismatch for ${originalItem.productName}. Originally sold in ${originalItem.unit}, but you're trying to return in ${returnItem.unit}.`
        );
      }

      // Validate return quantity does not exceed remaining returnable quantity
      const alreadyReturnedQty = returnedQuantitiesMap.get(returnItem.productId) || 0;
      const remainingReturnableQty = originalItem.quantity - alreadyReturnedQty;

      if (returnItem.quantity > remainingReturnableQty) {
        const alreadyReturnedText = alreadyReturnedQty > 0 ? ` (${alreadyReturnedQty} already returned)` : '';
        throw new BadRequestException(
          `You can only return ${remainingReturnableQty} more ${originalItem.unit} of ${originalItem.productName} from this purchase.${alreadyReturnedText}`
        );
      }

      // Get current product to check current price
      const currentProduct = await this.productsService.findById(returnItem.productId);
      const originalPricePerUnit = originalItem.unitPrice;
      const currentPricePerUnit = currentProduct.unitPrice;

      // Calculate refund per your business rules:
      // If price increased, refund at original price
      // If price decreased, refund at new (lower) price
      const refundPricePerUnit = currentPricePerUnit < originalPricePerUnit
        ? currentPricePerUnit
        : originalPricePerUnit;

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

      // Add returned quantity back to stock (skip for wholesale returns)
      if (!createTransactionDto.skipStockRestore) {
        await this.productsService.updateStock(returnItem.productId, {
          quantity: returnItem.quantity,
          unit: returnItem.unit,
          operation: StockOperation.ADD,
        });
      }
    }

    // Create the return transaction
    const accountingDate = createTransactionDto.date ? new Date(createTransactionDto.date) : new Date();

    const returnTransaction = new this.transactionModel({
      invoiceNumber: await this.generateInvoiceNumber(accountingDate),
      clientId: originalTransaction.clientId,
      walkInClient: originalTransaction.walkInClient,
      userId: new Types.ObjectId(user.userId),
      items: processedReturnedItems,
      subtotal: totalRefundedAmount,
      discount: 0,
      transportFare: 0,
      loadingAndOffloading: 0,
      loading: 0,
      total: totalRefundedAmount,
      amountPaid: 0,
      status: 'COMPLETED',
      branchId: createTransactionDto.branchId || originalTransaction.branchId,
      type: 'RETURN',
      referenceTransactionId: new Types.ObjectId(createTransactionDto.referenceTransactionId),
      reason: createTransactionDto.reason,
      totalRefundedAmount: totalRefundedAmount,
      actualAmountReturned: createTransactionDto.actualAmountReturned,
      date: accountingDate,
      notes: createTransactionDto.notes,
      clientBalanceAfterTransaction: null, // Will be updated after client ledger update
    });

    // Save the return transaction
    const session = await this.connection.startSession();
    session.startTransaction();
    
    try {
      const savedTransaction = await returnTransaction.save({ session });

      // Update client balance if it's a registered client using LEDGER APPROACH
      let newBalance = 0;
      if (originalTransaction.clientId) {
        // LEDGER APPROACH: Fetch current balance and calculate new balance
        const client = await this.clientsService.findById(originalTransaction.clientId.toString());
        const currentBalance = client.balance || 0;
        
        // RETURN: Add actualAmountReturned to balance
        newBalance = currentBalance + createTransactionDto.actualAmountReturned;

        // Update client balance atomically within the transaction session
        const updateResult = await this.clientModel.updateOne(
          { _id: originalTransaction.clientId },
          { 
            balance: newBalance,
            lastTransactionDate: accountingDate
          },
          { session }
        );

        if (updateResult.matchedCount === 0) {
          throw new Error('Client not found during balance update');
        }

        // Update transaction with balance snapshot
        await this.transactionModel.updateOne(
          { _id: savedTransaction._id },
          { clientBalanceAfterTransaction: newBalance },
          { session }
        );

        // Validation: Verify the balance was updated correctly
        const updatedClient = await this.clientModel.findById(originalTransaction.clientId).session(session);
        if (updatedClient.balance !== newBalance) {
          throw new Error(
            `Balance validation failed. Expected: ${newBalance}, Got: ${updatedClient.balance}`
          );
        }
      }

      // Commit the transaction
      await session.commitTransaction();
      await session.endSession();

      // Log return transaction activity (non-blocking)
      this.systemActivityLogService
        .createLog({
          action: 'RETURN_TRANSACTION_CREATED',
          details: `Return transaction ${savedTransaction.invoiceNumber} created for original transaction ${originalTransaction.invoiceNumber}. Total Refunded: ${totalRefundedAmount}, Actual Amount Returned: ${createTransactionDto.actualAmountReturned}`,
          performedBy: user.email || user.name || user.userId,
          role: user.role,
          device: extractDeviceInfo(userAgent) || '',
        })
        .catch((logError) => {
          console.error('Failed to log return transaction:', logError);
        });

      // Emit real-time event
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
            branchId: savedTransaction.branchId?.toString(),
            branch: user.branch || 'System Branch',
          }
        );
        
        this.realtimeEventService.emitTransactionCreated(eventData);
      } catch (realtimeError) {
        console.error('Failed to emit real-time return transaction event:', realtimeError);
      }

      return {
        ...savedTransaction.toJSON(),
        clientBalance: newBalance,
        clientBalanceAfterTransaction: newBalance,
      };
    } catch (error) {
      // Rollback transaction on error
      await session.abortTransaction();
      await session.endSession();
      
      console.error('❌ RETURN transaction creation failed:', error);
      throw new BadRequestException(`Failed to create return transaction: ${error.message}`);
    }
  }

  async createWholesaleTransaction(
    createTransactionDto: CreateTransactionDto,
    user: { userId: string; role: string; email?: string; name?: string; branch?: string },
    userAgent: string
  ): Promise<Transaction & { clientBalance?: number }> {
    // Validate that only registered clients can do WHOLESALE transactions
    if (!createTransactionDto.clientId) {
      throw new BadRequestException('WHOLESALE transactions are only allowed for registered clients');
    }

    // Validate that items are provided for WHOLESALE transactions
    if (!createTransactionDto.items || createTransactionDto.items.length === 0) {
      throw new BadRequestException('Items are required for WHOLESALE transactions');
    }

    let clientId: Types.ObjectId | undefined = undefined;

    // Get registered client
    const client = await this.clientsService.findById(createTransactionDto.clientId);
    
    // Check if client is blocked/suspended
    if (!client.isActive) {
      throw new BadRequestException(
        `Transaction blocked: Client "${client.name}" is currently suspended. Please contact admin to reactivate this client.`
      );
    }
    
    clientId = (client as any)._id;

    // Validate mutual exclusivity of loading charges
    const loadingCharge = createTransactionDto.loading || 0;
    const loadingAndOffloadingCharge = createTransactionDto.loadingAndOffloading || 0;
    
    if (loadingCharge > 0 && loadingAndOffloadingCharge > 0) {
      throw new BadRequestException(
        'Cannot have both "loading" and "loadingAndOffloading" charges in the same transaction. Please use only one.'
      );
    }

    // Process items and calculate totals - NO STOCK OPERATIONS
    let subtotal = 0;
    const processedItems = await Promise.all(
      createTransactionDto.items.map(async (item) => {
        const product = await this.productsService.findById(item.productId);

        // Validate that product is cement
        const category = await this.categoriesService.findById(product.categoryId.toString());
        if (category.name.toLowerCase() !== 'cement') {
          throw new BadRequestException(
            `WHOLESALE transactions are only allowed for cement products. "${product.name}" is not a cement product.`
          );
        }

        // Validate unit matches product category
        if (item.unit !== product.unit) {
          throw new BadRequestException(
            `Invalid unit ${item.unit} for product ${product.name}. This product only accepts ${product.unit}`,
          );
        }

        // For WHOLESALE, use UI-provided unitPrice from request body.
        // Keep wholesalePrice fallback for backward compatibility with older clients.
        const wholesaleUnitPrice = item.unitPrice ?? item.wholesalePrice;
        if (!wholesaleUnitPrice || wholesaleUnitPrice <= 0) {
          throw new BadRequestException(
            `Wholesale unit price is required and must be greater than 0 for product ${product.name}`
          );
        }

        // Calculate price using wholesale unit price from request body (NO STOCK VALIDATION)
        const price = wholesaleUnitPrice * item.quantity;
        const itemSubtotal = price - (item.discount || 0);
        subtotal += itemSubtotal;

        return {
          productId: product._id,
          productName: product.name,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: wholesaleUnitPrice, // Persist effective wholesale unit price
          discount: item.discount || 0,
          subtotal: itemSubtotal,
          wholesalePrice: wholesaleUnitPrice,
        };
      }),
    );

    // Calculate total with additional charges
    const discount = createTransactionDto.discount || 0;
    const transportFare = createTransactionDto.transportFare || 0;
    const loadingAndOffloading = createTransactionDto.loadingAndOffloading || 0;
    const loading = createTransactionDto.loading || 0;
    
    const total = subtotal - discount + transportFare + loadingAndOffloading + loading;
    const amountPaid = createTransactionDto.amountPaid || 0;

    // Determine status based on client balance and payment (PURCHASE allows debt)
    let status = 'PENDING';
    const clientBalance = client.balance || 0;
    const totalAvailable = amountPaid + clientBalance;

    if (totalAvailable >= total) {
      // Payment is sufficient - no debt created (PURCHASE-like)
      status = 'COMPLETED';
    } else {
      // Will create debt (PURCHASE allows this for registered clients)
      status = 'COMPLETED';
    }

    // Determine accounting date (used both for transaction.date and invoice prefix)
    const accountingDate = createTransactionDto.date ? new Date(createTransactionDto.date) : new Date();

    const transaction = new this.transactionModel({
      invoiceNumber: await this.generateInvoiceNumber(accountingDate),
      clientId,
      userId: new Types.ObjectId(user.userId),
      items: processedItems,
      subtotal,
      discount: createTransactionDto.discount || 0,
      transportFare: createTransactionDto.transportFare || 0,
      loadingAndOffloading: createTransactionDto.loadingAndOffloading || 0,
      loading: createTransactionDto.loading || 0,
      total,
      amountPaid,
      paymentMethod: createTransactionDto.paymentMethod,
      notes: createTransactionDto.notes,
      status,
      branchId: createTransactionDto.branchId,
      type: createTransactionDto.type,
      isPickedUp: false, // WHOLESALE is not picked up by default
      date: accountingDate,
      clientBalanceAfterTransaction: null, // Will be updated after client ledger update
    });

    // Start MongoDB session for atomic transaction
    const session = await this.connection.startSession();
    session.startTransaction();
    let newBalance = 0;

    // Initialize ledger tracking variables (declared outside try for error handling)
    let ledgerType: 'PURCHASE' = 'PURCHASE';
    let ledgerAmount = 0;
    let ledgerDescription = `Wholesale Invoice #${transaction.invoiceNumber}`;

    try {
      // Save transaction with retry-on-duplicate (invoiceNumber collisions)
      const maxSaveAttempts = 5;
      let saveAttempt = 0;
      let savedTransaction = null as any;
      while (saveAttempt < maxSaveAttempts) {
        try {
          saveAttempt++;
          savedTransaction = await transaction.save({ session });
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

      // NO STOCK UPDATES FOR WHOLESALE - This is the key difference

      // LEDGER APPROACH: Calculate new balance based on transaction
      // Fetch current balance before transaction
      const currentBalance = client.balance || 0;
      ledgerAmount = total - amountPaid; // How much is outstanding
      newBalance = currentBalance - ledgerAmount;

      if (amountPaid > total) {
        const excess = amountPaid - total;
        ledgerDescription += ` (Overpaid by ${excess} - added as credit)`;
      } else if (amountPaid === total) {
        ledgerDescription += ` (Paid in full)`;
      } else {
        const outstanding = total - amountPaid;
        ledgerDescription += ` (Outstanding: ${outstanding})`;
      }

      // Update client balance atomically within the transaction session
      const updateResult = await this.clientModel.updateOne(
        { _id: clientId },
        { 
          balance: newBalance,
          lastTransactionDate: transaction.date || new Date()
        },
        { session }
      );

      if (updateResult.matchedCount === 0) {
        throw new Error('Client not found during balance update');
      }

      // Update transaction with balance snapshot
      await this.transactionModel.updateOne(
        { _id: savedTransaction._id },
        { clientBalanceAfterTransaction: newBalance },
        { session }
      );

      // Validation: Verify the balance was updated correctly
      const updatedClient = await this.clientModel.findById(clientId).session(session);
      if (updatedClient.balance !== newBalance) {
        throw new Error(
          `Balance validation failed. Expected: ${newBalance}, Got: ${updatedClient.balance}`
        );
      }

      // Commit the transaction
      await session.commitTransaction();

      // Log transaction creation activity (non-blocking)
      this.systemActivityLogService
        .createLog({
          action: 'WHOLESALE_TRANSACTION_CREATED',
          details: `Wholesale transaction ${savedTransaction.invoiceNumber} created for ${client.name} - Total: ${total}`,
          performedBy: user.email || user.name || user.userId,
          role: user.role,
          device: extractDeviceInfo(userAgent) || "",
        })
        .catch((logError) => {
          console.error('Failed to log wholesale transaction creation:', logError);
        });

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
        console.error('❌ Failed to emit real-time wholesale transaction event:', realtimeError);
        // Don't fail transaction creation if real-time event fails
      }

      return {
        ...savedTransaction.toJSON(),
        clientBalance: newBalance,
        clientBalanceAfterTransaction: newBalance,
      };
    } catch (error) {
      // Log the actual error for debugging
      console.error('❌ WHOLESALE transaction failed:', error);
      console.error('Ledger details:', {
        clientId: clientId.toString(),
        ledgerType,
        ledgerAmount,
        ledgerDescription,
      });
      
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
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
      .populate('userId', 'name role')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string): Promise<Transaction> {
    const transaction = await this.transactionModel
      .findById(id)
      .populate('clientId', 'name phone balance')
      .populate('userId', 'name role');

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async findByBranchId(branchId: string): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ branchId })
      .populate('clientId', 'name phone balance')
      .populate('userId', 'name role')
      .sort({ createdAt: -1 });

    return transactions;
  }

  async findByUserId(userId: string): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('clientId', 'name phone')
      .populate('userId', 'name role')
      .sort({ createdAt: -1 });

    return transactions;
  }

  async findByClientId(clientId: string): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ clientId: new Types.ObjectId(clientId) })
      .populate('clientId', 'name phone')
      .populate('userId', 'name role')
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

    // Validate mutual exclusivity of loading charges if being updated
    if (updateTransactionDto.loading !== undefined || updateTransactionDto.loadingAndOffloading !== undefined) {
      const newLoading = updateTransactionDto.loading !== undefined ? updateTransactionDto.loading : transaction.loading;
      const newLoadingAndOffloading = updateTransactionDto.loadingAndOffloading !== undefined 
        ? updateTransactionDto.loadingAndOffloading 
        : transaction.loadingAndOffloading;
      
      if (newLoading > 0 && newLoadingAndOffloading > 0) {
        throw new BadRequestException(
          'Cannot have both "loading" and "loadingAndOffloading" charges in the same transaction. Please use only one.'
        );
      }
    }

    // Validate that additional charges are not applied to DEPOSIT transactions
    if (transaction.type === 'DEPOSIT') {
      if (updateTransactionDto.transportFare || updateTransactionDto.loading || updateTransactionDto.loadingAndOffloading) {
        throw new BadRequestException(
          'Transport fare, loading, and loadingAndOffloading charges cannot be applied to DEPOSIT transactions.'
        );
      }
    }

    // Handle additional charges updates - recalculate total if any charges are updated
    if (
      updateTransactionDto.transportFare !== undefined ||
      updateTransactionDto.loadingAndOffloading !== undefined ||
      updateTransactionDto.loading !== undefined
    ) {
      const newTransportFare = updateTransactionDto.transportFare !== undefined 
        ? updateTransactionDto.transportFare 
        : transaction.transportFare;
      const newLoadingAndOffloading = updateTransactionDto.loadingAndOffloading !== undefined 
        ? updateTransactionDto.loadingAndOffloading 
        : transaction.loadingAndOffloading;
      const newLoading = updateTransactionDto.loading !== undefined 
        ? updateTransactionDto.loading 
        : transaction.loading;
      
      // Recalculate total
      transaction.total = transaction.subtotal - transaction.discount + newTransportFare + newLoadingAndOffloading + newLoading;
      
      // Update the charge fields
      transaction.transportFare = newTransportFare;
      transaction.loadingAndOffloading = newLoadingAndOffloading;
      transaction.loading = newLoading;
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
          type: 'PURCHASE',
          amount: transaction.total,
          description: `Pickup for Invoice #${transaction.invoiceNumber}`,
          reference: transaction._id.toString(),
        },
      );
    }

    Object.assign(transaction, updateTransactionDto);
    const savedTransaction = await transaction.save();

    // Log transaction update activity (non-blocking)
    const changes = Object.keys(updateTransactionDto).join(', ');
    this.systemActivityLogService
      .createLog({
        action: 'TRANSACTION_UPDATED',
        details: `Transaction ${savedTransaction.invoiceNumber} updated - Changes: ${changes}`,
        performedBy: user.email || user.name || user.userId,
        role: user.role,
        device: extractDeviceInfo(userAgent) || '',
      })
      .catch((logError) => {
        console.error('Failed to log transaction update:', logError);
      });

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

    // Validate mutual exclusivity of loading charges
    const loadingCharge = calculateTransactionDto.loading || 0;
    const loadingAndOffloadingCharge = calculateTransactionDto.loadingAndOffloading || 0;
    
    if (loadingCharge > 0 && loadingAndOffloadingCharge > 0) {
      throw new BadRequestException(
        'Cannot have both "loading" and "loadingAndOffloading" charges in the same transaction. Please use only one.'
      );
    }

    // Validate that additional charges are not applied to DEPOSIT transactions
    if (calculateTransactionDto.type === 'DEPOSIT') {
      const transportFare = calculateTransactionDto.transportFare || 0;
      if (transportFare > 0 || loadingCharge > 0 || loadingAndOffloadingCharge > 0) {
        throw new BadRequestException(
          'Transport fare, loading, and loadingAndOffloading charges cannot be applied to DEPOSIT transactions.'
        );
      }
    }

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
    } else if (calculateTransactionDto.type === 'WHOLESALE') {
      // For WHOLESALE transactions, special handling
      if (!calculateTransactionDto.clientId) {
        throw new BadRequestException('WHOLESALE transactions are only allowed for registered clients');
      }
      if (!calculateTransactionDto.items || calculateTransactionDto.items.length === 0) {
        throw new BadRequestException('Items are required for WHOLESALE transactions');
      }
      
      processedItems = await Promise.all(
        calculateTransactionDto.items.map(async (item) => {
          const product = await this.productsService.findById(item.productId);

          // Validate that product is cement
          const category = await this.categoriesService.findById(product.categoryId.toString());
          if (category.name.toLowerCase() !== 'cement') {
            throw new BadRequestException(
              `WHOLESALE transactions are only allowed for cement products. "${product.name}" is not a cement product.`
            );
          }

          // Validate unit matches product category
          if (item.unit !== product.unit) {
            throw new BadRequestException(
              `Invalid unit ${item.unit} for product ${product.name}. This product only accepts ${product.unit}`,
            );
          }

          // For WHOLESALE, use UI-provided unitPrice from request body.
          // Keep wholesalePrice fallback for backward compatibility with older clients.
          const wholesaleUnitPrice = item.unitPrice ?? item.wholesalePrice;
          if (!wholesaleUnitPrice || wholesaleUnitPrice <= 0) {
            throw new BadRequestException(
              `Wholesale unit price is required and must be greater than 0 for product ${product.name}`
            );
          }

          // NO STOCK VALIDATION for WHOLESALE
          // Calculate price using wholesale unit price from request body
          const price = wholesaleUnitPrice * item.quantity;
          const itemSubtotal = price - (item.discount || 0);
          subtotal += itemSubtotal;

          return {
            productId: product._id,
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
      // For PURCHASE, process items normally
      if (!calculateTransactionDto.items || calculateTransactionDto.items.length === 0) {
        throw new BadRequestException('Items are required for PURCHASE transactions');
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

    // Calculate total with additional charges
    const discount = calculateTransactionDto.discount || 0;
    const transportFare = calculateTransactionDto.transportFare || 0;
    const loadingAndOffloading = calculateTransactionDto.loadingAndOffloading || 0;
    const loading = calculateTransactionDto.loading || 0;
    
    const total = subtotal - discount + transportFare + loadingAndOffloading + loading;

    // Calculate required payment based on client type and transaction type
    let requiredPayment = total;
    const paymentDetails = {
      subtotal,
      discount: calculateTransactionDto.discount || 0,
      transportFare: calculateTransactionDto.transportFare || 0,
      loadingAndOffloading: calculateTransactionDto.loadingAndOffloading || 0,
      loading: calculateTransactionDto.loading || 0,
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
      } else if (calculateTransactionDto.type === 'PURCHASE' || calculateTransactionDto.type === 'WHOLESALE') {
        // PURCHASE/WHOLESALE: Any payment where (amountPaid + balance) >= total
        // Minimum payment needed = total - balance (or 0 if balance covers all)
        const minimumPayment = Math.max(0, total - clientBalance);
        requiredPayment = minimumPayment;

        const transactionTypeLabel = calculateTransactionDto.type === 'WHOLESALE' ? 'WHOLESALE' : 'PURCHASE';

        if (clientBalance >= total) {
          paymentDetails.message = `${transactionTypeLabel}: You can pay 0 (balance ${clientBalance} covers all) up to any amount. Excess becomes credit.`;
        } else {
          const shortfall = total - clientBalance;
          paymentDetails.message = `${transactionTypeLabel}: You can pay any amount from 0 to ${total}. Paying less than ${shortfall} will create debt. Current balance: ${clientBalance}`;
        }
        paymentDetails.canUseCreditBalance = true;
      }
    } else {
      // Walk-in client - not allowed for deposits or wholesale
      if (calculateTransactionDto.type === 'DEPOSIT') {
        throw new BadRequestException('Deposit transactions are only allowed for registered clients.');
      }
      if (calculateTransactionDto.type === 'WHOLESALE') {
        throw new BadRequestException('WHOLESALE transactions are only allowed for registered clients.');
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

    // Log waybill assignment activity (non-blocking)
    this.systemActivityLogService
      .createLog({
        action: 'WAYBILL_ASSIGNED',
        details: `Waybill number ${savedTransaction.waybillNumber} assigned to transaction ${savedTransaction.invoiceNumber}`,
        performedBy: user.email || user.name || user.userId,
        role: user.role,
        device: 'System',
      })
      .catch((logError) => {
        console.error('Failed to log waybill assignment:', logError);
      });

    // Emit real-time event for waybill assignment
    try {
      const eventData = this.realtimeEventService.createEventData(
        'updated',
        'transaction',
        savedTransaction._id.toString(),
        savedTransaction,
        {
          id: user.userId,
          email: user.email || 'unknown@system.com',
          role: user.role as UserRole,
          branchId: savedTransaction.branchId?.toString(),
          branch: 'System Branch',
        }
      );

      this.realtimeEventService.emitTransactionUpdated(eventData);
    } catch (realtimeError) {
      console.error('❌ Failed to emit waybill assignment event:', realtimeError);
    }

    return savedTransaction;
  }

  // Revenue Analytics Methods
  async getTotalRevenue(branchId?: string, startDate?: Date, endDate?: Date) {
    const filter: any = {
      type: { $in: ['PURCHASE', 'DEPOSIT', 'WHOLESALE'] },
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
      type: { $in: ['PURCHASE', 'DEPOSIT'] },
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
      type: { $in: ['PURCHASE', 'DEPOSIT', 'WHOLESALE'] },
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
      type: { $in: ['PURCHASE', 'DEPOSIT'] },
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
