'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, Location, LocationRack, Page } from '../../lib/api';

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: '#22C55E',
  OCCUPIED: '#EF4444',
  BLOCKED: '#64748B',
  MAINTENANCE: '#F59E0B',
};

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  OCCUPIED: 'Ocupada',
  BLOCKED: 'Bloqueada',
  MAINTENANCE: 'Mantencion',
};

type RackGroup = {
  id: string;
  rack: LocationRack;
  aisleCode: string;
  locations: Location[];
};

function rackFromLocation(location: Location): LocationRack {
  const parts = location.code.split('-');
  return location.rack ?? {
    id: `rack-${parts.slice(0, 2).join('-')}`,
    code: parts[1] ?? 'X',
    name: parts.slice(0, 2).join('-'),
    levels: Math.max(location.level, 1),
    positions: Math.max(location.position, 1),
    aisle: { code: parts[0] ?? 'A' },
  };
}

function buildRackGroups(locations: Location[]): RackGroup[] {
  const groups = new Map<string, RackGroup>();
  for (const location of locations) {
    const rack = rackFromLocation(location);
    const aisleCode = rack.aisle?.code ?? location.code.split('-')[0] ?? 'A';
    const key = `${aisleCode}-${rack.code}`;
    const existing = groups.get(key);
    if (existing) {
      existing.locations.push(location);
      existing.rack.levels = Math.max(existing.rack.levels, location.level);
      existing.rack.positions = Math.max(existing.rack.positions, location.position);
    } else {
      groups.set(key, { id: key, rack: { ...rack }, aisleCode, locations: [location] });
    }
  }
  return [...groups.values()].sort((a, b) =>
    `${a.aisleCode}-${a.rack.code}`.localeCompare(`${b.aisleCode}-${b.rack.code}`)
  );
}

function getLocationAtLevelPosition(group: RackGroup, level: number, position: number): Location | undefined {
  return group.locations.find((l) => l.level === level && l.position === position);
}

type TooltipData = {
  location: Location;
  x: number;
  y: number;
};

