'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, Location, LocationRack, Page } from '../../lib/api';

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  AVAILABLE: { bg: '#22C55E', text: '#FFFFFF', border: '#16A34A', label: 'Disponible' },
  OCCUPIED: { bg: '#EF4444', text: '#FFFFFF', border: '#DC2626', label: 'Ocupada' },
  BLOCKED: { bg: '#64748B', text: '#FFFFFF', border: '#475569', label: 'Bloqueada' },
  MAINTENANCE: { bg: '#F59E0B', text: '#FFFFFF', border: '#D97706', label: 'Mantención' },
};

type TooltipInfo = {
  location: Location;
  x: number;
  y: number;
};

export function Warehouse2D({ token, onError }: { token: string; onError: (value: string) => void }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Location | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [levelFilter, setLevelFilter] = useState<'all' | '1' | '2'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [orderAsc, setOrderAsc] = useState(true); // Pos 1 at top or bottom

  useEffect(() => {
    setLoading(true);
    apiFetch<Page<Location>>('/locations?pageSize=500', token)
      .then((page) => {
        setLocations(page.items);
      })
      .catch((err: Error) => onError(err.message))
      .finally(() => setLoading(false));
  }, [token, onError]);

  // Index locations by "Aisle-RackCode-Level-Position"
  const locationMap = useMemo(() => {
    const map = new Map<string, Location>();
    for (const loc of locations) {
      const parts = loc.code.split('-');
      const aisle = parts[0] ?? loc.rack?.aisle?.code ?? 'A';
      const rack = parts[1] ?? loc.rack?.code ?? 'C';
      const level = loc.level;
      const pos = loc.position;
      map.set(`${aisle}-${rack}-${level}-${pos}`, loc);
    }
    return map;
  }, [locations]);

  // Stats calculation
  const stats = useMemo(() => {
    return locations.reduce(
      (acc, loc) => {
        acc[loc.status] = (acc[loc.status] ?? 0) + 1;
        return acc;
      },
      { AVAILABLE: 0, OCCUPIED: 0, BLOCKED: 0, MAINTENANCE: 0 } as Record<string, number>
    );
  }, [locations]);

  // Helper to get location by parameters
  const getLocation = (aisle: string, rack: string, level: number, position: number) => {
    return locationMap.get(`${aisle}-${rack}-${level}-${position}`);
  };

  // Check if a location matches current filters
  const isMatch = (loc?: Location) => {
    if (!loc) return false;
    if (statusFilter !== 'all' && loc.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (!loc.code.toLowerCase().includes(q)) return false;
    }
    return true;
  };

  const isHighlighted = (loc?: Location) => {
    if (!loc || !searchQuery.trim()) return false;
    return loc.code.toLowerCase().includes(searchQuery.trim().toLowerCase());
  };

  // Positions ranges
  const wallPositions = useMemo(() => {
    const arr = Array.from({ length: 22 }, (_, i) => i + 1);
    return orderAsc ? arr : [...arr].reverse();
  }, [orderAsc]);

  const centralPositions = useMemo(() => {
    const arr = Array.from({ length: 15 }, (_, i) => i + 1);
    return orderAsc ? arr : [...arr].reverse();
  }, [orderAsc]);

  // Render a single position square
  const renderSquare = (aisle: string, rack: string, level: number, position: number) => {
    const loc = getLocation(aisle, rack, level, position);
    if (!loc) {
      return (
        <div
          key={`${level}-${position}`}
          className="h-7 w-7 rounded border border-dashed border-slate-200 bg-slate-50 opacity-40"
        />
      );
    }

    const matched = isMatch(loc);
    const highlighted = isHighlighted(loc);
    const isSelected = selected?.id === loc.id;
    const statusCfg = STATUS_COLORS[loc.status] ?? STATUS_COLORS.AVAILABLE;

    return (
      <button
        key={loc.id}
        type="button"
        style={{
          backgroundColor: statusCfg.bg,
          borderColor: isSelected ? '#1E3A8A' : statusCfg.border,
          opacity: statusFilter !== 'all' && !matched ? 0.25 : 1,
        }}
        className={`relative flex h-7 w-7 items-center justify-center rounded text-[10px] font-bold text-white transition-all duration-150 hover:z-20 hover:scale-125 hover:shadow-lg focus:outline-none ${
          isSelected ? 'z-10 ring-4 ring-blue-500/50 scale-110' : 'border'
        } ${highlighted ? 'ring-4 ring-amber-400 animate-pulse' : ''}`}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setTooltip({
            location: loc,
            x: rect.right + 10,
            y: rect.top,
          });
        }}
        onMouseLeave={() => setTooltip(null)}
        onClick={() => setSelected(loc)}
      >
        <span className="drop-shadow-sm">{String(position).padStart(2, '0')}</span>
      </button>
    );
  };

  return (
    <section className="space-y-4">
      {/* 1. KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(['AVAILABLE', 'OCCUPIED', 'BLOCKED', 'MAINTENANCE'] as const).map((key) => {
          const cfg = STATUS_COLORS[key];
          return (
            <div
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
              className={`cursor-pointer rounded-xl bg-white p-4 shadow-sm border transition-all ${
                statusFilter === key ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-100 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{cfg.label}s</span>
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cfg.bg }} />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-800">{stats[key] ?? 0}</p>
            </div>
          );
        })}
      </div>

      {/* 2. Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm border border-slate-100">
        {/* Level Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-slate-500">Niveles:</span>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              onClick={() => setLevelFilter('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                levelFilter === 'all' ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ambos (N1 + N2)
            </button>
            <button
              onClick={() => setLevelFilter('1')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                levelFilter === '1' ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nivel 1 (Piso)
            </button>
            <button
              onClick={() => setLevelFilter('2')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                levelFilter === '2' ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nivel 2 (Superior)
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Buscar código (ej: A-C-01-05)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Orientation Toggle */}
        <button
          onClick={() => setOrderAsc(!orderAsc)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          {orderAsc ? 'Posición: 1 → 22' : 'Posición: 22 → 1'}
        </button>
      </div>

      {/* 3. Main Warehouse 2D Layout Plan */}
      <div className="relative overflow-x-auto rounded-2xl border-4 border-slate-700 bg-slate-100/70 p-6 shadow-inner">
        {loading ? (
          <div className="grid h-96 place-items-center">
            <p className="text-sm font-semibold text-slate-400 animate-pulse">Cargando layout del almacén...</p>
          </div>
        ) : (
          <div className="min-w-[840px] max-w-[1040px] mx-auto">
            {/* Warehouse Header Banner */}
            <div className="mb-4 flex items-center justify-between border-b-2 border-dashed border-slate-300 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Bodega Principal · Vista en Planta (Layout Oficial)
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">148 Posiciones Totales</span>
            </div>

            {/* Layout Grid: 5 Columns (Pared A | Pasillo A | Central | Pasillo B | Pared B) */}
            <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-3 items-start">
              {/* ================= COLUMN 1: RACK PARED PASILLO A (22 POSICIONES) ================= */}
              <div className="rounded-xl border-2 border-slate-800 bg-white p-2.5 shadow-md">
                <div className="mb-2 text-center">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-800">Rack Pared</p>
                  <p className="text-[9px] font-bold text-blue-800">Pasillo A (A-P)</p>
                </div>

                {/* Sub-headers for levels */}
                <div className="mb-1 flex justify-between px-1 text-[9px] font-black text-slate-500">
                  {(levelFilter === 'all' || levelFilter === '1') && <span>N1</span>}
                  <span className="text-[8px] text-slate-400">PASILLO A</span>
                  {(levelFilter === 'all' || levelFilter === '2') && <span>N2</span>}
                </div>

                {/* Grid of 22 positions with vertical middle label */}
                <div className="flex gap-1.5 items-stretch">
                  {/* Level 1 Column */}
                  {(levelFilter === 'all' || levelFilter === '1') && (
                    <div className="flex flex-col gap-1">
                      {wallPositions.map((pos) => renderSquare('A', 'P', 1, pos))}
                    </div>
                  )}

                  {/* Vertical Middle Strip like user diagram */}
                  <div className="flex w-6 flex-col items-center justify-center rounded bg-slate-100 py-2 border border-slate-200">
                    <span
                      style={{ writingMode: 'vertical-rl' }}
                      className="rotate-180 select-none text-[10px] font-black tracking-widest text-slate-600 uppercase"
                    >
                      N i v e l &nbsp; 2 &nbsp; P a s i l l o &nbsp; A
                    </span>
                  </div>

                  {/* Level 2 Column */}
                  {(levelFilter === 'all' || levelFilter === '2') && (
                    <div className="flex flex-col gap-1">
                      {wallPositions.map((pos) => renderSquare('A', 'P', 2, pos))}
                    </div>
                  )}
                </div>
              </div>

              {/* ================= COLUMN 2: PASILLO A ================= */}
              <div className="flex h-full min-h-[640px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-amber-50/20 px-4">
                <div className="flex flex-col items-center gap-6 select-none opacity-80">
                  <span className="text-xl text-slate-300 font-bold">▲</span>
                  <div
                    style={{ writingMode: 'vertical-rl' }}
                    className="rotate-180 text-2xl font-black tracking-widest text-slate-400/90 uppercase"
                  >
                    P a s i l l o &nbsp; A
                  </div>
                  <span className="text-xl text-slate-300 font-bold">▼</span>
                </div>
                <div className="mt-8 text-center text-[10px] text-slate-400 font-mono">
                  Carril de Tránsito
                </div>
              </div>

              {/* ================= COLUMN 3: RACK CENTRAL (15 POSICIONES) ================= */}
              <div className="flex flex-col items-center">
                <div className="rounded-xl border-2 border-slate-800 bg-white p-2.5 shadow-md">
                  <div className="mb-2 text-center">
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-800">Rack Central (Isla)</p>
                    <p className="text-[9px] font-bold text-slate-500">Pasillos A y B (15 Posiciones)</p>
                  </div>

                  <div className="flex gap-2 items-stretch">
                    {/* --- Left Half: Pasillo A (A-C) --- */}
                    <div className="flex gap-1.5 items-stretch border-r-2 border-slate-300 pr-2">
                      {/* Level 1 */}
                      {(levelFilter === 'all' || levelFilter === '1') && (
                        <div className="flex flex-col gap-1">
                          <div className="text-center text-[9px] font-black text-slate-500">N1</div>
                          {centralPositions.map((pos) => renderSquare('A', 'C', 1, pos))}
                        </div>
                      )}

                      {/* Vertical Strip */}
                      <div className="flex w-5 flex-col items-center justify-center rounded bg-blue-50 py-2 border border-blue-100">
                        <span
                          style={{ writingMode: 'vertical-rl' }}
                          className="rotate-180 select-none text-[9px] font-black tracking-widest text-blue-900 uppercase"
                        >
                          N i v e l &nbsp; 2 &nbsp; p a s i l l o &nbsp; A
                        </span>
                      </div>

                      {/* Level 2 */}
                      {(levelFilter === 'all' || levelFilter === '2') && (
                        <div className="flex flex-col gap-1">
                          <div className="text-center text-[9px] font-black text-slate-500">N2</div>
                          {centralPositions.map((pos) => renderSquare('A', 'C', 2, pos))}
                        </div>
                      )}
                    </div>

                    {/* --- Right Half: Pasillo B (B-C) --- */}
                    <div className="flex gap-1.5 items-stretch pl-1">
                      {/* Level 1 */}
                      {(levelFilter === 'all' || levelFilter === '1') && (
                        <div className="flex flex-col gap-1">
                          <div className="text-center text-[9px] font-black text-slate-500">N1</div>
                          {centralPositions.map((pos) => renderSquare('B', 'C', 1, pos))}
                        </div>
                      )}

                      {/* Vertical Strip */}
                      <div className="flex w-5 flex-col items-center justify-center rounded bg-indigo-50 py-2 border border-indigo-100">
                        <span
                          style={{ writingMode: 'vertical-rl' }}
                          className="rotate-180 select-none text-[9px] font-black tracking-widest text-indigo-900 uppercase"
                        >
                          N i v e l &nbsp; 2 &nbsp; p a s i l l o &nbsp; B
                        </span>
                      </div>

                      {/* Level 2 */}
                      {(levelFilter === 'all' || levelFilter === '2') && (
                        <div className="flex flex-col gap-1">
                          <div className="text-center text-[9px] font-black text-slate-500">N2</div>
                          {centralPositions.map((pos) => renderSquare('B', 'C', 2, pos))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Open staging space beneath Central Rack (just like the drawing) */}
                <div className="mt-4 flex w-full flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Área Libre / Maniobra
                  </span>
                </div>
              </div>

              {/* ================= COLUMN 4: PASILLO B ================= */}
              <div className="flex h-full min-h-[640px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-amber-50/20 px-4">
                <div className="flex flex-col items-center gap-6 select-none opacity-80">
                  <span className="text-xl text-slate-300 font-bold">▲</span>
                  <div
                    style={{ writingMode: 'vertical-rl' }}
                    className="rotate-180 text-2xl font-black tracking-widest text-slate-400/90 uppercase"
                  >
                    P a s i l l o &nbsp; B
                  </div>
                  <span className="text-xl text-slate-300 font-bold">▼</span>
                </div>
                <div className="mt-8 text-center text-[10px] text-slate-400 font-mono">
                  Carril de Tránsito
                </div>
              </div>

              {/* ================= COLUMN 5: RACK PARED PASILLO B (22 POSICIONES) ================= */}
              <div className="rounded-xl border-2 border-slate-800 bg-white p-2.5 shadow-md">
                <div className="mb-2 text-center">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-800">Rack Pared</p>
                  <p className="text-[9px] font-bold text-indigo-800">Pasillo B (B-P)</p>
                </div>

                {/* Sub-headers for levels */}
                <div className="mb-1 flex justify-between px-1 text-[9px] font-black text-slate-500">
                  {(levelFilter === 'all' || levelFilter === '1') && <span>N1</span>}
                  <span className="text-[8px] text-slate-400">PASILLO B</span>
                  {(levelFilter === 'all' || levelFilter === '2') && <span>N2</span>}
                </div>

                {/* Grid of 22 positions with vertical middle label */}
                <div className="flex gap-1.5 items-stretch">
                  {/* Level 1 Column */}
                  {(levelFilter === 'all' || levelFilter === '1') && (
                    <div className="flex flex-col gap-1">
                      {wallPositions.map((pos) => renderSquare('B', 'P', 1, pos))}
                    </div>
                  )}

                  {/* Vertical Middle Strip */}
                  <div className="flex w-6 flex-col items-center justify-center rounded bg-slate-100 py-2 border border-slate-200">
                    <span
                      style={{ writingMode: 'vertical-rl' }}
                      className="rotate-180 select-none text-[10px] font-black tracking-widest text-slate-600 uppercase"
                    >
                      N i v e l &nbsp; 2 &nbsp; P a s i l l o &nbsp; B
                    </span>
                  </div>

                  {/* Level 2 Column */}
                  {(levelFilter === 'all' || levelFilter === '2') && (
                    <div className="flex flex-col gap-1">
                      {wallPositions.map((pos) => renderSquare('B', 'P', 2, pos))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ================= BOTTOM GATE: ENTRADA / SALIDA ================= */}
            <div className="mt-6 flex justify-center">
              <div className="w-full max-w-md rounded-xl border-2 border-slate-800 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 p-3 text-center shadow-lg">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm">🚪</span>
                  <span className="text-sm font-black uppercase tracking-widest text-slate-900">
                    Entrada / Salida
                  </span>
                  <span className="text-sm">📦</span>
                </div>
                <p className="mt-0.5 text-[10px] font-medium text-slate-800">
                  Muelle de Carga, Recepción y Despacho
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Floating Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 min-w-[180px] rounded-xl bg-slate-900/95 p-3 text-white shadow-2xl backdrop-blur-sm border border-slate-700"
          style={{ left: Math.min(tooltip.x, window.innerWidth - 200), top: tooltip.y }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
            <span className="font-mono text-sm font-black text-amber-400">{tooltip.location.code}</span>
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[tooltip.location.status]?.bg }}
            />
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <p className="text-slate-300">
              Estado: <strong className="text-white">{STATUS_COLORS[tooltip.location.status]?.label}</strong>
            </p>
            <p className="text-slate-400">
              Nivel: <span className="font-semibold text-white">{tooltip.location.level}</span> · Posición:{' '}
              <span className="font-semibold text-white">{tooltip.location.position}</span>
            </p>
            <p className="text-slate-400">
              Rack: <span className="font-semibold text-white">{tooltip.location.rack?.name ?? tooltip.location.code.split('-')[1]}</span>
            </p>
          </div>
        </div>
      )}

      {/* 5. Selected Location Detail Bar */}
      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-blue-200 bg-blue-50/80 p-4 shadow-sm animate-fadeIn">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold text-white shadow"
              style={{ backgroundColor: STATUS_COLORS[selected.status]?.bg }}
            >
              N{selected.level}
            </div>
            <div>
              <p className="text-xs uppercase font-bold text-blue-900">Ubicación Seleccionada</p>
              <h4 className="text-lg font-black text-slate-800 font-mono">{selected.code}</h4>
              <p className="text-xs text-slate-600">
                Estado: <strong>{STATUS_COLORS[selected.status]?.label}</strong> · Nivel {selected.level} · Posición {selected.position} · Rack {selected.rack?.name ?? selected.code.split('-')[1]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(null)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cerrar detalle
            </button>
          </div>
        </div>
      )}

      {/* 6. Footer Note */}
      <p className="text-xs text-slate-400">
        📌 Plano 2D interactivo: Diseñado a escala respetando la distribución arquitectónica del almacén (Pasillo A, Pasillo B, Rack Central Isla y Entrada/Salida). Haz clic o pasa el cursor sobre cada cuadrado para inspeccionar el estado en tiempo real.
      </p>
    </section>
  );
}
