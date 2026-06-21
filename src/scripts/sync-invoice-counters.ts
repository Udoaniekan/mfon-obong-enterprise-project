import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

async function syncInvoiceCounters() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  console.log('🔄 Syncing invoice counters from existing transactions...');

  const transactions = await prisma.transaction.findMany({
    select: { invoiceNumber: true },
  });

  const prefixMap = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.invoiceNumber && tx.invoiceNumber.match(/^INV\d{4}\d{4}$/)) {
      const prefix = tx.invoiceNumber.substring(0, 7);
      const seq = parseInt(tx.invoiceNumber.substring(7));
      if (!isNaN(seq)) {
        const currentMax = prefixMap.get(prefix) || 0;
        prefixMap.set(prefix, Math.max(currentMax, seq));
      }
    }
  }

  for (const [prefix, maxSeq] of prefixMap) {
    await prisma.$executeRaw`
      INSERT INTO "Counter" (name, value) VALUES (${prefix}, ${maxSeq})
      ON CONFLICT (name) DO UPDATE SET value = GREATEST("Counter".value, ${maxSeq})
    `;
    console.log(`✅ Set ${prefix} counter to ${maxSeq}`);
  }

  console.log('🎉 Invoice counters synced successfully!');
  await app.close();
}

syncInvoiceCounters().catch(console.error);
