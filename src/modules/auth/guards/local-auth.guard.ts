import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      // Create a more descriptive error message
      let message = 'Invalid email or password';
      
      if (info && info.message) {
        message = info.message;
      } else if (err && err.message) {
        message = err.message;
      }
      
      throw new UnauthorizedException({
        statusCode: 401,
        message: message,
        error: 'Unauthorized'
      });
    }
    
    return user;
  }
}
