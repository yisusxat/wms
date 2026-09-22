import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null = null;
  private readonly fromEmail: string;

  constructor(private readonly config?: ConfigService) {
    const apiKey = this.config?.get<string>('RESEND_API_KEY') ?? process.env.RESEND_API_KEY;
    this.fromEmail = this.config?.get<string>('EMAIL_FROM') ?? process.env.EMAIL_FROM ?? 'WMS Logística <onboarding@resend.dev>';
    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend email client initialized successfully');
    } else {
      this.logger.warn('RESEND_API_KEY not found. Emails will be logged to console only.');
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.resend) {
      this.logger.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
      return true;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send email to ${to}: ${error.message}`, error);
        return false;
      }

      this.logger.log(`Email sent to ${to} [ID: ${data?.id}]`);
      return true;
    } catch (err) {
      this.logger.error(`Exception sending email to ${to}`, err);
      return false;
    }
  }

  async sendPasswordResetEmail(to: string, resetToken: string, name?: string): Promise<boolean> {
    const webOrigin = this.config?.get<string>('WEB_ORIGIN') ?? process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const resetUrl = `${webOrigin}/?resetToken=${resetToken}&email=${encodeURIComponent(to)}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <div style="background-color: #1e3a8a; padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px;">WMS LOGÍSTICA</h1>
        </div>
        <h2 style="color: #0f172a; margin-top: 0;">Restablecimiento de Contraseña</h2>
        <p>Hola <strong>${name || 'Usuario'}</strong>,</p>
        <p>Hemos recibido una solicitud para restablecer la contraseña de acceso a tu cuenta en el Sistema WMS.</p>
        <p style="margin: 28px 0; text-align: center;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
            Restablecer mi Contraseña
          </a>
        </p>
        <p style="font-size: 13px; color: #64748b;">
          O copia este enlace en tu navegador:<br />
          <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
        </p>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Si tú no solicitaste este cambio, puedes ignorar este mensaje de forma segura. El enlace expirará en 30 minutos.
        </p>
      </div>
    `;

    return this.sendEmail(to, 'Restablece tu contraseña - WMS', html);
  }

  async sendWelcomeEmail(to: string, orgName: string, tempPassword?: string, name?: string): Promise<boolean> {
    const webOrigin = this.config?.get<string>('WEB_ORIGIN') ?? process.env.WEB_ORIGIN ?? 'http://localhost:3000';

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <div style="background-color: #1e3a8a; padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px;">WMS LOGÍSTICA</h1>
        </div>
        <h2 style="color: #0f172a; margin-top: 0;">¡Bienvenido al Equipo!</h2>
        <p>Hola <strong>${name || 'Colaborador'}</strong>,</p>
        <p>Has sido dado de alta en el sistema de gestión de almacén para la organización <strong>${orgName}</strong>.</p>
        ${tempPassword ? `
          <div style="background-color: #f1f5f9; border-left: 4px solid #2563eb; padding: 14px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px;"><strong>Tus credenciales de acceso:</strong></p>
            <p style="margin: 4px 0 0 0; font-size: 13px;">Correo: <code>${to}</code></p>
            <p style="margin: 4px 0 0 0; font-size: 13px;">Contraseña inicial: <code>${tempPassword}</code></p>
          </div>
        ` : ''}
        <p style="margin: 28px 0; text-align: center;">
          <a href="${webOrigin}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
            Ingresar al Panel WMS
          </a>
        </p>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Por favor cambia tu contraseña una vez que hayas iniciado sesión por primera vez.
        </p>
      </div>
    `;

    return this.sendEmail(to, `Invitación a ${orgName} - WMS`, html);
  }
}
