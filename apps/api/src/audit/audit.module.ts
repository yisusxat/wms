import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { SupportController } from '../support/support.controller';

@Global()
@Module({
  controllers: [AuditController, SupportController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
