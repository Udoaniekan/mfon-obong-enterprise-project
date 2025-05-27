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
} from '../dto/product.dto';
import { InventoryUtils } from '../../../common/utils/inventory.utils';
import { PackagingUnit } from '../../../common/enums';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<ProductDocument> {
    // Validate secondary unit configuration
    if (createProductDto.secondaryUnit && !createProductDto.conversionRate) {
      throw new BadRequestException('Conversion rate is required when secondary unit is specified');
    }

    const bulkPrices = new Map<number, number>();
    if (createProductDto.bulkPrices) {
      createProductDto.bulkPrices.forEach((bp) => {
        bulkPrices.set(bp.quantity, bp.price);
      });
    }

    const product = new this.productModel({
      ...createProductDto,
      bulkPrices,
      priceHistory: [{ price: createProductDto.primaryUnitPrice, date: new Date() }],
    });

    // Set initial secondary unit stock based on conversion if applicable
    if (product.secondaryUnit && product.conversionRate) {
      product.secondaryUnitStock = InventoryUtils.convertUnits(
        product.primaryUnit,
        product.secondaryUnit,
        product.primaryUnitStock,
        product.conversionRate
      );
    }

    return product.save();
  }

  async findAll(includeInactive = false): Promise<ProductDocument[]> {
    const query = includeInactive ? {} : { isActive: true };
    return this.productModel.find(query).exec();
  }

  async findById(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<ProductDocument> {
    const product = await this.findById(id);

    // Track price history
    if (updateProductDto.primaryUnitPrice && updateProductDto.primaryUnitPrice !== product.primaryUnitPrice) {
      product.priceHistory.push({
        price: updateProductDto.primaryUnitPrice,
        date: new Date(),
      });
    }

    // Validate and update bulk prices
    if (updateProductDto.bulkPrices) {
      const bulkPrices = new Map<number, number>();
      updateProductDto.bulkPrices.forEach((bp) => {
        if (bp.price > updateProductDto.primaryUnitPrice) {
          throw new BadRequestException('Bulk price cannot be higher than primary unit price');
        }
        bulkPrices.set(bp.quantity, bp.price);
      });
      product.bulkPrices = bulkPrices;
    }

    // Validate secondary unit configuration
    if (updateProductDto.secondaryUnit && !updateProductDto.conversionRate && !product.conversionRate) {
      throw new BadRequestException('Conversion rate is required when adding secondary unit');
    }

    Object.assign(product, updateProductDto);

    // Update secondary unit stock if conversion rate or primary stock changes
    if (product.secondaryUnit && product.conversionRate) {
      product.secondaryUnitStock = InventoryUtils.convertUnits(
        product.primaryUnit,
        product.secondaryUnit,
        product.primaryUnitStock,
        product.conversionRate
      );
    }

    return product.save();
  }

  async updateStock(id: string, updateStockDto: UpdateStockDto): Promise<ProductDocument> {
    const product = await this.findById(id);
    const { quantity, unit, operation } = updateStockDto;

    // Validate the unit exists for the product
    if (unit !== product.primaryUnit && unit !== product.secondaryUnit) {
      throw new BadRequestException(`Invalid unit ${unit} for this product`);
    }

    let primaryUnitQuantity: number;
    
    // Convert quantity to primary unit if necessary
    if (unit === product.secondaryUnit) {
      if (!product.conversionRate) {
        throw new BadRequestException('Product does not have a conversion rate defined');
      }
      primaryUnitQuantity = InventoryUtils.convertUnits(
        unit,
        product.primaryUnit,
        quantity,
        product.conversionRate
      );
    } else {
      primaryUnitQuantity = quantity;
    }

    // Validate and update stock
    if (operation === 'subtract' && product.primaryUnitStock < primaryUnitQuantity) {
      throw new BadRequestException('Insufficient stock');
    }

    // Update primary unit stock
    product.primaryUnitStock = operation === 'add'
      ? product.primaryUnitStock + primaryUnitQuantity
      : product.primaryUnitStock - primaryUnitQuantity;

    // Update secondary unit stock if applicable
    if (product.secondaryUnit && product.conversionRate) {
      product.secondaryUnitStock = InventoryUtils.convertUnits(
        product.primaryUnit,
        product.secondaryUnit,
        product.primaryUnitStock,
        product.conversionRate
      );
    }

    return product.save();
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
          $lte: ['$primaryUnitStock', '$minStockLevel']
        }
      })
      .exec();
  }

  async findByType(type: string): Promise<ProductDocument[]> {
    return this.productModel
      .find({ type, isActive: true })
      .exec();
  }

  calculateProductValue(product: Product | ProductDocument): number {
    return InventoryUtils.calculateTotalValue(
      product.primaryUnitPrice,
      product.primaryUnitStock,
      product.secondaryUnitPrice,
      product.secondaryUnitStock
    );
  }

  calculatePrice(product: Product | ProductDocument, quantity: number, unit: PackagingUnit): number {
    let primaryUnitQuantity = quantity;
    
    // Convert to primary unit if necessary
    if (unit === product.secondaryUnit) {
      if (!product.conversionRate) {
        throw new BadRequestException('Product does not have a conversion rate defined');
      }
      primaryUnitQuantity = InventoryUtils.convertUnits(
        unit,
        product.primaryUnit,
        quantity,
        product.conversionRate
      );
    }

    // Apply bulk pricing if available
    if (product.bulkPrices && product.bulkPrices.size > 0) {
      return InventoryUtils.calculateBulkPrice(
        product.primaryUnitPrice,
        primaryUnitQuantity,
        product.bulkPrices
      );
    }

    // Regular pricing
    return unit === product.primaryUnit
      ? quantity * product.primaryUnitPrice
      : quantity * (product.secondaryUnitPrice || 0);
  }
}
