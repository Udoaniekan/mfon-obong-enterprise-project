import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
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

  async create(
    createCategoryDto: CreateCategoryDto,
    currentUser?: UserDocument,
  ): Promise<CategoryDocument> {
    try {
      const category = new this.categoryModel({
        ...createCategoryDto,
      });
      return await category.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Category name already exists');
      }
      throw error;
    }
  }

  async findAll(
    currentUser?: UserDocument,
    includeInactive = false,
  ): Promise<CategoryDocument[]> {
    const filter: any = includeInactive ? {} : { isActive: true };

    // Categories are global - all users can see all categories
    return this.categoryModel.find(filter).exec();
  }
  async findById(
    id: string,
    currentUser?: UserDocument,
  ): Promise<CategoryDocument> {
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

      // Categories are global - no branch filtering needed
      const category = await this.categoryModel.findById(id);

      if (!category) {
        throw new NotFoundException('Category not found');
      }
      return category;
    } catch (error) {
      console.error('Error finding category:', error);
      throw new NotFoundException(`Category lookup failed: ${error.message}`);
    }
  }

  async findByName(
    name: string,
    currentUser?: UserDocument,
  ): Promise<CategoryDocument | null> {
    // Categories are global - search by name only
    return this.categoryModel.findOne({ name }).exec();
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    currentUser?: UserDocument,
  ): Promise<CategoryDocument> {
    const category = await this.findById(id, currentUser);

    try {
      Object.assign(category, updateCategoryDto);
      return await category.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Category name already exists');
      }
      throw error;
    }
  }

  async remove(id: string, currentUser?: UserDocument): Promise<void> {
    const category = await this.findById(id, currentUser);
    category.isActive = false;
    await category.save();
  }

  async validateCategoryAndUnit(
    categoryId: string,
    unit: string,
    currentUser?: UserDocument,
  ): Promise<boolean> {
    const category = await this.findById(categoryId, currentUser);
    return category.units.includes(unit);
  }
}
