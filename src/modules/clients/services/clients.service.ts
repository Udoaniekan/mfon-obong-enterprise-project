import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client, ClientDocument } from '../schemas/client.schema';
import {
  CreateClientDto,
  UpdateClientDto,
  AddTransactionDto,
  QueryClientsDto,
} from '../dto/client.dto';
import { UserDocument } from '../../users/schemas/user.schema';
import { UserRole } from '../../../common/enums';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}

  async create(
    createClientDto: CreateClientDto,
    currentUser?: UserDocument,
  ): Promise<Client> {
    const existingClient = await this.clientModel.findOne({
      phone: createClientDto.phone,
    });
    if (existingClient) {
      throw new ConflictException('Phone number already registered');
    }
    const client = new this.clientModel({
      ...createClientDto,
      isRegistered: true,
      transactions: [],
    });
    const savedClient = await client.save();

    // Log client creation activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'CLIENT_CREATED',
        details: `New client registered: ${savedClient.name} (${savedClient.phone})`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'STAFF',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log client creation:', logError);
    }

    return savedClient;
  }

  async findAll(
    query: QueryClientsDto,
    currentUser?: UserDocument,
  ): Promise<Client[]> {
    const filter: any = {};
    if (query.search) {
      filter.$or = [
        { name: new RegExp(query.search, 'i') },
        { phone: new RegExp(query.search, 'i') },
      ];
    }
    if (query.minBalance !== undefined) {
      filter.balance = { $gte: query.minBalance };
    }
    if (query.maxBalance !== undefined) {
      filter.balance = { ...filter.balance, $lte: query.maxBalance };
    }
    if (query.startDate || query.endDate) {
      filter.lastTransactionDate = {};
      if (query.startDate) {
        filter.lastTransactionDate.$gte = query.startDate;
      }
      if (query.endDate) {
        filter.lastTransactionDate.$lte = query.endDate;
      }
    }
    return this.clientModel
      .find(filter)
      .sort({ lastTransactionDate: -1 })
      .exec();
  }

  async findById(
    id: string,
    currentUser?: UserDocument,
  ): Promise<ClientDocument> {
    const client = await this.clientModel.findById(id);
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  async update(
    id: string,
    updateClientDto: UpdateClientDto,
    currentUser?: UserDocument,
  ): Promise<ClientDocument> {
    const client = await this.findById(id, currentUser);
    if (updateClientDto.phone) {
      const existingClient = await this.clientModel.findOne({
        phone: updateClientDto.phone,
        _id: { $ne: id },
      });
      if (existingClient) {
        throw new ConflictException('Phone number already registered');
      }
    }
    Object.assign(client, updateClientDto);
    const savedClient = await client.save();

    // Log client update activity
    try {
      const changes = Object.keys(updateClientDto).join(', ');
      await this.systemActivityLogService.createLog({
        action: 'CLIENT_UPDATED',
        details: `Client updated: ${savedClient.name} - Changes: ${changes}`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'STAFF',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log client update:', logError);
    }

    return savedClient;
  }

  async addTransaction(
    id: string,
    transactionDto: AddTransactionDto,
    currentUser?: UserDocument,
  ): Promise<ClientDocument> {
    const client = await this.findById(id, currentUser);
    const transaction = {
      ...transactionDto,
      date: transactionDto.date || new Date(),
      reference: transactionDto.reference || `TXN${Date.now()}`,
    };
    switch (transaction.type) {
      case 'DEPOSIT':
        client.balance += transaction.amount;
        break;
      case 'PURCHASE': {
        // For PURCHASE, use up any positive balance, the rest is paid in cash
        const amountFromBalance = Math.min(client.balance, transaction.amount);
        client.balance -= amountFromBalance;
        // After this, balance should never go negative for PURCHASE
        if (client.balance < 0) client.balance = 0;
        break;
      }
      case 'PICKUP':
        // PICKUP can go negative
        client.balance -= transaction.amount;
        break;
    }
    client.transactions.push(transaction);
    client.lastTransactionDate = transaction.date;
    const savedClient = await client.save();

    // Log client transaction activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'CLIENT_TRANSACTION_ADDED',
        details: `${transaction.type} transaction added for ${client.name}: ${transaction.amount} - Balance: ${client.balance}`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'STAFF',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log client transaction:', logError);
    }

    return savedClient;
  }

  async remove(id: string, currentUser?: UserDocument): Promise<void> {
    const result = await this.clientModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('Client not found');
    }

    // Log client deletion activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'CLIENT_DELETED',
        details: `Client deleted: ${result.name} (${result.phone})`,
        performedBy: currentUser?.email || 'System',
        role: currentUser?.role || 'ADMIN',
        device: 'System',
      });
    } catch (logError) {
      console.error('Failed to log client deletion:', logError);
    }
  }

  async getTransactionHistory(
    id: string,
    startDate?: Date,
    endDate?: Date,
    currentUser?: UserDocument,
  ): Promise<any> {
    const client = await this.findById(id, currentUser);
    let transactions = client.transactions;
    if (startDate || endDate) {
      transactions = transactions.filter((t) => {
        const transDate = new Date(t.date);
        if (startDate && transDate < startDate) return false;
        if (endDate && transDate > endDate) return false;
        return true;
      });
    }
    const summary = {
      totalDeposits: 0,
      totalPurchases: 0,
      totalPickups: 0,
      currentBalance: client.balance,
      transactions: transactions,
    };
    transactions.forEach((t) => {
      switch (t.type) {
        case 'DEPOSIT':
          summary.totalDeposits += t.amount;
          break;
        case 'PURCHASE':
          summary.totalPurchases += t.amount;
          break;
        case 'PICKUP':
          summary.totalPickups += t.amount;
          break;
      }
    });
    return summary;
  }

  async findDebtors(
    minAmount: number = 0,
    currentUser?: UserDocument,
  ): Promise<Client[]> {
    const filter: Record<string, any> = {
      balance: { $lt: -minAmount },
    };
    return this.clientModel.find(filter).sort({ balance: 1 }).exec();
  }

  async createWalkInClient(currentUser?: UserDocument): Promise<Client> {
    const walkInClient = new this.clientModel({
      name: 'Walk-in Customer',
      phone: `WALK-IN-${Date.now()}`,
      isRegistered: false,
      balance: 0,
    });
    return walkInClient.save();
  }

  async getLifetimeValue(
    id: string,
    currentUser?: UserDocument,
  ): Promise<{ lifetimeValue: number; totalSpent: number; currentBalance: number }> {
    const client = await this.findById(id, currentUser);
    
    let totalSpent = 0;
    client.transactions.forEach((transaction) => {
      if (transaction.type === 'PURCHASE' || transaction.type === 'PICKUP') {
        totalSpent += transaction.amount;
      }
    });

    const currentBalance = client.balance;
    const lifetimeValue = currentBalance >= 0 ? 
      totalSpent + currentBalance : 
      totalSpent - currentBalance;

    return {
      lifetimeValue,
      totalSpent,
      currentBalance,
    };
  }
}
