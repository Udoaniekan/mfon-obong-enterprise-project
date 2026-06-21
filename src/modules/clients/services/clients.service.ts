import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateClientDto,
  UpdateClientDto,
  AddTransactionDto,
  QueryClientsDto,
} from '../dto/client.dto';
import { UserRole } from '../../../common/enums';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { RealtimeEventService } from '../../websocket/realtime-event.service';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemActivityLogService: SystemActivityLogService,
    private readonly realtimeEventService: RealtimeEventService,
  ) {}

  private toDoc(client: any) {
    if (!client) return client;
    return { ...client, _id: client.id };
  }

  async create(
    createClientDto: CreateClientDto,
    currentUser?: any,
    device?: string,
  ): Promise<any> {
    const existing = await this.prisma.client.findUnique({
      where: { phone: createClientDto.phone },
    });
    if (existing) throw new ConflictException('Phone number already registered');

    const client = await this.prisma.client.create({
      data: {
        name: createClientDto.name,
        phone: createClientDto.phone,
        email: createClientDto.email,
        description: createClientDto.description,
        address: createClientDto.address,
        balance: createClientDto.balance ?? 0,
        isRegistered: true,
      },
    });

    this.systemActivityLogService.createLog({
      action: 'CLIENT_CREATED',
      details: `New client registered: ${client.name} (${client.phone})`,
      performedBy: currentUser?.email || currentUser?.name || 'System',
      role: currentUser?.role || 'SYSTEM',
      device: device || 'System',
      branchId: currentUser?.branchId?.toString(),
    }).catch(() => {});

    try {
      if (currentUser) {
        const eventData = this.realtimeEventService.createEventData(
          'created', 'client', client.id, client,
          { id: currentUser._id?.toString() || '', email: currentUser.email, role: currentUser.role, branchId: currentUser.branchId?.toString(), branch: currentUser.branch },
        );
        this.realtimeEventService.emitClientCreated(eventData);
      }
    } catch {}

    return this.toDoc(client);
  }

  async findAll(query: QueryClientsDto, currentUser?: any): Promise<any[]> {
    const where: any = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.minBalance !== undefined) where.balance = { gte: query.minBalance };
    if (query.maxBalance !== undefined) {
      where.balance = { ...where.balance, lte: query.maxBalance };
    }
    if (query.startDate || query.endDate) {
      where.lastTransactionDate = {};
      if (query.startDate) where.lastTransactionDate.gte = query.startDate;
      if (query.endDate) where.lastTransactionDate.lte = query.endDate;
    }

    const clients = await this.prisma.client.findMany({
      where,
      orderBy: { lastTransactionDate: 'desc' },
    });

    return clients.map(c => this.toDoc(c));
  }

  async findAllActive(query: QueryClientsDto, currentUser?: any): Promise<any[]> {
    const where: any = { isActive: true };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.minBalance !== undefined) where.balance = { gte: query.minBalance };
    if (query.maxBalance !== undefined) {
      where.balance = { ...where.balance, lte: query.maxBalance };
    }
    if (query.startDate || query.endDate) {
      where.lastTransactionDate = {};
      if (query.startDate) where.lastTransactionDate.gte = query.startDate;
      if (query.endDate) where.lastTransactionDate.lte = query.endDate;
    }

    const clients = await this.prisma.client.findMany({
      where,
      orderBy: { lastTransactionDate: 'desc' },
    });

    return clients.map(c => this.toDoc(c));
  }

  async findById(id: string, currentUser?: any): Promise<any> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Client not found');
    return this.toDoc(client);
  }

  async update(
    id: string,
    updateClientDto: UpdateClientDto,
    currentUser?: any,
    device?: string,
  ): Promise<any> {
    await this.findById(id, currentUser);

    if (updateClientDto.phone) {
      const existing = await this.prisma.client.findFirst({
        where: { phone: updateClientDto.phone, NOT: { id } },
      });
      if (existing) throw new ConflictException('Phone number already registered');
    }

    const client = await this.prisma.client.update({
      where: { id },
      data: updateClientDto,
    });

    const changes = Object.keys(updateClientDto).join(', ');
    this.systemActivityLogService.createLog({
      action: 'CLIENT_UPDATED',
      details: `Client updated: ${client.name} - Changes: ${changes}`,
      performedBy: currentUser?.email || currentUser?.name || 'System',
      role: currentUser?.role || 'SYSTEM',
      device: device || 'System',
      branchId: currentUser?.branchId?.toString(),
    }).catch(() => {});

    try {
      if (currentUser) {
        const eventData = this.realtimeEventService.createEventData(
          'updated', 'client', client.id, client,
          { id: currentUser._id?.toString() || '', email: currentUser.email, role: currentUser.role, branchId: currentUser.branchId?.toString(), branch: currentUser.branch },
        );
        this.realtimeEventService.emitClientUpdated(eventData);
      }
    } catch {}

    return this.toDoc(client);
  }

  async addTransaction(
    id: string,
    transactionDto: AddTransactionDto,
    currentUser?: any,
    device?: string,
  ): Promise<any> {
    const client = await this.findById(id, currentUser);
    const date = transactionDto.date || new Date();

    let newBalance = client.balance;
    switch (transactionDto.type) {
      case 'DEPOSIT':
        newBalance += transactionDto.amount;
        break;
      case 'PURCHASE':
      case 'PICKUP':
      case 'WHOLESALE':
        newBalance -= transactionDto.amount;
        break;
      case 'RETURN':
        newBalance += transactionDto.amount;
        break;
    }

    const updated = await this.prisma.client.update({
      where: { id },
      data: { balance: newBalance, lastTransactionDate: date },
    });

    this.systemActivityLogService.createLog({
      action: 'CLIENT_TRANSACTION_ADDED',
      details: `${transactionDto.type} transaction added for ${client.name}: ${transactionDto.amount} - Balance: ${newBalance}`,
      performedBy: currentUser?.email || currentUser?.name || 'System',
      role: currentUser?.role || 'SYSTEM',
      device: device || 'System',
      branchId: currentUser?.branchId?.toString(),
    }).catch(() => {});

    return this.toDoc(updated);
  }

  async remove(id: string, currentUser?: any, device?: string): Promise<void> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Client not found');

    await this.prisma.client.update({ where: { id }, data: { isActive: false } });

    this.systemActivityLogService.createLog({
      action: 'CLIENT_DELETED',
      details: `Client deleted: ${client.name} (${client.phone})`,
      performedBy: currentUser?.email || currentUser?.name || 'System',
      role: currentUser?.role || 'SYSTEM',
      device: device || 'System',
      branchId: currentUser?.branchId?.toString(),
    }).catch(() => {});

    try {
      if (currentUser) {
        const eventData = this.realtimeEventService.createEventData(
          'deleted', 'client', id, client,
          { id: currentUser._id?.toString() || '', email: currentUser.email, role: currentUser.role, branchId: currentUser.branchId?.toString(), branch: currentUser.branch },
        );
        this.realtimeEventService.emitClientDeleted(eventData);
      }
    } catch {}
  }

  async getTransactionHistory(
    id: string,
    startDate?: Date,
    endDate?: Date,
    currentUser?: any,
  ): Promise<any> {
    const client = await this.findById(id, currentUser);

    const where: any = { clientId: id };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      include: {
        items: true,
        extraCharges: true,
        userRef: { select: { id: true, name: true, role: true } },
      },
      orderBy: { date: 'desc' },
    });

    let totalDeposits = 0;
    let totalPurchases = 0;

    transactions.forEach(t => {
      if (t.type === 'DEPOSIT') totalDeposits += t.total;
      if (t.type === 'PURCHASE') totalPurchases += t.total;
    });

    return {
      totalDeposits,
      totalPurchases,
      currentBalance: client.balance,
      transactions: transactions.map(t => this.transformTransaction(t)),
    };
  }

  private transformTransaction(t: any) {
    const { userRef, clientRef, branchRef, ...rest } = t;
    return {
      ...rest,
      _id: t.id,
      userId: userRef ? { _id: userRef.id, ...userRef } : t.userId,
      clientId: clientRef ? { _id: clientRef.id, ...clientRef } : t.clientId,
      walkInClient: t.walkInClientName
        ? { name: t.walkInClientName, phone: t.walkInClientPhone, address: t.walkInClientAddress }
        : undefined,
    };
  }

  async findDebtors(minAmount = 0, currentUser?: any): Promise<any[]> {
    const clients = await this.prisma.client.findMany();
    return clients
      .filter(c => {
        const balance = Number(c.balance);
        return !isNaN(balance) && balance < 0 && Math.abs(balance) >= minAmount;
      })
      .sort((a, b) => Number(a.balance) - Number(b.balance))
      .map(c => this.toDoc(c));
  }

  async createWalkInClient(currentUser?: any): Promise<any> {
    const client = await this.prisma.client.create({
      data: {
        name: 'Walk-in Customer',
        phone: `WALK-IN-${Date.now()}`,
        isRegistered: false,
        balance: 0,
      },
    });
    return this.toDoc(client);
  }

  async getLifetimeValue(
    id: string,
    currentUser?: any,
  ): Promise<{ lifetimeValue: number; totalSpent: number; currentBalance: number }> {
    const client = await this.findById(id, currentUser);

    const transactions = await this.prisma.transaction.findMany({
      where: { clientId: id, type: 'PURCHASE' },
    });

    const totalSpent = transactions.reduce((sum, t) => sum + t.total, 0);
    const currentBalance = client.balance;
    const lifetimeValue = currentBalance >= 0
      ? totalSpent + currentBalance
      : totalSpent - currentBalance;

    return { lifetimeValue, totalSpent, currentBalance };
  }

  async blockClient(id: string, currentUser?: any, device?: string): Promise<any> {
    const client = await this.findById(id, currentUser);
    if (!client.isActive) throw new BadRequestException('Client is already blocked');

    const updated = await this.prisma.client.update({
      where: { id },
      data: { isActive: false },
    });

    this.systemActivityLogService.createLog({
      action: 'CLIENT_BLOCKED',
      details: `Client blocked: ${updated.name} (${updated.phone})`,
      performedBy: currentUser?.email || currentUser?.name || 'System',
      role: currentUser?.role || 'SYSTEM',
      device: device || 'System',
      branchId: currentUser?.branchId?.toString(),
    }).catch(() => {});

    return this.toDoc(updated);
  }

  async unblockClient(id: string, currentUser?: any, device?: string): Promise<any> {
    const client = await this.findById(id, currentUser);
    if (client.isActive) throw new BadRequestException('Client is already active');

    const updated = await this.prisma.client.update({
      where: { id },
      data: { isActive: true },
    });

    this.systemActivityLogService.createLog({
      action: 'CLIENT_UNBLOCKED',
      details: `Client unblocked: ${updated.name} (${updated.phone})`,
      performedBy: currentUser?.email || currentUser?.name || 'System',
      role: currentUser?.role || 'SYSTEM',
      device: device || 'System',
      branchId: currentUser?.branchId?.toString(),
    }).catch(() => {});

    return this.toDoc(updated);
  }
}
