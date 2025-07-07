import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schemas/user.schema';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto';
import { UserRole } from '../../../common/enums';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}
  async create(createUserDto: CreateUserDto): Promise<User> {
    console.log('Creating user with data:', { ...createUserDto, password: '[REDACTED]' });
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

    return newUser.save();
  }
  async findAll(currentUser?: UserDocument): Promise<User[]> {
    let filter = {};
    
    // Only SUPER_ADMIN and MAINTAINER can see all users
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter = { branchId: currentUser.branchId };
    }

    const users = await this.userModel.find(filter).select('-password').populate('branchId', 'name').exec();
    console.log('Users filtered by branch:', JSON.stringify(users, null, 2));
    return users;
  }

  async findById(id: string, currentUser?: UserDocument): Promise<User> {
    let filter: any = { _id: id };
    
    // Only SUPER_ADMIN and MAINTAINER can access users from other branches
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    const user = await this.userModel.findOne(filter).select('-password').populate('branchId', 'name');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
  async findByEmail(email: string): Promise<UserDocument> {
    const user = await this.userModel.findOne({ email }).populate('branchId', 'name');
    console.log('Found user:', JSON.stringify(user, null, 2));
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto, currentUser?: UserDocument): Promise<User> {
    let filter: any = { _id: id };
    
    // Only SUPER_ADMIN and MAINTAINER can update users from other branches
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    if (updateUserDto.branchId) {
      updateUserDto.branchId = new Types.ObjectId(updateUserDto.branchId) as any;
    }

    const user = await this.userModel
      .findOneAndUpdate(filter, updateUserDto, { new: true })
      .select('-password')
      .populate('branchId', 'name');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async remove(id: string, currentUser?: UserDocument): Promise<void> {
    let filter: any = { _id: id };
    
    // Only SUPER_ADMIN and MAINTAINER can delete users from other branches
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    const result = await this.userModel.findOneAndDelete(filter);
    if (!result) {
      throw new NotFoundException('User not found');
    }
  }
}
