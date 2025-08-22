import { Injectable, Logger } from '@nestjs/common';
import { AppWebSocketGateway } from './websocket.gateway';
import { UserRole } from '../../common/enums';

export interface RealtimeEventData {
  action: string;
  resourceType: 'product' | 'client' | 'user' | 'transaction' | 'category' | 'branch';
  resourceId: string;
  data: any;
  actorId: string;
  actorEmail: string;
  actorRole: UserRole;
  branchId?: string;
  branch?: string;
}

@Injectable()
export class RealtimeEventService {
  private readonly logger = new Logger(RealtimeEventService.name);

  constructor(private readonly websocketGateway: AppWebSocketGateway) {}

  // Product events
  emitProductCreated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('product_created', data, data.actorRole, data.branchId);
  }

  emitProductUpdated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('product_updated', data, data.actorRole, data.branchId);
  }

  emitProductDeleted(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('product_deleted', data, data.actorRole, data.branchId);
  }

  // Client events
  emitClientCreated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('client_created', data, data.actorRole, data.branchId);
  }

  emitClientUpdated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('client_updated', data, data.actorRole, data.branchId);
  }

  emitClientDeleted(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('client_deleted', data, data.actorRole, data.branchId);
  }

  emitClientBalanceUpdated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('client_balance_updated', data, data.actorRole, data.branchId);
  }

  // User events
  emitUserCreated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('user_created', data, data.actorRole, data.branchId);
  }

  emitUserUpdated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('user_updated', data, data.actorRole, data.branchId);
  }

  emitUserDeleted(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('user_deleted', data, data.actorRole, data.branchId);
  }

  emitUserBlocked(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('user_blocked', data, data.actorRole, data.branchId);
  }

  emitUserUnblocked(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('user_unblocked', data, data.actorRole, data.branchId);
  }

  // Transaction events (Sales)
  emitTransactionCreated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('transaction_created', data, data.actorRole, data.branchId);
  }

  emitTransactionUpdated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('transaction_updated', data, data.actorRole, data.branchId);
  }

  emitTransactionStatusChanged(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('transaction_status_changed', data, data.actorRole, data.branchId);
  }

  emitSaleCompleted(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('sale_completed', data, data.actorRole, data.branchId);
  }

  // Category events
  emitCategoryCreated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('category_created', data, data.actorRole, data.branchId);
  }

  emitCategoryUpdated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('category_updated', data, data.actorRole, data.branchId);
  }

  emitCategoryDeleted(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('category_deleted', data, data.actorRole, data.branchId);
  }

  // Branch events
  emitBranchCreated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('branch_created', data, data.actorRole, data.branchId);
  }

  emitBranchUpdated(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('branch_updated', data, data.actorRole, data.branchId);
  }

  emitBranchDeleted(data: RealtimeEventData) {
    this.websocketGateway.emitUpdate('branch_deleted', data, data.actorRole, data.branchId);
  }

  // Generic method for custom events
  emitCustomEvent(eventName: string, data: RealtimeEventData) {
    this.websocketGateway.emitUpdate(eventName, data, data.actorRole, data.branchId);
  }

  // Utility method to create event data
  createEventData(
    action: string,
    resourceType: RealtimeEventData['resourceType'],
    resourceId: string,
    data: any,
    actor: { id: string; email: string; role: UserRole; branchId?: string; branch?: string }
  ): RealtimeEventData {
    return {
      action,
      resourceType,
      resourceId,
      data,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      branchId: actor.branchId,
      branch: actor.branch,
    };
  }
}