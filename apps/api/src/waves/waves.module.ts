import { Module } from '@nestjs/common';
import { WavesController } from './waves.controller';
import { WavesService } from './waves.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationsModule } from '../operations/operations.module';

@Module({
  imports: [PrismaModule, OperationsModule],
  controllers: [WavesController],
  providers: [WavesService],
  exports: [WavesService],
})
export class WavesModule {}
