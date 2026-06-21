import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateBranchDto, UpdateBranchDto } from '../dto/branch.dto';
import { UserRole } from '../../../common/enums';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { extractDeviceInfo } from 'src/modules/system-activity-logs/utils/device-extractor.util';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}

  private toDoc(branch: any) {
    if (!branch) return branch;
    return { ...branch, _id: branch.id };
  }

  async create(
    createBranchDto: CreateBranchDto,
    currentUser?: { email: string; role: string; name?: string },
    userAgent?: string,
  ): Promise<any> {
    try {
      const branch = await this.prisma.branch.create({ data: createBranchDto });

      try {
        await this.systemActivityLogService.createLog({
          action: 'BRANCH_CREATED',
          details: `${branch.name} has been created. Location: ${branch.address}`,
          performedBy: currentUser?.email || currentUser?.name || 'System',
          role: currentUser?.role || 'SYSTEM',
          device: extractDeviceInfo(userAgent) || '',
        });
      } catch {}

      return this.toDoc(branch);
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Branch name already exists');
      }
      throw error;
    }
  }

  async findAll(currentUser?: any, includeInactive = false): Promise<any[]> {
    const where: any = includeInactive ? {} : { isActive: true };

    if (
      currentUser?.role === UserRole.ADMIN ||
      currentUser?.role === UserRole.STAFF
    ) {
      where.id = currentUser.branchId;
    }

    const branches = await this.prisma.branch.findMany({ where });
    return branches.map(this.toDoc);
  }

  async findById(id: string, currentUser?: any): Promise<any> {
    if (
      currentUser?.role === UserRole.ADMIN ||
      currentUser?.role === UserRole.STAFF
    ) {
      if (currentUser.branchId?.toString() !== id) {
        throw new NotFoundException('Branch not found');
      }
    }

    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');
    return this.toDoc(branch);
  }

  async findByName(name: string): Promise<any> {
    const branch = await this.prisma.branch.findUnique({ where: { name } });
    return branch ? this.toDoc(branch) : null;
  }

  async update(
    id: string,
    updateBranchDto: UpdateBranchDto,
    currentUser?: any,
    device?: string,
  ): Promise<any> {
    if (
      currentUser?.role === UserRole.ADMIN ||
      currentUser?.role === UserRole.STAFF
    ) {
      throw new NotFoundException('Branch not found');
    }

    await this.findById(id, currentUser);

    try {
      const branch = await this.prisma.branch.update({
        where: { id },
        data: updateBranchDto,
      });

      try {
        const changes = Object.keys(updateBranchDto).join(', ');
        await this.systemActivityLogService.createLog({
          action: 'BRANCH_UPDATED',
          details: `Branch updated: ${branch.name} - Changes: ${changes}`,
          performedBy: currentUser?.email || currentUser?.name || 'System',
          role: currentUser?.role || 'SYSTEM',
          device: device || 'System',
        });
      } catch {}

      return this.toDoc(branch);
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Branch name already exists');
      }
      throw error;
    }
  }

  async remove(id: string, currentUser?: any, device?: string): Promise<void> {
    const branch = await this.findById(id, currentUser);

    await this.prisma.branch.update({
      where: { id },
      data: { isActive: false },
    });

    try {
      await this.systemActivityLogService.createLog({
        action: 'BRANCH_DEACTIVATED',
        details: `Branch deactivated: ${branch.name}`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch {}
  }

  async hardRemove(id: string): Promise<void> {
    try {
      await this.prisma.branch.delete({ where: { id } });
    } catch (error) {
      if (error?.code === 'P2025') throw new NotFoundException('Branch not found');
      throw error;
    }
  }
}
