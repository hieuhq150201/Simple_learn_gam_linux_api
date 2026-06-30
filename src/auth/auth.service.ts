import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Response } from 'express';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto, res: Response) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash },
      select: { id: true, email: true },
    });

    await this.issueTokens(user, res);
    return user;
  }

  async login(dto: LoginDto, res: Response) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // message đồng nhất — không phân biệt "user không tồn tại" vs "sai password"
    const valid = user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.issueTokens({ id: user.id, email: user.email }, res);
    return { id: user.id, email: user.email };
  }

  async refresh(userId: string, rawRefreshToken: string, res: Response) {
    const tokenHash = await bcrypt.hash(rawRefreshToken, BCRYPT_ROUNDS);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
    });
    if (!stored || !(await bcrypt.compare(rawRefreshToken, stored.tokenHash))) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true },
    });

    // rotate: xóa token cũ, issue mới
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    await this.issueTokens(user, res);
    return user;
  }

  async logout(userId: string, rawRefreshToken: string, res: Response) {
    const tokens = await this.prisma.refreshToken.findMany({ where: { userId } });
    for (const t of tokens) {
      if (await bcrypt.compare(rawRefreshToken, t.tokenHash)) {
        await this.prisma.refreshToken.delete({ where: { id: t.id } });
        break;
      }
    }
    this.clearCookies(res);
  }

  private async issueTokens(user: { id: string; email: string }, res: Response) {
    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'),
    });

    const tokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const cookieOpts = {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: (this.config.get('NODE_ENV') === 'production' ? 'none' : 'lax') as 'none' | 'lax',
    };

    res.cookie('access_token', accessToken, { ...cookieOpts, maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { ...cookieOpts, maxAge: 30 * 24 * 60 * 60 * 1000 });
  }

  private clearCookies(res: Response) {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
  }
}
