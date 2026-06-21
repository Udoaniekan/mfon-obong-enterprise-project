import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSystemActivityLogDto } from '../dto/system-activity-log.dto';

@Injectable()
export class SystemActivityLogService {
  private readonly logger = new Logger(SystemActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createLog(dto: CreateSystemActivityLogDto): Promise<any> {
    try {
      this.logger.log(`Creating log entry: ${dto.action}`);
      const log = await this.prisma.systemActivityLog.create({
        data: {
          action: dto.action,
          details: dto.details,
          performedBy: dto.performedBy,
          role: dto.role,
          device: dto.device || '',
          branchId: dto.branchId,
          timestamp: dto.timestamp || new Date(),
        },
      });
      this.logger.log(`Log entry created: ${log.id}`);
      return { ...log, _id: log.id };
    } catch (error) {
      this.logger.error(`Error creating log: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getLogs(): Promise<any[]> {
    try {
      const logs = await this.prisma.systemActivityLog.findMany({
        orderBy: { timestamp: 'desc' },
      });
      return logs.map(l => ({ ...l, _id: l.id }));
    } catch (error) {
      this.logger.error(`Error fetching logs: ${error.message}`, error.stack);
      throw error;
    }
  }
}
