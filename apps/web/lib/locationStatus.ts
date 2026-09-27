export const LOCATION_STATUS_STYLES: Record<
  string,
  { bg: string; text: string; border: string; label: string; badgeBg: string; badgeText: string; className: string }
> = {
  AVAILABLE: {
    bg: '#94A3B8',
    text: '#FFFFFF',
    border: '#64748B',
    label: 'Disponible',
    badgeBg: '#F1F5F9',
    badgeText: '#334155',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  OCCUPIED: {
    bg: '#2563EB',
    text: '#FFFFFF',
    border: '#1D4ED8',
    label: 'Ocupada',
    badgeBg: '#DBEAFE',
    badgeText: '#1E40AF',
    className: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  BLOCKED: {
    bg: '#DC2626',
    text: '#FFFFFF',
    border: '#B91C1C',
    label: 'Bloqueada',
    badgeBg: '#FEE2E2',
    badgeText: '#991B1B',
    className: 'bg-red-100 text-red-800 border-red-300',
  },
  MAINTENANCE: {
    bg: '#D97706',
    text: '#FFFFFF',
    border: '#B45309',
    label: 'Mantenimiento',
    badgeBg: '#FEF3C7',
    badgeText: '#92400E',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  TRANSIT: {
    bg: '#0EA5E9',
    text: '#FFFFFF',
    border: '#0284C7',
    label: 'En tránsito',
    badgeBg: '#E0F2FE',
    badgeText: '#075985',
    className: 'bg-sky-100 text-sky-800 border-sky-300',
  },
};

export function locationStatusLabel(status: string): string {
  return LOCATION_STATUS_STYLES[status]?.label ?? status;
}

export function locationStatusClass(status: string): string {
  return LOCATION_STATUS_STYLES[status]?.className ?? 'bg-slate-100 text-slate-700 border-slate-300';
}
