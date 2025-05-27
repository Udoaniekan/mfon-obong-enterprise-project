import { Controller, Post, Request, UseGuards} from "@nestjs/common";
import { AuthService } from "../services/auth.service";
import { AuthGuard } from "@nestjs/passport";

@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

@UseGuards(AuthGuard('local'))
@Post('/login')
async login(@Request() req) {
    console.log('Login request user:', req.user);
    const result = await this.authService.login(req.user);
    console.log('Login response:', result);
    return result;
  }
}