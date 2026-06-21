import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async checkHealth(): Promise<HealthStatus> {
    const databaseCheck = await this.checkDatabase();
    const memoryCheck = this.checkMemory();
    const environmentCheck = this.checkEnvironment();

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
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', responseTime: Date.now() - startTime };
    } catch (error) {
      return { status: 'down', error: error.message };
    }
  }

  private checkMemory(): {
    status: 'normal' | 'high' | 'critical';
    usage: { heapUsed: number; heapTotal: number; external: number; rss: number };
    percentage: number;
  } {
    const memoryUsage = process.memoryUsage();
    const maxOldSpaceSize = parseInt(process.env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/)?.[1] || '512');
    const totalSystemMemory = maxOldSpaceSize * 1024 * 1024;
    const usedMemory = memoryUsage.rss;
    const percentage = Math.round((usedMemory / totalSystemMemory) * 100);

    let status: 'normal' | 'high' | 'critical' = 'normal';
    if (percentage > 85) status = 'critical';
    else if (percentage > 70) status = 'high';

    return {
      status,
      usage: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
      },
      percentage,
    };
  }

  private checkEnvironment(): { nodeVersion: string; platform: string; environment: string } {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
