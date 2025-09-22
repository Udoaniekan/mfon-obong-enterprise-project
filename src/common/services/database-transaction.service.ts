import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ClientSession } from 'mongoose';

@Injectable()
export class DatabaseTransactionService {
  private readonly logger = new Logger(DatabaseTransactionService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Execute a function within a database transaction
   * All operations will be rolled back if any operation fails
   */
  async executeInTransaction<T>(
    operation: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    
    try {
      let result: T;
      
      await session.withTransaction(async () => {
        this.logger.debug('Starting database transaction');
        result = await operation(session);
        this.logger.debug('Transaction operation completed successfully');
      });

      this.logger.debug('Database transaction committed successfully');
      return result;
    } catch (error) {
      this.logger.error('Database transaction failed, rolling back', error);
      throw error;
    } finally {
      await session.endSession();
      this.logger.debug('Database session ended');
    }
  }

  /**
   * Execute a function within a transaction with custom options
   */
  async executeInTransactionWithOptions<T>(
    operation: (session: ClientSession) => Promise<T>,
    options?: {
      readConcern?: { level: 'local' | 'available' | 'majority' | 'linearizable' | 'snapshot' };
      writeConcern?: { w?: number | string; wtimeout?: number; j?: boolean };
      readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
    },
  ): Promise<T> {
    const session = await this.connection.startSession();
    
    try {
      let result: T;
      
      await session.withTransaction(async () => {
        this.logger.debug('Starting database transaction with custom options');
        result = await operation(session);
        this.logger.debug('Transaction operation completed successfully');
      });

      this.logger.debug('Database transaction committed successfully');
      return result;
    } catch (error) {
      this.logger.error('Database transaction failed, rolling back', error);
      throw error;
    } finally {
      await session.endSession();
      this.logger.debug('Database session ended');
    }
  }
}