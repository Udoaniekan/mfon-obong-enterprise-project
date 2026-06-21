import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';
import { SystemActivityLogService } from 'src/modules/system-activity-logs/services/system-activity-log.service';
import { extractDeviceInfo } from 'src/modules/system-activity-logs/utils/device-extractor.util';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}

  private toDoc(category: any) {
    if (!category) return category;
    return { ...category, _id: category.id };
  }

  async create(
    createCategoryDto: CreateCategoryDto,
    currentUser?: any,
    userAgent?: string,
  ): Promise<any> {
    // If a soft-deleted category with this name exists, reactivate it
    const existing = await this.prisma.category.findUnique({
      where: { name: createCategoryDto.name },
    });

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException('Category name already exists');
      }
      const category = await this.prisma.category.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          units: createCategoryDto.units || existing.units,
          description: createCategoryDto.description ?? existing.description,
        },
      });
      return this.toDoc(category);
    }

    try {
      const category = await this.prisma.category.create({
        data: {
          name: createCategoryDto.name,
          units: createCategoryDto.units || [],
          description: createCategoryDto.description,
        },
      });

      try {
        await this.systemActivityLogService.createLog({
          action: 'CATEGORY_CREATED',
          details: `${category.name} has been created`,
          performedBy: currentUser?.email || currentUser?.name || 'System',
          role: currentUser?.role || 'SYSTEM',
          device: extractDeviceInfo(userAgent) || '',
        });
      } catch {}

      return this.toDoc(category);
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Category name already exists');
      }
      throw error;
    }
  }

  async findAll(currentUser?: any, includeInactive = false): Promise<any[]> {
    const where: any = includeInactive ? {} : { isActive: true };
    const categories = await this.prisma.category.findMany({ where });
    return categories.map(this.toDoc);
  }

  async findById(id: string, currentUser?: any): Promise<any> {
    // Handle stringified ObjectId format (legacy)
    if (id.includes('ObjectId') && id.includes('_id')) {
      const match = id.match(/ObjectId\('([0-9a-fA-F]{24})'\)/);
      if (match?.[1]) id = match[1];
    }

    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return this.toDoc(category);
  }

  async findByName(name: string, currentUser?: any): Promise<any> {
    const category = await this.prisma.category.findUnique({ where: { name } });
    return category ? this.toDoc(category) : null;
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    currentUser?: any,
  ): Promise<any> {
    await this.findById(id, currentUser);
    try {
      const category = await this.prisma.category.update({
        where: { id },
        data: updateCategoryDto,
      });
      return this.toDoc(category);
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Category name already exists');
      }
      throw error;
    }
  }

  async remove(id: string, currentUser?: any, userAgent?: string): Promise<void> {
    const category = await this.findById(id, currentUser);

    await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });

    try {
      await this.systemActivityLogService.createLog({
        action: 'CATEGORY_DELETED',
        details: `${category.name} has been DELETED.`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: extractDeviceInfo(userAgent) || '',
      });
    } catch {}
  }

  async validateCategoryAndUnit(
    categoryId: string,
    unit: string,
    currentUser?: any,
  ): Promise<boolean> {
    const category = await this.findById(categoryId, currentUser);
    return category.units.includes(unit);
  }
}
