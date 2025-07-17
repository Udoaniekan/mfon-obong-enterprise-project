import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class UserProfilePictureService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async uploadProfilePicture(userId: string, file: Express.Multer.File, currentUser: any): Promise<string> {
    try {
      if (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/pjpeg') {
        throw new ForbiddenException('Only JPEG images are allowed');
      }
      if (currentUser.userId !== userId && !['SUPER_ADMIN', 'MAINTAINER'].includes(currentUser.role)) {
        throw new ForbiddenException('You can only update your own profile picture');
      }
      const user = await this.userModel.findById(userId);
      if (!user) throw new NotFoundException('User not found');
      // Upload to Cloudinary using upload_stream
      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'profile_pictures',
            public_id: `user_${userId}`,
            overwrite: true,
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          },
        );
        Readable.from(file.buffer).pipe(uploadStream);
      });
      user.profilePicture = result.secure_url;
      user.profilePictureMeta = {
        public_id: result.public_id,
        format: result.format,
        resource_type: result.resource_type,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        // Store any other relevant Cloudinary fields
        ...result,
      };
      await user.save();
      return user.profilePicture;
    } catch (error) {
      console.error('Profile picture upload error:', error);
      if (error instanceof ForbiddenException || error instanceof NotFoundException) {
        throw error;
      }
      throw new ForbiddenException(error.message || 'Profile picture upload failed');
    }
  }

  async deleteProfilePicture(userId: string, currentUser: any): Promise<void> {
    try {
      if (currentUser.userId !== userId && !['SUPER_ADMIN', 'MAINTAINER'].includes(currentUser.role)) {
        throw new ForbiddenException('You can only delete your own profile picture');
      }
      const user = await this.userModel.findById(userId);
      if (!user) throw new NotFoundException('User not found');
      if (user.profilePicture && user.profilePictureMeta?.public_id) {
        await cloudinary.uploader.destroy(user.profilePictureMeta.public_id);
        user.profilePicture = undefined;
        user.profilePictureMeta = undefined;
        await user.save();
      }
    } catch (error) {
      console.error('Profile picture delete error:', error);
      if (error instanceof ForbiddenException || error instanceof NotFoundException) {
        throw error;
      }
      throw new ForbiddenException(error.message || 'Profile picture delete failed');
    }
  }
}
