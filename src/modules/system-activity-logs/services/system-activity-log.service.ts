import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SystemActivityLog,
  SystemActivityLogDocument,
} from '../schemas/system-activity-log.schema';
import { CreateSystemActivityLogDto } from '../dto/system-activity-log.dto';

@Injectable()
export class SystemActivityLogService {
  private readonly logger = new Logger(SystemActivityLogService.name);

  constructor(
    @InjectModel(SystemActivityLog.name)
    private readonly systemActivityLogModel: Model<SystemActivityLogDocument>,
  ) {}

  async createLog(
    createSystemActivityLogDto: CreateSystemActivityLogDto,
  ): Promise<SystemActivityLog> {
    try {
      this.logger.log(
        `Creating log entry: ${createSystemActivityLogDto.action}`,
      );

      const logEntry = new this.systemActivityLogModel({
        ...createSystemActivityLogDto,
        timestamp: createSystemActivityLogDto.timestamp || new Date(),
      });

      const savedLog = await logEntry.save();
      this.logger.log(
        `Log entry created successfully with ID: ${savedLog._id}`,
      );

      return savedLog;
    } catch (error) {
      this.logger.error(
        `Error creating log entry: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getLogs(): Promise<SystemActivityLog[]> {
  try {
    this.logger.log(`Fetching all system activity logs`);

    const logs = await this.systemActivityLogModel
      .find()
      .sort({ timestamp: -1 }) // newest first
      .exec();

    this.logger.log(`Found ${logs.length} log entries`);

    return logs;
  } catch (error) {
    this.logger.error(`Error fetching logs: ${error.message}`, error.stack);
    throw error;
  }
}

}
