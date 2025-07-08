import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './services/users.service';
import { UsersController } from './controllers/users.controller';
import { UserProfilePictureService } from './services/user-profile-picture.service';
import { CloudinaryModule } from './cloudinary.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }],),
    CloudinaryModule
  ],
  providers: [UsersService, UserProfilePictureService],
  controllers: [UsersController],
  exports: [UsersService, UserProfilePictureService],
})
export class UsersModule {}
