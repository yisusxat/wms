import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getUserOrganizations(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        organization: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      ...m.organization,
      userRole: m.role,
    }));
  }

  async getCurrentOrganization(userId: string, requestedOrgId?: string) {
    if (requestedOrgId) {
      const membership = await this.prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: requestedOrgId,
            userId,
          },
        },
        include: { organization: true },
      });
      if (membership) {
        return { ...membership.organization, userRole: membership.role };
      }
    }

    // Fallback to first user organization or Bodega Central
    const firstMembership = await this.prisma.membership.findFirst({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });

    if (firstMembership) {
      return { ...firstMembership.organization, userRole: firstMembership.role };
    }

    // Default organization fallback
    const defaultOrg = await this.prisma.organization.findUnique({
      where: { slug: 'bodega-central' },
    });

    if (!defaultOrg) {
      throw new NotFoundException('No active organization found');
    }

    return { ...defaultOrg, userRole: 'ADMIN' };
  }

  async createOrganization(userId: string, name: string, slugInput?: string) {
    const slug = (slugInput || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestException(`La organización con slug "${slug}" ya existe`);
    }

    const org = await this.prisma.$transaction(async (tx) => {
      const newOrg = await tx.organization.create({
        data: {
          name,
          slug,
        },
      });

      await tx.membership.create({
        data: {
          organizationId: newOrg.id,
          userId,
          role: 'ADMIN',
        },
      });

      return newOrg;
    });

    await this.audit.log({
      organizationId: org.id,
      userId,
      action: 'ORGANIZATION_CREATED',
      entity: 'organization',
      entityId: org.id,
      details: { name: org.name, slug: org.slug },
    });

    return org;
  }

  async getMembers(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId },
      include: {
        user: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
