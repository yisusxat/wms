// apps/web/lib/hooks/useWmsQuery.ts
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';
import { QK } from '../queryKeys';

// ─── Tipos básicos reutilizados ───────────────────────────────────────────────
interface Page<T> { data: T[]; total: number; page: number; pageSize: number; }

// ─── Queries de solo lectura ──────────────────────────────────────────────────

export function useProducts(token: string, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: QK.products(params),
    queryFn:  () => apiFetch<Page<Record<string, unknown>>>(
      `/products?pageSize=200${params ? '&' + new URLSearchParams(params as Record<string, string>).toString() : ''}`,
      token
    ),
    enabled:  !!token,
    staleTime: 30_000,
  });
}

export function useInventory(token: string, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: QK.inventory(params),
    queryFn:  () => apiFetch<Page<Record<string, unknown>>>(
      `/inventory?pageSize=500${params ? '&' + new URLSearchParams(params as Record<string, string>).toString() : ''}`,
      token
    ),
    enabled:       !!token,
    staleTime:     30_000,
    refetchInterval: 60_000,
  });
}

export function useMovements(token: string, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: QK.movements(params),
    queryFn:  () => apiFetch<Page<Record<string, unknown>>>(
      `/movements?pageSize=100${params ? '&' + new URLSearchParams(params as Record<string, string>).toString() : ''}`,
      token
    ),
    enabled:  !!token,
    staleTime: 15_000,
  });
}

export function useLocations(token: string) {
  return useQuery({
    queryKey: QK.locations(),
    queryFn:  () => apiFetch<Record<string, unknown>[]>('/locations?pageSize=500', token),
    enabled:  !!token,
    staleTime: 60_000,
  });
}

export function useDashboardSummary(token: string) {
  return useQuery({
    queryKey: QK.summary(),
    queryFn:  () => apiFetch<Record<string, unknown>>('/dashboard/summary', token),
    enabled:  !!token,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useDashboardKpis(token: string) {
  return useQuery({
    queryKey: QK.kpis(),
    queryFn:  () => apiFetch<Record<string, unknown>>('/dashboard/kpis', token),
    enabled:  !!token,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useTeam(token: string) {
  return useQuery({
    queryKey: QK.team(),
    queryFn:  () => apiFetch<Record<string, unknown>[]>('/team', token),
    enabled:  !!token,
    staleTime: 30_000,
  });
}

export function useWarehouses(token: string) {
  return useQuery({
    queryKey: QK.warehouses(),
    queryFn:  () => apiFetch<Record<string, unknown>[]>('/warehouses', token),
    enabled:  !!token,
    staleTime: 300_000,
  });
}

// ─── Mutaciones con invalidación en cascada ───────────────────────────────────

export function useCreateMovement(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch('/movements', token, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}

export function useCreateProduct(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch('/products', token, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProduct(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown> & { id: string }) =>
      apiFetch(`/products/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteProduct(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/products/${id}`, token, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
