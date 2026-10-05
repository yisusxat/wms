'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Clock,
  FileText,
  LifeBuoy,
  LogOut,
  Moon,
  Scale,
  ScrollText,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CurrentUser } from '../../lib/api';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  OPERATOR: 'Operador',
  VIEWER: 'Visualizador',
};

export function RoleBadge({ role }: { role?: CurrentUser['role'] | string }) {
  if (!role) return null;
  const tone =
    role === 'ADMIN'
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
      : role === 'SUPERVISOR'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
        : role === 'VIEWER'
          ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      Rol: {role}
    </span>
  );
}

export function UserMenu({
  email,
  role,
  isDark,
  soundOn,
  onToggleTheme,
  onToggleSound,
  onOpenAudit,
  onOpenSupport,
  onOpenLegal,
  onRevokeAll,
  onSignOut,
}: {
  email?: string;
  role?: CurrentUser['role'];
  isDark: boolean;
  soundOn: boolean;
  onToggleTheme: () => void;
  onToggleSound: () => void;
  onOpenAudit?: () => void;
  onOpenSupport: () => void;
  onOpenLegal: () => void;
  onRevokeAll: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (email ?? 'U').slice(0, 1).toUpperCase();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const itemClass =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
          {initial}
        </span>
        <span className="hidden max-w-[140px] truncate md:inline">{email}</span>
        <RoleBadge role={role} />
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {role === 'ADMIN' && onOpenAudit ? (
            <button type="button" className={itemClass} onClick={() => { onOpenAudit(); setOpen(false); }}>
              <ScrollText className="h-4 w-4" /> Auditoría
            </button>
          ) : null}
          <button type="button" className={itemClass} onClick={() => { onOpenSupport(); setOpen(false); }}>
            <LifeBuoy className="h-4 w-4" /> Soporte
          </button>
          <button type="button" className={itemClass} onClick={() => { onOpenLegal(); setOpen(false); }}>
            <Scale className="h-4 w-4" /> Términos y privacidad
          </button>
          <button type="button" className={itemClass} onClick={() => { onToggleTheme(); }}>
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDark ? 'Modo claro' : 'Modo oscuro'}
          </button>
          <button type="button" className={itemClass} onClick={() => { onToggleSound(); }}>
            {soundOn ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {soundOn ? 'Silenciar sonidos' : 'Activar sonidos'}
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-slate-400" /> Inactividad
            </span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">15 min</span>
          </div>
          <button type="button" className={itemClass} onClick={() => { onRevokeAll(); setOpen(false); }}>
            <FileText className="h-4 w-4" /> Cerrar en todos
          </button>
          <button
            type="button"
            className={`${itemClass} text-red-700 dark:text-red-400`}
            onClick={() => { onSignOut(); setOpen(false); }}
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      ) : null}
    </div>
  );
}
