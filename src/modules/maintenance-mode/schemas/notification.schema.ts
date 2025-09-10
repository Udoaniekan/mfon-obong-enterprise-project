import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true })
  userEmail: string;

  @Prop({ required: false })
  userId?: string;

  @Prop({ required: false })
  message: string;
}

export type NotificationDocument = Notification & Document;
export const NotificationSchema = SchemaFactory.createForClass(Notification);
