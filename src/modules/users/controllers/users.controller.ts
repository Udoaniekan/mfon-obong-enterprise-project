import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto';
import { BlockUserDto } from '../dto/block-user.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
// ...existing code...
// ...existing code...
import { User } from '../schemas/user.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../../common/enums';
import { Roles } from 'src/decorators/roles.decorators';
import { UserProfilePictureService } from '../services/user-profile-picture.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userProfilePictureService: UserProfilePictureService,
  ) {}
  @Patch(':id/block')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async blockUser(
    @Param('id') id: string,
    @Body() blockUserDto: BlockUserDto,
    @Request() req,
  ): Promise<User> {
    return this.usersService.blockUser(id, blockUserDto, req.user);
  }
  @Patch(':id/unblock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async unblockUser(@Param('id') id: string, @Request() req): Promise<User> {
    return this.usersService.unblockUser(id, req.user);
  }

  @Post()
  @Roles(UserRole.MAINTAINER)
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async findAll(@Request() req): Promise<User[]> {
    return this.usersService.findAll(req.user);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  async findOne(@Param('id') id: string, @Request() req): Promise<User> {
    const user = await this.usersService.findById(id, req.user);
    // Only allow ADMIN to get users from their own branch
    if (
      req.user.role === UserRole.ADMIN &&
      user.branchId.toString() !== req.user.branchId
    ) {
      throw new Error(
        'Forbidden: ADMIN can only access users from their own branch',
      );
    }
    return user;
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req,
  ): Promise<User> {
    const user = await this.usersService.findById(id, req.user);
    // Only allow ADMIN to update users from their own branch
    if (
      req.user.role === UserRole.ADMIN &&
      user.branchId.toString() !== req.user.branchId
    ) {
      throw new Error(
        'Forbidden: ADMIN can only update users from their own branch',
      );
    }
    return this.usersService.update(id, updateUserDto, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async remove(@Param('id') id: string, @Request() req): Promise<void> {
    return this.usersService.remove(id, req.user);
  }

  @Patch(':id/update-password')
  async updatePassword(
    @Param('id') id: string,
    @Body() body: { previousPassword: string; newPassword: string },
    @Request() req,
  ): Promise<{ message: string }> {
    // Only allow users to update their own password or MAINTAINER
    if (req.user.role !== UserRole.MAINTAINER && req.user.userId !== id) {
      throw new Error('Forbidden');
    }
    await this.usersService.updatePassword(
      id,
      body.previousPassword,
      body.newPassword,
    );
    return { message: 'Password updated successfully' };
  }

  @Patch(':id/profile-picture')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProfilePicture(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ): Promise<{ url: string }> {
    // Only allow MAINTAINER or the owner of the profile
    if (req.user.role !== UserRole.MAINTAINER && req.user.userId !== id) {
      throw new Error(
        'Forbidden: Only MAINTAINER or the owner can upload profile picture',
      );
    }
    const url = await this.userProfilePictureService.uploadProfilePicture(
      id,
      file,
      req.user,
    );
    return { url };
  }

  @Delete(':id/profile-picture')
  async deleteProfilePicture(
    @Param('id') id: string,
    @Request() req,
  ): Promise<{ message: string }> {
    // Only allow MAINTAINER or the owner of the profile
    if (req.user.role !== UserRole.MAINTAINER && req.user.userId !== id) {
      throw new Error(
        'Forbidden: Only MAINTAINER or the owner can delete profile picture',
      );
    }
    await this.userProfilePictureService.deleteProfilePicture(id, req.user);
    return { message: 'Profile picture deleted' };
  }

  @Get('branch/:branchId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN)
  async getUsersByBranch(
    @Param('branchId') branchId: string,
    @Request() req,
  ): Promise<User[]> {
    // Only allow ADMIN to access their own branch
    if (req.user.role === UserRole.ADMIN && req.user.branchId !== branchId) {
      throw new Error('Forbidden: ADMIN can only access their own branch');
    }
    return this.usersService.getUsersByBranch(branchId);
  }
}