function RackGrid({ group, onHover, onClick, selectedId }: {
  group: RackGroup;
  onHover: (data: TooltipData | null) => void;
  onClick: (location: Location) => void;
  selectedId: string | null;
}) {
  const levels = group.rack.levels;
  const positions = group.rack.positions;
  const cellSize = Math.max(18, Math.min(32, Math.floor(200 / positions)));
  const gap = 2;

  return (
    <div className="inline-block">
      <div className="flex flex-col" style={{ gap: `${gap}px` }}>
        {Array.from({ length: levels }, (_, li) => {
          const level = levels - li;
          return (
            <div key={level} className="flex items-center" style={{ gap: `${gap}px` }}>
              <span className="flex-shrink-0 text-right font-mono text-gray-400" style={{ fontSize: '10px', width: '18px' }}>
                N{level}
              </span>
              {Array.from({ length: positions }, (_, pi) => {
                const position = pi + 1;
                const location = getLocationAtLevelPosition(group, level, position);
                const color = location ? (STATUS_COLORS[location.status] ?? '#E2E8F0') : '#E2E8F0';
                const isSelected = location?.id === selectedId;
                return (
                  <div
                    key={position}
                    title={location ? `${location.code} - ${STATUS_LABELS[location.status]}` : `N${level}/P${position}`}
                    style={{
                      width: `${cellSize}px`,
                      height: `${cellSize}px`,
                      backgroundColor: color,
                      border: isSelected ? '2px solid #1E3A8A' : '1px solid rgba(0,0,0,0.12)',
                      borderRadius: '3px',
                      cursor: location ? 'pointer' : 'default',
                      boxShadow: isSelected ? '0 0 0 2px #93C5FD' : undefined,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => {
                      if (location) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        onHover({ location, x: rect.left, y: rect.bottom });
                      }
                    }}
                    onMouseLeave={() => onHover(null)}
                    onClick={() => { if (location) onClick(location); }}
                  >
                    {cellSize >= 24 && (
                      <span style={{ fontSize: '8px', color: 'rgba(0,0,0,0.45)', fontWeight: 600, lineHeight: 1 }}>
                        {position}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        <div className="flex items-center" style={{ gap: `${gap}px` }}>
          <span style={{ width: '18px', flexShrink: 0 }} />
          {Array.from({ length: positions }, (_, pi) => (
            <div key={pi} className="text-center font-mono text-gray-300" style={{ width: `${cellSize}px`, fontSize: '9px', flexShrink: 0 }}>
              {pi + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AisleBlock({ aisleCode, groups, onHover, onClick, selectedId }: {
  aisleCode: string;
  groups: RackGroup[];
  onHover: (data: TooltipData | null) => void;
  onClick: (location: Location) => void;
  selectedId: string | null;
}) {
  const aisleGroups = groups.filter((g) => g.aisleCode === aisleCode);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-full bg-blue-900 px-3 py-0.5 text-xs font-bold text-white">Pasillo {aisleCode}</span>
        <span className="text-xs text-gray-400">{aisleGroups.length} rack(s)</span>
      </div>
      <div className="flex flex-wrap gap-6">
        {aisleGroups.map((group) => (
          <div key={group.id} className="flex flex-col items-start">
            <div className="mb-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              Rack {group.rack.code}
              <span className="ml-1 font-normal text-slate-400">{group.rack.levels}N x {group.rack.positions}P</span>
            </div>
            <RackGrid group={group} onHover={onHover} onClick={onClick} selectedId={selectedId} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Warehouse2D({ token, onError }: { token: string; onError: (value: string) => void }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState<Location | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [loading, setLoading] = useState(true);
  const groups = useMemo(() => buildRackGroups(locations), [locations]);
  const aisleCodes = useMemo(() => [...new Set(groups.map((g) => g.aisleCode))].sort(), [groups]);
  const stats = useMemo(() => locations.reduce((acc, loc) => {
    acc[loc.status] = (acc[loc.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>), [locations]);

  useEffect(() => {
    setLoading(true);
    void apiFetch<Page<Location>>('/locations?pageSize=500', token)
      .then((page) => setLocations(page.items))
      .catch((error: Error) => onError(error.message))
      .finally(() => setLoading(false));
  }, [onError, token]);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {(['AVAILABLE', 'OCCUPIED', 'BLOCKED', 'MAINTENANCE'] as const).map((key) => (
          <div key={key} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[key] }} />
              <p className="text-xs text-gray-500">{STATUS_LABELS[key]}s</p>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats[key] ?? 0}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
        <span className="font-semibold">Leyenda:</span>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded border border-black/10" style={{ backgroundColor: STATUS_COLORS[key] }} />
            {label}
          </span>
        ))}
        <span className="ml-auto text-xs text-gray-400">Cada cuadrado = 1 posicion - Filas = niveles (N)</span>
      </div>
      {loading ? (
        <div className="grid h-48 place-items-center rounded-xl bg-white shadow-sm">
          <p className="text-sm text-gray-400">Cargando layout...</p>
        </div>
      ) : locations.length === 0 ? (
        <div className="grid h-48 place-items-center rounded-xl bg-white shadow-sm">
          <p className="text-sm text-gray-400">No hay ubicaciones registradas</p>
        </div>
      ) : (
        <div className="space-y-4 overflow-x-auto">
          {aisleCodes.map((aisleCode) => (
            <AisleBlock key={aisleCode} aisleCode={aisleCode} groups={groups} onHover={setTooltip} onClick={setSelected} selectedId={selected?.id ?? null} />
          ))}
        </div>
      )}
      {tooltip && (
        <div className="pointer-events-none fixed z-50 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-xl" style={{ left: tooltip.x, top: tooltip.y + 6 }}>
          <p className="font-bold">{tooltip.location.code}</p>
          <p className="mt-0.5 text-slate-300">{STATUS_LABELS[tooltip.location.status] ?? tooltip.location.status}</p>
          <p className="text-slate-400">Nivel {tooltip.location.level} - Posicion {tooltip.location.position}</p>
        </div>
      )}
      {selected && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border border-black/10" style={{ backgroundColor: STATUS_COLORS[selected.status] }} />
          <div className="flex-1">
            <p className="font-bold">{selected.code}</p>
            <p className="text-sm text-gray-600">Estado: <strong>{STATUS_LABELS[selected.status] ?? selected.status}</strong> - Nivel {selected.level} - Posicion {selected.position}</p>
          </div>
          <button className="text-gray-400 hover:text-gray-600" onClick={() => setSelected(null)}>x</button>
        </div>
      )}
      <p className="text-xs text-gray-400">Cada fila dentro del rack representa un nivel (N1 = piso, N2 = segundo nivel). Cada columna es una posicion. Haz clic en un cuadrado para ver el detalle.</p>
    </section>
  );
}
