import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../../common/enums';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userRole?: UserRole;
  branchId?: string;
  branch?: string;
}

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://your-frontend-domain.com',
      'https://mfon-obong-enterprises.pipeops.net',
      'https://frontend-tawny-pi-78.vercel.app',
      'https://frontend-kkue8if0i-james-ndopnnoabasis-projects.vercel.app',
    ],
    credentials: true,
  },
})
export class AppWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AppWebSocketGateway.name);

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Try to get token from multiple sources: auth field, authorization header, or cookies
      let token = client.handshake.auth?.token || 
                  client.handshake.headers?.authorization?.replace('Bearer ', '');
      
      // If no token in auth/headers, try to get from cookies
      if (!token && client.handshake.headers?.cookie) {
        const cookies = client.handshake.headers.cookie
          .split(';')
          .reduce((acc, cookie) => {
            const [name, value] = cookie.trim().split('=');
            acc[name] = value;
            return acc;
          }, {} as Record<string, string>);
        
        // Try accessToken first, then refreshToken as fallback
        token = cookies.accessToken || cookies.refreshToken;
      }
      
      if (!token) {
        // Try to get user info from query params as fallback (for debugging)
        const queryToken = client.handshake.query?.token;
        if (queryToken && typeof queryToken === 'string') {
          token = queryToken;
        } else {
          this.logger.warn(`Client ${client.id} disconnected: No token provided`);
          client.emit('auth_error', { message: 'Authentication required' });
          client.disconnect();
          return;
        }
      }

      const decoded = this.jwtService.verify(token);
      client.userId = decoded.sub; // JWT uses 'sub' field, not 'userId'
      client.userEmail = decoded.email;
      client.userRole = decoded.role;
      client.branchId = decoded.branchId;
      client.branch = decoded.branch;

      // Join user to appropriate rooms based on role hierarchy
      await this.joinRooms(client);

      this.logger.log(
        `Client connected: ${client.userEmail} (${client.userRole}) - Socket ID: ${client.id}`,
      );
    } catch (error) {
      this.logger.error(`Authentication failed for client ${client.id}:`, error.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(
      `Client disconnected: ${client.userEmail} (${client.userRole}) - Socket ID: ${client.id}`,
    );
  }

  private async joinRooms(client: AuthenticatedSocket) {
    const { userRole, branchId, userId } = client;

    // Every user joins their personal room
    await client.join(`user_${userId}`);

    switch (userRole) {
      case UserRole.STAFF:
        // STAFF joins their branch room and staff-specific room
        await client.join(`branch_${branchId}`);
        await client.join(`staff_${branchId}`);
        break;

      case UserRole.ADMIN:
        // ADMIN joins their branch room, admin-specific room, and can see all staff in their branch
        await client.join(`branch_${branchId}`);
        await client.join(`admin_${branchId}`);
        await client.join(`staff_${branchId}`); // Can see staff activities
        break;

      case UserRole.SUPER_ADMIN:
        // SUPER_ADMIN can see everything across all branches
        await client.join('super_admin');
        await client.join('all_branches');
        await client.join('all_admins');
        await client.join('all_staff');
        break;

      case UserRole.MAINTAINER:
        // MAINTAINER can see special actions and system-wide activities
        await client.join('maintainer');
        await client.join('special_actions');
        await client.join('all_branches');
        break;
    }

    this.logger.log(`User ${client.userEmail} joined appropriate rooms`);
  }

  // Method to emit real-time updates to appropriate rooms
  emitToHierarchy(event: string, data: any, actorRole: UserRole, branchId?: string) {
    const rooms: string[] = [];

    switch (actorRole) {
      case UserRole.STAFF:
        // STAFF actions are seen by:
        // 1. The actor themselves (their personal room)
        if (data.actorId) {
          rooms.push(`user_${data.actorId}`);
        }
        // 2. All STAFF in the same branch (for peer visibility)
        if (branchId) {
          rooms.push(`staff_${branchId}`);
          // 3. Their branch ADMIN
          rooms.push(`admin_${branchId}`);
          // 4. Branch-wide visibility
          rooms.push(`branch_${branchId}`);
        }
        // 5. SUPER_ADMIN (can see everything)
        rooms.push('super_admin');
        break;

      case UserRole.ADMIN:
        // ADMIN actions are seen by:
        // 1. The actor themselves
        if (data.actorId) {
          rooms.push(`user_${data.actorId}`);
        }
        // 2. All in their branch (ADMIN and STAFF)
        if (branchId) {
          rooms.push(`branch_${branchId}`);
          rooms.push(`admin_${branchId}`);
          rooms.push(`staff_${branchId}`);
        }
        // 3. SUPER_ADMIN
        rooms.push('super_admin');
        // 4. MAINTAINER for special actions
        if (this.isSpecialAction(event)) {
          rooms.push('maintainer');
        }
        break;

      case UserRole.SUPER_ADMIN:
        // SUPER_ADMIN actions are seen by:
        // 1. The actor themselves
        if (data.actorId) {
          rooms.push(`user_${data.actorId}`);
        }
        // 2. All SUPER_ADMINs
        rooms.push('super_admin');
        // 3. All branches (global visibility)
        rooms.push('all_branches');
        rooms.push('all_admins');
        rooms.push('all_staff');
        // 4. MAINTAINER for special actions
        if (this.isSpecialAction(event)) {
          rooms.push('maintainer');
        }
        break;

      case UserRole.MAINTAINER:
        // MAINTAINER actions are seen by:
        // 1. The actor themselves
        if (data.actorId) {
          rooms.push(`user_${data.actorId}`);
        }
        // 2. All MAINTAINERs
        rooms.push('maintainer');
        // 3. SUPER_ADMIN
        rooms.push('super_admin');
        break;
    }

    // Remove duplicates
    const uniqueRooms = [...new Set(rooms)];

    // Emit to all relevant rooms
    uniqueRooms.forEach(room => {
      this.server.to(room).emit(event, {
        ...data,
        timestamp: new Date(),
        actorRole,
        branchId,
      });
    });

    this.logger.log(`Emitted ${event} to rooms: ${uniqueRooms.join(', ')}`);
  }

  private isSpecialAction(event: string): boolean {
    const specialActions = [
      'user_created',
      'user_updated',
      'user_deleted',
      'branch_created',
      'branch_updated',
      'system_config_changed',
    ];
    return specialActions.includes(event);
  }

  // Public method for services to emit events
  emitUpdate(event: string, data: any, actorRole: UserRole, branchId?: string) {
    this.emitToHierarchy(event, data, actorRole, branchId);
  }

  @SubscribeMessage('ping')
  handlePing(@MessageBody() data: any, @ConnectedSocket() client: AuthenticatedSocket) {
    return { event: 'pong', data: 'Connection is alive' };
  }
}