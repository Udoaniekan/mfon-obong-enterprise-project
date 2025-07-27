import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SystemActivityLogDocument = SystemActivityLog & Document;

@Schema({ timestamps: true })
export class SystemActivityLog {
  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  details: string;

  @Prop({ required: true })
  performedBy: string;

  @Prop({ required: true })
  role: string;

  @Prop({ required: true })
  device: string;

  @Prop({ default: Date.now })
  timestamp: Date;
}

export const SystemActivityLogSchema =
  SchemaFactory.createForClass(SystemActivityLog);
