'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { apiFetch, Location, LocationRack, Page, InventoryItem, normalizeLocationCode } from '../../lib/api';

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  OCCUPIED: 'Ocupada',
  BLOCKED: 'Bloqueada',
  MAINTENANCE: 'Mantención',
};

function colorFor(status: string) {
  if (status === 'OCCUPIED') return '#EF4444';
  if (status === 'BLOCKED') return '#64748B';
  if (status === 'MAINTENANCE') return '#F59E0B';
  return '#22C55E';
}

function textColorFor(status: string) {
  return status === 'AVAILABLE' || status === 'MAINTENANCE' ? '#052E16' : '#FFFFFF';
}

type RackGroup = {
  id: string;
  rack: LocationRack;
  aisleCode: string;
  locations: Location[];
};

function rackFromLocation(location: Location): LocationRack {
  const parts = location.code.split('-');
  return location.rack ?? {
    id: `rack-${parts.slice(0, 3).join('-')}`,
    code: parts[2] ?? parts[1] ?? '01',
    name: parts.slice(0, 3).join('-'),
    levels: Math.max(location.level, 1),
    positions: Math.max(location.position, 1),
    aisle: { code: parts[0] ?? 'A' },
  };
}

function buildRackGroups(locations: Location[]) {
  const groups = new Map<string, RackGroup>();
  for (const location of locations) {
    const rack = rackFromLocation(location);
    const aisleCode = rack.aisle?.code ?? location.code.split('-')[0] ?? 'A';
    const existing = groups.get(rack.id);
    if (existing) {
      existing.locations.push(location);
    } else {
      groups.set(rack.id, { id: rack.id, rack, aisleCode, locations: [location] });
    }
  }
  return [...groups.values()].sort((a, b) => `${a.aisleCode}-${a.rack.code}`.localeCompare(`${b.aisleCode}-${b.rack.code}`));
}

function RackStructure({ group, position, onSelect }: { group: RackGroup; position: [number, number, number]; onSelect: (location: Location) => void }) {
  const levels = Math.max(group.rack.levels, 1);
  const positions = Math.max(group.rack.positions, 1);
  const slotWidth = Math.max(0.38, Math.min(0.62, 8 / positions));
  const width = slotWidth * positions;
  const depth = 1.25;
  const shelfGap = 1;
  const rackHeight = levels * shelfGap + 0.35;
  const shelf = (level: number) => 0.12 + (level - 1) * shelfGap;

  return (
    <group position={position}>
      {[-1, 1].flatMap((side) => [-1, 1].map((front) => (
        <mesh key={`post-${side}-${front}`} position={[side * width / 2, rackHeight / 2, front * depth / 2]}>
          <boxGeometry args={[0.12, rackHeight, 0.12]} />
          <meshStandardMaterial color={front === -1 ? '#334155' : '#475569'} />
        </mesh>
      )))}

      {Array.from({ length: levels }, (_, index) => {
        const level = index + 1;
        return (
          <mesh key={`shelf-${level}`} position={[0, shelf(level), 0]}>
            <boxGeometry args={[width + 0.2, 0.12, depth + 0.15]} />
            <meshStandardMaterial color="#94A3B8" />
          </mesh>
        );
      })}

      {group.locations.map((location) => {
        const x = -width / 2 + (location.position - 0.5) * slotWidth;
        const y = shelf(location.level) + 0.3;
        const color = colorFor(location.status);
        return (
          <group key={location.id}>
            <mesh position={[x, y, 0]} onClick={(event) => { event.stopPropagation(); onSelect(location); }}>
              <boxGeometry args={[slotWidth * 0.86, 0.42, depth * 0.72]} />
              <meshStandardMaterial color={color} roughness={0.62} metalness={0.08} />
            </mesh>
            <Text position={[x, y + 0.27, 0.48]} fontSize={0.12} color={textColorFor(location.status)} anchorX="center" anchorY="middle">
              {location.position}
            </Text>
          </group>
        );
      })}

      <Text position={[0, rackHeight + 0.35, 0]} fontSize={0.2} color="#0F172A" anchorX="center" anchorY="middle">
        {`${group.aisleCode} · Rack ${group.rack.code}`}
      </Text>
    </group>
  );
}

