import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAvatarDto {
  @ApiProperty({ description: 'base64 JPEG string, max 200KB decoded' })
  @IsString()
  @MaxLength(280_000) // 200KB * 1.37 base64 overhead
  avatarBase64!: string;
}
