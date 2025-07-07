import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';
import { UserDocument } from '../../users/schemas/user.schema';
import { UserRole } from '../../../common/enums';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
  ) {}

  async create(createCategoryDto: CreateCategoryDto, currentUser?: UserDocument): Promise<CategoryDocument> {
    // Use current user's branchId if not provided by SUPER_ADMIN or MAINTAINER
    let branchId = createCategoryDto.branchId;
    if (!branchId || (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role))) {
      branchId = currentUser?.branchId?.toString();
    }

    try {
      const category = new this.categoryModel({
        ...createCategoryDto,
        branchId: new Types.ObjectId(branchId),
      });
      return await category.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Category already exists in this branch');
      }
      throw error;
    }
  }

  async findAll(currentUser?: UserDocument, includeInactive = false): Promise<CategoryDocument[]> {
    let filter: any = includeInactive ? {} : { isActive: true };
    
    // Only SUPER_ADMIN and MAINTAINER can see all categories
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    return this.categoryModel.find(filter).populate('branchId', 'name').exec();
  }
  async findById(id: string, currentUser?: UserDocument): Promise<CategoryDocument> {
    try {
      // Check if we've received a stringified object instead of a simple ID
      if (id.includes('ObjectId') && id.includes('_id')) {
        // Extract the ObjectId from the string
        const match = id.match(/ObjectId\('([0-9a-fA-F]{24})'\)/);
        if (match && match[1]) {
          // Use the extracted ID
          id = match[1];
        }
      }
      
      let filter: any = { _id: id };
      
      // Only SUPER_ADMIN and MAINTAINER can access categories from other branches
      if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
        filter.branchId = currentUser.branchId;
      }
      
      const category = await this.categoryModel.findOne(filter).populate('branchId', 'name');
      
      if (!category) {
        throw new NotFoundException('Category not found');
      }
      return category;
    } catch (error) {
      console.error('Error finding category:', error);
      throw new NotFoundException(`Category lookup failed: ${error.message}`);
    }
  }

  async findByName(name: string, currentUser?: UserDocument): Promise<CategoryDocument | null> {
    let filter: any = { name };
    
    // Only SUPER_ADMIN and MAINTAINER can search across all branches
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    return this.categoryModel.findOne(filter).populate('branchId', 'name').exec();
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto, currentUser?: UserDocument): Promise<CategoryDocument> {
    const category = await this.findById(id, currentUser);
    
    // Handle branchId update for SUPER_ADMIN and MAINTAINER only
    if (updateCategoryDto.branchId) {
      if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
        delete updateCategoryDto.branchId; // Remove branchId if user doesn't have permission
      } else {
        updateCategoryDto.branchId = new Types.ObjectId(updateCategoryDto.branchId) as any;
      }
    }
    
    try {
      Object.assign(category, updateCategoryDto);
      return await category.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Category name already exists in this branch');
      }
      throw error;
    }
  }

  async remove(id: string, currentUser?: UserDocument): Promise<void> {
    const category = await this.findById(id, currentUser);
    category.isActive = false;
    await category.save();
  }

  async validateCategoryAndUnit(categoryId: string, unit: string, currentUser?: UserDocument): Promise<boolean> {
    const category = await this.findById(categoryId, currentUser);
    return category.units.includes(unit);
  }
}
