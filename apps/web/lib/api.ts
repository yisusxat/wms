const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
const rawInsforgeUrl = process.env.NEXT_PUBLIC_INSFORGE_URL ?? 'https://jirv3k8h.us-east.insforge.app';
const insforgeUrl = rawInsforgeUrl.replace(/-\w+\.us-east/, '.us-east').replace(/\/$/, '');
const insforgeAnonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ?? 'anon_8c78b5a48a1c49627477ca316a70504fab071593359304c6f8484186628ad952';

export function getWarehouseSeedLocations(): Location[] {
  const rackDefs = [
    { code: 'C', name: 'Rack Central', levels: 2, positions: 15 },
    { code: 'P', name: 'Rack Pared', levels: 2, positions: 22 },
  ];
  return ['A', 'B'].flatMap((aisleCode) =>
    rackDefs.flatMap((def) =>
      Array.from({ length: def.levels }, (_, l) => l + 1).flatMap((level) =>
        Array.from({ length: def.positions }, (_, p) => p + 1).map((position) => ({
          id: `${aisleCode}-${def.code}-${level}-${position}`,
          code: `${aisleCode}-${def.code}-${String(level).padStart(2, '0')}-${String(position).padStart(2, '0')}`,
          status: 'AVAILABLE',
          level,
          position,
          rack: {
            id: `rack-${aisleCode}-${def.code}`,
            code: def.code,
            name: def.name,
            levels: def.levels,
            positions: def.positions,
            aisle: { code: aisleCode },
          },
        }))
      )
    )
  );
}

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type Product = { id: string; sku: string; name: string; unit: string; active: boolean };
export type LocationRack = {
  id: string;
  code: string;
  name?: string;
  levels: number;
  positions: number;
  aisle?: { code: string };
};
export type Location = { id: string; code: string; status: string; level: number; position: number; rack?: LocationRack };
export type InventoryItem = { id: string; quantity: number; reservedQuantity: number; product: Product; location: Location };
export type Movement = { id: string; type: string; quantity: number; createdAt: string; product: Product; sourceLocation?: Location; destinationLocation?: Location; reason?: string };
export type CurrentUser = { id: string; email?: string; name?: string; role: 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'VIEWER' };

