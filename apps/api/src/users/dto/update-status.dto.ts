import { IsBoolean } from 'class-validator';

export class UpdateStatusDto {
  @IsBoolean()
  active!: boolean;
}
