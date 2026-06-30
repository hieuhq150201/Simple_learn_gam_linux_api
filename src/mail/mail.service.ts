import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const user = config.get<string>('MAIL_USER');
    const pass = config.get<string>('MAIL_PASS');
    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
    } else {
      this.logger.warn('MAIL_USER/MAIL_PASS not set — email sending disabled');
    }
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Email not sent to ${to} — mail not configured`);
      return;
    }
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
