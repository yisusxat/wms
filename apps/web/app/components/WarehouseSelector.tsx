'use client';

import { Building2 } from 'lucide-react';
import { useWarehouse } from '../../lib/WarehouseContext';

/**
 * Selector compacto de almacén activo para la barra de navegación.
 * Solo se muestra si hay más de 1 bodega disponible.
 */
export function WarehouseSelector() {
  const { warehouses, activeWarehouse, setActiveWarehouse, loading } = useWarehouse();

  // Si solo hay 1 bodega o está cargando, no mostrar el selector
  if (loading || warehouses.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 transition dark:border-slate-700 dark:bg-slate-800">
      <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-slate-500 dark:text-slate-400" />
      <select
        value={activeWarehouse?.id ?? ''}
        onChange={(e) => {
          const w = warehouses.find((wh) => wh.id === e.target.value);
          if (w) setActiveWarehouse(w);
        }}
        className="cursor-pointer bg-transparent text-xs font-semibold text-slate-700 outline-none dark:text-slate-200"
        aria-label="Seleccionar almacén activo"
      >
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  );
}
