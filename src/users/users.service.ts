import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProgressDto } from './dto/update-progress.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
        progress: true,
      },
    });
    return user;
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
      create: { userId, completedMissions: mergedMissions, stats: mergedStats },
      update: { completedMissions: mergedMissions, stats: mergedStats },
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
