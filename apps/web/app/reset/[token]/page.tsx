'use client';

import { FormEvent, useState, use } from 'react';
import { Warehouse, Eye, EyeOff, Loader2 } from 'lucide-react';

/**
 * Fase 3.5 (PLAN_SEGURIDAD.md): página de restablecimiento/definición de
 * contraseña. El token llega por PATH (/reset/<token>), no por query string,
 * para que no quede en historial del navegador, logs de servidor ni Referer.
 */
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : '');

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams?.token ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newPassword.length < 10) {
      setError('La contraseña debe tener al menos 10 caracteres.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? 'No fue posible restablecer la contraseña');
      }
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-surface p-4 sm:p-6 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Warehouse className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">WMS Enterprise</p>
            <p className="text-[11px] font-medium uppercase tracking-widest text-blue-700 dark:text-blue-300">Logística</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          {done ? (
            <div className="space-y-4 text-center">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Contraseña actualizada</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Ya puedes iniciar sesión con tu nueva contraseña.
              </p>
              <a
                href="/"
                className="inline-block w-full rounded-lg bg-blue-600 p-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Ir al inicio de sesión
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Definir contraseña</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                El enlace es de un solo uso y tiene validez limitada. Si expira, solicita uno nuevo desde
                «¿Olvidaste tu contraseña?».
              </p>

              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Nueva contraseña (mínimo 10 caracteres)
                <div className="relative mt-1.5">
                  <input
                    name="newPassword"
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-slate-300 bg-white p-3 pr-11 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={10}
                    placeholder="••••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40">
                  {error}
                </p>
              )}

              <button
                disabled={submitting || !token}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 p-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? 'Procesando…' : 'Guardar contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
