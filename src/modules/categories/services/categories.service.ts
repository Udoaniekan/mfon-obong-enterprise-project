import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
  ) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<CategoryDocument> {
    try {
      const category = new this.categoryModel(createCategoryDto);
      return await category.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Category already exists');
      }
      throw error;
    }
  }

  async findAll(includeInactive = false): Promise<CategoryDocument[]> {
    const query = includeInactive ? {} : { isActive: true };
    return this.categoryModel.find(query).exec();
  }
  async findById(id: string): Promise<CategoryDocument> {
    console.log('Finding category by ID:', id);
    console.log('ID type:', typeof id);
    
    try {
      const category = await this.categoryModel.findById(id);
      console.log('Found category:', JSON.stringify(category, null, 2));
      
      if (!category) {
        throw new NotFoundException('Category not found');
      }
      return category;
    } catch (error) {
      console.error('Error finding category:', error);
      throw error;
    }
  }

  async findByName(name: string): Promise<CategoryDocument | null> {
    return this.categoryModel.findOne({ name }).exec();
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto): Promise<CategoryDocument> {
    const category = await this.findById(id);
    
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

  async remove(id: string): Promise<void> {
    const category = await this.findById(id);
    category.isActive = false;
    await category.save();
  }

  async validateCategoryAndUnit(categoryId: string, unit: string): Promise<boolean> {
    const category = await this.findById(categoryId);
    return category.units.includes(unit);
  }
}
