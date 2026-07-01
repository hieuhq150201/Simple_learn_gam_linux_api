import { IsObject, IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProgressDto {
  @ApiProperty({
    description: 'Map mission đã hoàn thành',
    example: { '1-1': { completedAt: 1234567890, usedHint: false, stars: 3, xpEarned: 180 } },
  })
  @IsObject()
  completedMissions!: Record<string, { completedAt: number; usedHint: boolean; stars?: number; xpEarned?: number }>;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) xp?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) level?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) currentStreak?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() lastPlayDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) commandsRun?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) hintsUsed?: number;
}
