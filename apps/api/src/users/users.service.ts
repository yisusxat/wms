import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
  ) {}

  async findAll(organizationId?: string) {
    let whereClause: any = {};
    if (organizationId) {
      whereClause = {
        memberships: {
          some: { organizationId },
        },
      };
    }

    const profiles = await this.prisma.user.findMany({
      where: whereClause,
      include: {
        memberships: {
          include: { organization: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

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

  async createUser(dto: CreateUserDto, organizationId?: string, adminUserId?: string) {
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

    // 5. Associate with Organization
    const defaultOrg = await this.prisma.organization.findFirst({
      where: organizationId ? { id: organizationId } : { slug: 'bodega-central' },
    });

    if (defaultOrg) {
      await this.prisma.membership.upsert({
        where: {
          organizationId_userId: {
            organizationId: defaultOrg.id,
            userId,
          },
        },
        update: { role: dto.role ?? 'OPERATOR' },
        create: {
          organizationId: defaultOrg.id,
          userId,
          role: dto.role ?? 'OPERATOR',
        },
      });

      // 6. Send welcome email via Resend
      await this.emailService.sendWelcomeEmail(dto.email, defaultOrg.name, dto.password, dto.name);
    }

    // 7. Audit log
    await this.audit.log({
      organizationId: defaultOrg?.id,
      userId: adminUserId,
      action: 'USER_CREATED',
      entity: 'user',
      entityId: userId,
      details: { email: dto.email, role: dto.role, name: dto.name },
    });

    return {
      ...profile,
      email: dto.email,
    };
  }

  async updateRole(id: string, data: UpdateRoleDto, adminUserId?: string) {
    const updated = await this.prisma.user.update({ where: { id }, data: { role: data.role } });
    await this.prisma.membership.updateMany({
      where: { userId: id },
      data: { role: data.role },
    });
    await this.audit.log({
      userId: adminUserId,
      action: 'ROLE_UPDATED',
      entity: 'user',
      entityId: id,
      details: { newRole: data.role },
    });
    return updated;
  }

  async updateStatus(id: string, data: UpdateStatusDto, adminUserId?: string) {
    const updated = await this.prisma.user.update({ where: { id }, data: { active: data.active } });
    await this.audit.log({
      userId: adminUserId,
      action: data.active ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
      entity: 'user',
      entityId: id,
    });
    return updated;
  }

  async updateProfile(
    id: string,
    data: { role?: any; active?: boolean; permissions?: any },
    adminUserId?: string
  ) {
    const updateData: any = {};
    if (data.role) updateData.role = data.role;
    if (typeof data.active === 'boolean') updateData.active = data.active;
    if (data.permissions) updateData.permissions = data.permissions;

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    if (data.role) {
      await this.prisma.membership.updateMany({
        where: { userId: id },
        data: { role: data.role },
      });
    }

    await this.audit.log({
      userId: adminUserId,
      action: 'PERMISSIONS_UPDATED',
      entity: 'user',
      entityId: id,
      details: {
        role: data.role,
        active: data.active,
        permissionsCount: data.permissions ? Object.keys(data.permissions).length : 0,
      },
    });

    return updated;
  }

  async anonymizeUser(userId: string) {
    const anonEmail = `anonymized_${userId.slice(0, 8)}@deleted.local`;
    await this.prisma.$executeRawUnsafe(
      `UPDATE "user_profiles" SET name = 'Usuario Anonimizado', active = false, updated_at = NOW() WHERE id = $1::uuid`,
      userId,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE auth.users SET email = $1, email_verified = false, updated_at = NOW() WHERE id = $2::uuid`,
      anonEmail,
      userId,
    );
    await this.audit.log({
      userId,
      action: 'USER_GDPR_ANONYMIZED',
      entity: 'user',
      entityId: userId,
    });
    return { message: 'Tu cuenta ha sido anonimizada y dada de baja exitosamente.' };
  }
}
