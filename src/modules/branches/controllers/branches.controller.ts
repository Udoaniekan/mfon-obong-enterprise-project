import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Req,
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
async create(@Body() createBranchDto: CreateBranchDto, @Req() req): Promise<Branch> {
  const currentUser = req.user; // comes from JwtAuthGuard
  const device = req.headers['user-agent']; // get device info 
  
  return this.branchesService.create(createBranchDto, currentUser, device);
}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async findAll(@Request() req): Promise<Branch[]> {
    return this.branchesService.findAll(req.user);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.MAINTAINER,
    UserRole.ADMIN,
    UserRole.STAFF,
  )
  async findOne(@Param('id') id: string, @Request() req): Promise<Branch> {
    return this.branchesService.findById(id, req.user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async update(
    @Param('id') id: string,
    @Body() updateBranchDto: UpdateBranchDto,
    @Request() req,
  ): Promise<Branch> {
    return this.branchesService.update(id, updateBranchDto, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.MAINTAINER)
  async remove(@Param('id') id: string, @Request() req): Promise<void> {
    return this.branchesService.remove(id, req.user);
  }
}
