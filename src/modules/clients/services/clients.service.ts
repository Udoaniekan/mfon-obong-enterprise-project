import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Client, ClientDocument } from '../schemas/client.schema';
import {
  CreateClientDto,
  UpdateClientDto,
  AddTransactionDto,
  QueryClientsDto,
} from '../dto/client.dto';
import { UserDocument } from '../../users/schemas/user.schema';
import { UserRole } from '../../../common/enums';

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
  ) {}

  async create(createClientDto: CreateClientDto, currentUser?: UserDocument): Promise<Client> {
    // Use current user's branchId if not provided by SUPER_ADMIN or MAINTAINER
    let branchId = createClientDto.branchId;
    if (!branchId || (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role))) {
      branchId = currentUser?.branchId?.toString();
    }

    const existingClient = await this.clientModel.findOne({
      phone: createClientDto.phone,
      branchId: new Types.ObjectId(branchId),
    });
    if (existingClient) {
      throw new ConflictException('Phone number already registered in this branch');
    }

    const client = new this.clientModel({
      ...createClientDto,
      branchId: new Types.ObjectId(branchId),
      isRegistered: true,
      transactions: [],
    });

    return client.save();
  }

  async findAll(query: QueryClientsDto, currentUser?: UserDocument): Promise<Client[]> {
    const filter: any = {};

    // Only SUPER_ADMIN and MAINTAINER can see all clients
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

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

    return this.clientModel.find(filter).populate('branchId', 'name').sort({ lastTransactionDate: -1 }).exec();
  }

  async findById(id: string, currentUser?: UserDocument): Promise<ClientDocument> {
    let filter: any = { _id: id };
    
    // Only SUPER_ADMIN and MAINTAINER can access clients from other branches
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    const client = await this.clientModel.findOne(filter).populate('branchId', 'name');
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  async update(id: string, updateClientDto: UpdateClientDto, currentUser?: UserDocument): Promise<ClientDocument> {
    const client = await this.findById(id, currentUser);

    if (updateClientDto.phone) {
      const existingClient = await this.clientModel.findOne({
        phone: updateClientDto.phone,
        _id: { $ne: id },
        branchId: client.branchId,
      });
      if (existingClient) {
        throw new ConflictException('Phone number already registered in this branch');
      }
    }

    // Handle branchId update for SUPER_ADMIN and MAINTAINER only
    if (updateClientDto.branchId) {
      if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
        delete updateClientDto.branchId; // Remove branchId if user doesn't have permission
      } else {
        updateClientDto.branchId = new Types.ObjectId(updateClientDto.branchId) as any;
      }
    }

    Object.assign(client, updateClientDto);
    return await client.save();
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

    return await client.save();
  }

  async remove(id: string, currentUser?: UserDocument): Promise<void> {
    let filter: any = { _id: id };
    
    // Only SUPER_ADMIN and MAINTAINER can delete clients from other branches
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    const result = await this.clientModel.findOneAndDelete(filter);
    if (!result) {
      throw new NotFoundException('Client not found');
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

  async findDebtors(minAmount: number = 0, currentUser?: UserDocument): Promise<Client[]> {
    const filter: any = {
      balance: { $lt: -minAmount },
    };

    // Only SUPER_ADMIN and MAINTAINER can see all debtors
    if (currentUser && ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)) {
      filter.branchId = currentUser.branchId;
    }

    return this.clientModel
      .find(filter)
      .populate('branchId', 'name')
      .sort({ balance: 1 })
      .exec();
  }

  async createWalkInClient(currentUser?: UserDocument): Promise<Client> {
    const walkInClient = new this.clientModel({
      name: 'Walk-in Customer',
      phone: `WALK-IN-${Date.now()}`,
      isRegistered: false,
      balance: 0,
      branchId: currentUser?.branchId,
    });

    return walkInClient.save();
  }
}