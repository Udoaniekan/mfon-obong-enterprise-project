import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from '../../modules/products/schemas/product.schema';
import { Transaction, TransactionDocument } from '../../modules/transactions/schemas/transaction.schema';
import { DecimalService } from './decimal.service';
import { DatabaseTransactionService } from './database-transaction.service';

export interface StockDiscrepancy {
  productId: string;
  productName: string;
  expectedStock: number;
  actualStock: number;
  discrepancy: number;
  unit: string;
  lastTransactionDate?: Date;
}

export interface ReconciliationReport {
  totalProducts: number;
  discrepanciesFound: number;
  discrepancies: StockDiscrepancy[];
  reconciliationDate: Date;
  totalValue: number;
  affectedValue: number;
}

@Injectable()
export class StockReconciliationService {
  private readonly logger = new Logger(StockReconciliationService.name);

  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    private readonly decimalService: DecimalService,
    private readonly dbTransactionService: DatabaseTransactionService,
  ) {}

  /**
   * Performs a comprehensive stock reconciliation
   * Compares calculated stock levels (based on transactions) with stored stock levels
   */
  async performReconciliation(branchId?: string): Promise<ReconciliationReport> {
    this.logger.log('Starting stock reconciliation...');
    
    const filter: any = {};
    if (branchId) {
      filter.branchId = branchId;
    }

    const products = await this.productModel.find(filter).exec();
    const discrepancies: StockDiscrepancy[] = [];
    let totalValue = this.decimalService.new(0);
    let affectedValue = this.decimalService.new(0);

    for (const product of products) {
      try {
        const calculatedStock = await this.calculateExpectedStock(product._id.toString());
        const actualStock = product.stock || 0;
        
        const expectedStockDecimal = this.decimalService.new(calculatedStock);
        const actualStockDecimal = this.decimalService.new(actualStock);
        const discrepancyDecimal = this.decimalService.subtract(actualStockDecimal, expectedStockDecimal);
        
        // Add to total value calculation
        const productValueDecimal = this.decimalService.multiply(
          this.decimalService.new(actualStock),
          this.decimalService.new(product.unitPrice)
        );
        totalValue = this.decimalService.add(totalValue, productValueDecimal);

        if (!this.decimalService.isZero(discrepancyDecimal)) {
          const discrepancy: StockDiscrepancy = {
            productId: product._id.toString(),
            productName: product.name,
            expectedStock: this.decimalService.toNumber(expectedStockDecimal),
            actualStock: this.decimalService.toNumber(actualStockDecimal),
            discrepancy: this.decimalService.toNumber(discrepancyDecimal),
            unit: product.unit,
            lastTransactionDate: await this.getLastTransactionDate(product._id.toString()),
          };

          discrepancies.push(discrepancy);

          // Add to affected value
          const discrepancyValueDecimal = this.decimalService.multiply(
            this.decimalService.abs(discrepancyDecimal),
            this.decimalService.new(product.unitPrice)
          );
          affectedValue = this.decimalService.add(affectedValue, discrepancyValueDecimal);

          this.logger.warn(
            `Stock discrepancy found for ${product.name}: Expected ${calculatedStock}, Actual ${actualStock}, Difference ${this.decimalService.toNumber(discrepancyDecimal)} ${product.unit}`
          );
        }
      } catch (error) {
        this.logger.error(`Error reconciling stock for product ${product.name}:`, error);
      }
    }

    const report: ReconciliationReport = {
      totalProducts: products.length,
      discrepanciesFound: discrepancies.length,
      discrepancies,
      reconciliationDate: new Date(),
      totalValue: this.decimalService.toNumber(totalValue),
      affectedValue: this.decimalService.toNumber(affectedValue),
    };

    this.logger.log(
      `Stock reconciliation completed. ${discrepancies.length} discrepancies found out of ${products.length} products.`
    );

    return report;
  }

  /**
   * Calculates expected stock based on initial stock and all transactions
   */
  private async calculateExpectedStock(productId: string): Promise<number> {
    // Get all completed transactions that affected this product
    const transactions = await this.transactionModel
      .find({
        'items.productId': productId,
        status: 'COMPLETED',
      })
      .sort({ createdAt: 1 })
      .exec();

    let calculatedStock = this.decimalService.new(0);

    // We need to get the initial stock at the time of first transaction
    // For now, we'll calculate based on current stock + all outgoing transactions
    // This assumes no manual stock adjustments outside the system
    
    const product = await this.productModel.findById(productId).exec();
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    // Start with current stock
    calculatedStock = this.decimalService.new(product.stock || 0);

    // Add back all stock that was subtracted by transactions
    for (const transaction of transactions) {
      for (const item of transaction.items) {
        if (item.productId.toString() === productId) {
          const quantityDecimal = this.decimalService.new(item.quantity);
          
          if (transaction.type === 'PURCHASE' || transaction.type === 'PICKUP') {
            // These transactions subtract stock, so add it back to get original
            calculatedStock = this.decimalService.add(calculatedStock, quantityDecimal);
          }
          // Note: We don't handle DEPOSIT type here as it doesn't affect product stock
        }
      }
    }

    // Now subtract all stock that should have been subtracted by transactions
    for (const transaction of transactions) {
      for (const item of transaction.items) {
        if (item.productId.toString() === productId) {
          const quantityDecimal = this.decimalService.new(item.quantity);
          
          if (transaction.type === 'PURCHASE' || transaction.type === 'PICKUP') {
            calculatedStock = this.decimalService.subtract(calculatedStock, quantityDecimal);
          }
        }
      }
    }

    return this.decimalService.toNumber(calculatedStock);
  }

  /**
   * Gets the date of the last transaction affecting a product
   */
  private async getLastTransactionDate(productId: string): Promise<Date | undefined> {
    const lastTransaction = await this.transactionModel
      .findOne({
        'items.productId': productId,
        status: 'COMPLETED',
      })
      .sort({ createdAt: -1 })
      .exec();

    return lastTransaction?.createdAt;
  }

  /**
   * Automatically corrects stock discrepancies by updating product stock to match calculated values
   * WARNING: This should only be used after careful analysis
   */
  async autoCorrectDiscrepancies(
    discrepancies: StockDiscrepancy[],
    reason: string = 'Stock reconciliation auto-correction'
  ): Promise<void> {
    return this.dbTransactionService.executeInTransaction(async (session) => {
      this.logger.log(`Auto-correcting ${discrepancies.length} stock discrepancies...`);

      for (const discrepancy of discrepancies) {
        try {
          await this.productModel.updateOne(
            { _id: discrepancy.productId },
            { 
              $set: { 
                stock: discrepancy.expectedStock,
                lastReconciliation: new Date(),
                reconciliationReason: reason,
              }
            },
            { session }
          );

          this.logger.log(
            `Corrected stock for ${discrepancy.productName}: ${discrepancy.actualStock} → ${discrepancy.expectedStock} ${discrepancy.unit}`
          );
        } catch (error) {
          this.logger.error(`Failed to correct stock for ${discrepancy.productName}:`, error);
          throw error;
        }
      }

      this.logger.log('Stock auto-correction completed successfully');
    });
  }

  /**
   * Identifies products with critically low stock levels
   */
  async getLowStockAlert(branchId?: string): Promise<ProductDocument[]> {
    const filter: any = {
      $expr: {
        $lte: ['$stock', '$minStockLevel']
      }
    };

    if (branchId) {
      filter.branchId = branchId;
    }

    return this.productModel
      .find(filter)
      .populate('categoryId', 'name')
      .populate('branchId', 'name')
      .exec();
  }

  /**
   * Identifies products with zero or negative stock
   */
  async getZeroStockProducts(branchId?: string): Promise<ProductDocument[]> {
    const filter: any = {
      stock: { $lte: 0 }
    };

    if (branchId) {
      filter.branchId = branchId;
    }

    return this.productModel
      .find(filter)
      .populate('categoryId', 'name')
      .populate('branchId', 'name')
      .exec();
  }

  /**
   * Generates a detailed inventory report with stock values
   */
  async generateInventoryReport(branchId?: string): Promise<{
    products: any[];
    totalValue: number;
    lowStockCount: number;
    zeroStockCount: number;
    totalProducts: number;
  }> {
    const filter: any = {};
    if (branchId) {
      filter.branchId = branchId;
    }

    const products = await this.productModel
      .find(filter)
      .populate('categoryId', 'name')
      .populate('branchId', 'name')
      .exec();

    let totalValue = this.decimalService.new(0);
    let lowStockCount = 0;
    let zeroStockCount = 0;

    const reportProducts = products.map(product => {
      const stockDecimal = this.decimalService.new(product.stock || 0);
      const priceDecimal = this.decimalService.new(product.unitPrice);
      const valueDecimal = this.decimalService.multiply(stockDecimal, priceDecimal);
      
      totalValue = this.decimalService.add(totalValue, valueDecimal);

      if (product.stock <= 0) {
        zeroStockCount++;
      } else if (product.stock <= product.minStockLevel) {
        lowStockCount++;
      }

      return {
        id: product._id,
        name: product.name,
        category: (product.categoryId as any)?.name || 'Unknown',
        branch: (product.branchId as any)?.name || 'Unknown',
        stock: product.stock,
        unit: product.unit,
        unitPrice: product.unitPrice,
        totalValue: this.decimalService.toNumber(valueDecimal),
        minStockLevel: product.minStockLevel,
        isLowStock: product.stock <= product.minStockLevel,
        isZeroStock: product.stock <= 0,
      };
    });

    return {
      products: reportProducts,
      totalValue: this.decimalService.toNumber(totalValue),
      lowStockCount,
      zeroStockCount,
      totalProducts: products.length,
    };
  }
}