import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from '../schemas/product.schema';
import {
  CreateProductDto,
  UpdateProductDto,
  UpdateStockDto,
  StockOperation,
} from '../dto/product.dto';
import { CategoriesService } from '../../categories/services/categories.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly categoriesService: CategoriesService,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    // Validate that the unit matches the category
    const category = await this.categoriesService.findById(createProductDto.categoryId);
    if (!category.units.includes(createProductDto.unit)) {
      throw new BadRequestException(`Invalid unit ${createProductDto.unit} for category ${category.name}`);
    }

    // Check if a product with the same categoryId and unit already exists
    const existingProduct = await this.productModel.findOne({
      categoryId: createProductDto.categoryId,
      unit: createProductDto.unit
    });

    if (existingProduct) {
      throw new BadRequestException(
        `A product with unit ${createProductDto.unit} already exists for category ${category.name}. Please choose a different unit.`
      );
    }

    const product = new this.productModel({
      ...createProductDto,
      priceHistory: [{ price: createProductDto.unitPrice, date: new Date() }],
    });

    return product.save();
  }

  async findAll(includeInactive = false): Promise<ProductDocument[]> {
    const query = includeInactive ? {} : { isActive: true };
    return this.productModel
      .find(query)
      .populate('categoryId', 'name units')
      .exec();
  }

  async findById(id: string): Promise<ProductDocument> {
    const product = await this.productModel
      .findById(id)
      .populate('categoryId', 'name units')
      .exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<ProductDocument> {
    const product = await this.findById(id);

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

    Object.assign(product, updateProductDto);
    return product.save();
  }    
  
  async updateStock(id: string, updateStockDto: UpdateStockDto): Promise<ProductDocument> {
    // Get the product first to validate it exists
    const product = await this.productModel.findById(id).exec();
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
      { _id: id },
      { $set: { stock: newStock } }
    ).exec();
    
    // Return the updated product with populated fields
    return this.productModel
      .findById(id)
      .populate('categoryId', 'name units')
      .exec();
  }

  async remove(id: string): Promise<void> {
    const product = await this.findById(id);
    product.isActive = false;
    await product.save();
  }

  async hardRemove(id: string): Promise<void> {
    const result = await this.productModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('Product not found');
    }
  }

  async getLowStockProducts(): Promise<ProductDocument[]> {
    return this.productModel
      .find({
        isActive: true,
        $expr: {
          $lte: ['$stock', '$minStockLevel']
        }
      })
      .populate('categoryId', 'name units')
      .exec();
  }

  async findByCategory(categoryId: string): Promise<ProductDocument[]> {
    return this.productModel
      .find({ categoryId, isActive: true })
      .populate('categoryId', 'name units')
      .exec();
  }

  calculatePrice(product: Product | ProductDocument, quantity: number): number {
    return quantity * product.unitPrice;
  }
}
