import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // ✅ Import ConfigModule
import { CloudinaryProvider } from './cloudinary.config';

@Module({
  imports: [ConfigModule], // ✅ Add ConfigModule
  providers: [CloudinaryProvider],
  exports: ['Cloudinary'],
})
export class CloudinaryModule {}
