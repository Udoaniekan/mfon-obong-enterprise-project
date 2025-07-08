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
} from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto';
import { User } from '../schemas/user.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../../common/enums';
import { Roles } from 'src/decorators/roles.decorators';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  async findAll(@Request() req): Promise<User[]> {
    return this.usersService.findAll(req.user);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  async findOne(@Param('id') id: string, @Request() req): Promise<User> {
    return this.usersService.findById(id, req.user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req,
  ): Promise<User> {
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
    // Only allow users to update their own password or SUPER_ADMIN/MAINTAINER
    if (
      req.user.role !== UserRole.SUPER_ADMIN &&
      req.user.role !== UserRole.MAINTAINER &&
      req.user.userId !== id
    ) {
      throw new Error('Forbidden');
    }
    await this.usersService.updatePassword(
      id,
      body.previousPassword,
      body.newPassword,
    );
    return { message: 'Password updated successfully' };
  }
}
