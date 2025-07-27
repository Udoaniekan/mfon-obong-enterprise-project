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
}

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ required: true })
  invoiceNumber: string;

  @Prop({
    type: String,
    enum: ['DEPOSIT', 'PURCHASE', 'PICKUP'],
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
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
