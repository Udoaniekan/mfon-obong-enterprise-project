import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../schemas/product.schema';
import {
  CreateProductDto,
  UpdateProductDto,
  UpdateStockDto,
  StockOperation,
} from '../dto/product.dto';
import { CategoriesService } from '../../categories/services/categories.service';
import { UserDocument } from '../../users/schemas/user.schema';
import { UserRole } from '../../../common/enums';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly categoriesService: CategoriesService,
  ) {}

  async create(createProductDto: CreateProductDto, currentUser?: UserDocument): Promise<Product> {
    // Use current user's branchId if not provided by SUPER_ADMIN or MAINTAINER
    let branchId = createProductDto.branchId;
    if (!branchId || (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role))) {
      branchId = currentUser?.branchId?.toString();
    }

    // Validate that the unit matches the category
    const category = await this.categoriesService.findById(createProductDto.categoryId);
    if (!category.units.includes(createProductDto.unit)) {
      throw new BadRequestException(`Invalid unit ${createProductDto.unit} for category ${category.name}`);
    }

    // Check if a product with the same categoryId, unit, and branchId already exists
    const existingProduct = await this.productModel.findOne({
      categoryId: createProductDto.categoryId,
      unit: createProductDto.unit,
      branchId: new Types.ObjectId(branchId)
    });

    if (existingProduct) {
      throw new BadRequestException(
        `A product with unit ${createProductDto.unit} already exists for category ${category.name} in this branch. Please choose a different unit.`
      );
    }

    const product = new this.productModel({
      ...createProductDto,
      branchId: new Types.ObjectId(branchId),
      priceHistory: [{ price: createProductDto.unitPrice, date: new Date() }],
    });

    return product.save();
  }

  async findAll(currentUser?: UserDocument, includeInactive = false): Promise<ProductDocument[]> {
    let filter: any = includeInactive ? {} : { isActive: true };
    
    // Only SUPER_ADMIN and MAINTAINER can see all products
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    return this.productModel
      .find(filter)
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .exec();
  }

  async findById(id: string, currentUser?: UserDocument): Promise<ProductDocument> {
    let filter: any = { _id: id };
    
    // Only SUPER_ADMIN and MAINTAINER can access products from other branches
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    const product = await this.productModel
      .findOne(filter)
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .exec();
    
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto, currentUser?: UserDocument): Promise<ProductDocument> {
    const product = await this.findById(id, currentUser);

    // Validate that the unit matches the category if changing unit or category
    if (updateProductDto.unit || updateProductDto.categoryId) {
      const categoryId = updateProductDto.categoryId || product.categoryId.toString();
      const category = await this.categoriesService.findById(categoryId);
      const unit = updateProductDto.unit || product.unit;

      if (!category.units.includes(unit)) {
        throw new BadRequestException(`Invalid unit ${unit} for category ${category.name}`);
      }
    }

    // Track price history if price is changing
    if (updateProductDto.unitPrice && updateProductDto.unitPrice !== product.unitPrice) {
      product.priceHistory.push({
        price: updateProductDto.unitPrice,
        date: new Date(),
      });
    }

    // Handle branchId update for SUPER_ADMIN and MAINTAINER only
    if (updateProductDto.branchId) {
      if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
        delete updateProductDto.branchId; // Remove branchId if user doesn't have permission
      } else {
        updateProductDto.branchId = new Types.ObjectId(updateProductDto.branchId) as any;
      }
    }

    Object.assign(product, updateProductDto);
    return product.save();
  }    
  
  async updateStock(id: string, updateStockDto: UpdateStockDto, currentUser?: UserDocument): Promise<ProductDocument> {
    let filter: any = { _id: id };
    
    // Only SUPER_ADMIN and MAINTAINER can update stock from other branches
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    // Get the product first to validate it exists
    const product = await this.productModel.findOne(filter).exec();
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    
    const { quantity, unit, operation } = updateStockDto;
    
    // Validate the unit matches
    if (product.unit !== unit) {
      throw new BadRequestException(`Unit mismatch: product has unit "${product.unit}", but operation specified "${unit}"`);
    }
    
    // Validate stock level for subtraction
    if (operation === StockOperation.SUBTRACT && product.stock < quantity) {
      throw new BadRequestException(`Insufficient stock: current ${product.stock}, requested ${quantity}`);
    }
    
    // Calculate new stock
    const newStock = operation === StockOperation.ADD
      ? product.stock + quantity
      : product.stock - quantity;
    
    // Use findOneAndUpdate to update in one atomic operation
    await this.productModel.findOneAndUpdate(
      filter,
      { $set: { stock: newStock } }
    ).exec();
    
    // Return the updated product with populated fields
    return this.productModel
      .findOne(filter)
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .exec();
  }

  async remove(id: string, currentUser?: UserDocument): Promise<void> {
    const product = await this.findById(id, currentUser);
    product.isActive = false;
    await product.save();
  }

  async hardRemove(id: string, currentUser?: UserDocument): Promise<void> {
    let filter: any = { _id: id };
    
    // Only SUPER_ADMIN and MAINTAINER can delete products from other branches
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    const result = await this.productModel.findOneAndDelete(filter);
    if (!result) {
      throw new NotFoundException('Product not found');
    }
  }

  async getLowStockProducts(currentUser?: UserDocument): Promise<ProductDocument[]> {
    let filter: any = {
      isActive: true,
      $expr: {
        $lte: ['$stock', '$minStockLevel']
      }
    };
    
    // Only SUPER_ADMIN and MAINTAINER can see all low stock products
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    return this.productModel
      .find(filter)
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .exec();
  }

  async findByCategory(categoryId: string, currentUser?: UserDocument): Promise<ProductDocument[]> {
    let filter: any = { categoryId, isActive: true };
    
    // Only SUPER_ADMIN and MAINTAINER can see products from all branches
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    return this.productModel
      .find(filter)
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .exec();
  }

  calculatePrice(product: Product | ProductDocument, quantity: number): number {
    return quantity * product.unitPrice;
  }
}
