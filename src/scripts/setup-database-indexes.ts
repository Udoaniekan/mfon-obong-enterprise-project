import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseIndexesService } from '../common/services/database-indexes.service';
import { Logger } from '@nestjs/common';

async function setupDatabaseIndexes() {
  const logger = new Logger('DatabaseSetup');
  
  try {
    logger.log('Starting database optimization setup...');
    
    const app = await NestFactory.createApplicationContext(AppModule);
    const indexService = app.get(DatabaseIndexesService);
    
    // Create optimized indexes
    await indexService.createOptimizedIndexes();
    
    // Show current index info
    const indexInfo = await indexService.getIndexInfo();
    logger.log('Current database indexes:');
    console.log(JSON.stringify(indexInfo, null, 2));
    
    await app.close();
    logger.log('Database optimization setup completed successfully!');
    
  } catch (error) {
    logger.error('Error setting up database optimization:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  setupDatabaseIndexes();
}

export { setupDatabaseIndexes };