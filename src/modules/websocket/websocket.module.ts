import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppWebSocketGateway } from './websocket.gateway';
import { RealtimeEventService } from './realtime-event.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AppWebSocketGateway, RealtimeEventService],
  exports: [AppWebSocketGateway, RealtimeEventService],
})
export class WebSocketModule {}