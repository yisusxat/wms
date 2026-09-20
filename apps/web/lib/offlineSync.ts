// IndexedDB offline queue & sync manager for WMS movements
const DB_NAME = "wms_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "pending_movements";

export interface PendingMovement {
  id?: number;
  mode: "entry" | "exit" | "transfer" | "adjustment";
  payload: any;
  timestamp: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return reject(new Error("IndexedDB no soportado"));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueOfflineMovement(movement: Omit<PendingMovement, "id">): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(movement);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingMovements(): Promise<PendingMovement[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearSyncedMovement(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function syncOfflineMovements(
  token: string,
  apiBase: string,
  onProgress?: (synced: number, total: number) => void
): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingMovements();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    try {
      const res = await fetch(`${apiBase}/movements/${item.mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(item.payload),
      });

      if (res.ok) {
        if (item.id) await clearSyncedMovement(item.id);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    if (onProgress) onProgress(synced, pending.length);
  }

  return { synced, failed };
}
