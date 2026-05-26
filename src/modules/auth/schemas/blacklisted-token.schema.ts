import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class BlacklistedToken extends Document {
  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ required: true })
  expiresAt: Date;
}

export const BlacklistedTokenSchema = SchemaFactory.createForClass(BlacklistedToken);

// MongoDB will automatically delete documents when expiresAt is reached
BlacklistedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
