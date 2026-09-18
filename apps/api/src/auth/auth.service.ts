import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, WmsRole } from './auth.types';

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
      name: user.profile?.name,
      role: (profile?.role ?? 'VIEWER') as WmsRole,
    };
  }
}
