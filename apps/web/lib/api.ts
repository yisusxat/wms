const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? 'No fue posible completar la operación');
  return payload as T;
}

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type Product = { id: string; sku: string; name: string; unit: string; active: boolean };
export type Location = { id: string; code: string; status: string; level: number; position: number };
export type InventoryItem = { id: string; quantity: number; reservedQuantity: number; product: Product; location: Location };
export type Movement = { id: string; type: string; quantity: number; createdAt: string; product: Product; sourceLocation?: Location; destinationLocation?: Location; reason?: string };
export type CurrentUser = { id: string; email?: string; name?: string; role: 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'VIEWER' };
