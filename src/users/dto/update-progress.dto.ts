import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProgressDto {
  @ApiProperty({
    description: 'Map của mission đã hoàn thành',
    example: { '1-1': { completedAt: 1234567890, usedHint: false } },
  })
  @IsObject()
  completedMissions!: Record<string, { completedAt: number; usedHint: boolean }>;

  @ApiProperty({
    description: 'Stats tổng hợp',
    example: { commandsRun: 42, hintsUsed: 3 },
  })
  @IsObject()
  stats!: { commandsRun: number; hintsUsed: number };
}
