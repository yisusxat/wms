import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ReceiveStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  locationId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  reference?: string;

}
