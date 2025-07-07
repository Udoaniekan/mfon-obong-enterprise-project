import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Branch, BranchDocument } from '../schemas/branch.schema';
import { CreateBranchDto, UpdateBranchDto } from '../dto/branch.dto';
import { UserDocument } from '../../users/schemas/user.schema';
import { UserRole } from '../../../common/enums';

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

  async findAll(currentUser?: UserDocument, includeInactive = false): Promise<BranchDocument[]> {
    let query: any = includeInactive ? {} : { isActive: true };
    
    // Role-based access control
    if (currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.STAFF) {
      // ADMIN and STAFF can only see their own branch
      query._id = currentUser.branchId;
    }
    // MAINTAINER and SUPER_ADMIN can see all branches
    
    return this.branchModel.find(query).exec();
  }

  async findById(id: string, currentUser?: UserDocument): Promise<BranchDocument> {
    // Role-based access control
    if (currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.STAFF) {
      // ADMIN and STAFF can only access their own branch
      if (currentUser.branchId?.toString() !== id) {
        throw new NotFoundException('Branch not found');
      }
    }
    
    const branch = await this.branchModel.findById(id);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch;
  }

  async findByName(name: string): Promise<BranchDocument | null> {
    return this.branchModel.findOne({ name }).exec();
  }

  async update(id: string, updateBranchDto: UpdateBranchDto, currentUser?: UserDocument): Promise<BranchDocument> {
    // Role-based access control
    if (currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.STAFF) {
      // ADMIN and STAFF cannot update branches (this should be prevented by guards, but extra safety)
      throw new NotFoundException('Branch not found');
    }
    
    const branch = await this.findById(id, currentUser);
    
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

  async remove(id: string, currentUser?: UserDocument): Promise<void> {
    const branch = await this.findById(id, currentUser);
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
