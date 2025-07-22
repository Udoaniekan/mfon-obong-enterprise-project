import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  checks: {
    database: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    memory: {
      status: 'normal' | 'high' | 'critical';
      usage: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
      };
      percentage: number;
    };
    environment: {
      nodeVersion: string;
      platform: string;
      environment: string;
    };
  };
}

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async checkHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    // Check database connection
    const databaseCheck = await this.checkDatabase();
    
    // Check memory usage
    const memoryCheck = this.checkMemory();
    
    // Get environment info
    const environmentCheck = this.checkEnvironment();
    
    // Determine overall status
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    
    if (databaseCheck.status === 'down') {
      overallStatus = 'unhealthy';
    } else if (memoryCheck.status === 'critical') {
      overallStatus = 'unhealthy';
    } else if (memoryCheck.status === 'high') {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: databaseCheck,
        memory: memoryCheck,
        environment: environmentCheck,
      },
    };
  }

  private async checkDatabase(): Promise<{ status: 'up' | 'down'; responseTime?: number; error?: string }> {
    try {
      const startTime = Date.now();
      
      // Simple ping to check database connectivity
      await this.connection.db.admin().ping();
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'up',
        responseTime,
      };
    } catch (error) {
      return {
        status: 'down',
        error: error.message,
      };
    }
  }

  private checkMemory(): {
    status: 'normal' | 'high' | 'critical';
    usage: {
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
    };
    percentage: number;
  } {
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal;
    const usedMemory = memoryUsage.heapUsed;
    const percentage = Math.round((usedMemory / totalMemory) * 100);

    let status: 'normal' | 'high' | 'critical' = 'normal';
    
    if (percentage > 90) {
      status = 'critical';
    } else if (percentage > 75) {
      status = 'high';
    }

    return {
      status,
      usage: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
      },
      percentage,
    };
  }

  private checkEnvironment(): {
    nodeVersion: string;
    platform: string;
    environment: string;
  } {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV || 'development',
    };
  }
}