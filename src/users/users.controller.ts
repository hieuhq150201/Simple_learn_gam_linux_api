import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from './users.service';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateAvatarDto } from './dto/update-avatar.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
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

  @Patch('me/profile')
  @ApiOperation({ summary: 'Cập nhật displayName và bio' })
  updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    const user = req.user as { id: string };
    return this.users.updateProfile(user.id, dto);
  }

  @Patch('me/avatar')
  @ApiOperation({ summary: 'Upload avatar (base64 JPEG, max 200KB)' })
  updateAvatar(@Req() req: Request, @Body() dto: UpdateAvatarDto) {
    const user = req.user as { id: string };
    return this.users.updateAvatar(user.id, dto);
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Xóa avatar' })
  deleteAvatar(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.users.deleteAvatar(user.id);
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Đổi mật khẩu (yêu cầu mật khẩu hiện tại)' })
  changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    const user = req.user as { id: string };
    return this.users.changePassword(user.id, dto);
  }

  @Patch('me/email')
  @ApiOperation({ summary: 'Đổi email (yêu cầu mật khẩu hiện tại)' })
  changeEmail(@Req() req: Request, @Body() dto: ChangeEmailDto) {
    const user = req.user as { id: string };
    return this.users.changeEmail(user.id, dto);
  }
}
