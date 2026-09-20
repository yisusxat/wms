'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

type AuditLog = {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: any;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    role: string;
  };
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
};

export function AuditLogsModal({ isOpen, onClose, token }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !token) return;
    setLoading(true);
    apiFetch<AuditLog[]>('/audit-logs?limit=50', token)
      .then((data) => {
        setLogs(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [isOpen, token]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold">
                📜
              </span>
              <h3 className="text-lg font-bold text-slate-900">Bitácora de Auditoría (Audit Log)</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">Registro inmutable de acciones críticas, mutaciones y eventos de seguridad</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}

        <div className="flex-1 overflow-auto mt-4">
          {loading ? (
            <p className="text-center py-10 text-sm text-slate-500">Cargando bitácora de auditoría...</p>
          ) : logs.length === 0 ? (
            <p className="text-center py-10 text-sm text-slate-500">No hay registros de auditoría recientes</p>
          ) : (
            <table className="w-full min-w-[640px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Fecha y Hora</th>
                  <th className="py-2.5 px-3">Acción</th>
                  <th className="py-2.5 px-3">Entidad</th>
                  <th className="py-2.5 px-3">Usuario</th>
                  <th className="py-2.5 px-3">Detalles</th>
                  <th className="py-2.5 px-3">IP / Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-block px-2 py-0.5 rounded font-mono font-semibold text-[11px] bg-slate-100 text-slate-800">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 font-medium">{log.entity}</td>
                    <td className="py-2.5 px-3 text-slate-800">
                      {log.user?.name || log.user?.id?.slice(0, 8) || 'Sistema'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 max-w-xs truncate">
                      {log.details ? JSON.stringify(log.details) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{log.ip || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
