import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async findAll() {
    const profiles = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    try {
      const authUsers: { id: string; email: string }[] = await this.prisma.$queryRaw`
        SELECT id::text, email FROM auth.users
      `;
      const emailMap = new Map(authUsers.map((u) => [u.id, u.email]));
      return profiles.map((p) => ({
        ...p,
        email: emailMap.get(p.id) ?? '',
      }));
    } catch {
      return profiles.map((p) => ({ ...p, email: '' }));
    }
  }

  async createUser(dto: CreateUserDto) {
    const rawUrl = this.config.get<string>('INSFORGE_URL', 'https://jirv3k8h.us-east.insforge.app');
    const insforgeUrl = rawUrl.replace(/-\w+\.us-east/, '.us-east').replace(/\/$/, '');
    const anonKey = this.config.get<string>(
      'INSFORGE_ANON_KEY',
      'anon_8c78b5a48a1c49627477ca316a70504fab071593359304c6f8484186628ad952',
    );

    // 1. Register in InsForge Auth
    const res = await fetch(`${insforgeUrl}/api/auth/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        email: dto.email,
        password: dto.password,
        name: dto.name,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new BadRequestException(errorData?.message ?? 'No fue posible registrar el usuario en el sistema');
    }

    // 2. Query the user id from auth.users
    const authUsers: { id: string }[] = await this.prisma.$queryRaw`
      SELECT id::text FROM auth.users WHERE email = ${dto.email} LIMIT 1
    `;

    if (!authUsers[0]) {
      throw new BadRequestException('Usuario creado en auth pero no encontrado en base de datos');
    }

    const userId = authUsers[0].id;

    // 3. Mark email verified so user can log in immediately
    await this.prisma.$executeRawUnsafe(`
      UPDATE auth.users SET email_verified = true WHERE id = '${userId}'::uuid
    `).catch(() => null);

    // 4. Upsert user profile
    const profile = await this.prisma.user.upsert({
      where: { id: userId },
      update: {
        name: dto.name,
        role: dto.role ?? 'OPERATOR',
        active: true,
      },
      create: {
        id: userId,
        name: dto.name,
        role: dto.role ?? 'OPERATOR',
        active: true,
      },
    });

    return {
      ...profile,
      email: dto.email,
    };
  }

  updateRole(id: string, data: UpdateRoleDto) {
    return this.prisma.user.update({ where: { id }, data: { role: data.role } });
  }

  updateStatus(id: string, data: UpdateStatusDto) {
    return this.prisma.user.update({ where: { id }, data: { active: data.active } });
  }
}