export async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const isClient = typeof window !== 'undefined';
  const isLocalHost = isClient && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const apiUrl = configuredApiUrl ? configuredApiUrl.replace(/\/$/, '') : (isLocalHost ? 'http://localhost:3001' : null);

  if (apiUrl) {
    try {
      const response = await fetch(`${apiUrl}/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
      });
      if (response.ok) {
        return (await response.json()) as T;
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 404) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? `Error (${response.status})`);
      }
    } catch (err: any) {
      if (err?.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError') && !err.message.includes('fetch failed')) {
        throw err;
      }
    }
  }

  return fallbackInsforge<T>(path, token, init);
}

async function fallbackInsforge<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: insforgeAnonKey,
  };
  const cleanPath = path.split('?')[0];

  if (cleanPath === '/auth/me') {
    let userId = '';
    let email = '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.sub ?? '';
      email = payload.email ?? '';
    } catch {}

    let name = 'Usuario';
    let role: CurrentUser['role'] = 'ADMIN';

    if (userId) {
      const res = await fetch(`${insforgeUrl}/api/database/records/user_profiles?id=eq.${userId}`, { headers });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0]) {
          name = rows[0].name || name;
          role = rows[0].role || role;
        }
      }
    }

    return { id: userId, email, name, role } as T;
  }

  if (cleanPath === '/dashboard/summary') {
    const [locRes, prodRes, invRes] = await Promise.all([
      fetch(`${insforgeUrl}/api/database/records/locations?select=id,status`, { headers }).catch(() => null),
      fetch(`${insforgeUrl}/api/database/records/products?select=id`, { headers }).catch(() => null),
      fetch(`${insforgeUrl}/api/database/records/inventory?select=quantity`, { headers }).catch(() => null),
    ]);

    const locs: any[] = locRes && locRes.ok ? await locRes.json().catch(() => []) : [];
    const prods: any[] = prodRes && prodRes.ok ? await prodRes.json().catch(() => []) : [];
    const invs: any[] = invRes && invRes.ok ? await invRes.json().catch(() => []) : [];

    const availableLocations = Array.isArray(locs) ? locs.filter((l) => l.status === 'AVAILABLE').length : 0;
    const occupiedLocations = Array.isArray(locs) ? locs.filter((l) => l.status === 'OCCUPIED').length : 0;
    const totalUnits = Array.isArray(invs) ? invs.reduce((acc, i) => acc + (i.quantity || 0), 0) : 0;

    return {
      products: Array.isArray(prods) ? prods.length : 0,
      locations: Array.isArray(locs) ? locs.length : 0,
      occupiedLocations,
      availableLocations,
      totalUnits,
      entriesToday: 0,
      issuesToday: 0,
    } as T;
  }

  if (cleanPath === '/locations') {
    try {
      const res = await fetch(
        `${insforgeUrl}/api/database/records/locations?select=id,code,status,level,position,rack:racks(id,code,name,levels,positions,aisle:aisles(code))&order=code.asc`,
        { headers }
      );
      if (res.ok) {
        const items = await res.json();
        if (Array.isArray(items) && items.length > 0) {
          return { items, total: items.length, page: 1, pageSize: items.length } as T;
        }
      }
    } catch {}

    const seed = getWarehouseSeedLocations();
    return { items: seed, total: seed.length, page: 1, pageSize: seed.length } as T;
  }

  if (cleanPath === '/products') {
    if (init?.method === 'POST' && init.body) {
      const parsed = JSON.parse(init.body as string);
      const res = await fetch(`${insforgeUrl}/api/database/records/products`, {
        method: 'POST',
        headers,
        body: JSON.stringify([parsed]),
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => null);
        throw new Error(errPayload?.message ?? 'Error al registrar producto');
      }
      return (await res.json()) as T;
    }

    const res = await fetch(`${insforgeUrl}/api/database/records/products?order=name.asc`, { headers });
    const items = res.ok ? await res.json().catch(() => []) : [];
    const list = Array.isArray(items) ? items : [];
    return { items: list, total: list.length, page: 1, pageSize: 20 } as T;
  }

  if (cleanPath === '/inventory') {
    const res = await fetch(
      `${insforgeUrl}/api/database/records/inventory?select=id,quantity,reserved_quantity,product:products(*),location:locations(*)`,
      { headers }
    );
    const data = res.ok ? await res.json().catch(() => []) : [];
    const items = Array.isArray(data)
      ? data.map((item: any) => ({
          id: item.id,
          quantity: item.quantity,
          reservedQuantity: item.reserved_quantity ?? 0,
          product: item.product,
          location: item.location,
        }))
      : [];
    return { items, total: items.length, page: 1, pageSize: 100 } as T;
  }

  if (cleanPath === '/movements') {
    const res = await fetch(
      `${insforgeUrl}/api/database/records/movements?select=id,type,quantity,created_at,product:products(*),sourceLocation:locations!source_location_id(*),destinationLocation:locations!destination_location_id(*)&order=created_at.desc`,
      { headers }
    );
    const data = res.ok ? await res.json().catch(() => []) : [];
    const items = Array.isArray(data)
      ? data.map((item: any) => ({
          id: item.id,
          type: item.type,
          quantity: item.quantity,
          createdAt: item.created_at,
          product: item.product,
          sourceLocation: item.sourceLocation,
          destinationLocation: item.destinationLocation,
        }))
      : [];
    return { items, total: items.length, page: 1, pageSize: 100 } as T;
  }

  throw new Error(`Operación no disponible sin API en ${path}`);
}
