// apps/web/lib/queryKeys.ts
export const QK = {
  products:    (params?: Record<string, unknown>) => ['products', params] as const,
  inventory:   (params?: Record<string, unknown>) => ['inventory', params] as const,
  movements:   (params?: Record<string, unknown>) => ['movements', params] as const,
  locations:   ()                                  => ['locations'] as const,
  summary:     ()                                  => ['dashboard', 'summary'] as const,
  kpis:        ()                                  => ['dashboard', 'kpis'] as const,
  reports:     (type: string)                      => ['reports', type] as const,
  warehouses:  ()                                  => ['warehouses'] as const,
  team:        ()                                  => ['team'] as const,
} as const;
