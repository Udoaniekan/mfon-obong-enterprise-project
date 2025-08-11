// ...existing code...
// ...existing code...
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schemas/user.schema';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto';
import { UserRole } from '../../../common/enums';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}
  async blockUser(
    id: string,
    blockUserDto: { reason?: string },
    currentUser?: UserDocument,
  ): Promise<User> {
    const filter: any = { _id: id };
    // Only SUPER_ADMIN and MAINTAINER can block users from other branches
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter.branchId = currentUser.branchId;
    }
    const user = await this.userModel.findOne(filter);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.isBlocked = true;
    if (blockUserDto.reason) {
      user.blockReason = blockUserDto.reason;
    }
    await user.save();
    // Log user block activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'USER_BLOCKED',
        details: `User blocked: ${user.name} (${user.email}) - Reason: ${blockUserDto.reason || 'N/A'}`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'ADMIN',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log user block:', logError);
    }
    return user;
  }

  async unblockUser(id: string, currentUser?: UserDocument): Promise<User> {
    const filter: any = { _id: id };
    // Only SUPER_ADMIN and MAINTAINER can unblock users from other branches
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter.branchId = currentUser.branchId;
    }
    const user = await this.userModel.findOne(filter);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.isBlocked = false;
    user.blockReason = undefined;
    await user.save();
    // Log user unblock activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'USER_UNBLOCKED',
        details: `User unblocked: ${user.name} (${user.email})`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'ADMIN',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log user unblock:', logError);
    }
    return user;
  }
  async create(createUserDto: CreateUserDto): Promise<User> {
    console.log('Creating user with data:', {
      ...createUserDto,
      password: '[REDACTED]',
    });
    const { email, password } = createUserDto;

    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
      branchId: new Types.ObjectId(createUserDto.branchId),
    });

    const savedUser = await newUser.save();

    // Log user creation activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'USER_CREATED',
        details: `New user created: ${savedUser.name} (${savedUser.email}) with role ${savedUser.role}`,
        performedBy: 'System', // Could be improved by passing the creator's ID
        role: 'ADMIN', // Default role for user creation
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log user creation:', logError);
    }

    return savedUser;
  }
  async findAll(currentUser?: UserDocument): Promise<User[]> {
    let filter = {};

    // Only SUPER_ADMIN and MAINTAINER can see all users
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter = { branchId: currentUser.branchId };
    }

    const users = await this.userModel
      .find(filter)
      .select('-password')
      .populate('branchId', 'name')
      .exec();
    console.log('Users filtered by branch:', JSON.stringify(users, null, 2));
    return users;
  }

  async findById(id: string, currentUser?: UserDocument): Promise<User> {
    const filter: any = { _id: id };

    // Only SUPER_ADMIN and MAINTAINER can access users from other branches
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter.branchId = currentUser.branchId;
    }

    const user = await this.userModel
      .findOne(filter)
      .select('-password')
      .populate('branchId', 'name');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
  async findByEmail(email: string): Promise<UserDocument> {
    const user = await this.userModel
      .findOne({ email });
    return user;
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    currentUser?: UserDocument,
  ): Promise<User> {
    const filter: any = { _id: id };

    // Only SUPER_ADMIN and MAINTAINER can update users from other branches
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter.branchId = currentUser.branchId;
    }

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    if (updateUserDto.branchId) {
      updateUserDto.branchId = new Types.ObjectId(
        updateUserDto.branchId,
      ) as any;
    }

    const user = await this.userModel
      .findOneAndUpdate(filter, updateUserDto, { new: true })
      .select('-password')
      .populate('branchId', 'name');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Log user update activity
    try {
      const changes = Object.keys(updateUserDto).filter(
        (key) => key !== 'password',
      );
      const changeDetails =
        changes.length > 0 ? ` - Updated: ${changes.join(', ')}` : '';

      await this.systemActivityLogService.createLog({
        action: 'USER_UPDATED',
        details: `User updated: ${user.name} (${user.email})${changeDetails}`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'ADMIN',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log user update:', logError);
    }

    return user;
  }

  async remove(id: string, currentUser?: UserDocument): Promise<void> {
    const filter: any = { _id: id };

    // Only SUPER_ADMIN and MAINTAINER can delete users from other branches
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter.branchId = currentUser.branchId;
    }

    const result = await this.userModel.findOneAndDelete(filter);
    if (!result) {
      throw new NotFoundException('User not found');
    }

    // Log user deletion activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'USER_DELETED',
        details: `User deleted: ${result.name} (${result.email}) - Role: ${result.role}`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'ADMIN',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log user deletion:', logError);
    }
  }

  async updatePassword(
    userId: string,
    previousPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const isMatch = await bcrypt.compare(previousPassword, user.password);
    if (!isMatch) {
      throw new ConflictException('Wrong password');
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // Log password update activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'PASSWORD_UPDATED',
        details: `User changed password: ${user.name} (${user.email})`,
        performedBy: user.email,
        role: user.role,
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log password update:', logError);
    }
  }

  async forgotPassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // Log password reset activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'PASSWORD_RESET',
        details: `Password reset for user: ${user.name} (${user.email})`,
        performedBy: 'MAINTAINER', // Since only maintainers can reset passwords
        role: 'MAINTAINER',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log password reset:', logError);
    }
  }

  async getUsersByBranch(branchId: string): Promise<User[]> {
    return this.userModel
      .find({ branchId: new Types.ObjectId(branchId) })
      .select('-password')
      .populate('branchId', 'name')
      .exec();
  }
}
