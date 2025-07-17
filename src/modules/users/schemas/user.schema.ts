import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from '../../../common/enums';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  phone: string;

  @Prop()
  address?: string;

  @Prop({ required: true, enum: UserRole, default: UserRole.STAFF })
  role: UserRole;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLogin?: Date;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch' })
  branchId: Types.ObjectId;

  @Prop({ required: true })
  branch: string;

  @Prop()
  branchAddress?: string;

  @Prop()
  profilePicture?: string;

  @Prop({ type: Object })
  profilePictureMeta?: {
    public_id?: string;
    format?: string;
    resource_type?: string;
    width?: number;
    height?: number;
    bytes?: number;
    [key: string]: any;
  };
}

export const UserSchema = SchemaFactory.createForClass(User);
