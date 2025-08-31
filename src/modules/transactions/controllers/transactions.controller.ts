import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { TransactionsService } from '../services/transactions.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  QueryTransactionsDto,
  CalculateTransactionDto,
} from '../dto/transaction.dto';
import { Transaction } from '../schemas/transaction.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../../common/enums';
import { Roles } from 'src/decorators/roles.decorators';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async create(
    @Body() createTransactionDto: CreateTransactionDto,
    @Request() req,
  ): Promise<Transaction> {
    return this.transactionsService.create(
      createTransactionDto,
      req.user,
    );
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async findAll(@Query() query: QueryTransactionsDto): Promise<Transaction[]> {
    return this.transactionsService.findAll(query);
  }

  @Get('branch/:branchId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async findByBranch(@Param('branchId') branchId: string, @Request() req): Promise<Transaction[]> {
    // Check permissions: ADMIN can only access their own branch
    if (req.user.role === UserRole.ADMIN && req.user.branchId !== branchId) {
      throw new BadRequestException('Forbidden: ADMIN can only access transactions from their own branch');
    }
    return this.transactionsService.findByBranchId(branchId);
  }

  @Get('user/:userId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async findByUser(@Param('userId') userId: string, @Request() req): Promise<Transaction[]> {
    // Check permissions: Non-privileged users can only access their own transactions
    if (![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(req.user.role) && req.user.userId !== userId) {
      throw new BadRequestException('Forbidden: You can only access your own transactions');
    }
    return this.transactionsService.findByUserId(userId);
  }

  @Get('client/:clientId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async findByClient(@Param('clientId') clientId: string): Promise<Transaction[]> {
    return this.transactionsService.findByClientId(clientId);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async findOne(@Param('id') id: string): Promise<Transaction> {
    return this.transactionsService.findById(id);
  }

  @Patch(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async update(
    @Param('id') id: string,
    @Body() updateTransactionDto: UpdateTransactionDto,
    @Request() req,
  ): Promise<Transaction> {
    return this.transactionsService.update(id, updateTransactionDto, req.user);
  }

  @Get('reports/sales')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  async getSalesReport(
    @Query('startDate') startDate: Date,
    @Query('endDate') endDate: Date,
  ) {
    return this.transactionsService.generateReport(startDate, endDate);
  }

  @Post('calculate')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async calculateTransaction(
    @Body() calculateTransactionDto: CalculateTransactionDto,
  ): Promise<any> {
    return this.transactionsService.calculateTransaction(
      calculateTransactionDto,
    );
  }

  @Patch(':id/waybill')
  async assignWaybillNumber(@Param('id') id: string, @Request() req): Promise<any> {
    return this.transactionsService.assignWaybillNumber(id, req.user);
  }

  // Revenue Analytics Endpoints
  @Get('revenue/total')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN)
  async getTotalRevenue(
    @Request() req,
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveBranchId = this.getEffectiveBranchId(req.user, branchId);
    const parsedStartDate = startDate ? new Date(startDate) : undefined;
    const parsedEndDate = endDate ? new Date(endDate) : undefined;

    this.validateDateRange(parsedStartDate, parsedEndDate);

    return this.transactionsService.getTotalRevenue(
      effectiveBranchId,
      parsedStartDate,
      parsedEndDate,
    );
  }

  @Get('revenue/daily')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN)
  async getDailyRevenue(
    @Request() req,
    @Query('branchId') branchId?: string,
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveBranchId = this.getEffectiveBranchId(req.user, branchId);
    const parsedDate = date ? new Date(date) : undefined;
    const parsedStartDate = startDate ? new Date(startDate) : undefined;
    const parsedEndDate = endDate ? new Date(endDate) : undefined;

    this.validateDateRange(parsedStartDate, parsedEndDate);

    return this.transactionsService.getDailyRevenue(
      effectiveBranchId,
      parsedDate,
      parsedStartDate,
      parsedEndDate,
    );
  }

  @Get('revenue/monthly')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN)
  async getMonthlyRevenue(
    @Request() req,
    @Query('branchId') branchId?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveBranchId = this.getEffectiveBranchId(req.user, branchId);
    const parsedMonth = month ? parseInt(month) : undefined;
    const parsedYear = year ? parseInt(year) : undefined;
    const parsedStartDate = startDate ? new Date(startDate) : undefined;
    const parsedEndDate = endDate ? new Date(endDate) : undefined;

    if (parsedMonth && (parsedMonth < 1 || parsedMonth > 12)) {
      throw new BadRequestException('Month must be between 1 and 12');
    }

    this.validateDateRange(parsedStartDate, parsedEndDate);

    return this.transactionsService.getMonthlyRevenue(
      effectiveBranchId,
      parsedMonth,
      parsedYear,
      parsedStartDate,
      parsedEndDate,
    );
  }

  @Get('revenue/yearly')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN)
  async getYearlyRevenue(
    @Request() req,
    @Query('branchId') branchId?: string,
    @Query('year') year?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveBranchId = this.getEffectiveBranchId(req.user, branchId);
    const parsedYear = year ? parseInt(year) : undefined;
    const parsedStartDate = startDate ? new Date(startDate) : undefined;
    const parsedEndDate = endDate ? new Date(endDate) : undefined;

    this.validateDateRange(parsedStartDate, parsedEndDate);

    return this.transactionsService.getYearlyRevenue(
      effectiveBranchId,
      parsedYear,
      parsedStartDate,
      parsedEndDate,
    );
  }

  // Helper methods for branch access control and validation
  private getEffectiveBranchId(user: any, requestedBranchId?: string): string | undefined {
    const userRole = user.role;
    
    // SUPER_ADMIN and MAINTAINER can access any branch
    if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.MAINTAINER) {
      return requestedBranchId;
    }
    
    // ADMIN can only access their own branch
    if (userRole === UserRole.ADMIN) {
      return user.branchId?.toString();
    }

    // Default: no branch restriction (shouldn't reach here due to @Roles decorator)
    return undefined;
  }

  private validateDateRange(startDate?: Date, endDate?: Date): void {
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('Start date cannot be after end date');
    }
    if (startDate && isNaN(startDate.getTime())) {
      throw new BadRequestException('Invalid start date format');
    }
    if (endDate && isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid end date format');
    }
  }
}
