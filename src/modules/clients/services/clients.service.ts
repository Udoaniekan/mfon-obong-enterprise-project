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

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
  ) {}

  async create(createClientDto: CreateClientDto): Promise<Client> {
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

    return client.save();
  }

  async findAll(query: QueryClientsDto): Promise<Client[]> {
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

    return this.clientModel.find(filter).sort({ lastTransactionDate: -1 }).exec();
  }

  async findById(id: string): Promise<Client> {
    const client = await this.clientModel.findById(id);
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  async update(id: string, updateClientDto: UpdateClientDto): Promise<Client> {
    if (updateClientDto.phone) {
      const existingClient = await this.clientModel.findOne({
        phone: updateClientDto.phone,
        _id: { $ne: id },
      });
      if (existingClient) {
        throw new ConflictException('Phone number already registered');
      }
    }

    const client = await this.clientModel.findByIdAndUpdate(
      id,
      updateClientDto,
      { new: true },
    );

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  async addTransaction(
    id: string,
    transactionDto: AddTransactionDto,
  ): Promise<Client> {
    const client = await this.clientModel.findById(id);
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const transaction = {
      ...transactionDto,
      date: transactionDto.date || new Date(),
      reference: transactionDto.reference || `TXN${Date.now()}`,
    };

    // Update client balance based on transaction type
    switch (transaction.type) {
      case 'DEPOSIT':
        client.balance += transaction.amount;
        break;
      case 'PURCHASE':
      case 'PICKUP':
        if (client.balance - transaction.amount < -100000) { // Configurable credit limit
          throw new BadRequestException('Insufficient balance/credit limit exceeded');
        }
        client.balance -= transaction.amount;
        break;
    }

    client.transactions.push(transaction);
    client.lastTransactionDate = transaction.date;

    return client.save();
  }

  async remove(id: string): Promise<void> {
    const result = await this.clientModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('Client not found');
    }
  }

  async getTransactionHistory(
    id: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    const client = await this.clientModel.findById(id);
    if (!client) {
      throw new NotFoundException('Client not found');
    }

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

  async findDebtors(minAmount: number = 0): Promise<Client[]> {
    return this.clientModel
      .find({
        balance: { $lt: -minAmount },
      })
      .sort({ balance: 1 })
      .exec();
  }

  async createWalkInClient(): Promise<Client> {
    const walkInClient = new this.clientModel({
      name: 'Walk-in Customer',
      phone: `WALK-IN-${Date.now()}`,
      isRegistered: false,
      balance: 0,
    });

    return walkInClient.save();
  }
}