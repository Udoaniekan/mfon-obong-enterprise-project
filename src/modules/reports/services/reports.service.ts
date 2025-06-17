import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transaction, TransactionDocument } from '../../transactions/schemas/transaction.schema';
import { Product, ProductDocument } from '../../products/schemas/product.schema';
import { Client, ClientDocument } from '../../clients/schemas/client.schema';
interface SalesReportProduct {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  units: { [key: string]: number };
}

interface ProductSalesSummary {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  units: Map<string, number>;
}

export interface SalesReport {
  period: { startDate: Date; endDate: Date };
  totalSales: number;
  totalRevenue: number;
  totalDiscount: number;
  totalPaid: number;
  totalPending: number;
  transactionCount: number;
  topProducts: SalesReportProduct[];
  dailySales: { [key: string]: number };
  paymentMethods: { [key: string]: number };
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
  ) {}

  async generateSalesReport(startDate: Date, endDate: Date): Promise<SalesReport> {
    const transactions = await this.transactionModel
      .find({
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'COMPLETED',
      })
      .populate('clientId', 'name phone')
      .populate('userId', 'name')
      .lean()
      .exec();

    const productSales = new Map<string, ProductSalesSummary>();
    const dailySales: { [key: string]: number } = {};
    const paymentMethods: { [key: string]: number } = {};

    let totalSales = 0;
    let totalDiscount = 0;
    let totalPaid = 0;
    let totalPending = 0;

    transactions.forEach((transaction) => {
      const dateKey = new Date(transaction.createdAt).toISOString().split('T')[0];
      const paymentMethod = transaction.paymentMethod || 'UNKNOWN';

      // Update totals
      totalSales += transaction.total;
      totalDiscount += transaction.discount;
      totalPaid += transaction.amountPaid;
      totalPending += transaction.total - transaction.amountPaid;

      // Update payment methods
      paymentMethods[paymentMethod] = (paymentMethods[paymentMethod] || 0) + transaction.amountPaid;

      // Update daily sales
      dailySales[dateKey] = (dailySales[dateKey] || 0) + transaction.total;

      // Update product sales
      transaction.items.forEach((item) => {
        const productId = item.productId.toString();
        const currentProduct = productSales.get(productId) || {
          productId,
          name: item.productName,
          quantity: 0,
          revenue: 0,
          units: new Map<string, number>(),
        };

        currentProduct.quantity += item.quantity;
        currentProduct.revenue += item.subtotal;
        
        const currentUnitQuantity = currentProduct.units.get(item.unit) || 0;
        currentProduct.units.set(item.unit, currentUnitQuantity + item.quantity);

        productSales.set(productId, currentProduct);
      });
    });

    // Convert product sales to final format
    const topProducts = Array.from(productSales.values())
      .map(product => ({
        productId: product.productId,
        name: product.name,
        quantity: product.quantity,
        revenue: product.revenue,
        units: Array.from(product.units.entries()).reduce(
          (acc, [unit, qty]) => ({ ...acc, [unit]: qty }),
          {}
        ),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      period: { startDate, endDate },
      totalSales,
      totalRevenue: totalSales,
      totalDiscount,
      totalPaid,
      totalPending,
      transactionCount: transactions.length,
      topProducts,
      dailySales,
      paymentMethods,
    };
  }

  async generateInventoryReport() {
    const products = await this.productModel.find().exec();
    
    const categoryStats = new Map<string, {
      count: number;
      value: number;
      lowStock: number;
    }>();
    
    const lowStockProducts: Array<{
      id: string;
      name: string;
      currentStock: number;
      minStockLevel: number;
      unit: string;
    }> = [];

    let totalValue = 0;

    // Process each product
    products.forEach((product) => {
      // Calculate total value
      const productValue = product.unitPrice * product.stock;
      totalValue += productValue;

      // Track low stock products
      if (product.stock <= product.minStockLevel) {
        lowStockProducts.push({
          id: product._id.toString(),
          name: product.name,
          currentStock: product.stock,
          minStockLevel: product.minStockLevel,
          unit: product.unit,
        });
      }

      // Update category statistics
      const categoryId = product.categoryId;
      const currentCategoryStats = categoryStats.get(categoryId) || {
        count: 0,
        value: 0,
        lowStock: 0,
      };

      currentCategoryStats.count++;
      currentCategoryStats.value += productValue;
      if (product.stock <= product.minStockLevel) {
        currentCategoryStats.lowStock++;
      }

      categoryStats.set(categoryId, currentCategoryStats);
    });

    // Convert Map to object for response
    const byCategory = Array.from(categoryStats.entries()).reduce(
      (acc, [category, stats]) => ({
        ...acc,
        [category]: stats,
      }),
      {}
    );

    return {
      totalProducts: products.length,
      lowStockProducts,
      totalValue,
      byCategory,
    };
  }

  async generateClientReport() {
    const clients = await this.clientModel.find().exec();
    const transactions = await this.transactionModel
      .find({ status: 'COMPLETED' })
      .exec();

    const summary = {
      totalClients: clients.length,
      activeClients: 0, // Had transaction in last 30 days
      totalDebt: 0,
      totalCredit: 0,
      clientsByBalance: {
        credit: 0,
        debt: 0,
        zero: 0,
      },
      topClients: [],
    };

    const clientTransactions = new Map();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Process transactions
    transactions.forEach((transaction) => {
      const clientId = transaction.clientId.toString();
      const current = clientTransactions.get(clientId) || {
        totalPurchases: 0,
        lastTransaction: null,
        transactions: 0,
      };

      current.totalPurchases += transaction.total;
      current.transactions++;
      if (!current.lastTransaction || transaction.createdAt > current.lastTransaction) {
        current.lastTransaction = transaction.createdAt;
      }

      clientTransactions.set(clientId, current);
    });

    // Process clients
    clients.forEach((client) => {
      // Balance statistics
      if (client.balance > 0) {
        summary.totalCredit += client.balance;
        summary.clientsByBalance.credit++;
      } else if (client.balance < 0) {
        summary.totalDebt += Math.abs(client.balance);
        summary.clientsByBalance.debt++;
      } else {
        summary.clientsByBalance.zero++;
      }

      // Activity check
      const clientStats = clientTransactions.get(client._id.toString());
      if (clientStats?.lastTransaction >= thirtyDaysAgo) {
        summary.activeClients++;
      }

      // Top clients
      if (clientStats) {
        summary.topClients.push({
          id: client._id,
          name: client.name,
          phone: client.phone,
          totalPurchases: clientStats.totalPurchases,
          transactions: clientStats.transactions,
          balance: client.balance,
          lastTransaction: clientStats.lastTransaction,
        });
      }
    });

    // Sort and limit top clients
    summary.topClients.sort((a, b) => b.totalPurchases - a.totalPurchases);
    summary.topClients = summary.topClients.slice(0, 10);

    return summary;
  }
}
