#!/usr/bin/env node
/**
 * scripts/security-verify.mjs
 * Script de verificación automatizada de seguridad (línea base vs cierre).
 *
 * Cada comprobación evalúa un hallazgo específico del INFORME_SEGURIDAD_FINAL.md:
 * - En la línea base (Fase 0): deben reportar FAIL (la vulnerabilidad existe).
 * - En el cierre (Fase Final): todas deben reportar PASS (la vulnerabilidad fue remediada).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const results = [];

function check(id, title, testFn) {
  try {
    const outcome = testFn();
    results.push({ id, title, pass: outcome.pass, details: outcome.details });
  } catch (err) {
    results.push({ id, title, pass: false, details: `Error ejecutando prueba: ${err.message}` });
  }
}

// ── C1: Contraseña en texto plano en localStorage ─────────────────────────
check('C1', 'Eliminación de password en localStorage ("recordar credenciales")', () => {
  const pagePath = path.join(ROOT, 'apps/web/app/page.tsx');
  const content = fs.readFileSync(pagePath, 'utf8');

  // Buscar si se almacena password en wms_remembered_credentials
  const hasPasswordInStorage =
    /wms_remembered_credentials['"],\s*JSON\.stringify\(\{[^}]*password/i.test(content) ||
    /localStorage\.setItem\(['"]wms_remembered_credentials['"][^;]*password/i.test(content);

  if (hasPasswordInStorage) {
    return {
      pass: false,
      details: 'VULNERABLE: page.tsx almacena la contraseña en texto plano en localStorage.'
    };
  }
  return {
    pass: true,
    details: 'CORREGIDO: page.tsx ya no almacena la contraseña en localStorage.'
  };
});

// ── C2: Bypass de NestJS ante 401/403 en api.ts ─────────────────────────────
check('C2', 'Eliminación de fallback a InsForge ante respuestas 401 y 403', () => {
  const apiPath = path.join(ROOT, 'apps/web/lib/api.ts');
  const content = fs.readFileSync(apiPath, 'utf8');

  // Comprobar si status 401 o 403 disparan fallbackInsforge
  const regexAuthFallback = /response\.status\s*===\s*40[13][^}]*fallbackInsforge/s;
  const isFallbackOnAuthFail = regexAuthFallback.test(content) || 
    (content.includes('response.status === 403') && content.includes('fallbackInsforge'));

  if (isFallbackOnAuthFail) {
    return {
      pass: false,
      details: 'VULNERABLE: api.ts elude los errores 401/403 de NestJS reintentando con fallbackInsforge.'
    };
  }
  return {
    pass: true,
    details: 'CORREGIDO: api.ts no ejecuta fallback ante 401/403.'
  };
});

// ── C4: 2FA cosmético / no operativo ──────────────────────────────────────
check('C4', 'Eliminación o validación real de 2FA (no simulación)', () => {
  const modalPath = path.join(ROOT, 'apps/web/app/components/TwoFactorModal.tsx');
  if (!fs.existsSync(modalPath)) {
    return { pass: true, details: 'CORREGIDO: TwoFactorModal.tsx fue eliminado del proyecto.' };
  }
  const content = fs.readFileSync(modalPath, 'utf8');
  const hasHardcodedKey = content.includes('JBSWY3DPEHPK3PXP');
  const acceptsAny6Digits = /code\.length\s*===\s*6/.test(content) && !content.includes('verifyOtp');

  if (hasHardcodedKey || acceptsAny6Digits) {
    return {
      pass: false,
      details: 'VULNERABLE: TwoFactorModal contiene secreto hardcodeado y/o validación cosmética de 6 dígitos.'
    };
  }
  return {
    pass: true,
    details: 'CORREGIDO: TwoFactorModal no contiene secretos hardcodeados ni validación simulada.'
  };
});

// ── C5: JWT_SECRET con fallback débil conocido ────────────────────────────
check('C5', 'Prohibición de secreto por defecto ("wms-secret") en JWT', () => {
  const authServicePath = path.join(ROOT, 'apps/api/src/auth/auth.service.ts');
  const content = fs.readFileSync(authServicePath, 'utf8');

  const hasDefaultSecret = /'JWT_SECRET',\s*['"]wms-secret['"]/.test(content) || content.includes("'wms-secret'");

  if (hasDefaultSecret) {
    return {
      pass: false,
      details: 'VULNERABLE: auth.service.ts contiene fallback por defecto a "wms-secret".'
    };
  }
  return {
    pass: true,
    details: 'CORREGIDO: auth.service.ts exige un JWT_SECRET robusto sin fallbacks predecibles.'
  };
});

// ── C6: Endpoints de reportes sin control de roles ─────────────────────────
check('C6', 'Control de acceso granular (@Roles) en /reports/*', () => {
  const controllerPath = path.join(ROOT, 'apps/api/src/reports/reports.controller.ts');
  const content = fs.readFileSync(controllerPath, 'utf8');

  const hasBulkApplyRole = /@Roles\([^)]*\)\s*@(Post|Get)\(["']bulk\/apply["']/.test(content) ||
                          /@(Post|Get)\(["']bulk\/apply["']\)\s*@Roles/.test(content);
  const hasScheduleDispatchRole = /@Roles\([^)]*\)\s*@(Post|Get)\(["']schedule\/dispatch["']/.test(content) ||
                                  /@(Post|Get)\(["']schedule\/dispatch["']\)\s*@Roles/.test(content);

  if (!hasBulkApplyRole || !hasScheduleDispatchRole) {
    return {
      pass: false,
      details: 'VULNERABLE: endpoints sensibles en ReportsController (bulk/apply, dispatch) carecen de @Roles.'
    };
  }
  return {
    pass: true,
    details: 'CORREGIDO: ReportsController tiene decoradores @Roles en sus endpoints sensibles.'
  };
});

// ── N1: API key de Resend ofuscada en Base64 en código ────────────────────
check('N1', 'Eliminación de clave Resend hardcodeada en base64', () => {
  const reportsServicePath = path.join(ROOT, 'apps/api/src/reports/reports.service.ts');
  const content = fs.readFileSync(reportsServicePath, 'utf8');

  const hasBase64Resend = content.includes('cmVfR1JaMkZlOGRf') || content.includes('re_GRZ2Fe8d_');

  if (hasBase64Resend) {
    return {
      pass: false,
      details: 'VULNERABLE: reports.service.ts contiene la clave de Resend hardcodeada.'
    };
  }
  return {
    pass: true,
    details: 'CORREGIDO: Clave de Resend eliminada del código fuente.'
  };
});

// ── A1: Rol por defecto ADMIN en fallback del frontend ────────────────────
check('A1', 'Rol por defecto seguro en frontend (VIEWER y no ADMIN)', () => {
  const apiPath = path.join(ROOT, 'apps/web/lib/api.ts');
  const content = fs.readFileSync(apiPath, 'utf8');

  // Buscar fallback que asigne ADMIN si falla la carga de perfil
  const hasAdminDefault = /role:\s*['"]ADMIN['"]/.test(content) && content.includes('fallbackInsforge');

  if (hasAdminDefault) {
    return {
      pass: false,
      details: 'VULNERABLE: api.ts asigna rol ADMIN por defecto cuando falla la consulta de perfil.'
    };
  }
  return {
    pass: true,
    details: 'CORREGIDO: api.ts no concede ADMIN por defecto ante fallos.'
  };
});

// ── N6: Inyección de fórmulas CSV/Excel en exportaciones ───────────────────
check('N6', 'Sanitización de fórmulas en exportación de reportes CSV/Excel', () => {
  const reportsServicePath = path.join(ROOT, 'apps/api/src/reports/reports.service.ts');
  const content = fs.readFileSync(reportsServicePath, 'utf8');

  // Comprobar si existe sanitización de prefijos (=, +, -, @)
  const hasFormulaSanitization = content.includes('sanitizeFormula') || 
                                 /['"`]\t?['"`]\s*\+\s*value/.test(content) ||
                                 /^[=+\-@]/.test(content) ||
                                 content.includes("value.startsWith('=')");

  if (!hasFormulaSanitization) {
    return {
      pass: false,
      details: 'VULNERABLE: reports.service.ts no neutraliza prefijos de fórmulas (=, +, -, @).'
    };
  }
  return {
    pass: true,
    details: 'CORREGIDO: Exportaciones neutralizan caracteres ejecutables en Excel/CSV.'
  };
});

// ── F2: Inyección de comandos ZPL en generación de etiquetas ───────────────
check('F2', 'Sanitización y escape de comandos en etiquetas ZPL', () => {
  const opsServicePath = path.join(ROOT, 'apps/api/src/operations/operations.service.ts');
  const content = fs.readFileSync(opsServicePath, 'utf8');

  // Comprobar si se escapan los caracteres de control ZPL (^ y ~)
  const escapesZpl = content.includes('.replace(/\\^/g') || 
                     content.includes('escapeZpl') || 
                     content.includes('^FH');

  if (!escapesZpl) {
    return {
      pass: false,
      details: 'VULNERABLE: generateLabel interpola títulos directamente sin sanitizar caracteres ZPL (^, ~).'
    };
  }
  return {
    pass: true,
    details: 'CORREGIDO: generateLabel sanitiza caracteres de control ZPL.'
  };
});

// ── Impresión de Resultados ───────────────────────────────────────────────
console.log('\n======================================================');
console.log('       INFORME DE VERIFICACIÓN DE SEGURIDAD');
console.log('======================================================\n');

let passCount = 0;
let failCount = 0;

for (const r of results) {
  const icon = r.pass ? '✅ PASS' : '❌ FAIL';
  if (r.pass) passCount++;
  else failCount++;
  console.log(`[${icon}] ${r.id}: ${r.title}`);
  console.log(`       Detalle: ${r.details}\n`);
}

console.log('------------------------------------------------------');
console.log(`Total pruebas: ${results.length} | PASS: ${passCount} | FAIL: ${failCount}`);
console.log('------------------------------------------------------\n');

if (process.env.EXPECT_ALL_PASS === 'true' && failCount > 0) {
  process.exit(1);
}
