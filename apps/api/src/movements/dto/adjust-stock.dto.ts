import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class AdjustStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  locationId!: string;

  @IsInt()
  @Min(-1000000)
  @Max(1000000)
  delta!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
