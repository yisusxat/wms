'use client';

import { useState } from 'react';
import { apiFetch } from '../../lib/api';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  token?: string | null;
  onAnonymized?: () => void;
};

export function LegalModal({ isOpen, onClose, token, onAnonymized }: Props) {
  const [tab, setTab] = useState<'tos' | 'sla' | 'gdpr'>('tos');
  const [anonymizing, setAnonymizing] = useState(false);
  const [anonymizedSuccess, setAnonymizedSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleAnonymize() {
    if (!token) return;
    if (!confirm('¿Estás seguro de que deseas anonimizar y dar de baja tu cuenta? Esta acción es irreversible conforme al derecho al olvido (RGPD).')) {
      return;
    }

    setAnonymizing(true);
    setError('');

    try {
      await apiFetch('/users/me/anonymize', token, { method: 'POST' });
      setAnonymizedSuccess(true);
      setTimeout(() => {
        onAnonymized?.();
        onClose();
      }, 2500);
    } catch (err: any) {
      setError(err.message || 'Error al procesar la anonimización');
    } finally {
      setAnonymizing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Marco Legal, SLA y Privacidad</h3>
            <p className="text-xs text-slate-500">Términos operativos, acuerdo de nivel de servicio y cumplimiento de datos</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 mt-4 space-x-4 text-xs font-semibold">
          <button
            onClick={() => setTab('tos')}
            className={`pb-2.5 transition ${tab === 'tos' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Términos de Servicio (ToS)
          </button>
          <button
            onClick={() => setTab('sla')}
            className={`pb-2.5 transition ${tab === 'sla' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Acuerdo de Nivel de Servicio (SLA)
          </button>
          <button
            onClick={() => setTab('gdpr')}
            className={`pb-2.5 transition ${tab === 'gdpr' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Privacidad & RGPD (Derecho al Olvido)
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto mt-4 text-xs text-slate-600 space-y-3 leading-relaxed pr-2">
          {tab === 'tos' && (
            <div className="space-y-3">
              <h4 className="font-bold text-sm text-slate-900">1. Condiciones de Uso de la Plataforma</h4>
              <p>
                El software de Gestión de Almacenes (WMS) se provee para uso operacional de inventarios y logística. Los usuarios se comprometen a utilizar credenciales seguras y no transferibles.
              </p>
              <h4 className="font-bold text-sm text-slate-900">2. Exención de Responsabilidad por Terceros</h4>
              <p>
                La plataforma opera sobre infraestructura en la nube de alta disponibilidad (AWS, Vercel, Supabase/InsForge). No se asume responsabilidad por interrupciones fortuitas causadas por fallas de conectividad de los proveedores de telecomunicaciones o incidencias de fuerza mayor ajenas al control directo del operador.
              </p>
              <h4 className="font-bold text-sm text-slate-900">3. Custodia de Inventarios</h4>
              <p>
                El sistema actúa como libro contable digital y gemelo virtual de almacén. La exactitud física del stock físico recae en las auditorías periódicas y procedimientos de conciliación del personal operativo.
              </p>
            </div>
          )}

          {tab === 'sla' && (
            <div className="space-y-3">
              <h4 className="font-bold text-sm text-slate-900">1. Compromiso de Disponibilidad</h4>
              <p>
                Nos comprometemos a un objetivo de disponibilidad operativa mensual del <strong>99.5%</strong> para las operaciones de consulta y registro de inventario en tiempo real.
              </p>
              <h4 className="font-bold text-sm text-slate-900">2. Ventanas de Mantenimiento</h4>
              <p>
                Las actualizaciones de infraestructura y despliegues se ejecutan en horarios de baja demanda operativa o mediante despliegues progresivos sin tiempo de caída (Zero-Downtime Deployments).
              </p>
              <h4 className="font-bold text-sm text-slate-900">3. Tiempos de Respuesta y Respaldo</h4>
              <p>
                La base de datos cuenta con copias de seguridad continuas gestionadas en la nube, con un objetivo de recuperación (RTO) inferior a 2 horas y punto de recuperación (RPO) inferior a 24 horas.
              </p>
            </div>
          )}

          {tab === 'gdpr' && (
            <div className="space-y-3">
              <h4 className="font-bold text-sm text-slate-900">1. Tratamiento y Finalidad de Datos</h4>
              <p>
                Únicamente recopilamos los datos estrictamente necesarios para la identificación de operadores y trazabilidad de movimientos de almacén (nombre, correo electrónico, rol y registros de auditoría).
              </p>
              <h4 className="font-bold text-sm text-slate-900">2. Derecho al Olvido y Anonimización</h4>
              <p>
                En cumplimiento con normativas de protección de datos (RGPD / GDPR), cualquier usuario puede solicitar la anonimización completa e irreversible de sus datos personales. Sus registros históricos en movimientos de almacén se mantendrán por integridad contable desvinculados de su identidad personal.
              </p>

              {token && (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                  <h5 className="font-bold text-amber-900">Zona de Autogestión de Privacidad</h5>
                  <p className="text-[11px] text-amber-800">
                    Si deseas dar de baja y anonimizar tu cuenta actual, presiona el botón inferior.
                  </p>
                  {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
                  {anonymizedSuccess ? (
                    <p className="text-xs text-emerald-700 font-bold">✓ Cuenta anonimizada. Cerrando sesión...</p>
                  ) : (
                    <button
                      onClick={handleAnonymize}
                      disabled={anonymizing}
                      className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition"
                    >
                      {anonymizing ? 'Procesando...' : 'Solicitar Anonimización y Baja (RGPD)'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
