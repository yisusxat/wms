'use client';

import { FormEvent, useState } from 'react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  apiBaseUrl?: string;
};

export function ForgotPasswordModal({ isOpen, onClose, apiBaseUrl = 'http://localhost:3001' }: Props) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? 'No fue posible procesar la solicitud');
      }

      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setSent(false);
    setEmail('');
    setError('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Restablecer Contraseña</h3>
            <p className="text-xs text-slate-500">Recibe un enlace seguro en tu correo electrónico</p>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        {sent ? (
          <div className="py-6 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-2xl font-bold">
              ✓
            </div>
            <h4 className="font-semibold text-slate-900">Correo enviado con éxito</h4>
            <p className="text-xs text-slate-600 max-w-xs mx-auto">
              Si el correo <strong>{email}</strong> está registrado, hemos despachado las instrucciones para restablecer tu clave mediante nuestro servicio transaccional.
            </p>
            <button
              onClick={handleClose}
              className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
            >
              Volver al inicio de sesión
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Ingresa el correo asociado a tu cuenta. Te enviaremos un enlace con validez de 30 minutos para crear una nueva contraseña.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu.correo@empresa.com"
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-600 focus:outline-hidden"
              />
            </div>

            {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {submitting ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
