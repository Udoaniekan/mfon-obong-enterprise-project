import { PackagingUnit } from '../enums';

export class InventoryUtils {
  static convertUnits(
    fromUnit: PackagingUnit,
    toUnit: PackagingUnit,
    quantity: number,
    conversionRate: number,
  ): number {
    if (fromUnit === toUnit) return quantity;

    // Convert from larger to smaller unit (e.g., bag to pounds)
    if (fromUnit === PackagingUnit.BAG && toUnit === PackagingUnit.POUND) {
      return quantity * conversionRate;
    }

    // Convert from smaller to larger unit (e.g., pounds to bags)
    if (fromUnit === PackagingUnit.POUND && toUnit === PackagingUnit.BAG) {
      return quantity / conversionRate;
    }

    throw new Error(`Unsupported unit conversion from ${fromUnit} to ${toUnit}`);
  }

  static calculateTotalValue(
    primaryUnitPrice: number,
    primaryUnitStock: number,
    secondaryUnitPrice?: number,
    secondaryUnitStock?: number,
  ): number {
    const primaryValue = primaryUnitPrice * primaryUnitStock;
    const secondaryValue = secondaryUnitPrice && secondaryUnitStock
      ? secondaryUnitPrice * secondaryUnitStock
      : 0;
    return primaryValue + secondaryValue;
  }

  static calculateBulkPrice(
    basePrice: number,
    quantity: number,
    bulkPrices: Map<number, number>,
  ): number {
    let applicablePrice = basePrice;
    
    // Find the highest quantity threshold that applies
    for (const [threshold, price] of bulkPrices.entries()) {
      if (quantity >= threshold && price < applicablePrice) {
        applicablePrice = price;
      }
    }
    
    return applicablePrice * quantity;
  }
}
