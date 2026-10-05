import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { AuditService } from '../audit/audit.service';
import { Request } from 'express';

class CreateTicketDto {
  @IsString()
  @IsNotEmpty({ message: 'El asunto es requerido' })
  @MaxLength(200)
  subject!: string;

  @IsIn(['INCIDENT', 'BUG', 'ACCESS', 'SUGGESTION'])
  category!: 'INCIDENT' | 'BUG' | 'ACCESS' | 'SUGGESTION';

  @IsString()
  @IsNotEmpty({ message: 'La descripción es requerida' })
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  section?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  warehouse?: string;
}

/**
 * Tickets de soporte (PLAN_SEGURIDAD.md, Fase 2.3).
 * Reemplaza el INSERT anónimo del frontend a `audit_logs` (solo con anon key):
 * ahora el ticket se persiste server-side con el JWT del usuario autenticado,
 * de modo que la bitácora no es escribible por anónimos.
 */
@Controller('support')
@UseGuards(AuthGuard)
export class SupportController {
  constructor(private readonly audit: AuditService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('tickets')
  async createTicket(@Req() req: Request, @Body() body: CreateTicketDto) {
    const user = (req as any).user;
    await this.audit.log({
      userId: user?.id,
      action: 'SUPPORT_TICKET_CREATED',
      entity: 'SUPPORT_TICKET',
      entityId: user?.id,
      details: {
        subject: body.subject,
        category: body.category,
        description: body.description,
        section: body.section,
        warehouse: body.warehouse,
        role: user?.role,
        email: user?.email,
      },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return { status: 'ok', message: 'Ticket de soporte registrado correctamente.' };
  }
}
