import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto';
import { UserRole } from '../../../common/enums';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { BranchesService } from '../../branches/services/branches.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemActivityLogService: SystemActivityLogService,
    private readonly branchesService: BranchesService,
  ) {}

  private transformUser(user: any, includeBranch = false) {
    if (!user) return user;
    const { password, branchRef, ...rest } = user;
    return {
      ...rest,
      _id: user.id,
      branchId: branchRef
        ? { _id: branchRef.id, ...branchRef }
        : user.branchId,
    };
  }

  async blockUser(
    id: string,
    blockUserDto: { reason?: string },
    currentUser?: any,
    device?: string,
  ): Promise<any> {
    const where: any = { id };
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      where.branchId = currentUser.branchId;
    }

    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        isBlocked: true,
        blockReason: blockUserDto.reason,
      },
    });

    try {
      await this.systemActivityLogService.createLog({
        action: 'USER_BLOCKED',
        details: `User blocked: ${user.name} (${user.email}) - Reason: ${blockUserDto.reason || 'N/A'}`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
        branchId: currentUser?.branchId?.toString(),
      });
    } catch {}

    return this.transformUser(updated);
  }

  async unblockUser(id: string, currentUser?: any, device?: string): Promise<any> {
    const where: any = { id };
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      where.branchId = currentUser.branchId;
    }

    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isBlocked: false, blockReason: null },
    });

    try {
      await this.systemActivityLogService.createLog({
        action: 'USER_UNBLOCKED',
        details: `User unblocked: ${user.name} (${user.email})`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
        branchId: currentUser?.branchId?.toString(),
      });
    } catch {}

    return this.transformUser(updated);
  }

  async create(
    createUserDto: CreateUserDto,
    currentUser?: { userId: string; email: string; role: string; name?: string },
    device?: string,
  ): Promise<any> {
    const { email, password, branchId, branch } = createUserDto;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new ConflictException('Email already exists');

    const branchDocument = await this.branchesService.findById(branchId);
    if (branchDocument.name !== branch) {
      throw new BadRequestException(
        `Branch name '${branch}' does not match the branch with ID '${branchId}'. Expected: '${branchDocument.name}'`,
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        password: hashedPassword,
        phone: createUserDto.phone,
        address: createUserDto.address,
        role: createUserDto.role as any,
        branchId: createUserDto.branchId,
        branch: createUserDto.branch,
        branchAddress: createUserDto.branchAddress,
      },
    });

    try {
      await this.systemActivityLogService.createLog({
        action: 'USER_CREATED',
        details: `New user created: ${newUser.name} (${newUser.email}) with role ${newUser.role}`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
        branchId: (currentUser as any)?.branchId?.toString() || newUser.branchId,
      });
    } catch {}

    return this.transformUser(newUser);
  }

  async findAll(currentUser?: any): Promise<any[]> {
    const where: any = { isActive: true };

    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      where.branchId = currentUser.branchId;
    }

    const users = await this.prisma.user.findMany({
      where,
      include: { branchRef: { select: { id: true, name: true } } },
    });

    return users.map(u => this.transformUser(u, true));
  }

  async findById(id: string, currentUser?: any): Promise<any> {
    const where: any = { id };

    if (currentUser) {
      if (currentUser.role === UserRole.STAFF) {
        const currentUserId = currentUser._id?.toString() || currentUser.userId || currentUser.id;
        if (currentUserId !== id) throw new NotFoundException('User not found');
      } else if (![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
        where.branchId = currentUser.branchId;
      }
    }

    const user = await this.prisma.user.findFirst({
      where,
      include: { branchRef: { select: { id: true, name: true } } },
    });

    if (!user) throw new NotFoundException('User not found');
    return this.transformUser(user, true);
  }

  async findByIdRaw(id: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    const { password, ...rest } = user;
    return { ...rest, _id: user.id };
  }

  async findByEmail(email: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    return {
      ...user,
      _id: user.id,
      toJSON: () => ({ ...user, _id: user.id }),
    };
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    currentUser?: any,
    device?: string,
  ): Promise<any> {
    const where: any = { id };

    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      where.branchId = currentUser.branchId;
    }

    const existing = await this.prisma.user.findFirst({ where });
    if (!existing) throw new NotFoundException('User not found');

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    if (updateUserDto.branchId || updateUserDto.branch) {
      const bId = updateUserDto.branchId;
      const bName = updateUserDto.branch;

      if (bId && bName) {
        const branchDocument = await this.branchesService.findById(bId);
        if (branchDocument.name !== bName) {
          throw new BadRequestException(
            `Branch name '${bName}' does not match the branch with ID '${bId}'. Expected: '${branchDocument.name}'`,
          );
        }
      } else if (bId && !bName) {
        const branchDocument = await this.branchesService.findById(bId);
        updateUserDto.branch = branchDocument.name;
      } else if (!bId && bName) {
        throw new BadRequestException('When updating branch name, branchId must also be provided');
      }
    }

    const updateData: any = { ...updateUserDto };
    delete updateData.branchId;
    if (updateUserDto.branchId) updateData.branchId = updateUserDto.branchId;

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: { branchRef: { select: { id: true, name: true } } },
    });

    try {
      const changes = Object.keys(updateUserDto).filter(k => k !== 'password');
      const changeDetails = changes.length > 0 ? ` - Updated: ${changes.join(', ')}` : '';
      await this.systemActivityLogService.createLog({
        action: 'USER_UPDATED',
        details: `User updated: ${user.name} (${user.email})${changeDetails}`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
        branchId: currentUser?.branchId?.toString(),
      });
    } catch {}

    return this.transformUser(user, true);
  }

  async remove(id: string, currentUser?: any, device?: string): Promise<void> {
    const where: any = { id };

    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      where.branchId = currentUser.branchId;
    }

    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({ where: { id }, data: { isActive: false } });

    try {
      await this.systemActivityLogService.createLog({
        action: 'USER_DELETED',
        details: `User deleted: ${user.name} (${user.email}) - Role: ${user.role}`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
        branchId: currentUser?.branchId?.toString(),
      });
    } catch {}
  }

  async updatePassword(
    userId: string,
    newPassword: string,
    previousPassword?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.mustChangePassword && user.isTemporaryPassword) {
      if (user.temporaryPasswordExpiry && new Date() > user.temporaryPasswordExpiry) {
        throw new BadRequestException('Temporary password has expired. Please contact your administrator.');
      }
    } else {
      if (!previousPassword) throw new BadRequestException('Previous password is required');
      const isMatch = await bcrypt.compare(previousPassword, user.password);
      if (!isMatch) throw new ConflictException('Wrong password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updateData: any = { password: hashedPassword };

    if (user.mustChangePassword && user.isTemporaryPassword) {
      updateData.isTemporaryPassword = false;
      updateData.temporaryPasswordExpiry = null;
      updateData.mustChangePassword = false;
    }

    await this.prisma.user.update({ where: { id: userId }, data: updateData });

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
        branchId: user.branchId,
      });
    } catch {}
  }

  private generateTemporaryPassword(): string {
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
    device?: string,
  ): Promise<{ temporaryPassword: string; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const temporaryPassword = this.generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        isTemporaryPassword: true,
        temporaryPasswordExpiry: expiresAt,
        mustChangePassword: true,
      },
    });

    try {
      await this.systemActivityLogService.createLog({
        action: 'TEMPORARY_PASSWORD_RESET',
        details: `Temporary password set for user: ${user.name} (${user.email}) - Expires in 24 hours`,
        performedBy: performedByUser?.email || performedByUser?.name || 'System',
        role: performedByUser?.role || 'MAINTAINER',
        device: device || 'System',
      });
    } catch {}

    return { temporaryPassword, expiresAt };
  }

  async getUsersByBranch(branchId: string): Promise<any[]> {
    const users = await this.prisma.user.findMany({
      where: { branchId },
      include: { branchRef: { select: { id: true, name: true } } },
    });
    return users.map(u => this.transformUser(u, true));
  }
}
