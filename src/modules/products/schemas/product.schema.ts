import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PackagingUnit } from '../../../common/enums';

export type ProductDocument = Product & Document;

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  primaryUnit: PackagingUnit;

  @Prop()
  secondaryUnit?: PackagingUnit;

  @Prop({ required: true })
  conversionRate?: number; // e.g., 1 bag = 50 pounds

  @Prop({ required: true })
  primaryUnitPrice: number;

  @Prop()
  secondaryUnitPrice?: number;

  @Prop({ type: Map, of: Number })
  bulkPrices: Map<number, number>; // quantity threshold -> price

  @Prop({ required: true })
  primaryUnitStock: number;

  @Prop()
  secondaryUnitStock?: number;

  @Prop({ required: true })
  minStockLevel: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [{ price: Number, date: Date }] })
  priceHistory: { price: number; date: Date }[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);
