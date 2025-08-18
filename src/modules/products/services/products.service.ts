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
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly categoriesService: CategoriesService,
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}

  async create(
    createProductDto: CreateProductDto,
    currentUser?: UserDocument,
  ): Promise<Product> {
    // branchId is now compulsory from DTO - use the provided branchId
    const branchId = createProductDto.branchId;

    // Validate that the unit matches the category
    const category = await this.categoriesService.findById(
      createProductDto.categoryId,
    );
    if (!category.units.includes(createProductDto.unit)) {
      throw new BadRequestException(
        `Invalid unit ${createProductDto.unit} for category ${category.name}`,
      );
    }

    // Check if a product with the same categoryId, unit, and branchId already exists
    const existingProduct = await this.productModel.findOne({
      categoryId: createProductDto.categoryId,
      unit: createProductDto.unit,
      branchId: new Types.ObjectId(branchId),
    });

    if (existingProduct) {
      throw new BadRequestException(
        `A product with unit ${createProductDto.unit} already exists for category ${category.name} in this branch. Please choose a different unit.`,
      );
    }

    const product = new this.productModel({
      ...createProductDto,
      branchId: new Types.ObjectId(branchId),
      priceHistory: [{ price: createProductDto.unitPrice, date: new Date() }],
    });

    const savedProduct = await product.save();

    // Log product creation activity
    try {
      const category = await this.categoriesService.findById(
        createProductDto.categoryId,
      );
      await this.systemActivityLogService.createLog({
        action: 'PRODUCT_CREATED',
        details: `Product created: ${savedProduct.name} (${savedProduct.unit}) in category ${category.name} - Price: ${savedProduct.unitPrice}`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'ADMIN',
        device: 'System',
      });
    } catch (logError) {
      // Don't fail if logging fails
    }

    // Return the product with populated branchId information
    return this.productModel
      .findById(savedProduct._id)
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .exec();
  }

  async findAll(
    currentUser?: UserDocument,
    includeInactive = false,
  ): Promise<ProductDocument[]> {
    const filter: any = includeInactive ? {} : { isActive: true };

    // Only SUPER_ADMIN and MAINTAINER can see all products
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter.branchId = currentUser.branchId;
    }

    return this.productModel
      .find(filter)
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .exec();
  }

  async findById(
    id: string,
    currentUser?: UserDocument,
  ): Promise<ProductDocument> {
    const filter: any = { _id: id };

    // Only SUPER_ADMIN and MAINTAINER can access products from other branches
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
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

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    currentUser?: UserDocument,
  ): Promise<ProductDocument> {
    const product = await this.findById(id, currentUser);

    // Validate that the unit matches the category if changing unit or category
    if (updateProductDto.unit || updateProductDto.categoryId) {
      const categoryId =
        updateProductDto.categoryId || product.categoryId.toString();
      const category = await this.categoriesService.findById(categoryId);
      const unit = updateProductDto.unit || product.unit;

      if (!category.units.includes(unit)) {
        throw new BadRequestException(
          `Invalid unit ${unit} for category ${category.name}`,
        );
      }
    }

    // Track price history if price is changing
    if (
      updateProductDto.unitPrice &&
      updateProductDto.unitPrice !== product.unitPrice
    ) {
      product.priceHistory.push({
        price: updateProductDto.unitPrice,
        date: new Date(),
      });
    }

    // Handle branchId update for SUPER_ADMIN and MAINTAINER only
    if (updateProductDto.branchId) {
      if (
        currentUser &&
        ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
      ) {
        delete updateProductDto.branchId; // Remove branchId if user doesn't have permission
      } else {
        updateProductDto.branchId = new Types.ObjectId(
          updateProductDto.branchId,
        ) as any;
      }
    }

    Object.assign(product, updateProductDto);
    const savedProduct = await product.save();

    // Log product update activity
    try {
      const changes = Object.keys(updateProductDto).join(', ');
      await this.systemActivityLogService.createLog({
        action: 'PRODUCT_UPDATED',
        details: `Product updated: ${savedProduct.name} - Changes: ${changes}`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'ADMIN',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log product update:', logError);
    }

    return savedProduct;
  }

  async updateStock(
    id: string,
    updateStockDto: UpdateStockDto,
    currentUser?: UserDocument,
  ): Promise<ProductDocument> {
    const filter: any = { _id: id };

    // Only SUPER_ADMIN and MAINTAINER can update stock from other branches
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
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
      throw new BadRequestException(
        `Unit mismatch: product has unit "${product.unit}", but operation specified "${unit}"`,
      );
    }

    // Validate stock level for subtraction
    if (operation === StockOperation.SUBTRACT && product.stock < quantity) {
      throw new BadRequestException(
        `Insufficient stock: current ${product.stock}, requested ${quantity}`,
      );
    }

    // Calculate new stock
    const newStock =
      operation === StockOperation.ADD
        ? product.stock + quantity
        : product.stock - quantity;

    // Use findOneAndUpdate to update in one atomic operation
    await this.productModel
      .findOneAndUpdate(filter, { $set: { stock: newStock } })
      .exec();

    // Return the updated product with populated fields
    const updatedProduct = await this.productModel
      .findOne(filter)
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .exec();

    // Log stock update activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'STOCK_UPDATED',
        details: `Stock ${operation === StockOperation.ADD ? 'increased' : 'decreased'} for ${updatedProduct.name}: ${quantity} ${unit} (New stock: ${newStock})`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'STAFF',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log stock update:', logError);
    }

    return updatedProduct;
  }

  async remove(id: string, currentUser?: UserDocument): Promise<void> {
    const product = await this.findById(id, currentUser);
    product.isActive = false;
    await product.save();

    // Log product deactivation activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'PRODUCT_DEACTIVATED',
        details: `Product deactivated: ${product.name} (${product.unit})`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'ADMIN',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log product deactivation:', logError);
    }
  }

  async hardRemove(id: string, currentUser?: UserDocument): Promise<void> {
    const filter: any = { _id: id };

    // Only SUPER_ADMIN and MAINTAINER can delete products from other branches
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter.branchId = currentUser.branchId;
    }

    const result = await this.productModel.findOneAndDelete(filter);
    if (!result) {
      throw new NotFoundException('Product not found');
    }

    // Log product hard deletion activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'PRODUCT_DELETED',
        details: `Product permanently deleted: ${result.name} (${result.unit})`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'ADMIN',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log product deletion:', logError);
    }
  }

  async getLowStockProducts(
    currentUser?: UserDocument,
  ): Promise<ProductDocument[]> {
    const filter: any = {
      isActive: true,
      $expr: {
        $lte: ['$stock', '$minStockLevel'],
      },
    };

    // Only SUPER_ADMIN and MAINTAINER can see all low stock products
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter.branchId = currentUser.branchId;
    }

    return this.productModel
      .find(filter)
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .exec();
  }

  async findByCategory(
    categoryId: string,
    currentUser?: UserDocument,
  ): Promise<ProductDocument[]> {
    const filter: any = { categoryId, isActive: true };

    // Only SUPER_ADMIN and MAINTAINER can see products from all branches
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter.branchId = currentUser.branchId;
    }

    return this.productModel
      .find(filter)
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .exec();
  }

  async findByBranchId(branchId: string): Promise<ProductDocument[]> {
    return this.productModel
      .find({ branchId: new Types.ObjectId(branchId), isActive: true })
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .sort({ createdAt: -1 })
      .exec();
  }

  calculatePrice(product: Product | ProductDocument, quantity: number): number {
    return quantity * product.unitPrice;
  }
}
