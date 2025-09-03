import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SessionManagementDocument = SessionManagement & Document;

@Schema({ timestamps: true })
export class SessionManagement {
  @Prop({ required: true })
  startTime: string; // Format: "HH:mm" (24-hour format, e.g., "08:00")

  @Prop({ required: true })
  endTime: string; // Format: "HH:mm" (24-hour format, e.g., "21:00")

  @Prop({ required: true })
  timezone: string; // Timezone string (e.g., "Africa/Lagos", "UTC")

  @Prop({ type: Types.ObjectId, required: true })
  setBy: Types.ObjectId; // MAINTAINER who set the active hours

  @Prop({ required: true })
  setByEmail: string; // Email of the maintainer who set it

  @Prop({ default: true })
  isActive: boolean; // Whether session management is currently enabled

  @Prop()
  description?: string; // Optional description for the active hours setting
}

export const SessionManagementSchema = SchemaFactory.createForClass(SessionManagement);

// Index for efficient querying
SessionManagementSchema.index({ isActive: 1 });
SessionManagementSchema.index({ setBy: 1 });