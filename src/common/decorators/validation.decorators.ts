import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Decimal } from 'decimal.js';

/**
 * Custom validation decorators for business rules
 */

// Decimal validation constraint
@ValidatorConstraint({ name: 'isValidDecimal', async: false })
export class IsValidDecimalConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    if (value === null || value === undefined) return true; // Let @IsOptional handle this
    
    try {
      const decimal = new Decimal(value);
      const [minValue, maxValue, decimalPlaces] = args.constraints;
      
      // Check decimal places
      if (decimalPlaces !== undefined && decimal.decimalPlaces() > decimalPlaces) {
        return false;
      }
      
      // Check min value
      if (minValue !== undefined && decimal.lt(minValue)) {
        return false;
      }
      
      // Check max value
      if (maxValue !== undefined && decimal.gt(maxValue)) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    const [minValue, maxValue, decimalPlaces] = args.constraints;
    let message = `${args.property} must be a valid decimal number`;
    
    if (decimalPlaces !== undefined) {
      message += ` with at most ${decimalPlaces} decimal places`;
    }
    
    if (minValue !== undefined && maxValue !== undefined) {
      message += ` between ${minValue} and ${maxValue}`;
    } else if (minValue !== undefined) {
      message += ` greater than or equal to ${minValue}`;
    } else if (maxValue !== undefined) {
      message += ` less than or equal to ${maxValue}`;
    }
    
    return message;
  }
}

/**
 * Validates that a value is a valid decimal number with optional constraints
 * @param minValue - Minimum allowed value
 * @param maxValue - Maximum allowed value  
 * @param decimalPlaces - Maximum decimal places allowed
 * @param validationOptions - Additional validation options
 */
export function IsValidDecimal(
  minValue?: number | string,
  maxValue?: number | string,
  decimalPlaces?: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [minValue, maxValue, decimalPlaces],
      validator: IsValidDecimalConstraint,
    });
  };
}

// Money validation constraint (specific for currency amounts)
@ValidatorConstraint({ name: 'isValidMoney', async: false })
export class IsValidMoneyConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    if (value === null || value === undefined) return true;
    
    try {
      const decimal = new Decimal(value);
      
      // Money must be non-negative
      if (decimal.lt(0)) {
        return false;
      }
      
      // Money must have at most 2 decimal places
      if (decimal.decimalPlaces() > 2) {
        return false;
      }
      
      // Money must not exceed reasonable business limits (100 million)
      if (decimal.gt(100000000)) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be a valid money amount (non-negative, max 2 decimal places, under 100M)`;
  }
}

/**
 * Validates that a value is a valid money amount (non-negative, max 2 decimal places)
 */
export function IsValidMoney(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidMoneyConstraint,
    });
  };
}

// Quantity validation constraint
@ValidatorConstraint({ name: 'isValidQuantity', async: false })
export class IsValidQuantityConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    if (value === null || value === undefined) return true;
    
    try {
      const decimal = new Decimal(value);
      
      // Quantity must be positive
      if (decimal.lte(0)) {
        return false;
      }
      
      // Quantity must be reasonable (not more than 1 million)
      if (decimal.gt(1000000)) {
        return false;
      }
      
      // For units that should be whole numbers (pieces, items), check if it's an integer
      const [unit] = args.constraints;
      if (unit && ['pieces', 'items', 'units', 'pcs'].includes(unit.toLowerCase())) {
        if (!decimal.isInteger()) {
          return false;
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    const [unit] = args.constraints;
    let message = `${args.property} must be a positive number`;
    
    if (unit && ['pieces', 'items', 'units', 'pcs'].includes(unit.toLowerCase())) {
      message += ' and must be a whole number for piece-based units';
    }
    
    return message;
  }
}

/**
 * Validates that a value is a valid quantity (positive number, integer for piece units)
 */
export function IsValidQuantity(unit?: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [unit],
      validator: IsValidQuantityConstraint,
    });
  };
}

// Business rule validation for transaction totals
@ValidatorConstraint({ name: 'isValidTransactionTotal', async: false })
export class IsValidTransactionTotalConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const object = args.object as any;
    
    try {
      // Check if we have the required fields
      if (!object.items || !Array.isArray(object.items)) {
        return true; // Let other validators handle this
      }
      
      // Calculate expected total from items
      let calculatedSubtotal = new Decimal(0);
      
      for (const item of object.items) {
        if (item.subtotal !== undefined) {
          calculatedSubtotal = calculatedSubtotal.add(new Decimal(item.subtotal));
        }
      }
      
      // Apply global discount
      const globalDiscount = new Decimal(object.discount || 0);
      const calculatedTotal = calculatedSubtotal.sub(globalDiscount);
      
      // Compare with provided total
      const providedTotal = new Decimal(value);
      
      // Allow small rounding differences (1 cent)
      const difference = calculatedTotal.sub(providedTotal).abs();
      return difference.lte(0.01);
      
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} does not match the calculated total from items and discounts`;
  }
}

/**
 * Validates that transaction total matches calculated total from items
 */
export function IsValidTransactionTotal(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidTransactionTotalConstraint,
    });
  };
}

// Phone number validation constraint
@ValidatorConstraint({ name: 'isValidNigerianPhone', async: false })
export class IsValidNigerianPhoneConstraint implements ValidatorConstraintInterface {
  validate(phone: any, args: ValidationArguments) {
    if (!phone || typeof phone !== 'string') return false;
    
    // Remove all non-digit characters
    const digitsOnly = phone.replace(/\D/g, '');
    
    // Check Nigerian phone number patterns
    // Local format: 080xxxxxxxx, 070xxxxxxxx, etc. (11 digits)
    // International format: 2348xxxxxxxxx (13 digits)
    if (digitsOnly.length === 11) {
      // Local format - should start with 070, 080, 081, 090, 091, etc.
      return /^(070|080|081|090|091|070|071|080|081|082|083|084|085|086|087|088|089|090|091|092|093|094|095|096|097|098|099)/.test(digitsOnly);
    } else if (digitsOnly.length === 13) {
      // International format - should start with 234
      return digitsOnly.startsWith('234') && /^(234)(070|080|081|090|091|070|071|080|081|082|083|084|085|086|087|088|089|090|091|092|093|094|095|096|097|098|099)/.test(digitsOnly);
    }
    
    return false;
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be a valid Nigerian phone number (e.g., 08012345678 or +2348012345678)`;
  }
}

/**
 * Validates Nigerian phone number format
 */
export function IsValidNigerianPhone(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidNigerianPhoneConstraint,
    });
  };
}