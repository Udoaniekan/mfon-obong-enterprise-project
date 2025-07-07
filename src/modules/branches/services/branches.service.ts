import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Branch, BranchDocument } from '../schemas/branch.schema';
import { CreateBranchDto, UpdateBranchDto } from '../dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    @InjectModel(Branch.name) private branchModel: Model<BranchDocument>,
  ) {}

  async create(createBranchDto: CreateBranchDto): Promise<BranchDocument> {
    try {
      const branch = new this.branchModel(createBranchDto);
      return await branch.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Branch name already exists');
      }
      throw error;
    }
  }

  async findAll(includeInactive = false): Promise<BranchDocument[]> {
    const query = includeInactive ? {} : { isActive: true };
    return this.branchModel.find(query).exec();
  }

  async findById(id: string): Promise<BranchDocument> {
    const branch = await this.branchModel.findById(id);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch;
  }

  async findByName(name: string): Promise<BranchDocument | null> {
    return this.branchModel.findOne({ name }).exec();
  }

  async update(id: string, updateBranchDto: UpdateBranchDto): Promise<BranchDocument> {
    const branch = await this.findById(id);
    
    try {
      Object.assign(branch, updateBranchDto);
      return await branch.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Branch name already exists');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const branch = await this.findById(id);
    branch.isActive = false;
    await branch.save();
  }

  async hardRemove(id: string): Promise<void> {
    const result = await this.branchModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('Branch not found');
    }
  }
}
