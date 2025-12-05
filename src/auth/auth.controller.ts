import {
  Controller,
  Post,
  Body,
  Inject,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { LoggerService } from '../shared/types';
import { CreateAuthUserDto } from '../shared/dto/create-auth-user.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject('LOGGER_SERVICE') private readonly logger: LoggerService,
  ) {}

  @Post('register')
  async register(@Body() dto: CreateAuthUserDto) {
    await this.authService.register(dto);
    await this.logger.log(`Registered user username:${dto.username}`);
    return { message: 'User registered' };
  }

  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    const user = await this.authService.validateUser(
      body.username,
      body.password,
    );
    await this.logger.log(`User login username:${body.username}`);
    return this.authService.login(user);
  }

  @Post('refresh')
  async refresh(@Body() body: { refresh_token: string }) {
    return this.authService.refreshToken(body.refresh_token);
  }

  @Post('logout')
  async logout(@Request() req) {
    // note: this will only work once we add a JWT guard that sets req.user
    return this.authService.logout(req.user.sub);
  }
}
