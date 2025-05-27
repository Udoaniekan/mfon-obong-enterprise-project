import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientsService } from '../services/clients.service';
import {
  CreateClientDto,
  UpdateClientDto,
  AddTransactionDto,
  QueryClientsDto,
} from '../dto/client.dto';
import { Client } from '../schemas/client.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../../common/enums';
import { Roles } from 'src/decorators/roles.decorators';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async create(@Body() createClientDto: CreateClientDto): Promise<Client> {
    return this.clientsService.create(createClientDto);
  }

  @Post('walk-in')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  async createWalkInClient(): Promise<Client> {
    return this.clientsService.createWalkInClient();
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  async findAll(@Query() query: QueryClientsDto): Promise<Client[]> {
    return this.clientsService.findAll(query);
  }

  @Get('debtors')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async findDebtors(@Query('minAmount') minAmount?: number): Promise<Client[]> {
    return this.clientsService.findDebtors(minAmount);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  async findOne(@Param('id') id: string): Promise<Client> {
    return this.clientsService.findById(id);
  }

  @Get(':id/transactions')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  async getTransactionHistory(
    @Param('id') id: string,
    @Query('startDate') startDate?: Date,
    @Query('endDate') endDate?: Date,
  ) {
    return this.clientsService.getTransactionHistory(id, startDate, endDate);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
  ): Promise<Client> {
    return this.clientsService.update(id, updateClientDto);
  }

  @Post(':id/transactions')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  async addTransaction(
    @Param('id') id: string,
    @Body() transactionDto: AddTransactionDto,
  ): Promise<Client> {
    return this.clientsService.addTransaction(id, transactionDto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async remove(@Param('id') id: string): Promise<void> {
    return this.clientsService.remove(id);
  }
}