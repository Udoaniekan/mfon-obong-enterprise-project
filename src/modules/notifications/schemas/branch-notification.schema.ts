import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: true })
export class BranchNotification extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch' })
  branch: Types.ObjectId;

  @Prop({ required: true })
  message: string;

  @Prop({ required: true })
  temporaryPassword: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const BranchNotificationSchema = SchemaFactory.createForClass(BranchNotification);

export type BranchNotificationDocument = BranchNotification & Document;
