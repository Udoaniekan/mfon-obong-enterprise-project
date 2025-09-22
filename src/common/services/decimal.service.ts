import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';

@Injectable()
export class DecimalService {
  constructor() {
    // Configure Decimal.js for financial calculations
    Decimal.set({
      precision: 20, // High precision for financial calculations
      rounding: Decimal.ROUND_HALF_UP, // Standard rounding for money
      toExpNeg: -7, // Use exponential notation for very small numbers
      toExpPos: 21, // Use exponential notation for very large numbers
      modulo: Decimal.ROUND_FLOOR, // Modulo method
    });
  }

  /**
   * Create a new Decimal instance from a number or string
   */
  new(value: string | number): Decimal {
    return new Decimal(value);
  }

  /**
   * Add two decimal values
   */
  add(a: string | number | Decimal, b: string | number | Decimal): Decimal {
    return new Decimal(a).add(new Decimal(b));
  }

  /**
   * Subtract two decimal values
   */
  subtract(a: string | number | Decimal, b: string | number | Decimal): Decimal {
    return new Decimal(a).minus(new Decimal(b));
  }

  /**
   * Multiply two decimal values
   */
  multiply(a: string | number | Decimal, b: string | number | Decimal): Decimal {
    return new Decimal(a).mul(new Decimal(b));
  }

  /**
   * Divide two decimal values
   */
  divide(a: string | number | Decimal, b: string | number | Decimal): Decimal {
    return new Decimal(a).div(new Decimal(b));
  }

  /**
   * Calculate percentage of a value
   */
  percentage(value: string | number | Decimal, percent: string | number | Decimal): Decimal {
    return new Decimal(value).mul(new Decimal(percent)).div(100);
  }

  /**
   * Round a decimal to specified decimal places (default 2 for currency)
   */
  round(value: string | number | Decimal, decimalPlaces: number = 2): Decimal {
    return new Decimal(value).toDecimalPlaces(decimalPlaces);
  }

  /**
   * Convert decimal to number (use with caution - only for final display)
   */
  toNumber(value: Decimal): number {
    return value.toNumber();
  }

  /**
   * Convert decimal to string with fixed decimal places
   */
  toFixed(value: Decimal, decimalPlaces: number = 2): string {
    return value.toFixed(decimalPlaces);
  }

  /**
   * Check if a value is zero
   */
  isZero(value: string | number | Decimal): boolean {
    return new Decimal(value).isZero();
  }

  /**
   * Check if first value is greater than second
   */
  isGreaterThan(a: string | number | Decimal, b: string | number | Decimal): boolean {
    return new Decimal(a).greaterThan(new Decimal(b));
  }

  /**
   * Check if first value is greater than or equal to second
   */
  isGreaterThanOrEqual(a: string | number | Decimal, b: string | number | Decimal): boolean {
    return new Decimal(a).greaterThanOrEqualTo(new Decimal(b));
  }

  /**
   * Check if first value is less than second
   */
  isLessThan(a: string | number | Decimal, b: string | number | Decimal): boolean {
    return new Decimal(a).lessThan(new Decimal(b));
  }

  /**
   * Check if first value is less than or equal to second
   */
  isLessThanOrEqual(a: string | number | Decimal, b: string | number | Decimal): boolean {
    return new Decimal(a).lessThanOrEqualTo(new Decimal(b));
  }

  /**
   * Check if two values are equal
   */
  isEqual(a: string | number | Decimal, b: string | number | Decimal): boolean {
    return new Decimal(a).equals(new Decimal(b));
  }

  /**
   * Get the absolute value
   */
  abs(value: string | number | Decimal): Decimal {
    return new Decimal(value).abs();
  }

  /**
   * Calculate total from an array of items with quantity and unit price
   */
  calculateItemsTotal(items: Array<{
    quantity: string | number | Decimal;
    unitPrice: string | number | Decimal;
    discount?: string | number | Decimal;
  }>): Decimal {
    return items.reduce((total, item) => {
      const itemPrice = this.multiply(item.quantity, item.unitPrice);
      const itemDiscount = item.discount ? new Decimal(item.discount) : new Decimal(0);
      const itemTotal = this.subtract(itemPrice, itemDiscount);
      return this.add(total, itemTotal);
    }, new Decimal(0));
  }

  /**
   * Calculate subtotal and total with global discount
   */
  calculateTransactionTotal(
    subtotal: string | number | Decimal,
    globalDiscount: string | number | Decimal = 0,
  ): {
    subtotal: Decimal;
    discount: Decimal;
    total: Decimal;
  } {
    const subtotalDecimal = new Decimal(subtotal);
    const discountDecimal = new Decimal(globalDiscount);
    const totalDecimal = this.subtract(subtotalDecimal, discountDecimal);

    return {
      subtotal: subtotalDecimal,
      discount: discountDecimal,
      total: totalDecimal,
    };
  }

  /**
   * Format decimal as currency string (NGN)
   */
  formatCurrency(value: string | number | Decimal, currency: string = 'NGN'): string {
    const amount = this.toFixed(new Decimal(value), 2);
    return `${currency} ${amount}`;
  }

  /**
   * Validate that a value is a valid decimal
   */
  isValidDecimal(value: any): boolean {
    try {
      new Decimal(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure value is positive (throw error if negative)
   */
  ensurePositive(value: string | number | Decimal, fieldName: string = 'Value'): Decimal {
    const decimal = new Decimal(value);
    if (decimal.isNegative()) {
      throw new Error(`${fieldName} cannot be negative: ${decimal.toString()}`);
    }
    return decimal;
  }

  /**
   * Ensure value is not zero (throw error if zero)
   */
  ensureNotZero(value: string | number | Decimal, fieldName: string = 'Value'): Decimal {
    const decimal = new Decimal(value);
    if (decimal.isZero()) {
      throw new Error(`${fieldName} cannot be zero`);
    }
    return decimal;
  }
}