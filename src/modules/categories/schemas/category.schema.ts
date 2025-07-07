import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CategoryDocument = Category & Document;

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  units: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  description?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch' })
  branchId: Types.ObjectId;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
