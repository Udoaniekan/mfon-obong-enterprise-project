import { Injectable } from '@nestjs/common';

@Injectable()
export class QueryOptimizationService {
  
  /**
   * Optimize filters for better database performance
   */
  optimizeFilters<T>(filters: any): any {
    const optimized: any = {};

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') {
        continue; // Skip empty filters
      }

      // Handle search queries
      if (key === 'search' && typeof value === 'string') {
        optimized.$text = { $search: value };
        continue;
      }

      // Handle date ranges
      if (key.includes('Date') && typeof value === 'object' && value !== null) {
        const dateFilter: any = {};
        const dateObj = value as any;
        if (dateObj.from) dateFilter.$gte = new Date(dateObj.from);
        if (dateObj.to) dateFilter.$lte = new Date(dateObj.to);
        if (Object.keys(dateFilter).length > 0) {
          optimized[key] = dateFilter;
        }
        continue;
      }

      // Handle array filters (e.g., status: ['PENDING', 'COMPLETED'])
      if (Array.isArray(value) && value.length > 0) {
        optimized[key] = { $in: value };
        continue;
      }

      // Handle number ranges
      if (typeof value === 'object' && value !== null) {
        const rangeObj = value as any;
        if (rangeObj.min !== undefined || rangeObj.max !== undefined) {
          const rangeFilter: any = {};
          if (rangeObj.min !== undefined) rangeFilter.$gte = Number(rangeObj.min);
          if (rangeObj.max !== undefined) rangeFilter.$lte = Number(rangeObj.max);
          if (Object.keys(rangeFilter).length > 0) {
            optimized[key] = rangeFilter;
          }
          continue;
        }
      }

      // Handle boolean filters
      if (typeof value === 'boolean' || value === 'true' || value === 'false') {
        optimized[key] = value === true || value === 'true';
        continue;
      }

      // Handle string filters with case-insensitive regex
      if (typeof value === 'string' && key !== '_id') {
        optimized[key] = { $regex: new RegExp(value, 'i') };
        continue;
      }

      // Default: use value as-is
      optimized[key] = value;
    }

    return optimized;
  }

  /**
   * Build optimized sort options
   */
  optimizeSort(sort?: any): any {
    if (!sort) {
      return { createdAt: -1 }; // Default: newest first
    }

    // Handle string format: "field:desc" or "field:asc"
    if (typeof sort === 'string') {
      const [field, direction] = sort.split(':');
      return { [field]: direction === 'desc' ? -1 : 1 };
    }

    // Handle object format
    if (typeof sort === 'object') {
      const optimized: any = {};
      for (const [field, direction] of Object.entries(sort)) {
        optimized[field] = direction === 'desc' || direction === -1 ? -1 : 1;
      }
      return optimized;
    }

    return { createdAt: -1 };
  }

  /**
   * Build optimized field selection
   */
  optimizeSelect(select?: string | string[]): string | undefined {
    if (!select) return undefined;

    if (Array.isArray(select)) {
      return select.join(' ');
    }

    return select;
  }

  /**
   * Optimize populate options
   */
  optimizePopulate(populate?: string | string[] | any): any {
    if (!populate) return undefined;

    // Simple string or array of strings
    if (typeof populate === 'string' || Array.isArray(populate)) {
      return populate;
    }

    // Complex populate object
    if (typeof populate === 'object') {
      return populate;
    }

    return undefined;
  }

  /**
   * Get lean options for better performance
   */
  getLeanOptions(includeMethods = false) {
    return {
      lean: !includeMethods, // Use lean queries when methods not needed
      autopopulate: false    // Disable auto-population for performance
    };
  }

  /**
   * Build aggregation pipeline for complex queries
   */
  buildAggregationPipeline(options: {
    match?: any;
    lookup?: any[];
    sort?: any;
    skip?: number;
    limit?: number;
    project?: any;
  }): any[] {
    const pipeline: any[] = [];

    // Match stage (filtering)
    if (options.match) {
      pipeline.push({ $match: options.match });
    }

    // Lookup stages (joins)
    if (options.lookup && Array.isArray(options.lookup)) {
      pipeline.push(...options.lookup);
    }

    // Sort stage
    if (options.sort) {
      pipeline.push({ $sort: options.sort });
    }

    // Skip stage (pagination)
    if (options.skip && options.skip > 0) {
      pipeline.push({ $skip: options.skip });
    }

    // Limit stage
    if (options.limit && options.limit > 0) {
      pipeline.push({ $limit: options.limit });
    }

    // Project stage (field selection)
    if (options.project) {
      pipeline.push({ $project: options.project });
    }

    return pipeline;
  }
}