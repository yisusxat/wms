'use client';

import { useEffect, useRef } from 'react';
import { insforge } from './insforge';

export const WMS_SYNC_EVENT = 'wms-data-changed';
export const WMS_SYNC_CHANNEL = 'wms_realtime_sync_channel';

export interface WmsSyncDetail {
  type?: 'movement' | 'location' | 'inventory' | 'audit' | 'all';
  action?: 'entry' | 'exit' | 'transfer' | 'adjust' | 'adjustment' | 'update' | 'sync';
  locationCode?: string;
  sku?: string;
  timestamp?: number;
}

let broadcastChannel: BroadcastChannel | null = null;
function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!('BroadcastChannel' in window)) return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(WMS_SYNC_CHANNEL);
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

/**
 * Triggers a global synchronization event across all components in the current window
 * AND across all other open browser tabs/windows via BroadcastChannel.
 */
export function notifyWmsDataChanged(detail: WmsSyncDetail = {}) {
  if (typeof window === 'undefined') return;

  const eventPayload: WmsSyncDetail = {
    ...detail,
    timestamp: Date.now(),
  };

  // 1. Dispatch in-page CustomEvent
  try {
    window.dispatchEvent(new CustomEvent(WMS_SYNC_EVENT, { detail: eventPayload }));
  } catch (err) {
    console.warn('[Sync] In-page dispatch error:', err);
  }

  // 2. Broadcast across browser tabs
  try {
    const channel = getBroadcastChannel();
    if (channel) {
      channel.postMessage({ type: WMS_SYNC_EVENT, ...eventPayload });
    }
  } catch (err) {
    console.warn('[Sync] BroadcastChannel post error:', err);
  }

  // 3. Broadcast over InsForge Realtime websocket if connected
  try {
    if (insforge && insforge.realtime && typeof insforge.realtime.publish === 'function') {
      insforge.realtime.publish('wms_warehouse_sync', 'sync', eventPayload).catch(() => {});
    }
  } catch {}
}

/**
 * React hook that subscribes the calling component to all WMS data change events
 * (in-window CustomEvent, cross-tab BroadcastChannel, and InsForge realtime changes).
 * Automatically debounces rapid bursts to avoid multiple redundant re-fetches.
 */
export function useWmsRealtimeSync(
  onSync: () => void,
  deps: unknown[] = []
) {
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const triggerSync = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        try {
          onSyncRef.current();
        } catch (err) {
          console.warn('[Sync] Execution error in subscriber:', err);
        }
      }, 60);
    };

    // 1. Listen for local CustomEvents
    const handleCustomEvent = () => {
      triggerSync();
    };
    window.addEventListener(WMS_SYNC_EVENT, handleCustomEvent);

    // 2. Listen for cross-tab BroadcastChannel events
    const channel = getBroadcastChannel();
    const handleBroadcast = (event: MessageEvent) => {
      if (event?.data?.type === WMS_SYNC_EVENT) {
        triggerSync();
      }
    };
    if (channel) {
      channel.addEventListener('message', handleBroadcast);
    }

    // 3. Optional: Subscribe to InsForge Realtime websocket
    const handleRealtime = () => {
      triggerSync();
    };

    try {
      if (insforge && insforge.realtime && typeof insforge.realtime.subscribe === 'function') {
        insforge.realtime.subscribe('wms_warehouse_sync').catch(() => {});
        insforge.realtime.on('sync', handleRealtime);
      }
    } catch {
      // Non-blocking fallback
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      window.removeEventListener(WMS_SYNC_EVENT, handleCustomEvent);
      if (channel) {
        channel.removeEventListener('message', handleBroadcast);
      }
      try {
        if (insforge && insforge.realtime && typeof insforge.realtime.off === 'function') {
          insforge.realtime.off('sync', handleRealtime);
        }
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
