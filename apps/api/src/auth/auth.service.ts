import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, WmsRole } from './auth.types';
import { createHmac, timingSafeEqual } from 'node:crypto';

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

    await this.enforceSessionControl(accessToken, user.id);

    return {
      id: user.id,
      email: user.email,
      name: user.profile?.name ?? profile?.name,
      role: (profile?.role ?? 'VIEWER') as WmsRole,
      permissions: (profile as any)?.permissions ?? {},
    };
  }

  private getJwtSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET') ?? process.env.JWT_SECRET;
    if (!secret || secret === 'wms-secret' || secret.length < 32) {
      throw new ServiceUnavailableException(
        'CONFIG ERROR: JWT_SECRET debe estar configurado con una clave segura de al menos 32 caracteres (no se permite "wms-secret").'
      );
    }
    return secret;
  }

  /**
   * Fase 3.1/3.2 (PLAN_SEGURIDAD.md): control de sesión server-side sobre la
   * tabla `session_control` (user_id PK, revoked_at, last_seen_at).
   *
   * - revocación: un token emitido (iat) ANTES de revoked_at se rechaza —
   *   hace real el botón "cerrar sesión en todos los dispositivos".
   * - inactividad: si last_seen_at es más antiguo que SESSION_INACTIVITY_MINUTES
   *   (default 30, más laxo que los 15 min del modal cliente para no competir
   *   con él), el token se rechaza.
   *
   * Acceso por SQL crudo y con try/catch: si la tabla aún no existe (migración
   * pendiente), la validación se omite sin romper el servicio — ver
   * prisma/session_control.sql.
   */
  private async enforceSessionControl(accessToken: string, userId: string): Promise<void> {
    let issuedAtMs: number | null = null;
    try {
      const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8'));
      if (typeof payload.iat === 'number') issuedAtMs = payload.iat * 1000;
    } catch {
      // sin iat legible no se puede evaluar revocación; InsForge ya validó el token
    }

    const inactivityMs =
      (Number(this.config.get<number>('SESSION_INACTIVITY_MINUTES')) || 30) * 60 * 1000;

    try {
      const rows = await this.prisma.$queryRaw<{ revoked_at: Date | null; last_seen_at: Date | null }[]>`
        SELECT revoked_at, last_seen_at FROM session_control WHERE user_id = ${userId}::uuid
      `;
      const row = rows[0];
      if (row) {
        if (row.revoked_at && (issuedAtMs === null || issuedAtMs < new Date(row.revoked_at).getTime())) {
          throw new UnauthorizedException('Sesión revocada: inicia sesión nuevamente');
        }
        if (row.last_seen_at && Date.now() - new Date(row.last_seen_at).getTime() > inactivityMs) {
          throw new UnauthorizedException('Sesión expirada por inactividad');
        }
        // Actualizar last_seen_at con throttle (máx. una escritura por minuto)
        if (!row.last_seen_at || Date.now() - new Date(row.last_seen_at).getTime() > 60_000) {
          await this.prisma.$executeRaw`
            UPDATE session_control SET last_seen_at = NOW() WHERE user_id = ${userId}::uuid
          `.catch(() => null);
        }
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // Tabla inexistente u otro error de BD: no bloquear la autenticación
    }
  }

  createPasswordResetToken(userId: string, email: string, ttlMinutes = 30): string {
    const secret = this.getJwtSecret();
    const exp = Date.now() + ttlMinutes * 60 * 1000;
    const data = JSON.stringify({ userId, email, exp, type: 'pwd_reset' });
    const b64 = Buffer.from(data).toString('base64url');
    const sig = createHmac('sha256', secret).update(b64).digest('base64url');
    return `${b64}.${sig}`;
  }

  verifyPasswordResetToken(token: string): { userId: string; email: string } {
    const secret = this.getJwtSecret();
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) throw new BadRequestException('Token de restablecimiento inválido');
    const expectedSig = createHmac('sha256', secret).update(b64).digest('base64url');

    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      throw new BadRequestException('Firma de token inválida');
    }

    let payload: { userId?: string; email?: string; exp?: number; type?: string };
    try {
      payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Token de restablecimiento inválido');
    }
    if (payload.type !== 'pwd_reset') throw new BadRequestException('Token de restablecimiento inválido');
    if (!payload.userId || !payload.email) throw new BadRequestException('Token de restablecimiento inválido');
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) {
      throw new BadRequestException('El enlace de restablecimiento ha expirado');
    }
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
    if (!newPassword || newPassword.length < 10) {
      throw new BadRequestException('La contraseña debe tener al menos 10 caracteres');
    }
    const { userId, email } = this.verifyPasswordResetToken(token);
    await this.prisma.$executeRaw`
      UPDATE auth.users SET password = crypt(${newPassword}, gen_salt('bf')), updated_at = NOW() WHERE id = ${userId}::uuid
    `;
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
    // Fase 3.1: revocación REAL — todo token emitido antes de este momento
    // queda invalidado en su siguiente request (ver enforceSessionControl).
    await this.prisma.$executeRaw`
      INSERT INTO session_control (user_id, revoked_at, last_seen_at)
      VALUES (${userId}::uuid, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET revoked_at = NOW(), last_seen_at = NOW()
    `.catch(() => {
      throw new ServiceUnavailableException(
        'No fue posible revocar las sesiones: ejecuta prisma/session_control.sql en la base de datos.'
      );
    });
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
