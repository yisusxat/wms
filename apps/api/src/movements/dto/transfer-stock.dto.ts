import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class TransferStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  sourceLocationId!: string;

  @IsUUID()
  destinationLocationId!: string;

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
