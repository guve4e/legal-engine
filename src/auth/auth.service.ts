import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from './auth-user.entity';
import { CreateAuthUserDto } from '../shared/dto/create-auth-user.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AuthUser)
    private readonly userRepo: Repository<AuthUser>,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<Omit<AuthUser, 'password'>> {
    const user = await this.userRepo.findOne({
      where: { username },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // strip password before returning
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user;
    return result;
  }

  async login(user: Omit<AuthUser, 'password'>) {
    const payload = {
      username: user.username,
      sub: user.id,      // or user.userId if you prefer
      role: user.role,
    };

    const access_token = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refresh_token = this.jwtService.sign(payload, { expiresIn: '7d' });

    const hashedRefreshToken = await bcrypt.hash(refresh_token, 10);

    await this.userRepo.update(
      { id: user.id },
      { refreshToken: hashedRefreshToken },
    );

    return { access_token, refresh_token };
  }

  async register(registerDto: CreateAuthUserDto): Promise<void> {
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = this.userRepo.create({
      username: registerDto.username,
      password: hashedPassword,
      role: registerDto.role,
    });

    await this.userRepo.save(user);
  }

  async refreshToken(providedRefreshToken: string) {
    try {
      const decoded = this.jwtService.verify(providedRefreshToken);

      const user = await this.userRepo.findOne({
        where: { id: decoded.sub }, // or { userId: decoded.sub }
      });

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isTokenValid = await bcrypt.compare(
        providedRefreshToken,
        user.refreshToken,
      );

      if (!isTokenValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newAccessToken = this.jwtService.sign(
        {
          username: user.username,
          sub: user.id,
          role: user.role,
        },
        { expiresIn: '15m' },
      );

      return { access_token: newAccessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async delete(userId: string): Promise<{ message: string }> {
    const result = await this.userRepo.delete({ id: userId });

    if (!result.affected) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return { message: `User with ID ${userId} deleted successfully` };
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.userRepo.update(
      { id: userId },
      { refreshToken: null },
    );
    return { message: 'Logged out successfully' };
  }
}
