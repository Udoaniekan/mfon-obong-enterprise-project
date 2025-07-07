import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { BranchesService } from '../services/branches.service';
import { CreateBranchDto, UpdateBranchDto } from '../dto/branch.dto';
import { Branch } from '../schemas/branch.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../../common/enums';
import { Roles } from 'src/decorators/roles.decorators';

@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @Roles(UserRole.MAINTAINER)
  async create(@Body() createBranchDto: CreateBranchDto): Promise<Branch> {
    return this.branchesService.create(createBranchDto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN, UserRole.STAFF)
  async findAll(): Promise<Branch[]> {
    return this.branchesService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN, UserRole.STAFF)
  async findOne(@Param('id') id: string): Promise<Branch> {
    return this.branchesService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async update(
    @Param('id') id: string,
    @Body() updateBranchDto: UpdateBranchDto,
  ): Promise<Branch> {
    return this.branchesService.update(id, updateBranchDto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async remove(@Param('id') id: string): Promise<void> {
    return this.branchesService.remove(id);
  }
}
