'use client';

import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { apiFetch, Location, LocationRack, Page } from '../../lib/api';

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
  const [selected, setSelected] = useState<Location | null>(null);
  const groups = useMemo(() => buildRackGroups(locations), [locations]);
  const aisleCodes = useMemo(() => [...new Set(groups.map((group) => group.aisleCode))], [groups]);
  const stats = useMemo(() => locations.reduce((result, location) => {
    result[location.status] = (result[location.status] ?? 0) + 1;
    return result;
  }, {} as Record<string, number>), [locations]);

  useEffect(() => {
    void apiFetch<Page<Location>>('/locations?pageSize=500', token)
      .then((page) => setLocations(page.items))
      .catch((error: Error) => onError(error.message));
  }, [onError, token, refreshKey]);

  const rackSpacingX = 9.5;
  const aisleSpacingZ = 5.5;

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {(['AVAILABLE', 'OCCUPIED', 'BLOCKED', 'MAINTENANCE'] as const).map((key) => (
          <div key={key} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colorFor(key) }} />
              <p className="text-xs text-gray-500">{STATUS_LABELS[key]}s</p>
            </div>
            <p className="mt-1 text-2xl font-bold">{stats[key] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
        <span className="font-semibold">Leyenda:</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-green-500" />Vacía / disponible</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-red-500" />Ocupada</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-slate-500" />Bloqueada</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-amber-500" />Mantención</span>
      </div>

      <div className="relative h-[420px] sm:h-[520px] lg:h-[620px] overflow-hidden rounded-xl bg-slate-100 shadow-sm">
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

        {selected && (
          <aside className="absolute right-4 top-4 w-72 rounded-xl bg-white p-4 shadow-lg">
            <button className="float-right text-gray-500" onClick={() => setSelected(null)}>×</button>
            <p className="text-xs uppercase text-gray-500">Posición seleccionada</p>
            <h3 className="mt-1 text-xl font-bold">{selected.code}</h3>
            <p className="mt-2 text-sm">Estado: <strong>{STATUS_LABELS[selected.status] ?? selected.status}</strong></p>
            <p className="text-sm">Nivel {selected.level} · Posición {selected.position}</p>
            <div className="mt-3 flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: colorFor(selected.status) }} />Color de estado</div>
          </aside>
        )}
      </div>

      <p className="text-sm text-gray-500">Cada rack y posición se construye desde los datos de la bodega. Haz clic en una posición y usa el mouse para orbitar o hacer zoom.</p>
    </section>
  );
}
