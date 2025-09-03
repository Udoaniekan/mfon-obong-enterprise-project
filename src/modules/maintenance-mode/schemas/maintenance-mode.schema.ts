import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MaintenanceModeDocument = MaintenanceMode & Document;

@Schema({ timestamps: true })
export class MaintenanceMode {
  @Prop({ required: true, default: false })
  isActive: boolean;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  activatedBy: Types.ObjectId;

  @Prop({ type: String })
  reason?: string;

  @Prop({ type: Date })
  activatedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deactivatedBy?: Types.ObjectId;

  @Prop({ type: Date })
  deactivatedAt?: Date;

  @Prop({ type: String })
  deactivationReason?: string;
}

export const MaintenanceModeSchema = SchemaFactory.createForClass(MaintenanceMode);

// Ensure only one document exists
MaintenanceModeSchema.index({ isActive: 1 }, { unique: false });