export class InventoryUtils {
  static calculateTotalValue(unitPrice: number, stock: number): number {
    return unitPrice * stock;
  }
}
