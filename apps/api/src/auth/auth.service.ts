import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@insforge/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, WmsRole } from './auth.types';

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

    const client = createClient({
      baseUrl,
      anonKey,
      accessToken,
      isServerMode: true,
    });
    const { data, error } = await client.auth.getCurrentUser();
    if (error || !data?.user?.id) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    let profile = await this.prisma.user.findUnique({ where: { id: data.user.id } });
    if (!profile) {
      profile = await this.prisma.user.create({
        data: {
          id: data.user.id,
          name: data.user.profile?.name ?? data.user.email,
        },
      });
    }
    if (profile && !profile.active) {
      throw new UnauthorizedException('User is inactive');
    }

    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.profile?.name,
      role: (profile?.role ?? 'VIEWER') as WmsRole,
    };
  }
}
