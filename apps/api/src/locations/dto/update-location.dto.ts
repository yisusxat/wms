import { IsEnum } from 'class-validator';
import { LocationStatus } from '@prisma/client';

export class UpdateLocationDto {
  @IsEnum(LocationStatus)
  status!: LocationStatus;
}
