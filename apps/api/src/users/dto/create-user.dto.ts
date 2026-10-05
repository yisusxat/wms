import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  /**
   * Opcional desde la Fase 3.3 (PLAN_SEGURIDAD.md): si se omite, el backend
   * genera una contraseña aleatoria interna (nunca se envía por email) y el
   * usuario recibe un enlace de primer login para definir la suya.
   */
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
  password?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
