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
  const [deliveryDetails, setDeliveryDetails] = useState<{ channel: string; status: 'ok' | 'fail'; detail: string }[]>([]);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const screenResolution = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const details: { channel: string; status: 'ok' | 'fail'; detail: string }[] = [];

    // Generate 32-character hexadecimal event ID for Sentry
    const rawUuid = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const sentryEventId = rawUuid.replace(/-/g, '').substring(0, 32).padEnd(32, '0');

    const report = {
      subject,
      category,
      description,
      user: user?.email ?? 'Desconocido',
      role: profile?.role ?? 'VIEWER',
      url: currentUrl,
      userAgent,
      screenResolution,
      sentryEventId,
      timestamp: new Date().toISOString(),
    };

    console.log('Technical report generated:', report);

    // 1. Direct Transmission to Sentry Ingest (Infalible HTTP Envelope)
    const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || 'https://c209787c1c56ffddbbadd2b36a226ee5@o4512119900536832.ingest.us.sentry.io/4512119917117440';
    const SENTRY_KEY = 'c209787c1c56ffddbbadd2b36a226ee5';
    const SENTRY_ENVELOPE_URL = 'https://o4512119900536832.ingest.us.sentry.io/api/4512119917117440/envelope/';

    try {
      const header = JSON.stringify({
        event_id: sentryEventId,
        sent_at: new Date().toISOString(),
        dsn: SENTRY_DSN,
      });
      const itemHeader = JSON.stringify({ type: 'event', content_type: 'application/json' });
      const eventPayload = JSON.stringify({
        event_id: sentryEventId,
        timestamp: Date.now() / 1000,
        platform: 'javascript',
        level: category === 'BUG' ? 'error' : 'info',
        message: `[Soporte ${category}] ${subject}`,
        user: { email: user?.email ?? 'anonymous' },
        tags: { category, role: profile?.role ?? 'VIEWER', source: 'wms_platform' },
        extra: { ...report },
      });
      const body = header + '\n' + itemHeader + '\n' + eventPayload + '\n';

      const sentryRes = await fetch(`${SENTRY_ENVELOPE_URL}?sentry_key=${SENTRY_KEY}&sentry_version=7`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
        body,
        mode: 'cors',
      });

      if (sentryRes.ok) {
        details.push({ channel: 'Sentry.io', status: 'ok', detail: `Evento registrado (#${sentryEventId.substring(0, 8)})` });
      } else {
        details.push({ channel: 'Sentry.io', status: 'fail', detail: `HTTP ${sentryRes.status}` });
      }

      // Also dispatch through Sentry SDK if loaded
      try {
        Sentry.captureMessage(`[Soporte ${category}] ${subject}`, {
          level: category === 'BUG' ? 'error' : 'info',
          extra: report,
          user: { email: user?.email ?? 'anonymous' },
        });
      } catch (_) {}
    } catch (sentryErr: any) {
      console.warn('Sentry envelope direct dispatch error:', sentryErr);
      details.push({ channel: 'Sentry.io', status: 'fail', detail: sentryErr.message || 'Error de red' });
    }

    // 2. Persistent Inmutable Storage in InsForge PostgreSQL backend
    try {
      const insforgeUrl = process.env.NEXT_PUBLIC_INSFORGE_URL || 'https://jirv3k8h.us-east.insforge.app';
      const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY || 'anon_8c78b5a48a1c49627477ca316a70504fab071593359304c6f8484186628ad952';
      const dbRecord = {
        action: 'SUPPORT_TICKET_CREATED',
        entity: 'SUPPORT_TICKET',
        user_agent: userAgent || 'Web Browser',
        details: {
          subject,
          category,
          description,
          user: user?.email ?? 'anonymous',
          role: profile?.role ?? 'VIEWER',
          url: currentUrl,
          screenResolution,
          sentryEventId,
          timestamp: new Date().toISOString(),
        },
      };

      const dbRes = await fetch(`${insforgeUrl}/api/database/records/audit_logs`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: 'Bearer ' + anonKey,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify([dbRecord]),
      });

      if (dbRes.ok) {
        details.push({ channel: 'Base de Datos (InsForge)', status: 'ok', detail: 'Ticket persistido en audit_logs' });
      } else {
        const errTxt = await dbRes.text().catch(() => '');
        details.push({ channel: 'Base de Datos (InsForge)', status: 'fail', detail: errTxt.slice(0, 60) || 'Error al persistir' });
      }
    } catch (dbErr: any) {
      console.warn('InsForge direct audit log error:', dbErr);
      details.push({ channel: 'Base de Datos (InsForge)', status: 'fail', detail: dbErr.message || 'Error de conexión' });
    }

    // 3. Dispatch transactional email via /api/support (Resend)
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.emailStatus && !data.emailStatus.startsWith('failed') && !data.emailStatus.startsWith('error')) {
        details.push({ channel: 'Correo Electrónico (Resend)', status: 'ok', detail: `Entregado a yisusxat@gmail.com ${data.resendId ? `(#${data.resendId.slice(0, 8)})` : ''}` });
      } else {
        details.push({
          channel: 'Correo Electrónico (Resend)',
          status: 'fail',
          detail: data?.emailStatus || `HTTP ${res.status} (Notificación pendiente)`,
        });
      }
    } catch (apiErr: any) {
      console.warn('Could not reach /api/support:', apiErr);
      details.push({ channel: 'Correo Electrónico (Resend)', status: 'fail', detail: 'Servidor no disponible para envío SMTP directo' });
    }

    setDeliveryDetails(details);
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
          <div className="my-6 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 text-2xl font-black">
              ✓
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-900">Reporte Despachado y Registrado</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                La incidencia ha sido procesada mediante la arquitectura de triple redundancia operativa.
              </p>
            </div>

            {/* Detailed multi-channel status list */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 text-left space-y-2">
              <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Estado de Canales de Recepción:</p>
              <div className="space-y-1.5 text-xs">
                {deliveryDetails.map((item, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2 p-1.5 rounded-lg bg-white border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className={item.status === 'ok' ? 'text-emerald-600 font-bold' : 'text-amber-500 font-bold'}>
                        {item.status === 'ok' ? '✓' : '⚠️'}
                      </span>
                      <span className="font-semibold text-slate-800">{item.channel}</span>
                    </div>
                    <span className={`text-[11px] font-mono ${item.status === 'ok' ? 'text-emerald-700' : 'text-amber-700'} text-right truncate max-w-[210px]`}>
                      {item.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleClose}
                className="rounded-xl bg-slate-900 px-7 py-2.5 text-xs font-bold text-white shadow hover:bg-slate-800 transition"
              >
                Cerrar y Continuar
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
