'use client';

import { useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { CurrentUser } from '../../lib/api';

type SupportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  user: { email?: string } | null;
  profile: CurrentUser | null;
};

export function SupportModal({ isOpen, onClose, user, profile }: SupportModalProps) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<'INCIDENT' | 'BUG' | 'ACCESS' | 'SUGGESTION'>('INCIDENT');
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const screenResolution = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const report = {
      subject,
      category,
      description,
      user: user?.email ?? 'Desconocido',
      role: profile?.role ?? 'VIEWER',
      url: currentUrl,
      userAgent,
      screenResolution,
      timestamp: new Date().toISOString(),
    };

    console.log('Technical report generated:', report);

    // 1. Dispatch email notification via Next.js backend API
    let emailStatus = '';
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        emailStatus = data?.emailStatus || 'ok';
      } else {
        console.error('Support API returned error:', data);
      }
    } catch (err: any) {
      console.warn('Could not post report to /api/support:', err);
    }

    // 2. Capture message in Sentry for monitoring & error tracking
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      try {
        Sentry.captureMessage(`[Soporte ${category}] ${subject}`, {
          level: category === 'BUG' ? 'error' : 'info',
          extra: { ...report, emailStatus },
          user: { email: user?.email ?? 'anonymous' },
        });
        await Sentry.flush(2000).catch(() => null);
      } catch (err) {
        console.warn('Could not forward report to Sentry:', err);
      }
    }

    setDeliveryNote(emailStatus ? `Notificación por correo: ${emailStatus}` : '');
    setLoading(false);
    setSent(true);
  };

  const handleClose = () => {
    setSent(false);
    setSubject('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-900 text-lg">
              🛠️
            </span>
            <div>
              <h3 className="text-lg font-black text-slate-900">Mesa de Ayuda y Soporte WMS</h3>
              <p className="text-xs text-slate-500">Reportar incidencias operativas o solicitar asistencia</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-full bg-slate-100 p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            ✕
          </button>
        </div>

        {sent ? (
          <div className="my-8 text-center space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 text-3xl">
              ✓
            </div>
            <h4 className="text-xl font-bold text-slate-800">Reporte Enviado con Éxito</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Se ha capturado el contexto técnico y tus datos. Nuestro equipo de soporte o el administrador revisará la incidencia a la brevedad.
            </p>
            {deliveryNote && (
              <p className="text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 py-1.5 px-3 rounded-lg inline-block border border-emerald-200">
                ✓ {deliveryNote}
              </p>
            )}
            <div className="pt-4">
              <button
                onClick={handleClose}
                className="rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-bold text-white shadow hover:bg-slate-800"
              >
                Entendido
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium focus:bg-white focus:border-blue-600 focus:outline-none"
              >
                <option value="INCIDENT">Incidencia operativa en bodega / Ubicación</option>
                <option value="BUG">Fallo o error en el sistema web</option>
                <option value="ACCESS">Permisos de usuario o rol</option>
                <option value="SUGGESTION">Sugerencia de mejora en layout o procesos</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Asunto / Título</label>
              <input
                required
                placeholder="Ej: Posición A-C-01-05 bloqueada físicamente..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Descripción detallada</label>
              <textarea
                required
                rows={4}
                placeholder="Indica qué ocurrió, SKU involucrado o pasos para reproducir..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Auto captured metadata preview */}
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3 text-[11px] text-slate-500 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-600">Contexto técnico capturado automáticamente:</span>
                <span className="text-[10px] text-emerald-600 font-bold">✓ Listo</span>
              </div>
              <p>Usuario: <span className="font-mono text-slate-700">{user?.email ?? 'N/A'}</span> ({profile?.role ?? 'VIEWER'})</p>
              <p className="truncate">URL: <span className="font-mono text-slate-700">{currentUrl}</span></p>
              <p>Resolución: <span className="font-mono text-slate-700">{screenResolution}</span></p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-blue-900 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-blue-800 disabled:opacity-50"
              >
                {loading ? 'Enviando...' : 'Enviar Reporte'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
