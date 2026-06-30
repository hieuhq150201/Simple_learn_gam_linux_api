import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.get<string>('MAIL_USER'),
        pass: config.get<string>('MAIL_PASS'),
      },
    });
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const from = this.config.get<string>('MAIL_FROM');
    await this.transporter.sendMail({
      from,
      to,
      subject: '[Hacker Path] Đặt lại mật khẩu',
      html: `
        <div style="font-family:monospace;background:#0a0a0a;color:#4ade80;padding:32px;border-radius:8px;">
          <h2 style="color:#4ade80;">[HACKER PATH]</h2>
          <p>Mày vừa yêu cầu đặt lại mật khẩu cho tài khoản Hacker Path.</p>
          <p>Link này hết hạn sau <strong>1 giờ</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#4ade80;color:#0a0a0a;padding:12px 24px;text-decoration:none;font-weight:bold;border-radius:4px;margin:16px 0;">ĐẶT LẠI MẬT KHẨU</a>
          <p style="color:#6b7280;font-size:12px;">Nếu không phải mày yêu cầu, bỏ qua email này.</p>
        </div>
      `,
    });
  }
}
