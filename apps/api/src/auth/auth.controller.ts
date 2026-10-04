import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';
import { Request } from 'express';

import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

class ForgotPasswordDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email!: string;
}

class ResetPasswordDto {
  @IsString({ message: 'El token es requerido' })
  @IsNotEmpty({ message: 'El token no puede estar vacío' })
  token!: string;

  @IsString({ message: 'La contraseña es requerida' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  newPassword!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post('forgot-password')
  async forgotPassword(@Req() req: Request, @Body() body: ForgotPasswordDto) {
    const ip = req.ip;
    const userAgent = req.get('user-agent');
    return this.authService.forgotPassword(body.email, ip, userAgent);
  }

  @Post('reset-password')
  async resetPassword(@Req() req: Request, @Body() body: ResetPasswordDto) {
    const ip = req.ip;
    const userAgent = req.get('user-agent');
    return this.authService.resetPassword(body.token, body.newPassword, ip, userAgent);
  }

  @Post('revoke-all')
  @UseGuards(AuthGuard)
  async revokeAll(@Req() req: Request, @CurrentUser() user: AuthenticatedUser) {
    const ip = req.ip;
    const userAgent = req.get('user-agent');
    return this.authService.revokeAllSessions(user.id, ip, userAgent);
  }
}
