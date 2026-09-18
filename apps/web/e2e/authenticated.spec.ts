import { expect, test } from '@playwright/test';

test('usuario autenticado puede abrir el panel operacional', async ({ page }) => {
  test.skip(!process.env.WMS_E2E_EMAIL || !process.env.WMS_E2E_PASSWORD, 'Requiere credenciales de prueba, nunca productivas');
  await page.goto('/');
  await page.getByLabel('Correo').fill(process.env.WMS_E2E_EMAIL!);
  await page.getByLabel('Contraseña').fill(process.env.WMS_E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Movimientos' }).click();
  await expect(page.getByText('Entrada / salida rápida')).toBeVisible();
});
