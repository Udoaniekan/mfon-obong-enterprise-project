import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
export type TransactionDocument = Transaction & Document;

@Schema({ timestamps: true })
export class TransactionItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId: string;

  @Prop({ required: true })
  productName: string;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  unit: string;

  @Prop({ required: true })
  unitPrice: number;

  @Prop({ default: 0 })
  discount: number;

  @Prop({ required: true })
  subtotal: number;

  @Prop()
  wholesalePrice?: number;
}

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ required: true })
  invoiceNumber: string;

  @Prop({
    type: String,
    enum: ['DEPOSIT', 'PURCHASE', 'PICKUP', 'RETURN', 'WHOLESALE'],
    required: true,
  })
  type: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: false })
  clientId?: MongooseSchema.Types.ObjectId;

  @Prop({
    type: Object,
    required: false,
    default: undefined,
  })
  walkInClient?: {
    name: string;
    phone?: string;
    address?: string;
  };

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ type: [TransactionItem], required: true })
  items: TransactionItem[];

  @Prop({ required: true })
  subtotal: number;

  @Prop({ default: 0 })
  discount: number;

  @Prop({ default: 0 })
  transportFare: number;

  @Prop({ default: 0 })
  loadingAndOffloading: number;

  @Prop({ default: 0 })
  loading: number;

  @Prop({ required: true })
  total: number;

  @Prop({ default: 0 })
  amountPaid: number;

  @Prop()
  paymentMethod?: string;

  @Prop({ default: false })
  isPickedUp: boolean;

  @Prop()
  pickupDate?: Date;

  // Accounting date for the transaction (can be backdated). If not provided, service will set this to the current date.
  @Prop()
  date?: Date;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch' })
  branchId: Types.ObjectId;

  @Prop({ type: String, default: null })
  waybillNumber?: string;

  @Prop({
    type: String,
    enum: ['PENDING', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING',
  })
  status: string;

  @Prop()
  notes?: string;

  // Fields specific to RETURN transactions
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Transaction' })
  referenceTransactionId?: MongooseSchema.Types.ObjectId;

  @Prop()
  reason?: string;

  @Prop({ type: Number })
  totalRefundedAmount?: number;

  @Prop({ type: Number })
  actualAmountReturned?: number;

  // Store client balance snapshot after this transaction (for historical accuracy)
  @Prop({ type: Number })
  clientBalanceAfterTransaction?: number;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
// Ensure invoiceNumber is unique to prevent duplicates
TransactionSchema.index({ invoiceNumber: 1 }, { unique: true });
