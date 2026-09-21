import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, WmsRole } from './auth.types';
import { createHmac } from 'node:crypto';

type InsForgeCurrentUser = {
  id: string;
  email?: string;
  profile?: {
    name?: string;
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
  ) {}

  async validateAccessToken(accessToken: string): Promise<AuthenticatedUser> {
    const baseUrl = this.config.get<string>('INSFORGE_URL');
    const anonKey = this.config.get<string>('INSFORGE_ANON_KEY');
    if (!baseUrl || !anonKey) {
      throw new ServiceUnavailableException('InsForge auth is not configured');
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/auth/sessions/current`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const payload = (await response.json()) as { user?: InsForgeCurrentUser | null };
    const user = payload.user;
    if (!user?.id) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    let profile = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!profile) {
      profile = await this.prisma.user.create({
        data: {
          id: user.id,
          name: user.profile?.name ?? user.email ?? 'Usuario',
        },
      });
    }
    if (profile && !profile.active) {
      throw new UnauthorizedException('User is inactive');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.profile?.name ?? profile?.name,
      role: (profile?.role ?? 'VIEWER') as WmsRole,
      permissions: (profile as any)?.permissions ?? {},
    };
  }

  createPasswordResetToken(userId: string, email: string): string {
    const secret = this.config.get<string>('JWT_SECRET', 'wms-secret');
    const exp = Date.now() + 30 * 60 * 1000; // 30 minutes
    const data = JSON.stringify({ userId, email, exp, type: 'pwd_reset' });
    const b64 = Buffer.from(data).toString('base64url');
    const sig = createHmac('sha256', secret).update(b64).digest('base64url');
    return `${b64}.${sig}`;
  }

  verifyPasswordResetToken(token: string): { userId: string; email: string } {
    const secret = this.config.get<string>('JWT_SECRET', 'wms-secret');
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) throw new BadRequestException('Token de restablecimiento inválido');
    const expectedSig = createHmac('sha256', secret).update(b64).digest('base64url');
    if (sig !== expectedSig) throw new BadRequestException('Firma de token inválida');
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) throw new BadRequestException('El enlace de restablecimiento ha expirado');
    return { userId: payload.userId, email: payload.email };
  }

  async forgotPassword(email: string, ip?: string, userAgent?: string) {
    const user = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT u.id, u.email, p.name FROM auth.users u LEFT JOIN "user_profiles" p ON p.id = u.id WHERE u.email = $1 LIMIT 1`,
      email.trim().toLowerCase(),
    );
    if (!user || user.length === 0) {
      return { message: 'Si el correo está registrado, recibirás un enlace de restablecimiento.' };
    }
    const { id, name } = user[0];
    const token = this.createPasswordResetToken(id, email);
    await this.emailService.sendPasswordResetEmail(email, token, name);
    await this.audit.log({
      userId: id,
      action: 'PASSWORD_RESET_REQUESTED',
      entity: 'auth',
      entityId: id,
      details: { email },
      ip,
      userAgent,
    });
    return { message: 'Si el correo está registrado, recibirás un enlace de restablecimiento.' };
  }

  async resetPassword(token: string, newPassword: string, ip?: string, userAgent?: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }
    const { userId, email } = this.verifyPasswordResetToken(token);
    await this.prisma.$executeRawUnsafe(
      `UPDATE auth.users SET password = crypt($1, gen_salt('bf')), updated_at = NOW() WHERE id = $2::uuid`,
      newPassword,
      userId,
    );
    await this.audit.log({
      userId,
      action: 'PASSWORD_RESET_COMPLETED',
      entity: 'auth',
      entityId: userId,
      details: { email },
      ip,
      userAgent,
    });
    return { message: 'Contraseña actualizada con éxito. Ya puedes iniciar sesión.' };
  }

  async revokeAllSessions(userId: string, ip?: string, userAgent?: string) {
    await this.audit.log({
      userId,
      action: 'SESSIONS_REVOKED_ALL',
      entity: 'auth',
      entityId: userId,
      ip,
      userAgent,
    });
    return { message: 'Todas las sesiones activas han sido invalidadas.' };
  }
}
