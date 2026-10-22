/** Offline order queue — localStorage, flush when online */

import { supabase } from "@/lib/supabase";

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

/** Same pattern the POS page already used to detect a dropped connection. */
export function isNetworkError(msg?: string | null) {
  return /failed to fetch|network|offline|timeout|Load failed|fetch/i.test(msg || "");
}

function notifyQueueChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("pos-queue-changed"));
}

// Module-level lock: stops two flushes (mount + "online" event, or POS + AuthGate)
// from uploading the same queued order twice.
let flushing = false;

/** Upload queued orders. Safe to call from anywhere, any number of times. */
export async function flushQueue(): Promise<void> {
  if (flushing || isProbablyOffline()) return;
  if (!loadQueue().length) return;
  flushing = true;
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return;
    for (const entry of loadQueue()) {
      let res;
      try {
        res = await supabase.rpc("place_order", entry.rpcArgs);
      } catch {
        break; // still offline
      }
      if (res.error) {
        if (isNetworkError(res.error.message)) break; // connection dropped again
        continue; // server rejected this one – leave it queued, try the rest
      }
      if (!res.data) continue;
      removeFromQueue(entry.id);
      notifyQueueChanged();
      // best-effort telegram
      try {
        const data = res.data as { order_no: number; total: number };
        const itemsText = entry.snapshot.items
          .map((i) => `• ${i.name} × ${i.qty} = ₹${i.price * i.qty}`)
          .join("\n");
        await fetch("/api/send-telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderText: `🆕 <b>Queued order synced</b>\n#${data.order_no}\n${itemsText}\n💰 ₹${data.total}`,
            orderNumber: data.order_no,
          }),
        });
      } catch {}
    }
  } finally {
    flushing = false;
    notifyQueueChanged();
  }
}
