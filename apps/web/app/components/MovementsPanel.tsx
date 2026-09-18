'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, Location, Movement, Page, Product } from '../../lib/api';

type Mode = 'entry' | 'exit' | 'transfer' | 'adjustment';

export function MovementsPanel({ token, onError }: { token: string; onError: (value: string) => void }) {
  const [mode, setMode] = useState<Mode>('entry');
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [movements, setMovements] = useState<Page<Movement> | null>(null);
  const [form, setForm] = useState({ productId: '', locationId: '', destinationLocationId: '', quantity: 1, delta: 1, reason: '', reference: '' });

  const loadMovements = () => apiFetch<Page<Movement>>('/movements?pageSize=100', token).then(setMovements).catch((e: Error) => onError(e.message));
  useEffect(() => {
    void Promise.all([
      apiFetch<Page<Product>>('/products?pageSize=100', token),
      apiFetch<Page<Location>>('/locations?pageSize=100', token),
      loadMovements(),
    ]).then(([productPage, locationPage]) => {
      setProducts(productPage.items); setLocations(locationPage.items);
      setForm(current => ({ ...current, productId: current.productId || productPage.items[0]?.id || '', locationId: current.locationId || locationPage.items[0]?.id || '', destinationLocationId: current.destinationLocationId || locationPage.items[1]?.id || '' }));
    }).catch((e: Error) => onError(e.message));
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = mode === 'transfer'
      ? { productId: form.productId, sourceLocationId: form.locationId, destinationLocationId: form.destinationLocationId, quantity: form.quantity, reason: form.reason, reference: form.reference }
      : mode === 'adjustment'
        ? { productId: form.productId, locationId: form.locationId, delta: form.delta, reason: form.reason, reference: form.reference }
        : { productId: form.productId, locationId: form.locationId, quantity: form.quantity, reason: form.reason, reference: form.reference };
    try { await apiFetch(`/movements/${mode}`, token, { method: 'POST', body: JSON.stringify(payload) }); await loadMovements(); }
    catch (e) { onError((e as Error).message); }
  }

  const locationLabel = (id: string) => locations.find(location => location.id === id)?.code ?? 'Seleccionar ubicación';
  return <section className="space-y-5">
    <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap gap-2">{(['entry', 'exit', 'transfer', 'adjustment'] as Mode[]).map(item => <button type="button" key={item} onClick={() => setMode(item)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === item ? 'bg-brand text-white' : 'border bg-white'}`}>{({ entry: 'Entrada', exit: 'Salida', transfer: 'Transferencia', adjustment: 'Ajuste' } as Record<Mode, string>)[item]}</button>)}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium">Producto<select required className="mt-1 w-full rounded-lg border p-3" value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })}>{products.map(product => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}</select></label>
        <label className="text-sm font-medium">Ubicación<select required className="mt-1 w-full rounded-lg border p-3" value={form.locationId} onChange={e => setForm({ ...form, locationId: e.target.value })}>{locations.map(location => <option key={location.id} value={location.id}>{location.code} — {location.status}</option>)}</select></label>
        {mode === 'transfer' && <label className="text-sm font-medium">Destino<select required className="mt-1 w-full rounded-lg border p-3" value={form.destinationLocationId} onChange={e => setForm({ ...form, destinationLocationId: e.target.value })}>{locations.filter(location => location.id !== form.locationId).map(location => <option key={location.id} value={location.id}>{location.code} — {location.status}</option>)}</select></label>}
        {mode === 'adjustment' ? <label className="text-sm font-medium">Delta (+/-)<input required type="number" className="mt-1 w-full rounded-lg border p-3" value={form.delta} onChange={e => setForm({ ...form, delta: Number(e.target.value) })} /></label> : <label className="text-sm font-medium">Cantidad<input required min="1" type="number" className="mt-1 w-full rounded-lg border p-3" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></label>}
        <label className="text-sm font-medium">Referencia<input className="mt-1 w-full rounded-lg border p-3" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></label>
        <label className="text-sm font-medium md:col-span-2">Motivo<input className="mt-1 w-full rounded-lg border p-3" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></label>
      </div>
      <p className="text-xs text-gray-500">{mode === 'transfer' ? `Origen: ${locationLabel(form.locationId)} → destino seleccionado` : mode === 'adjustment' ? 'El ajuste positivo suma stock; el negativo descuenta stock disponible.' : 'La operación se registra con el usuario autenticado.'}</p>
      <button className="rounded-lg bg-brand px-4 py-3 font-semibold text-white">Confirmar {({ entry: 'entrada', exit: 'salida', transfer: 'transferencia', adjustment: 'ajuste' } as Record<Mode, string>)[mode]}</button>
    </form>
    <div className="rounded-xl bg-white p-5 shadow-sm"><Table headers={['Tipo', 'Producto', 'Cantidad', 'Origen', 'Destino', 'Fecha']} rows={(movements?.items ?? []).map(item => [item.type, item.product?.sku ?? '-', item.quantity, item.sourceLocation?.code ?? '-', item.destinationLocation?.code ?? '-', new Date(item.createdAt).toLocaleString()])} /></div>
  </section>;
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) { return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-gray-500">{headers.map(header => <th key={header} className="px-3 py-3">{header}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-gray-500">Sin registros</td></tr> : rows.map((row, index) => <tr key={index} className="border-b last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3">{cell}</td>)}</tr>)}</tbody></table></div>; }
