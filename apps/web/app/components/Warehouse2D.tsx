'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getWarehouseSeedLocations, Location, Page, resolveLocationUuid } from '../../lib/api';
import { Entry2DModal } from './Entry2DModal';
import { Exit2DModal } from './Exit2DModal';
import { MappingModal } from './MappingModal';

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; border: string; label: string; badgeBg: string; badgeText: string }
> = {
  AVAILABLE: {
    bg: '#10B981',
    text: '#FFFFFF',
    border: '#059669',
    label: 'Disponible',
    badgeBg: '#D1FAE5',
    badgeText: '#065F46',
  },
  OCCUPIED: {
    bg: '#EF4444',
    text: '#FFFFFF',
    border: '#DC2626',
    label: 'Ocupada',
    badgeBg: '#FEE2E2',
    badgeText: '#991B1B',
  },
  BLOCKED: {
    bg: '#64748B',
    text: '#FFFFFF',
    border: '#475569',
    label: 'Bloqueada',
    badgeBg: '#F1F5F9',
    badgeText: '#334155',
  },
  MAINTENANCE: {
    bg: '#F59E0B',
    text: '#FFFFFF',
    border: '#D97706',
    label: 'Mantención',
    badgeBg: '#FEF3C7',
    badgeText: '#92400E',
  },
  TRANSIT: {
    bg: '#0EA5E9',
    text: '#FFFFFF',
    border: '#0284C7',
    label: 'En Tránsito',
    badgeBg: '#E0F2FE',
    badgeText: '#0369A1',
  },
};

type TooltipInfo = {
  location: Location;
  x: number;
  y: number;
};

interface Warehouse2DProps {
  token: string;
  onError: (value: string) => void;
  onNavigate?: (tab: string, locationCode?: string) => void;
  onDataChanged?: () => void;
}

