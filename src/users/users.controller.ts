import { Controller, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from './users.service';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Lấy profile + progress của user hiện tại' })
  getMe(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.users.getMe(user.id);
  }

  @Patch('me/progress')
  @ApiOperation({ summary: 'Sync progress lên server (merge logic)' })
  syncProgress(@Req() req: Request, @Body() dto: UpdateProgressDto) {
    const user = req.user as { id: string };
    return this.users.syncProgress(user.id, dto);
  }
}
