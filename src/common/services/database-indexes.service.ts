import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class DatabaseIndexesService {
  private readonly logger = new Logger(DatabaseIndexesService.name);

  constructor(@InjectConnection() private connection: Connection) {}

  async createOptimizedIndexes(): Promise<void> {
    try {
      this.logger.log('Creating database indexes for performance optimization...');

      // Product indexes - for frequent queries
      await this.createProductIndexes();
      
      // Transaction indexes - for reporting and filtering
      await this.createTransactionIndexes();
      
      // User indexes - for authentication and filtering
      await this.createUserIndexes();
      
      // Client indexes - for search and balance queries
      await this.createClientIndexes();

      this.logger.log('Database indexes created successfully');
    } catch (error) {
      this.logger.error('Error creating database indexes:', error);
    }
  }

  private async createProductIndexes(): Promise<void> {
    const productCollection = this.connection.collection('products');
    
    // Single field indexes
    await productCollection.createIndex({ name: 1 }); // For product search
    await productCollection.createIndex({ categoryId: 1 }); // For category filtering
    await productCollection.createIndex({ branchId: 1 }); // For branch filtering
    await productCollection.createIndex({ isActive: 1 }); // For active product filtering
    await productCollection.createIndex({ stock: 1 }); // For stock level queries
    
    // Compound indexes for common queries
    await productCollection.createIndex({ branchId: 1, isActive: 1 }); // Active products by branch
    await productCollection.createIndex({ branchId: 1, categoryId: 1 }); // Products by branch and category
    await productCollection.createIndex({ stock: 1, minStockLevel: 1 }); // Low stock alerts
    
    this.logger.log('Product indexes created');
  }

  private async createTransactionIndexes(): Promise<void> {
    const transactionCollection = this.connection.collection('transactions');
    
    // Single field indexes
    await transactionCollection.createIndex({ invoiceNumber: 1 }, { unique: true }); // Unique invoice lookup
    await transactionCollection.createIndex({ type: 1 }); // Transaction type filtering
    await transactionCollection.createIndex({ clientId: 1 }); // Client transaction history
    await transactionCollection.createIndex({ userId: 1 }); // User transaction history
    await transactionCollection.createIndex({ branchId: 1 }); // Branch transactions
    await transactionCollection.createIndex({ status: 1 }); // Transaction status filtering
    await transactionCollection.createIndex({ createdAt: -1 }); // Recent transactions first
    
    // Compound indexes for common queries
    await transactionCollection.createIndex({ branchId: 1, type: 1 }); // Transactions by branch and type
    await transactionCollection.createIndex({ branchId: 1, createdAt: -1 }); // Recent transactions by branch
    await transactionCollection.createIndex({ clientId: 1, createdAt: -1 }); // Client transaction history by date
    await transactionCollection.createIndex({ userId: 1, createdAt: -1 }); // User transaction history by date
    await transactionCollection.createIndex({ status: 1, createdAt: -1 }); // Transactions by status and date
    
    this.logger.log('Transaction indexes created');
  }

  private async createUserIndexes(): Promise<void> {
    const userCollection = this.connection.collection('users');
    
    // Single field indexes
    await userCollection.createIndex({ email: 1 }, { unique: true }); // Unique email for login
    await userCollection.createIndex({ phone: 1 }); // Phone lookup
    await userCollection.createIndex({ role: 1 }); // Role-based filtering
    await userCollection.createIndex({ branchId: 1 }); // Users by branch
    await userCollection.createIndex({ isActive: 1 }); // Active users
    await userCollection.createIndex({ lastLogin: -1 }); // Recent login tracking
    
    // Compound indexes
    await userCollection.createIndex({ branchId: 1, role: 1 }); // Users by branch and role
    await userCollection.createIndex({ branchId: 1, isActive: 1 }); // Active users by branch
    
    this.logger.log('User indexes created');
  }

  private async createClientIndexes(): Promise<void> {
    const clientCollection = this.connection.collection('clients');
    
    // Single field indexes
    await clientCollection.createIndex({ name: 1 }); // Client name search
    await clientCollection.createIndex({ phone: 1 }); // Phone lookup
    await clientCollection.createIndex({ email: 1 }); // Email lookup
    await clientCollection.createIndex({ isActive: 1 }); // Active clients
    await clientCollection.createIndex({ balance: 1 }); // Balance queries
    await clientCollection.createIndex({ lastTransactionDate: -1 }); // Recent activity
    
    // Text search index for client search
    await clientCollection.createIndex({ 
      name: 'text', 
      phone: 'text', 
      email: 'text' 
    }); // Full text search
    
    this.logger.log('Client indexes created');
  }

  async getIndexInfo(): Promise<any> {
    const collections = ['products', 'transactions', 'users', 'clients'];
    const indexInfo = {};

    for (const collectionName of collections) {
      try {
        const collection = this.connection.collection(collectionName);
        indexInfo[collectionName] = await collection.listIndexes().toArray();
      } catch (error) {
        this.logger.warn(`Could not get index info for ${collectionName}:`, error.message);
        indexInfo[collectionName] = [];
      }
    }

    return indexInfo;
  }
}