export function Warehouse2D({ token, onError, onNavigate, onDataChanged }: Warehouse2DProps) {
  // Pre-seed with all 148 locations so squares are 100% visible immediately
  const [locations, setLocations] = useState<Location[]>(() => getWarehouseSeedLocations());
  const [selected, setSelected] = useState<Location | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [levelFilter, setLevelFilter] = useState<'all' | '1' | '2'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [orderAsc, setOrderAsc] = useState(true);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [exitModalOpen, setExitModalOpen] = useState(false);

  const refreshLocations = () => {
    apiFetch<Page<Location>>('/locations?pageSize=500', token)
      .then((page) => {
        if (page.items && page.items.length > 0) {
          // Merge live statuses
          setLocations((current) => {
            const liveMap = new Map(page.items.map((l) => [l.code, l]));
            return current.map((loc) => liveMap.get(loc.code) ?? loc);
          });
        }
      })
      .catch((err: Error) => {
        console.warn('Live location fetch notice:', err.message);
      });
  };

  // Fetch live updates from API / InsForge
  useEffect(() => {
    refreshLocations();
  }, [token, onError]);

  // Index locations by "Aisle-RackCode-Level-Position"
  const locationMap = useMemo(() => {
    const map = new Map<string, Location>();
    for (const loc of locations) {
      const parts = loc.code.split('-');
      const aisle = parts[0] ?? loc.rack?.aisle?.code ?? 'A';
      const rack = parts[1] ?? loc.rack?.code ?? 'C';
      map.set(`${aisle}-${rack}-${loc.level}-${loc.position}`, loc);
    }
    return map;
  }, [locations]);

  // Dynamic KPI Stats
  const stats = useMemo(() => {
    return locations.reduce(
      (acc, loc) => {
        acc[loc.status] = (acc[loc.status] ?? 0) + 1;
        return acc;
      },
      { AVAILABLE: 0, OCCUPIED: 0, BLOCKED: 0, MAINTENANCE: 0, TRANSIT: 0 } as Record<string, number>
    );
  }, [locations]);

  const getLocation = (aisle: string, rack: string, level: number, position: number): Location => {
    const key = `${aisle}-${rack}-${level}-${position}`;
    const found = locationMap.get(key);
    if (found) return found;

    const code = `${aisle}-${rack}-${String(level).padStart(2, '0')}-${String(position).padStart(2, '0')}`;
    const id = resolveLocationUuid(code) || `${aisle}-${rack}-${level}-${position}`;

    return {
      id,
      code,
      status: 'AVAILABLE',
      level,
      position,
      rack: {
        id: `rack-${aisle}-${rack}`,
        code: rack,
        name: rack === 'C' ? 'Rack Central' : 'Rack Pared',
        levels: 2,
        positions: rack === 'C' ? 15 : 22,
        aisle: { code: aisle },
      },
    };
  };

  // Change location status interactively and persist to database
  const handleStatusChange = (loc: Location, newStatus: string) => {
    setLocations((prev) =>
      prev.map((l) => (l.code === loc.code ? { ...l, status: newStatus } : l))
    );
    if (selected && selected.code === loc.code) {
      setSelected({ ...selected, status: newStatus });
    }

    const locId = resolveLocationUuid(loc.id) || resolveLocationUuid(loc.code) || loc.id;

    // Persist to backend / database
    apiFetch(`/locations/${locId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    })
      .then(() => {
        refreshLocations();
        onDataChanged?.();
      })
      .catch((err: any) => {
        console.warn('Error al persistir estado de ubicación en BD:', err?.message);
      });
  };

  // Filter checks
  const isMatch = (loc: Location) => {
    if (statusFilter !== 'all' && loc.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (!loc.code.toLowerCase().includes(q)) return false;
    }
    return true;
  };

  const isHighlighted = (loc: Location) => {
    if (!searchQuery.trim()) return false;
    return loc.code.toLowerCase().includes(searchQuery.trim().toLowerCase());
  };

  // Row positions: 01 starts from the bottom (Entrada/Salida) and the highest number is at the top (Fondo)
  const wallPositions = useMemo(() => {
    const arr = Array.from({ length: 22 }, (_, i) => 22 - i); // [22, 21, ..., 01]
    return orderAsc ? arr : [...arr].reverse();
  }, [orderAsc]);

  const centralPositions = useMemo(() => {
    const arr = Array.from({ length: 15 }, (_, i) => 15 - i); // [15, 14, ..., 01]
    return orderAsc ? arr : [...arr].reverse();
  }, [orderAsc]);

  // Render an individual interactive position square
  const renderSquare = (aisle: string, rack: string, level: number, position: number) => {
    const loc = getLocation(aisle, rack, level, position);
    const matched = isMatch(loc);
    const highlighted = isHighlighted(loc);
    const isSelected = selected?.code === loc.code;
    const cfg = STATUS_CONFIG[loc.status] ?? STATUS_CONFIG.AVAILABLE;

    return (
      <button
        key={`${aisle}-${rack}-${level}-${position}`}
        type="button"
        title={`${loc.code} · ${cfg.label}`}
        style={{
          backgroundColor: cfg.bg,
          borderColor: isSelected ? '#1E3A8A' : cfg.border,
          opacity: statusFilter !== 'all' && !matched ? 0.2 : 1,
        }}
        className={`relative flex h-8 w-8 items-center justify-center rounded-md text-[11px] font-extrabold text-white shadow-sm transition-all duration-150 cursor-pointer focus:outline-none ${
          isSelected
            ? 'z-30 scale-125 ring-4 ring-blue-500 shadow-xl'
            : 'hover:z-20 hover:scale-125 hover:shadow-lg hover:ring-2 hover:ring-white border'
        } ${highlighted ? 'z-30 scale-125 ring-4 ring-amber-400 animate-pulse shadow-xl' : ''}`}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setTooltip({
            location: loc,
            x: rect.right + 12,
            y: rect.top - 8,
          });
        }}
        onMouseLeave={() => setTooltip(null)}
        onClick={() => setSelected(loc)}
      >
        <span className="drop-shadow-md select-none">{String(position).padStart(2, '0')}</span>
      </button>
    );
  };

  return (
    <section className="space-y-4">
      {/* 1. Header KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(['AVAILABLE', 'OCCUPIED', 'BLOCKED', 'MAINTENANCE'] as const).map((key) => {
          const cfg = STATUS_CONFIG[key];
          const count = stats[key] ?? 0;
          const pct = Math.round((count / locations.length) * 100) || 0;
          const isSelected = statusFilter === key;

          return (
            <div
              key={key}
              onClick={() => setStatusFilter(isSelected ? 'all' : key)}
              className={`cursor-pointer rounded-2xl bg-white p-4 shadow-sm border-2 transition-all ${
                isSelected
                  ? 'border-blue-600 ring-2 ring-blue-100 shadow-md scale-[1.02]'
                  : 'border-slate-100 hover:border-slate-300 hover:shadow'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{cfg.label}s</span>
                <span className="h-3 w-3 rounded-full shadow-sm" style={{ backgroundColor: cfg.bg }} />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <p className="text-3xl font-black text-slate-800">{count}</p>
                <span className="text-xs font-semibold text-slate-400">{pct}% del total</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {isSelected ? '✓ Filtro activo (clic para limpiar)' : 'Clic para filtrar en el plano'}
              </p>
            </div>
          );
        })}
      </div>

      {/* 2. Interactive Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
        {/* Level Tabs */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase text-slate-500">Niveles:</span>
          <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50">
            <button
              onClick={() => setLevelFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                levelFilter === 'all'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              Ambos (N1 + N2)
            </button>
            <button
              onClick={() => setLevelFilter('1')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                levelFilter === '1'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              Nivel 1 (Piso)
            </button>
            <button
              onClick={() => setLevelFilter('2')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                levelFilter === '2'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              Nivel 2 (Superior)
            </button>
          </div>
        </div>

        {/* Quick Search */}
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <input
              type="text"
              placeholder="Buscar por código (ej: A-C-01-05 o 12)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-8 py-2 text-xs font-medium focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {statusFilter !== 'all' && (
            <button
              onClick={() => setStatusFilter('all')}
              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100"
            >
              Limpiar filtro: {STATUS_CONFIG[statusFilter]?.label} ✕
            </button>
          )}

          <button
            onClick={() => setOrderAsc(!orderAsc)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            {orderAsc ? 'Orden: Entrada (01) → Fondo' : 'Orden: Fondo (01) → Entrada'}
          </button>

          <button
            onClick={() => setEntryModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition hover:scale-105 active:scale-95"
            title="Registrar o apartar entrada de mercancía"
          >
            <span>📥</span>
            <span>Entrada de Mercancía</span>
          </button>

          <button
            onClick={() => setExitModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-orange-700 shadow-sm transition hover:scale-105 active:scale-95"
            title="Seleccionar productos y generar reporte de salida"
          >
            <span>📤</span>
            <span>Salida de Producto</span>
          </button>

          <button
            onClick={() => {
              if (onNavigate) {
                onNavigate('mapping');
              }
            }}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 shadow-sm transition hover:scale-105 active:scale-95"
            title="Ir a la sección de Mapeo y Conciliación Física"
          >
            <span>🔍</span>
            <span>Mapeo Almacén →</span>
          </button>
        </div>
      </div>

      {/* 3. Official Warehouse 2D Layout Plan */}
      <div className="md:hidden flex items-center justify-between px-2 py-1 text-xs text-slate-500">
        <span>↔ Desliza horizontalmente para explorar los pasillos</span>
      </div>
      <div className="relative overflow-x-auto rounded-3xl border-4 border-slate-800 bg-slate-100/90 p-6 shadow-2xl">
        <div className="min-w-[880px] max-w-[1060px] mx-auto">
          {/* Header Bar */}
          <div className="mb-5 flex items-center justify-between border-b-2 border-slate-300 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-sm animate-pulse" />
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
                Bodega Principal · Plano de Planta 2D (Layout Oficial)
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-200 px-3 py-1 font-mono text-xs font-bold text-slate-700">
                {locations.length} Posiciones Activas
              </span>
              <span className="text-xs text-slate-500 font-medium">Haz clic en cualquier cuadrado para ver disponibilidad</span>
            </div>
          </div>

          {/* 5-Column Grid */}
          <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-4 items-start">
            {/* ================= COLUMN 1: RACK PARED PASILLO A (22 POSICIONES) ================= */}
            <div className="rounded-2xl border-2 border-slate-800 bg-white p-3 shadow-lg">
              <div className="mb-3 text-center border-b border-slate-100 pb-2">
                <span className="inline-block rounded-full bg-blue-900 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  Rack Pared
                </span>
                <p className="mt-1 text-xs font-black text-slate-800">Pasillo A (A-P)</p>
                <p className="text-[10px] text-slate-400">22 Posiciones × 2 Niveles</p>
              </div>

              {/* Level Headers */}
              <div className="mb-1.5 flex justify-between px-1 text-[10px] font-black text-slate-600">
                {(levelFilter === 'all' || levelFilter === '2') && <span className="w-8 text-center text-blue-900 font-black">N2</span>}
                <span className="flex-1 text-center text-[9px] text-slate-400">PARED ◀ | ▶ PASILLO A</span>
                {(levelFilter === 'all' || levelFilter === '1') && <span className="w-8 text-center text-slate-700">N1</span>}
              </div>

              {/* 22 Rows of Squares with Vertical Strip */}
              <div className="flex gap-2 items-stretch">
                {/* Level 2 Column (Contra la pared) */}
                {(levelFilter === 'all' || levelFilter === '2') && (
                  <div className="flex flex-col gap-1.5">
                    {wallPositions.map((pos) => renderSquare('A', 'P', 2, pos))}
                  </div>
                )}

                {/* Vertical Strip */}
                <div className="flex w-7 flex-col items-center justify-center rounded-lg bg-slate-100 py-3 border border-slate-200">
                  <span
                    style={{ writingMode: 'vertical-rl' }}
                    className="rotate-180 select-none text-[11px] font-black tracking-widest text-slate-700 uppercase"
                  >
                    N i v e l &nbsp; 2 &nbsp; P a s i l l o &nbsp; A
                  </span>
                </div>

                {/* Level 1 Column (Frente a Pasillo A) */}
                {(levelFilter === 'all' || levelFilter === '1') && (
                  <div className="flex flex-col gap-1.5">
                    {wallPositions.map((pos) => renderSquare('A', 'P', 1, pos))}
                  </div>
                )}
              </div>
            </div>

            {/* ================= COLUMN 2: PASILLO A ================= */}
            <div className="flex h-full min-h-[760px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-amber-50/30 px-4">
              <div className="flex flex-col items-center gap-8 select-none opacity-80">
                <span className="text-2xl text-slate-400 font-black">▲</span>
                <div
                  style={{ writingMode: 'vertical-rl' }}
                  className="rotate-180 text-3xl font-black tracking-widest text-slate-500 uppercase drop-shadow-sm"
                >
                  P a s i l l o &nbsp; A
                </div>
                <span className="text-2xl text-slate-400 font-black">▼</span>
              </div>
              <div className="mt-10 rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold text-slate-500 shadow-sm">
                Carril de Tránsito
              </div>
            </div>

            {/* ================= COLUMN 3: RACK CENTRAL ISLA (15 POSICIONES) ================= */}
            <div className="flex flex-col items-center">
              <div className="rounded-2xl border-2 border-slate-800 bg-white p-3 shadow-lg">
                <div className="mb-3 text-center border-b border-slate-100 pb-2">
                  <span className="inline-block rounded-full bg-emerald-800 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                    Rack Central (Isla)
                  </span>
                  <p className="mt-1 text-xs font-black text-slate-800">Pasillos A y B (15 Posiciones)</p>
                  <p className="text-[10px] text-slate-400">Doble Frente × 2 Niveles</p>
                </div>

                <div className="flex gap-3 items-stretch">
                  {/* --- Frente Pasillo A (A-C) --- */}
                  <div className="flex gap-2 items-stretch border-r-2 border-slate-300 pr-3">
                    {/* Level 1 */}
                    {(levelFilter === 'all' || levelFilter === '1') && (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-center text-[10px] font-black text-slate-600 mb-0.5">N1</div>
                        {centralPositions.map((pos) => renderSquare('A', 'C', 1, pos))}
                      </div>
                    )}

                    {/* Vertical Strip */}
                    <div className="flex w-6 flex-col items-center justify-center rounded-lg bg-blue-50 py-3 border border-blue-200">
                      <span
                        style={{ writingMode: 'vertical-rl' }}
                        className="rotate-180 select-none text-[10px] font-black tracking-widest text-blue-900 uppercase"
                      >
                        N i v e l &nbsp; 2 &nbsp; p a s i l l o &nbsp; A
                      </span>
                    </div>

                    {/* Level 2 */}
                    {(levelFilter === 'all' || levelFilter === '2') && (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-center text-[10px] font-black text-slate-600 mb-0.5">N2</div>
                        {centralPositions.map((pos) => renderSquare('A', 'C', 2, pos))}
                      </div>
                    )}
                  </div>

                  {/* --- Frente Pasillo B (B-C) --- */}
                  <div className="flex gap-2 items-stretch pl-1">
                    {/* Level 2 (Detrás / Centro del rack) */}
                    {(levelFilter === 'all' || levelFilter === '2') && (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-center text-[10px] font-black text-blue-900 mb-0.5">N2</div>
                        {centralPositions.map((pos) => renderSquare('B', 'C', 2, pos))}
                      </div>
                    )}

                    {/* Vertical Strip */}
                    <div className="flex w-6 flex-col items-center justify-center rounded-lg bg-indigo-50 py-3 border border-indigo-200">
                      <span
                        style={{ writingMode: 'vertical-rl' }}
                        className="rotate-180 select-none text-[10px] font-black tracking-widest text-indigo-900 uppercase"
                      >
                        N i v e l &nbsp; 2 &nbsp; p a s i l l o &nbsp; B
                      </span>
                    </div>

                    {/* Level 1 (Frente a Pasillo B) */}
                    {(levelFilter === 'all' || levelFilter === '1') && (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-center text-[10px] font-black text-slate-700 mb-0.5">N1</div>
                        {centralPositions.map((pos) => renderSquare('B', 'C', 1, pos))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Open Staging / Maneuver Area under Central Rack */}
              <div className="mt-5 flex w-full flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Área Libre / Maniobra
                </span>
                <span className="mt-1 text-[10px] text-slate-400 font-mono">Zona de tránsito vehicular y traspaletas</span>
              </div>
            </div>

            {/* ================= COLUMN 4: PASILLO B ================= */}
            <div className="flex h-full min-h-[760px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-amber-50/30 px-4">
              <div className="flex flex-col items-center gap-8 select-none opacity-80">
                <span className="text-2xl text-slate-400 font-black">▲</span>
                <div
                  style={{ writingMode: 'vertical-rl' }}
                  className="rotate-180 text-3xl font-black tracking-widest text-slate-500 uppercase drop-shadow-sm"
                >
                  P a s i l l o &nbsp; B
                </div>
                <span className="text-2xl text-slate-400 font-black">▼</span>
              </div>
              <div className="mt-10 rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold text-slate-500 shadow-sm">
                Carril de Tránsito
              </div>
            </div>

            {/* ================= COLUMN 5: RACK PARED PASILLO B (22 POSICIONES) ================= */}
            <div className="rounded-2xl border-2 border-slate-800 bg-white p-3 shadow-lg">
              <div className="mb-3 text-center border-b border-slate-100 pb-2">
                <span className="inline-block rounded-full bg-indigo-900 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  Rack Pared
                </span>
                <p className="mt-1 text-xs font-black text-slate-800">Pasillo B (B-P)</p>
                <p className="text-[10px] text-slate-400">22 Posiciones × 2 Niveles</p>
              </div>

              {/* Level Headers */}
              <div className="mb-1.5 flex justify-between px-1 text-[10px] font-black text-slate-600">
                {(levelFilter === 'all' || levelFilter === '1') && <span className="w-8 text-center text-slate-700">N1</span>}
                <span className="flex-1 text-center text-[9px] text-slate-400">PASILLO B ◀ | ▶ PARED</span>
                {(levelFilter === 'all' || levelFilter === '2') && <span className="w-8 text-center text-blue-900 font-black">N2</span>}
              </div>

              {/* 22 Rows of Squares with Vertical Strip */}
              <div className="flex gap-2 items-stretch">
                {/* Level 1 Column */}
                {(levelFilter === 'all' || levelFilter === '1') && (
                  <div className="flex flex-col gap-1.5">
                    {wallPositions.map((pos) => renderSquare('B', 'P', 1, pos))}
                  </div>
                )}

                {/* Vertical Strip */}
                <div className="flex w-7 flex-col items-center justify-center rounded-lg bg-slate-100 py-3 border border-slate-200">
                  <span
                    style={{ writingMode: 'vertical-rl' }}
                    className="rotate-180 select-none text-[11px] font-black tracking-widest text-slate-700 uppercase"
                  >
                    N i v e l &nbsp; 2 &nbsp; P a s i l l o &nbsp; B
                  </span>
                </div>

                {/* Level 2 Column */}
                {(levelFilter === 'all' || levelFilter === '2') && (
                  <div className="flex flex-col gap-1.5">
                    {wallPositions.map((pos) => renderSquare('B', 'P', 2, pos))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ================= BOTTOM GATE: ENTRADA / SALIDA ================= */}
          <div className="mt-8 flex justify-center">
            <div className="w-full max-w-lg rounded-2xl border-4 border-slate-800 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 p-4 text-center shadow-xl">
              <div className="flex items-center justify-center gap-3">
                <span className="text-xl">🚪</span>
                <span className="text-base font-black uppercase tracking-widest text-slate-900">
                  Entrada / Salida
                </span>
                <span className="text-xl">📦</span>
              </div>
              <p className="mt-1 text-xs font-bold text-slate-800">
                Muelle de Carga, Descarga, Recepción y Despacho
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Floating Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 min-w-[200px] rounded-2xl bg-slate-900/95 p-3.5 text-white shadow-2xl backdrop-blur-md border border-slate-700 animate-fadeIn"
          style={{ left: Math.min(tooltip.x, window.innerWidth - 220), top: tooltip.y }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <span className="font-mono text-base font-black text-amber-400">{tooltip.location.code}</span>
            <span
              className="h-2.5 w-2.5 rounded-full shadow"
              style={{ backgroundColor: STATUS_CONFIG[tooltip.location.status]?.bg }}
            />
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <p className="flex justify-between">
              <span className="text-slate-400">Estado:</span>
              <strong style={{ color: STATUS_CONFIG[tooltip.location.status]?.bg }}>
                {STATUS_CONFIG[tooltip.location.status]?.label}
              </strong>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-400">Nivel:</span>
              <span className="font-bold text-white">
                Nivel {tooltip.location.level} ({tooltip.location.level === 1 ? 'Frente pasillo' : 'Pared / Fondo'})
              </span>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-400">Posición:</span>
              <span className="font-bold text-white">Pos #{tooltip.location.position}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-400">Rack:</span>
              <span className="font-bold text-white">
                {tooltip.location.rack?.name ?? (tooltip.location.code.split('-')[1] === 'C' ? 'Central' : 'Pared')}
              </span>
            </p>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 text-center font-medium">Clic para inspeccionar disponibilidad</p>
        </div>
      )}

      {/* 5. Rich Availability & Position Inspection Modal / Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-900">
                  Inspección de Ubicación
                </span>
                <h3 className="mt-1 text-2xl font-black text-slate-900 font-mono tracking-tight">
                  {selected.code}
                </h3>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-full bg-slate-100 p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              >
                ✕
              </button>
            </div>

            {/* Availability Banner */}
            <div className="mt-5">
              {selected.status === 'AVAILABLE' ? (
                <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-xl text-white shadow-sm">
                      ✓
                    </span>
                    <div>
                      <h4 className="font-black text-emerald-900">UBICACIÓN DISPONIBLE</h4>
                      <p className="text-xs text-emerald-700">
                        Esta posición está 100% vacía y lista para recibir ingresos de mercadería.
                      </p>
                    </div>
                  </div>
                </div>
              ) : selected.status === 'OCCUPIED' ? (
                <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500 text-xl text-white shadow-sm">
                      📦
                    </span>
                    <div>
                      <h4 className="font-black text-rose-900">UBICACIÓN OCUPADA</h4>
                      <p className="text-xs text-rose-700">
                        Posición con stock registrado. No ingresar productos hasta que sea liberada.
                      </p>
                    </div>
                  </div>
                </div>
              ) : selected.status === 'BLOCKED' ? (
                <div className="rounded-2xl border-2 border-slate-300 bg-slate-100 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-600 text-xl text-white shadow-sm">
                      🔒
                    </span>
                    <div>
                      <h4 className="font-black text-slate-900">UBICACIÓN BLOQUEADA</h4>
                      <p className="text-xs text-slate-600">
                        Posición inoperativa por decisión administrativa o restricción física.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-xl text-white shadow-sm">
                      ⚠️
                    </span>
                    <div>
                      <h4 className="font-black text-amber-900">EN MANTENCIÓN</h4>
                      <p className="text-xs text-amber-700">
                        En revisión técnica de estantería o limpieza.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Technical Specifications Grid */}
            <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-xs">
              <div>
                <p className="text-slate-400">Pasillo:</p>
                <p className="font-bold text-slate-800">
                  Pasillo {selected.code.split('-')[0]}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Estructura / Rack:</p>
                <p className="font-bold text-slate-800">
                  {selected.rack?.name ?? (selected.code.split('-')[1] === 'C' ? 'Rack Central (Isla)' : 'Rack Pared')}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Nivel de Estantería:</p>
                <p className="font-bold text-slate-800">
                  Nivel {selected.level} {selected.level === 1 ? '(Frente al pasillo / Acceso inmediato)' : '(Contra la pared / Detrás del Nivel 1)'}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Posición Física:</p>
                <p className="font-bold text-slate-800">
                  Casillero #{selected.position}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Capacidad Máxima:</p>
                <p className="font-bold text-slate-800">1,000 kg (1 Tonelada)</p>
              </div>
              <div>
                <p className="text-slate-400">Tipo de Almacenaje:</p>
                <p className="font-bold text-slate-800">Pallet estándar (1.20m × 1.00m)</p>
              </div>
            </div>

            {/* Quick Status Toggles */}
            <div className="mt-5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Cambiar Estado Operacional en Tiempo Real:
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['AVAILABLE', 'OCCUPIED', 'BLOCKED', 'MAINTENANCE'] as const).map((st) => {
                  const cfg = STATUS_CONFIG[st];
                  const isActive = selected.status === st;

                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleStatusChange(selected, st)}
                      style={{
                        backgroundColor: isActive ? cfg.bg : '#F8FAFC',
                        color: isActive ? '#FFFFFF' : '#334155',
                        borderColor: isActive ? cfg.border : '#E2E8F0',
                      }}
                      className="rounded-xl border py-2 text-xs font-bold shadow-sm transition hover:scale-105 active:scale-95"
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const targetCode = selected?.code ?? null;
                  setSelected(null);
                  if (onNavigate) {
                    onNavigate('mapping', targetCode ?? undefined);
                  }
                }}
                className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
              >
                <span>🔍</span>
                <span>Auditar Posición en Mapeo →</span>
              </button>

              <button
                onClick={() => setSelected(null)}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-slate-800 transition"
              >
                Cerrar Inspección
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Entry 2D Merchandise Modal */}
      <Entry2DModal
        isOpen={entryModalOpen}
        onClose={() => setEntryModalOpen(false)}
        token={token}
        locations={locations}
        onSuccess={(assigned, mode) => {
          if (mode === 'TRANSIT') {
            // Asignar estado temporal en tránsito en memoria para el plano
            const assignedCodes = new Set(assigned.map((a) => a.code));
            setLocations((current) =>
              current.map((loc) =>
                assignedCodes.has(loc.code) ? { ...loc, status: 'TRANSIT' } : loc
              )
            );
          } else {
            // Confirmado directamente en la base de datos
            refreshLocations();
            onDataChanged?.();
          }
        }}
      />

      {/* 5. Exit 2D Merchandise Modal */}
      <Exit2DModal
        isOpen={exitModalOpen}
        onClose={() => setExitModalOpen(false)}
        token={token}
        onSuccess={() => {
          refreshLocations();
          onDataChanged?.();
        }}
      />
    </section>
  );
}
