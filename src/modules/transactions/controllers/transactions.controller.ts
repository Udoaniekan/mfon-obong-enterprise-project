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
} from '@nestjs/common';
import { TransactionsService } from '../services/transactions.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  QueryTransactionsDto,
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  async create(
    @Body() createTransactionDto: CreateTransactionDto,
    @Request() req,
  ): Promise<Transaction> {
    return this.transactionsService.create(createTransactionDto, req.user.userId);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  async findAll(@Query() query: QueryTransactionsDto): Promise<Transaction[]> {
    return this.transactionsService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  async findOne(@Param('id') id: string): Promise<Transaction> {
    return this.transactionsService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  async update(
    @Param('id') id: string,
    @Body() updateTransactionDto: UpdateTransactionDto,
  ): Promise<Transaction> {
    return this.transactionsService.update(id, updateTransactionDto);
  }

  @Get('reports/sales')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getSalesReport(
    @Query('startDate') startDate: Date,
    @Query('endDate') endDate: Date,
  ) {
    return this.transactionsService.generateReport(startDate, endDate);
  }
}
