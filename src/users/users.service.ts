import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import * as bcrypt from 'bcrypt';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';

const PROFILE_SELECT = {
  id: true,
  email: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async getMe(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        ...PROFILE_SELECT,
        progress: true,
      },
    });
  }

  async syncProgress(userId: string, dto: UpdateProgressDto) {
    const existing = await this.prisma.progress.findUnique({ where: { userId } });

    const mergedMissions = this.mergeMissions(
      (existing?.completedMissions as Record<string, { stars?: number; completedAt?: number }>) ?? {},
      dto.completedMissions,
    );

    // Recompute XP từ merged missions để tránh client gian lận
    const recomputedXP: number = Object.values(mergedMissions).reduce(
      (sum: number, m) => sum + (((m as { xpEarned?: number }).xpEarned) ?? 0),
      0,
    );

    const data = {
      completedMissions: mergedMissions as unknown as Prisma.JsonObject,
      xp: recomputedXP,
      level: Math.min(99, Math.floor(recomputedXP / 1000) + 1),
      // Streak: server wins (time-based — không tin client)
      currentStreak: existing?.currentStreak ?? dto.currentStreak ?? 0,
      lastPlayDate: existing?.lastPlayDate ?? dto.lastPlayDate ?? '',
      commandsRun: Math.max(existing?.commandsRun ?? 0, dto.commandsRun ?? 0),
      hintsUsed: Math.max(existing?.hintsUsed ?? 0, dto.hintsUsed ?? 0),
    };

    return this.prisma.progress.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { displayName: dto.displayName, bio: dto.bio },
      select: PROFILE_SELECT,
    });
  }

  async updateAvatar(userId: string, file: Express.Multer.File): Promise<unknown> {
    const url = await this.cloudinary.uploadAvatar(file, userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
      select: PROFILE_SELECT,
    });
  }

  async deleteAvatar(userId: string): Promise<unknown> {
    await this.cloudinary.deleteAvatar(userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: PROFILE_SELECT,
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Mật khẩu hiện tại không đúng');

    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    // Revoke all refresh tokens to force re-login
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { message: 'Đổi mật khẩu thành công' };
  }

  async changeEmail(userId: string, dto: ChangeEmailDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Mật khẩu không đúng');

    const existing = await this.prisma.user.findUnique({ where: { email: dto.newEmail } });
    if (existing) throw new BadRequestException('Email đã được sử dụng');

    return this.prisma.user.update({
      where: { id: userId },
      data: { email: dto.newEmail },
      select: PROFILE_SELECT,
    });
  }

  private mergeMissions(
    server: Record<string, { stars?: number; completedAt?: number }>,
    client: Record<string, { stars?: number; completedAt?: number }>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...server };
    for (const [key, clientRecord] of Object.entries(client)) {
      const serverRecord = server[key];
      if (!serverRecord) {
        result[key] = clientRecord;
      } else {
        // Giữ record có stars cao hơn; ngang thì giữ server
        const clientStars = clientRecord.stars ?? 0;
        const serverStars = serverRecord.stars ?? 0;
        result[key] = clientStars > serverStars ? clientRecord : serverRecord;
      }
    }
    return result;
  }
}
