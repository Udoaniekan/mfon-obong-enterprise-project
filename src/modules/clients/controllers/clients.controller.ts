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
  Request,
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  async create(
    @Body() createClientDto: CreateClientDto,
    @Request() req,
  ): Promise<Client> {
    return this.clientsService.create(createClientDto, req.user);
  }

  @Post('walk-in')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async createWalkInClient(@Request() req): Promise<Client> {
    return this.clientsService.createWalkInClient(req.user);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async findAll(
    @Query() query: QueryClientsDto,
    @Request() req,
  ): Promise<Client[]> {
    return this.clientsService.findAll(query, req.user);
  }

  @Get('debtors')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  async findDebtors(
    @Request() req,
    @Query('minAmount') minAmount?: number,
  ): Promise<Client[]> {
    return this.clientsService.findDebtors(minAmount, req.user);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async findOne(@Param('id') id: string, @Request() req): Promise<Client> {
    return this.clientsService.findById(id, req.user);
  }

  @Get(':id/transactions')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async getTransactionHistory(
    @Param('id') id: string,
    @Request() req,
    @Query('startDate') startDate?: Date,
    @Query('endDate') endDate?: Date,
  ) {
    return this.clientsService.getTransactionHistory(
      id,
      startDate,
      endDate,
      req.user,
    );
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  async update(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
    @Request() req,
  ): Promise<Client> {
    return this.clientsService.update(id, updateClientDto, req.user);
  }

  @Post(':id/transactions')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async addTransaction(
    @Param('id') id: string,
    @Body() transactionDto: AddTransactionDto,
    @Request() req,
  ): Promise<Client> {
    return this.clientsService.addTransaction(id, transactionDto, req.user);
  }

  @Get(':id/lifetime-value')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAINTAINER,
    UserRole.STAFF,
  )
  async getLifetimeValue(@Param('id') id: string, @Request() req) {
    return this.clientsService.getLifetimeValue(id, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async remove(@Param('id') id: string, @Request() req): Promise<void> {
    return this.clientsService.remove(id, req.user);
  }
}
