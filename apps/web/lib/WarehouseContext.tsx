'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { apiFetch } from './api';

export interface WarehouseInfo {
  id: string;
  code: string;
  name: string;
  address?: string;
  active: boolean;
}

interface WarehouseContextValue {
  activeWarehouse: WarehouseInfo | null;
  warehouses: WarehouseInfo[];
  loading: boolean;
  setActiveWarehouse: (w: WarehouseInfo) => void;
  loadWarehouses: (token: string) => Promise<void>;
}

const WarehouseContext = createContext<WarehouseContextValue>({
  activeWarehouse: null,
  warehouses: [],
  loading: false,
  setActiveWarehouse: () => {},
  loadWarehouses: async () => {},
});

export function WarehouseProvider({ children }: { children: React.ReactNode }) {
  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>([]);
  const [activeWarehouse, setActiveWarehouseState] = useState<WarehouseInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const setActiveWarehouse = useCallback((w: WarehouseInfo) => {
    setActiveWarehouseState(w);
    // Persistir elección del usuario en localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('wms_active_warehouse_id', w.id);
    }
  }, []);

  const loadWarehouses = useCallback(async (token: string) => {
    if (!token) return;
    setLoading(true);
    try {
      // Intentar con el endpoint del backend
      const data = await apiFetch<WarehouseInfo[]>('/warehouses', token);
      const list = Array.isArray(data) ? data.filter((w) => w.active) : [];
      setWarehouses(list);

      if (list.length > 0) {
        // Restaurar la última bodega seleccionada si existe
        const savedId =
          typeof window !== 'undefined'
            ? localStorage.getItem('wms_active_warehouse_id')
            : null;
        const saved = savedId ? list.find((w) => w.id === savedId) : null;
        setActiveWarehouseState(saved ?? list[0]);
      }
    } catch {
      // Si el endpoint no existe aún, usar bodega por defecto
      const fallback: WarehouseInfo = {
        id: 'default',
        code: 'PRINCIPAL',
        name: 'Bodega Central',
        active: true,
      };
      setWarehouses([fallback]);
      setActiveWarehouseState(fallback);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <WarehouseContext.Provider
      value={{ activeWarehouse, warehouses, loading, setActiveWarehouse, loadWarehouses }}
    >
      {children}
    </WarehouseContext.Provider>
  );
}

export const useWarehouse = () => useContext(WarehouseContext);
