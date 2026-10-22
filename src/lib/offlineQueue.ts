/** Offline order queue — localStorage, flush when online */

export type QueuedOrder = {
  id: string; // local uuid
  createdAt: string;
  rpcArgs: Record<string, unknown>;
  snapshot: {
    items: { name: string; qty: number; price: number }[];
    total: number;
    parcel: boolean;
    jain: boolean;
    customerName?: string;
    customerMobile?: string;
  };
};

const KEY = "pos-offline-orders";

export function loadQueue(): QueuedOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveQueue(q: QueuedOrder[]) {
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function enqueueOrder(entry: QueuedOrder) {
  const q = loadQueue();
  q.push(entry);
  saveQueue(q);
  return q.length;
}

export function removeFromQueue(id: string) {
  saveQueue(loadQueue().filter((x) => x.id !== id));
}

export function isProbablyOffline() {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine === false;
}
