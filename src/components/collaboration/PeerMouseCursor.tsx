/**
 * PeerMouseCursor — fixed-position peer mouse overlay covering the entire app UI.
 *
 * Broadcasts local mouse position via WebRTC data channel (throttled to ~30fps)
 * and renders the peer's cursor as an SVG arrow anywhere on screen.
 */

import { useRef, useEffect } from 'react';
import { useCollaborationStore, getCollabClient } from '@stores/useCollaborationStore';

const THROTTLE_MS = 33; // ~30fps

export function PeerMouseCursor() {
  const divRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ nx: 0, ny: 0, active: false });
  const lastSendRef = useRef(0);
  const rafRef = useRef(0);

  // Global mouse broadcast — tracks the local user's mouse over the entire window
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastSendRef.current < THROTTLE_MS) return;
      if (useCollaborationStore.getState().status !== 'connected') return;
      lastSendRef.current = now;
      const nx = e.clientX / window.innerWidth;
      const ny = e.clientY / window.innerHeight;
      getCollabClient()?.send({
        type: 'peer_mouse',
        nx: Math.max(0, Math.min(1, nx)),
        ny: Math.max(0, Math.min(1, ny)),
      });
    };
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  // Sync peer position into ref and track active state for RAF gating
  const activeRef = useRef(false);
  useEffect(() => {
    const unsub = useCollaborationStore.subscribe((state) => {
      const active = state.peerMouseActive &&
        state.status === 'connected' &&
        state.listenMode === 'shared';
      posRef.current = {
        nx: state.peerMouseNX,
        ny: state.peerMouseNY,
        active,
      };
      activeRef.current = active;
    });
    return unsub;
  }, []);

  // RAF drives the cursor position imperatively — only runs when peer is active
  useEffect(() => {
    let running = false;
    const tick = () => {
      if (divRef.current) {
        const { nx, ny, active } = posRef.current;
        if (active) {
          divRef.current.style.display = 'block';
          divRef.current.style.transform =
            `translate(${nx * window.innerWidth}px, ${ny * window.innerHeight}px)`;
        } else {
          divRef.current.style.display = 'none';
          running = false;
          return; // stop loop when inactive
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    // Start/restart loop when collaboration becomes active
    const unsub = useCollaborationStore.subscribe((state) => {
      const active = state.peerMouseActive &&
        state.status === 'connected' &&
        state.listenMode === 'shared';
      if (active && !running) {
        running = true;
        rafRef.current = requestAnimationFrame(tick);
      }
    });

    return () => { unsub(); cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div
      ref={divRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        display: 'none',
        pointerEvents: 'none',
        zIndex: 99999,
      }}
    >
      {/* Standard arrow cursor SVG — tip at origin (0,0) */}
      <svg
        width="18"
        height="22"
        viewBox="0 0 18 22"
        style={{ display: 'block', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}
      >
        <path
          d="M1 1 L1 18 L5.5 13.5 L9.5 21.5 L12.5 20 L8.5 12 L15 12 Z"
          fill="#a855f7"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      {/* "Friend" label below the cursor tip */}
      <span
        style={{
          position: 'absolute',
          top: 20,
          left: 14,
          fontSize: 9,
          color: '#a855f7',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          textShadow: '0 0 4px rgba(168,85,247,0.6), 0 1px 2px rgba(0,0,0,0.9)',
          userSelect: 'none',
          letterSpacing: '0.05em',
        }}
      >
        Friend
      </span>
    </div>
  );
}
