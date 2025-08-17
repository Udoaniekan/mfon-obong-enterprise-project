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
  BadRequestException,
} from '@nestjs/common';
import { ProductsService } from '../services/products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  UpdateStockDto,
  StockOperation,
} from '../dto/product.dto';
import { Product, ProductDocument } from '../schemas/product.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../../common/enums';
import { Roles } from 'src/decorators/roles.decorators';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  async create(
    @Body() createProductDto: CreateProductDto,
    @Request() req,
  ): Promise<Product> {
    return this.productsService.create(createProductDto, req.user);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async findAll(@Request() req): Promise<Product[]> {
    return this.productsService.findAll(req.user);
  }

  @Get('low-stock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  async getLowStockProducts(@Request() req): Promise<Product[]> {
    return this.productsService.getLowStockProducts(req.user);
  }

  @Get('branch/:branchId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async findByBranch(@Param('branchId') branchId: string, @Request() req): Promise<Product[]> {
    // Check permissions: ADMIN can only access their own branch
    if (req.user.role === UserRole.ADMIN && req.user.branchId !== branchId) {
      throw new BadRequestException('Forbidden: ADMIN can only access products from their own branch');
    }
    return this.productsService.findByBranchId(branchId);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async findOne(@Param('id') id: string, @Request() req): Promise<Product> {
    return this.productsService.findById(id, req.user);
  }

  @Get(':id/category')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async findByCategory(
    @Param('id') id: string,
    @Request() req,
  ): Promise<ProductDocument[]> {
    return this.productsService.findByCategory(id, req.user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Request() req,
  ): Promise<Product> {
    return this.productsService.update(id, updateProductDto, req.user);
  }

  @Patch(':id/stock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  async updateStock(
    @Param('id') id: string,
    @Body() updateStockDto: UpdateStockDto,
    @Request() req,
  ): Promise<Product> {
    return this.productsService.updateStock(id, updateStockDto, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async remove(@Param('id') id: string, @Request() req): Promise<void> {
    return this.productsService.remove(id, req.user);
  }

  @Delete(':id/delete')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN)
  async hardRemove(@Param('id') id: string, @Request() req): Promise<void> {
    return this.productsService.hardRemove(id, req.user);
  }
}
