"use client";

/**
 * DESHABILITADO — hardening de seguridad (PLAN_SEGURIDAD.md, Fase 1.4).
 *
 * Este modal simulaba autenticación 2FA: generaba un "secreto" y aceptaba
 * cualquier código de 6 dígitos sin verificación server-side, lo que daba al
 * usuario una falsa sensación de protección (hallazgo C4 de
 * INFORME_SEGURIDAD_FINAL.md).
 *
 * Se mantiene el export como stub nulo para no romper imports residuales.
 * El 2FA real (TOTP verificado en servidor, obligatorio para ADMIN) está
 * planificado en PLAN_SEGURIDAD.md, Fase 5.
 */
export function TwoFactorModal(_: {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}) {
  return null;
}
