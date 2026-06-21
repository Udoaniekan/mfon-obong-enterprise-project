import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async generateSalesReport(startDate: Date, endDate: Date): Promise<SalesReport> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: 'COMPLETED',
      },
      include: {
        items: true,
        clientRef: { select: { id: true, name: true, phone: true } },
        userRef: { select: { id: true, name: true } },
      },
    });

    const productSales = new Map<string, ProductSalesSummary>();
    const dailySales: { [key: string]: number } = {};
    const paymentMethods: { [key: string]: number } = {};
    let totalSales = 0;
    let totalDiscount = 0;
    let totalPaid = 0;
    let totalPending = 0;

    transactions.forEach((transaction) => {
      const dateKey = (transaction.date ? new Date(transaction.date) : new Date())
        .toISOString()
        .split('T')[0];
      const paymentMethod = transaction.paymentMethod || 'UNKNOWN';

      totalSales += transaction.total;
      totalDiscount += transaction.discount;
      totalPaid += transaction.amountPaid;
      totalPending += transaction.total - transaction.amountPaid;
      paymentMethods[paymentMethod] = (paymentMethods[paymentMethod] || 0) + transaction.amountPaid;
      dailySales[dateKey] = (dailySales[dateKey] || 0) + transaction.total;

      transaction.items.forEach((item) => {
        const productId = item.productId;
        const currentProduct = productSales.get(productId) || {
          productId,
          name: item.productName,
          quantity: 0,
          revenue: 0,
          units: new Map<string, number>(),
        };
        currentProduct.quantity += item.quantity;
        currentProduct.revenue += item.subtotal;
        const currentUnitQty = currentProduct.units.get(item.unit) || 0;
        currentProduct.units.set(item.unit, currentUnitQty + item.quantity);
        productSales.set(productId, currentProduct);
      });
    });

    const topProducts = Array.from(productSales.values())
      .map((product) => ({
        productId: product.productId,
        name: product.name,
        quantity: product.quantity,
        revenue: product.revenue,
        units: Array.from(product.units.entries()).reduce(
          (acc, [unit, qty]) => ({ ...acc, [unit]: qty }),
          {},
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
    const products = await this.prisma.product.findMany({
      include: { categoryRef: { select: { id: true, name: true } } },
    });

    const categoryStats = new Map<string, { count: number; value: number; lowStock: number }>();
    const lowStockProducts: Array<{
      id: string;
      name: string;
      currentStock: number;
      minStockLevel: number;
      unit: string;
    }> = [];
    let totalValue = 0;

    products.forEach((product) => {
      const productValue = product.unitPrice * product.stock;
      totalValue += productValue;

      if (product.stock <= product.minStockLevel) {
        lowStockProducts.push({
          id: product.id,
          name: product.name,
          currentStock: product.stock,
          minStockLevel: product.minStockLevel,
          unit: product.unit,
        });
      }

      const categoryKey = product.categoryRef?.name || product.categoryId;
      const currentStats = categoryStats.get(categoryKey) || { count: 0, value: 0, lowStock: 0 };
      currentStats.count++;
      currentStats.value += productValue;
      if (product.stock <= product.minStockLevel) currentStats.lowStock++;
      categoryStats.set(categoryKey, currentStats);
    });

    const byCategory = Array.from(categoryStats.entries()).reduce(
      (acc, [category, stats]) => ({ ...acc, [category]: stats }),
      {},
    );

    return { totalProducts: products.length, lowStockProducts, totalValue, byCategory };
  }

  async generateClientReport() {
    const clients = await this.prisma.client.findMany();
    const transactions = await this.prisma.transaction.findMany({
      where: { status: 'COMPLETED' },
    });

    const summary: any = {
      totalClients: clients.length,
      activeClients: 0,
      totalDebt: 0,
      totalCredit: 0,
      clientsByBalance: { credit: 0, debt: 0, zero: 0 },
      topClients: [],
    };

    const clientTransactions = new Map<string, { totalPurchases: number; lastTransaction: Date | null; transactions: number }>();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    transactions.forEach((transaction) => {
      if (!transaction.clientId) return;
      const current = clientTransactions.get(transaction.clientId) || {
        totalPurchases: 0,
        lastTransaction: null,
        transactions: 0,
      };
      current.totalPurchases += transaction.total;
      current.transactions++;
      const txDate = transaction.date ? new Date(transaction.date) : null;
      if (txDate && (!current.lastTransaction || txDate > current.lastTransaction)) {
        current.lastTransaction = txDate;
      }
      clientTransactions.set(transaction.clientId, current);
    });

    clients.forEach((client) => {
      if (client.balance > 0) {
        summary.totalCredit += client.balance;
        summary.clientsByBalance.credit++;
      } else if (client.balance < 0) {
        summary.totalDebt += Math.abs(client.balance);
        summary.clientsByBalance.debt++;
      } else {
        summary.clientsByBalance.zero++;
      }

      const clientStats = clientTransactions.get(client.id);
      if (clientStats?.lastTransaction && clientStats.lastTransaction >= thirtyDaysAgo) {
        summary.activeClients++;
      }

      if (clientStats) {
        summary.topClients.push({
          id: client.id,
          _id: client.id,
          name: client.name,
          phone: client.phone,
          totalPurchases: clientStats.totalPurchases,
          transactions: clientStats.transactions,
          balance: client.balance,
          lastTransaction: clientStats.lastTransaction,
        });
      }
    });

    summary.topClients.sort((a: any, b: any) => b.totalPurchases - a.totalPurchases);
    summary.topClients = summary.topClients.slice(0, 10);

    return summary;
  }
}
