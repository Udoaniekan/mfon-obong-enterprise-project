import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class UserProfilePictureService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadProfilePicture(
    userId: string,
    file: Express.Multer.File,
    currentUser: any,
  ): Promise<string> {
    try {
      if (!file) {
        throw new ForbiddenException('No file provided. Please upload a JPEG image.');
      }
      if (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/pjpeg') {
        throw new ForbiddenException('Only JPEG images are allowed');
      }
      if (
        currentUser.userId !== userId &&
        !['SUPER_ADMIN', 'MAINTAINER'].includes(currentUser.role)
      ) {
        throw new ForbiddenException('You can only update your own profile picture');
      }

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'profile_pictures', public_id: `user_${userId}`, overwrite: true },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          },
        );
        Readable.from(file.buffer).pipe(uploadStream);
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          profilePicture: result.secure_url,
          profilePictureMeta: {
            public_id: result.public_id,
            format: result.format,
            resource_type: result.resource_type,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            ...result,
          },
        },
      });

      return result.secure_url;
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException) throw error;
      throw new ForbiddenException(error.message || 'Profile picture upload failed');
    }
  }

  async deleteProfilePicture(userId: string, currentUser: any): Promise<void> {
    try {
      if (
        currentUser.userId !== userId &&
        !['SUPER_ADMIN', 'MAINTAINER'].includes(currentUser.role)
      ) {
        throw new ForbiddenException('You can only delete your own profile picture');
      }

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      if (user.profilePicture && (user.profilePictureMeta as any)?.public_id) {
        await cloudinary.uploader.destroy((user.profilePictureMeta as any).public_id);
        await this.prisma.user.update({
          where: { id: userId },
          data: { profilePicture: null, profilePictureMeta: null },
        });
      }
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException) throw error;
      throw new ForbiddenException(error.message || 'Profile picture delete failed');
    }
  }
}