export function Warehouse3D({
  token,
  onError,
  refreshKey,
}: {
  token: string;
  onError: (value: string) => void;
  refreshKey?: number;
}) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [inventoryMap, setInventoryMap] = useState<Map<string, InventoryItem>>(new Map());
  const [totalUnits, setTotalUnits] = useState<number>(0);
  const [selected, setSelected] = useState<Location | null>(null);

  const refresh3D = useCallback(() => {
    Promise.all([
      apiFetch<Page<Location>>('/locations?pageSize=500', token),
      apiFetch<Page<InventoryItem>>('/inventory?pageSize=500', token).catch(() => ({ items: [], total: 0, page: 1, pageSize: 500 })),
    ])
      .then(([locPage, invPage]) => {
        const invM = new Map<string, InventoryItem>();
        let sumUnits = 0;
        for (const item of (invPage?.items ?? [])) {
          if (!item || (item.quantity || 0) <= 0) continue;
          sumUnits += item.quantity || 0;
          if (item.location && typeof item.location === 'object') {
            if (item.location.code) {
              invM.set(item.location.code, item);
              invM.set(normalizeLocationCode(item.location.code), item);
            }
            if (item.location.id) {
              invM.set(item.location.id, item);
            }
          }
        }
        setInventoryMap(invM);
        setTotalUnits(sumUnits);

        if (locPage?.items && locPage.items.length > 0) {
          const liveLocs = locPage.items.map((loc) => {
            const hasStock = invM.has(loc.code) || invM.has(normalizeLocationCode(loc.code)) || invM.has(loc.id);
            let computedStatus = loc.status;
            if (hasStock && loc.status === 'AVAILABLE') {
              computedStatus = 'OCCUPIED';
            } else if (!hasStock && loc.status === 'OCCUPIED') {
              computedStatus = 'AVAILABLE';
            }
            return { ...loc, status: computedStatus };
          });
          setLocations(liveLocs);
        }
      })
      .catch((error: Error) => onError(error.message));
  }, [token, onError]);

  useEffect(() => {
    refresh3D();
  }, [refresh3D, refreshKey]);

  const groups = useMemo(() => buildRackGroups(locations), [locations]);
  const aisleCodes = useMemo(() => [...new Set(groups.map((group) => group.aisleCode))], [groups]);
  const stats = useMemo(() => locations.reduce((result, location) => {
    result[location.status] = (result[location.status] ?? 0) + 1;
    return result;
  }, {} as Record<string, number>), [locations]);

  const rackSpacingX = 9.5;
  const aisleSpacingZ = 5.5;

  return (
    <section className="space-y-4">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
        {(['AVAILABLE', 'OCCUPIED', 'BLOCKED', 'MAINTENANCE'] as const).map((key) => (
          <div key={key} className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colorFor(key) }} />
              <p className="text-xs text-gray-500">{STATUS_LABELS[key]}s</p>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats[key] ?? 0}</p>
          </div>
        ))}
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-blue-500" />
            <p className="text-xs text-gray-500">Stock Total</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-blue-600">{totalUnits} <span className="text-xs font-normal text-slate-400">uds</span></p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl bg-white px-4 py-3 text-sm shadow-sm border border-slate-100">
        <span className="font-semibold text-slate-700">Leyenda:</span>
        <span className="inline-flex items-center gap-2 text-xs text-slate-600"><i className="h-3 w-3 rounded-full bg-green-500" />Vacía / disponible</span>
        <span className="inline-flex items-center gap-2 text-xs text-slate-600"><i className="h-3 w-3 rounded-full bg-red-500" />Ocupada (con stock)</span>
        <span className="inline-flex items-center gap-2 text-xs text-slate-600"><i className="h-3 w-3 rounded-full bg-slate-500" />Bloqueada</span>
        <span className="inline-flex items-center gap-2 text-xs text-slate-600"><i className="h-3 w-3 rounded-full bg-amber-500" />Mantención</span>
      </div>

      <div className="relative h-[420px] sm:h-[520px] lg:h-[620px] overflow-hidden rounded-xl bg-slate-100 shadow-sm border border-slate-200">
        <Canvas camera={{ position: [15, 11, 19], fov: 48 }}>
          <color attach="background" args={['#F1F5F9']} />
          <ambientLight intensity={1.6} />
          <directionalLight position={[8, 14, 10]} intensity={2.4} />
          <gridHelper args={[42, 42, '#94A3B8', '#CBD5E1']} />
          {groups.map((group) => {
            const aisleIndex = Math.max(0, aisleCodes.indexOf(group.aisleCode));
            const racksInAisle = groups.filter((item) => item.aisleCode === group.aisleCode);
            const rackIndex = racksInAisle.findIndex((item) => item.id === group.id);
            const x = (rackIndex - (racksInAisle.length - 1) / 2) * rackSpacingX;
            const z = (aisleIndex - (aisleCodes.length - 1) / 2) * aisleSpacingZ;
            return <RackStructure key={group.id} group={group} position={[x, 0, z]} onSelect={setSelected} />;
          })}
          <OrbitControls makeDefault target={[0, 2, 0]} minDistance={8} maxDistance={38} />
        </Canvas>

        {locations.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p className="rounded-lg bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">No hay ubicaciones cargadas</p>
          </div>
        )}

        {selected && (() => {
          const invItem = inventoryMap.get(selected.code) ||
            inventoryMap.get(normalizeLocationCode(selected.code)) ||
            inventoryMap.get(selected.id);
          const hasStock = Boolean(invItem && (invItem.quantity || 0) > 0);
          return (
            <aside className="absolute right-4 top-4 w-80 rounded-2xl bg-white/95 p-5 shadow-xl border border-slate-200 backdrop-blur-sm z-10">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Posición Seleccionada</span>
                  <h3 className="text-xl font-black text-slate-800">{selected.code}</h3>
                </div>
                <button
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                  onClick={() => setSelected(null)}
                >
                  ✕
                </button>
              </div>

              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Estado:</span>
                  <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: colorFor(selected.status) }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(selected.status) }} />
                    {STATUS_LABELS[selected.status] ?? selected.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ubicación física:</span>
                  <span className="font-medium text-slate-700">Nivel {selected.level} · Posición {selected.position}</span>
                </div>

                {hasStock && invItem?.product ? (
                  <div className="mt-3 rounded-xl bg-blue-50/80 p-3.5 border border-blue-100 space-y-1">
                    <p className="text-xs font-bold text-blue-900">{invItem.product.name}</p>
                    <p className="text-[10px] text-blue-700 font-mono">SKU: {invItem.product.sku}</p>
                    <div className="mt-2 flex items-baseline justify-between border-t border-blue-100/60 pt-2">
                      <span className="text-[11px] text-slate-600">Stock almacenado:</span>
                      <span className="text-sm font-black text-blue-950">
                        {invItem.quantity} {invItem.product.unit || 'u'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 text-center text-slate-500 text-xs">
                    Posición vacía disponible para almacenamiento
                  </div>
                )}
              </div>
            </aside>
          );
        })()}
      </div>

      <p className="text-sm text-gray-500">Cada rack y posición se construye desde los datos de la bodega. Haz clic en una posición para ver su detalle en tiempo real y usa el mouse para orbitar o hacer zoom.</p>
    </section>
  );
}
