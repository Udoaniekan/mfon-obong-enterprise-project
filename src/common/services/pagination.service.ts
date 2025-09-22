import { Injectable } from '@nestjs/common';
import { FilterQuery, Model, Document } from 'mongoose';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: any;
  select?: string;
  populate?: string | string[];
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

@Injectable()
export class PaginationService {
  
  async paginate<T extends Document>(
    model: Model<T>,
    filter: FilterQuery<T> = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<T>> {
    
    // Set default values
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 10)); // Max 100 items per page
    const skip = (page - 1) * limit;

    // Build query
    let query = model.find(filter);

    // Apply sorting (default: newest first)
    if (options.sort) {
      query = query.sort(options.sort);
    } else {
      query = query.sort({ createdAt: -1 });
    }

    // Apply field selection
    if (options.select) {
      query = query.select(options.select);
    }

    // Apply population
    if (options.populate) {
      if (Array.isArray(options.populate)) {
        options.populate.forEach(field => {
          query = query.populate(field);
        });
      } else {
        query = query.populate(options.populate);
      }
    }

    // Execute queries in parallel for better performance
    const [data, total] = await Promise.all([
      query.skip(skip).limit(limit).exec(),
      model.countDocuments(filter).exec()
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext,
        hasPrev
      }
    };
  }

  /**
   * Create pagination metadata for manual queries
   */
  createPaginationMeta(total: number, page: number, limit: number) {
    const totalPages = Math.ceil(total / limit);
    return {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }

  /**
   * Validate and sanitize pagination parameters
   */
  validatePaginationParams(page?: any, limit?: any) {
    const validPage = Math.max(1, parseInt(page) || 1);
    const validLimit = Math.min(100, Math.max(1, parseInt(limit) || 10));
    
    return { page: validPage, limit: validLimit };
  }
}