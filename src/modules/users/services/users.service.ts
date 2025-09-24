// ...existing code...
// ...existing code...
import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schemas/user.schema';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto';
import { UserRole } from '../../../common/enums';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { BranchesService } from '../../branches/services/branches.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly systemActivityLogService: SystemActivityLogService,
    private readonly branchesService: BranchesService,
  ) {}
  async blockUser(
    id: string,
    blockUserDto: { reason?: string },
    currentUser?: UserDocument,
    device?: string,
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
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch (logError) {
      console.error('Failed to log user block:', logError);
    }
    return user;
  }

  async unblockUser(
    id: string,
    currentUser?: UserDocument,
    device?: string,
  ): Promise<User> {
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
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch (logError) {
      console.error('Failed to log user unblock:', logError);
    }
    return user;
  }
  async create(
    createUserDto: CreateUserDto,
    currentUser?: { userId: string; email: string; role: string; name?: string },
    device?: string
  ): Promise<User> {
    const { email, password, branchId, branch } = createUserDto;

    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Validate that branch name matches branchId
    const branchDocument = await this.branchesService.findById(branchId);
    if (branchDocument.name !== branch) {
      throw new BadRequestException(
        `Branch name '${branch}' does not match the branch with ID '${branchId}'. Expected: '${branchDocument.name}'`
      );
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
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch (logError) {
      console.error('Failed to log user creation:', logError);
    }

    return savedUser;
  }
  async findAll(currentUser?: UserDocument): Promise<User[]> {
    let filter: any = { isActive: true };

    // Only SUPER_ADMIN and MAINTAINER can see all users
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter = { branchId: currentUser.branchId, isActive: true };
    }

    const users = await this.userModel
      .find(filter)
      .select('-password')
      .populate('branchId', 'name')
      .exec();
    console.log(`Users filtered by branch: Found ${users.length} users`);
    return users;
  }

  async findById(id: string, currentUser?: UserDocument): Promise<User> {
    const filter: any = { _id: id };

    if (currentUser) {
      if (currentUser.role === UserRole.STAFF) {
        // STAFF can only access their own profile
        const currentUserId = currentUser._id?.toString() || (currentUser as any).userId;
        if (currentUserId !== id) {
          throw new NotFoundException('User not found');
        }
      } else if (![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
        // ADMIN can access users from their own branch only
        filter.branchId = currentUser.branchId;
      }
      // SUPER_ADMIN and MAINTAINER can access any user (no restrictions)
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

  async findByIdRaw(id: string): Promise<User | null> {
    // Raw find without permission checks - used for JWT validation
    return this.userModel.findById(id).select('-password').exec();
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
    device?: string,
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

    // Validate branch name matches branchId if both are being updated
    if (updateUserDto.branchId || updateUserDto.branch) {
      const branchId = updateUserDto.branchId;
      const branch = updateUserDto.branch;

      if (branchId && branch) {
        // Both branchId and branch are provided - validate they match
        const branchDocument = await this.branchesService.findById(branchId);
        if (branchDocument.name !== branch) {
          throw new BadRequestException(
            `Branch name '${branch}' does not match the branch with ID '${branchId}'. Expected: '${branchDocument.name}'`
          );
        }
      } else if (branchId && !branch) {
        // Only branchId provided - auto-set the correct branch name
        const branchDocument = await this.branchesService.findById(branchId);
        updateUserDto.branch = branchDocument.name;
      } else if (!branchId && branch) {
        // Only branch name provided - this is not allowed, need branchId too
        throw new BadRequestException(
          'When updating branch name, branchId must also be provided'
        );
      }
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
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch (logError) {
      console.error('Failed to log user update:', logError);
    }

    return user;
  }

  async remove(
    id: string,
    currentUser?: UserDocument,
    device?: string,
  ): Promise<void> {
    const filter: any = { _id: id };

    // Only SUPER_ADMIN and MAINTAINER can delete users from other branches
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

    // Soft delete - set isActive to false
    user.isActive = false;
    await user.save();

    // Log user deletion activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'USER_DELETED',
        details: `User deleted: ${user.name} (${user.email}) - Role: ${user.role}`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch (logError) {
      console.error('Failed to log user deletion:', logError);
    }
  }

  async updatePassword(
    userId: string,
    newPassword: string,
    previousPassword?: string,
  ): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Different validation logic based on whether user has temporary password
    if (user.mustChangePassword && user.isTemporaryPassword) {
      // For temporary password users: no previous password needed
      // Check if temporary password has expired
      if (user.temporaryPasswordExpiry && new Date() > user.temporaryPasswordExpiry) {
        throw new BadRequestException('Temporary password has expired. Please contact your administrator.');
      }
    } else {
      // For regular users: previous password is required
      if (!previousPassword) {
        throw new BadRequestException('Previous password is required');
      }
      
      // Verify previous password
      const isMatch = await bcrypt.compare(previousPassword, user.password);
      if (!isMatch) {
        throw new ConflictException('Wrong password');
      }
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password and reset temporary password flags
    const updateData: any = { 
      password: hashedPassword
    };

    // If updating from temporary password, reset the flags
    if (user.mustChangePassword && user.isTemporaryPassword) {
      updateData.isTemporaryPassword = false;
      updateData.temporaryPasswordExpiry = undefined;
      updateData.mustChangePassword = false;
    }

    await this.userModel.findByIdAndUpdate(userId, updateData);

    // Log password update activity
    try {
      const actionType = user.isTemporaryPassword ? 'TEMPORARY_PASSWORD_UPDATED' : 'PASSWORD_UPDATED';
      const details = user.isTemporaryPassword 
        ? `User converted temporary password to permanent: ${user.name} (${user.email})`
        : `User changed password: ${user.name} (${user.email})`;

      await this.systemActivityLogService.createLog({
        action: actionType,
        details,
        performedBy: user.email,
        role: user.role,
        device: 'System',
      });
    } catch (logError) {
      // Don't fail if logging fails
    }
  }

  private generateTemporaryPassword(): string {
    // Generate a secure 8-character temporary password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let tempPassword = '';
    for (let i = 0; i < 8; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return tempPassword;
  }

  async forgotPassword(
    userId: string,
    performedByUser?: { email: string; role: string; name?: string },
    device?: string
  ): Promise<{ temporaryPassword: string; expiresAt: Date }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    // Generate temporary password
    const temporaryPassword = this.generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    
    // Set expiry to 24 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    // Update user with temporary password settings
    await this.userModel.findByIdAndUpdate(userId, { 
      password: hashedPassword,
      isTemporaryPassword: true,
      temporaryPasswordExpiry: expiresAt,
      mustChangePassword: true,
    });

    // Log password reset activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'TEMPORARY_PASSWORD_RESET',
        details: `Temporary password set for user: ${user.name} (${user.email}) - Expires in 24 hours`,
        performedBy: performedByUser?.email || performedByUser?.name || 'System',
        role: performedByUser?.role || 'MAINTAINER',
        device: device || 'System',
      });
    } catch (logError) {
      // Don't fail if logging fails
    }

    return {
      temporaryPassword,
      expiresAt,
    };
  }

  async getUsersByBranch(branchId: string): Promise<User[]> {
    return this.userModel
      .find({ branchId: new Types.ObjectId(branchId) })
      .select('-password')
      .populate('branchId', 'name')
      .exec();
  }
}
