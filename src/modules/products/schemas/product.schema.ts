import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Category } from '../../categories/schemas/category.schema';

export type ProductDocument = Product & Document;

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true })
  name: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Category.name, required: true })
  categoryId: string;

  @Prop({ required: true })
  unit: string;

  @Prop({ required: true })
  unitPrice: number;

  @Prop({ required: true })
  stock: number;

  @Prop({ required: true })
  minStockLevel: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [{ price: Number, date: Date }] })
  priceHistory: { price: number; date: Date }[];

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch' })
  branchId: Types.ObjectId;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
