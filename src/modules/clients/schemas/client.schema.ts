import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClientDocument = Client & Document;

@Schema({ timestamps: true })
export class Client {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  phone: string;

  @Prop()
  email?: string;

  @Prop()
  address?: string;

  @Prop({ default: 0 })
  balance: number; // Positive = credit, Negative = debt

  @Prop({ type: [{ 
    type: { type: String, enum: ['DEPOSIT', 'PURCHASE', 'PICKUP'] },
    amount: Number,
    description: String,
    date: Date,
    reference: String
  }] })
  transactions: Array<{
    type: 'DEPOSIT' | 'PURCHASE' | 'PICKUP';
    amount: number;
    description: string;
    date: Date;
    reference: string;
  }>;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastTransactionDate?: Date;

  @Prop({ default: false })
  isRegistered: boolean;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch' })
  branchId: Types.ObjectId;
}

export const ClientSchema = SchemaFactory.createForClass(Client);