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
      (existing?.completedMissions as Record<string, unknown>) ?? {},
      dto.completedMissions,
    );

    const existingStats = (existing?.stats as { commandsRun: number; hintsUsed: number }) ?? {
      commandsRun: 0,
      hintsUsed: 0,
    };

    const mergedStats = {
      commandsRun: Math.max(existingStats.commandsRun, dto.stats.commandsRun),
      hintsUsed: Math.max(existingStats.hintsUsed, dto.stats.hintsUsed),
    };

    return this.prisma.progress.upsert({
      where: { userId },
      create: {
        userId,
        completedMissions: mergedMissions as unknown as Prisma.JsonObject,
        stats: mergedStats as unknown as Prisma.JsonObject,
      },
      update: {
        completedMissions: mergedMissions as unknown as Prisma.JsonObject,
        stats: mergedStats as unknown as Prisma.JsonObject,
      },
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
    server: Record<string, unknown>,
    client: Record<string, unknown>,
  ): Record<string, unknown> {
    // union: server thắng nếu cùng key (server là source of truth)
    return { ...client, ...server };
  }
}
