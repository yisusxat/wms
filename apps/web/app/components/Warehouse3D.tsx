'use client';

import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { apiFetch, Location, Page } from '../../lib/api';

function colorFor(status: string) { return status === 'OCCUPIED' ? '#2563EB' : status === 'BLOCKED' ? '#DC2626' : status === 'MAINTENANCE' ? '#F59E0B' : '#CBD5E1'; }

function LocationBox({ location, index, onSelect }: { location: Location; index: number; onSelect: (location: Location) => void }) {
  const aisle = Math.floor(index / 30); const position = index % 30; const x = (position % 15) * 0.9 - 6.3; const z = Math.floor(position / 15) * 1.5 + aisle * 2.4 - 4; const y = Math.max(0, location.level - 1) * 0.65;
  return <mesh position={[x, y, z]} onClick={() => onSelect(location)}><boxGeometry args={[0.7, 0.45, 1]} /><meshStandardMaterial color={colorFor(location.status)} /><Text position={[0, 0.3, 0]} fontSize={0.11} color="#111111" rotation={[-Math.PI / 2, 0, 0]}>{location.code}</Text></mesh>;
}

export function Warehouse3D({ token, onError }: { token: string; onError: (value: string) => void }) {
  const [locations, setLocations] = useState<Location[]>([]); const [selected, setSelected] = useState<Location | null>(null);
  useEffect(() => { void apiFetch<Page<Location>>('/locations?pageSize=148', token).then(page => setLocations(page.items)).catch((e: Error) => onError(e.message)); }, [token]);
  const stats = useMemo(() => locations.reduce((result, location) => { result[location.status] = (result[location.status] ?? 0) + 1; return result; }, {} as Record<string, number>), [locations]);
  return <section className="space-y-4"><div className="grid gap-3 sm:grid-cols-4">{[['AVAILABLE', 'Disponibles'], ['OCCUPIED', 'Ocupadas'], ['BLOCKED', 'Bloqueadas'], ['MAINTENANCE', 'Mantención']].map(([key, label]) => <div key={key} className="rounded-xl bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold">{stats[key] ?? 0}</p></div>)}</div><div className="relative h-[620px] overflow-hidden rounded-xl bg-slate-100 shadow-sm"><Canvas camera={{ position: [0, 11, 15], fov: 48 }}><ambientLight intensity={1.5} /><directionalLight position={[5, 12, 8]} intensity={2} /><gridHelper args={[25, 25, '#94A3B8', '#CBD5E1']} />{locations.map((location, index) => <LocationBox key={location.id} location={location} index={index} onSelect={setSelected} />)}<OrbitControls makeDefault /></Canvas>{selected && <aside className="absolute right-4 top-4 w-64 rounded-xl bg-white p-4 shadow-lg"><button className="float-right text-gray-500" onClick={() => setSelected(null)}>×</button><p className="text-xs uppercase text-gray-500">Ubicación</p><h3 className="mt-1 text-xl font-bold">{selected.code}</h3><p className="mt-2 text-sm">Estado: <strong>{selected.status}</strong></p><p className="text-sm">Nivel {selected.level} · Posición {selected.position}</p></aside>}</div><p className="text-sm text-gray-500">Selecciona una ubicación y usa el mouse para orbitar o hacer zoom.</p></section>;
}
