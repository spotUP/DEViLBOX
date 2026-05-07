/**
 * useKKDawIntegration — React hook that manages the Komplete Kontrol DAW surface
 *
 * Mounts on app start, polls for KK DAW MIDI ports, connects automatically when
 * a supported keyboard is found, and tears down on unmount.
 *
 * Usage:  call once in App.tsx — <KKDawProvider /> or  useKKDawIntegration()
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getKKDawSurface, type KKSurfaceStatus } from '@/midi/kk/KKDawSurface';
import { isKKDawPort } from '@/midi/kk/KKDawProtocol';
import type { LGConfig } from '@/midi/kk/KKLightGuide';

const RECONNECT_INTERVAL_MS = 5000;

export function useKKDawIntegration() {
  const [status, setStatus] = useState<KKSurfaceStatus>({
    connected: false,
    protocolVersion: 0,
    portName: '',
    instrumentName: '',
    currentPage: 0,
    totalPages: 0,
  });

  const accessRef    = useRef<MIDIAccess | null>(null);
  const timerRef     = useRef<number | null>(null);
  const mountedRef   = useRef(true);
  const connectedRef = useRef(false);

  const tryConnect = useCallback(async () => {
    if (!mountedRef.current) return;
    if (connectedRef.current) return;

    const access = accessRef.current;
    if (!access) return;

    // Check if any KK DAW port is available
    const hasPort = [...access.outputs.values()].some(o => isKKDawPort(o.name ?? ''));
    if (!hasPort) return;

    const surface = getKKDawSurface();
    const ok = await surface.connect(access);
    if (ok && mountedRef.current) {
      connectedRef.current = true;
      setStatus(surface.getStatus());
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!('requestMIDIAccess' in navigator)) return;

    // Request sysex access (needed for SysEx communication with KK firmware)
    navigator.requestMIDIAccess({ sysex: true })
      .then(access => {
        if (!mountedRef.current) return;
        accessRef.current = access;

        // Subscribe to status updates
        const surface = getKKDawSurface();
        const unsub = surface.onStatusChange(s => {
          if (mountedRef.current) setStatus(s);
          connectedRef.current = s.connected;
        });

        // Watch for device connect/disconnect
        access.onstatechange = () => {
          if (!mountedRef.current) return;
          const wasConnected = connectedRef.current;
          if (!wasConnected) {
            void tryConnect();
          } else {
            const stillHasPort = [...access.outputs.values()].some(o => isKKDawPort(o.name ?? ''));
            if (!stillHasPort) {
              surface.disconnect();
              connectedRef.current = false;
            }
          }
        };

        // Try to connect right away
        void tryConnect();

        // Periodic reconnect poll (in case device was unplugged/re-plugged)
        timerRef.current = window.setInterval(() => {
          if (!connectedRef.current) void tryConnect();
        }, RECONNECT_INTERVAL_MS);

        return unsub;
      })
      .catch(e => {
        // MIDI permission denied or not supported — silently skip
        console.debug('[KKDaw] MIDI access unavailable:', e);
      });

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Surface stays alive (singleton) — just unsub listeners
      // Actual disconnect happens when the page unloads or user disables it
    };
  }, [tryConnect]);

  return status;
}

/** Set the Light Guide config on the singleton surface. */
export function setKKLightGuide(cfg: Partial<LGConfig>): void {
  getKKDawSurface().setLightGuideConfig(cfg);
}

/**
 * KKDawProvider — thin wrapper that mounts the integration without needing
 * a React context. Just renders null, suitable for App.tsx.
 */
export function KKDawProvider() {
  useKKDawIntegration();
  return null;
}
