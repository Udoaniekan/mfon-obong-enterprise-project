import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ColumnSettingDocument = ColumnSetting & Document;

@Schema({
  timestamps: true,
  versionKey: false,
})
export class ColumnSetting {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ['users'], // Can be extended for other tables in future
    default: 'users',
  })
  tableName: string;

  @Prop({
    type: [String],
    required: true,
    default: ['name', 'email', 'role', 'permissions', 'status', 'location', 'createdAt', 'lastLogin'],
  })
  visibleColumns: string[];

  @Prop({
    type: [String],
    required: false,
  })
  columnOrder: string[];

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const ColumnSettingSchema = SchemaFactory.createForClass(ColumnSetting);

// Create compound index to ensure one setting per user per table
ColumnSettingSchema.index({ userId: 1, tableName: 1 }, { unique: true });
