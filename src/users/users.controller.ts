import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from './users.service';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload avatar (multipart/form-data, field: file, max 5MB)' })
  updateAvatar(@Req() req: Request, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('Only JPEG/PNG/WebP/GIF allowed');
    const user = req.user as { id: string };
    return this.users.updateAvatar(user.id, file);
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
