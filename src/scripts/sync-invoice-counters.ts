import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { Transaction } from '../modules/transactions/schemas/transaction.schema';

async function syncInvoiceCounters() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));
  
  console.log('🔄 Syncing invoice counters from existing transactions...');
  
  // Get all existing invoices
  const transactions = await transactionModel.find({}, { invoiceNumber: 1 }).exec();
  
  // Group by prefix and find max sequence
  const prefixMap = new Map<string, number>();
  
  for (const tx of transactions) {
    if (tx.invoiceNumber && tx.invoiceNumber.match(/^INV\d{4}\d{4}$/)) {
      const prefix = tx.invoiceNumber.substring(0, 7); // INV2509
      const seq = parseInt(tx.invoiceNumber.substring(7)); // 0017 -> 17
      
      if (!isNaN(seq)) {
        const currentMax = prefixMap.get(prefix) || 0;
        prefixMap.set(prefix, Math.max(currentMax, seq));
      }
    }
  }
  
  // Update counters collection
  const countersCollection = transactionModel.db.collection('invoice_counters');
  
  for (const [prefix, maxSeq] of prefixMap) {
    await countersCollection.updateOne(
      { _id: prefix } as any,
      { $set: { seq: maxSeq } } as any,
      { upsert: true } as any
    );
    console.log(`✅ Set ${prefix} counter to ${maxSeq}`);
  }
  
  console.log('🎉 Invoice counters synced successfully!');
  await app.close();
}

syncInvoiceCounters().catch(console.error);