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
import { RealtimeEventService } from '../../websocket/realtime-event.service';
import { DecimalService } from '../../../common/services/decimal.service';
import { PaginationService, PaginatedResult } from '../../../common/services/pagination.service';
import { QueryOptimizationService } from '../../../common/services/query-optimization.service';
import { CacheService } from '../../../common/services/cache.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly categoriesService: CategoriesService,
    private readonly systemActivityLogService: SystemActivityLogService,
    private readonly realtimeEventService: RealtimeEventService,
    private readonly decimalService: DecimalService,
    private readonly paginationService: PaginationService,
    private readonly queryOptimizationService: QueryOptimizationService,
    private readonly cacheService: CacheService,
  ) {}

  async create(
    createProductDto: CreateProductDto,
    currentUser?: UserDocument,
    device?: string,
  ): Promise<Product> {
    // branchId is now compulsory from DTO - use the provided branchId
    const branchId = createProductDto.branchId;

    // Validate that the unit matches the category
    let category;
    try {
      category = await this.categoriesService.findById(
        createProductDto.categoryId,
      );
    } catch (error) {
      throw new BadRequestException(
        `Invalid categoryId: ${createProductDto.categoryId}. Category does not exist.`,
      );
    }
    
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
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch (logError) {
      // Don't fail if logging fails
    }

    // Emit real-time event for product creation
    try {
      if (currentUser) {
        const eventData = this.realtimeEventService.createEventData(
          'created',
          'product',
          savedProduct._id.toString(),
          savedProduct,
          {
            id: currentUser._id?.toString() || '',
            email: currentUser.email,
            role: currentUser.role,
            branchId: currentUser.branchId?.toString(),
            branch: currentUser.branch,
          }
        );
        this.realtimeEventService.emitProductCreated(eventData);
      }
    } catch (realtimeError) {
      // Don't fail if real-time event fails
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
      filter.branchId = new Types.ObjectId(currentUser.branchId);
    }

    return this.productModel
      .find(filter)
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .exec();
  }

  /**
   * Enhanced findAll with pagination, filtering, and caching
   */
  async findAllPaginated(
    filters: any = {},
    options: any = {},
    currentUser?: UserDocument,
  ): Promise<PaginatedResult<ProductDocument>> {
    // Build base filter
    const baseFilter: any = {};
    
    // Default to active products only
    if (filters.includeInactive !== true) {
      baseFilter.isActive = true;
    }

    // Branch-based filtering for non-admin users
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      baseFilter.branchId = new Types.ObjectId(currentUser.branchId);
    }

    // Merge with additional filters
    const optimizedFilters = this.queryOptimizationService.optimizeFilters({
      ...baseFilter,
      ...filters,
    });

    // Set up pagination options
    const paginationOptions = {
      page: options.page || 1,
      limit: options.limit || 10,
      sort: this.queryOptimizationService.optimizeSort(options.sort),
      populate: ['categoryId', 'branchId'],
      select: options.select,
    };

    // Generate cache key
    const cacheKey = this.cacheService.generateKey(
      'products:paginated',
      JSON.stringify(optimizedFilters),
      JSON.stringify(paginationOptions),
      currentUser?.branchId?.toString() || 'all'
    );

    // Try to get from cache first
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        return this.paginationService.paginate(
          this.productModel,
          optimizedFilters,
          paginationOptions
        );
      },
      2 * 60 * 1000 // Cache for 2 minutes
    );
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
      filter.branchId = new Types.ObjectId(currentUser.branchId);
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
    device?: string,
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
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch (logError) {
      console.error('Failed to log product update:', logError);
    }

    // Emit real-time event for product update
    try {
      if (currentUser) {
        const eventData = this.realtimeEventService.createEventData(
          'updated',
          'product',
          savedProduct._id.toString(),
          savedProduct,
          {
            id: currentUser._id?.toString() || '',
            email: currentUser.email,
            role: currentUser.role,
            branchId: currentUser.branchId?.toString(),
            branch: currentUser.branch,
          }
        );
        this.realtimeEventService.emitProductUpdated(eventData);
      }
    } catch (realtimeError) {
      // Don't fail if real-time event fails
    }

    return savedProduct;
  }

  async updateStock(
    id: string,
    updateStockDto: UpdateStockDto,
    currentUser?: UserDocument,
    device?: string,
    session?: any, // MongoDB session for transactions
  ): Promise<ProductDocument> {
    const filter: any = { _id: id };

    // Only SUPER_ADMIN and MAINTAINER can update stock from other branches
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter.branchId = new Types.ObjectId(currentUser.branchId);
    }

    const { quantity, unit, operation } = updateStockDto;

    // Calculate the increment value for atomic operation
    const increment = operation === StockOperation.ADD ? quantity : -quantity;

    // For SUBTRACT operations, ensure we don't go below zero
    // For ADD operations, just increment
    const updateQuery: any = { $inc: { stock: increment } };
    
    if (operation === StockOperation.SUBTRACT) {
      // Add condition to prevent negative stock
      filter.stock = { $gte: quantity };
    }

    // Perform atomic update with session support
    const updateOptions: any = { 
      new: true, // Return the updated document
      runValidators: true,
    };
    
    if (session) {
      updateOptions.session = session;
    }

    // Atomic update operation
    const result = await this.productModel
      .findOneAndUpdate(filter, updateQuery, updateOptions)
      .exec();

    if (!result) {
      if (operation === StockOperation.SUBTRACT) {
        // Get current stock to show in error message
        const currentProduct = await this.productModel.findById(id).exec();
        throw new BadRequestException(
          `Insufficient stock: current ${currentProduct?.stock || 0}, requested ${quantity}`,
        );
      } else {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }
    }

    // Cast the result to ProductDocument to access properties
    const updatedProduct = result as unknown as ProductDocument;

    // Validate the unit matches (after successful update)
    if (updatedProduct.unit !== unit) {
      // Rollback the stock change if unit doesn't match
      const rollbackIncrement = operation === StockOperation.ADD ? -quantity : quantity;
      await this.productModel
        .findByIdAndUpdate(
          id,
          { $inc: { stock: rollbackIncrement } },
          session ? { session } : {},
        )
        .exec();
      
      throw new BadRequestException(
        `Unit mismatch: product has unit "${updatedProduct.unit}", but operation specified "${unit}"`,
      );
    }

    // Log stock update activity (don't fail transaction if logging fails)
    try {
      await this.systemActivityLogService.createLog({
        action: 'STOCK_UPDATED',
        details: `Stock ${operation === StockOperation.ADD ? 'increased' : 'decreased'} for ${updatedProduct.name}: ${quantity} ${unit} (New stock: ${updatedProduct.stock})`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
      }, session ? { session } : undefined);
    } catch (logError) {
      console.error('Failed to log stock update:', logError);
      // Don't throw error - logging failure shouldn't fail the stock update
    }

    return updatedProduct;
  }

  async remove(
    id: string,
    currentUser?: UserDocument,
    device?: string,
  ): Promise<void> {
    const product = await this.findById(id, currentUser);
    product.isActive = false;
    await product.save();

    // Log product deactivation activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'PRODUCT_DEACTIVATED',
        details: `Product deactivated: ${product.name} (${product.unit})`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch (logError) {
      console.error('Failed to log product deactivation:', logError);
    }

    // Emit real-time event for product deletion
    try {
      if (currentUser) {
        const eventData = this.realtimeEventService.createEventData(
          'deleted',
          'product',
          product._id.toString(),
          product,
          {
            id: currentUser._id?.toString() || '',
            email: currentUser.email,
            role: currentUser.role,
            branchId: currentUser.branchId?.toString(),
            branch: currentUser.branch,
          }
        );
        this.realtimeEventService.emitProductDeleted(eventData);
      }
    } catch (realtimeError) {
      // Don't fail if real-time event fails
    }
  }

  async hardRemove(
    id: string,
    currentUser?: UserDocument,
    device?: string,
  ): Promise<void> {
    const filter: any = { _id: id };

    // Only SUPER_ADMIN and MAINTAINER can delete products from other branches
    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      filter.branchId = new Types.ObjectId(currentUser.branchId);
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
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
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
      filter.branchId = new Types.ObjectId(currentUser.branchId);
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
      filter.branchId = new Types.ObjectId(currentUser.branchId);
    }

    return this.productModel
      .find(filter)
      .populate('categoryId', 'name units')
      .populate('branchId', 'name')
      .exec();
  }

  async findByBranchId(branchId: string): Promise<ProductDocument[]> {
    try {
      // Validate if branchId is a valid ObjectId
      if (!Types.ObjectId.isValid(branchId)) {
        throw new BadRequestException(`Invalid branchId format: ${branchId}`);
      }

      return this.productModel
        .find({ branchId: new Types.ObjectId(branchId), isActive: true })
        .populate('categoryId', 'name units')
        .populate('branchId', 'name')
        .sort({ createdAt: -1 })
        .exec();
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Error finding products by branchId: ${error.message}`);
    }
  }

  calculatePrice(product: Product | ProductDocument, quantity: number): number {
    // Use decimal service for precise financial calculations
    const price = this.decimalService.multiply(product.unitPrice, quantity);
    return this.decimalService.toNumber(price);
  }
}
