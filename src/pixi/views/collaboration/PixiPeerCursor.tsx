/**
 * PixiPeerCursor — Remote peer's cursor overlay for WebGL mode.
 * Renders a purple arrow sprite + "Friend" label, driven by RAF position updates.
 */

import { useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useCollaborationStore, getCollabClient } from '@stores/useCollaborationStore';

const THROTTLE_MS = 33; // ~30fps
const CURSOR_COLOR = 0xa855f7; // Purple

interface PixiPeerCursorProps {
  width: number;
  height: number;
}

export const PixiPeerCursor: React.FC<PixiPeerCursorProps> = ({ width, height }) => {
  const graphicsRef = useRef<GraphicsType | null>(null);
  const posRef = useRef({ nx: 0, ny: 0, active: false });
  const lastSendRef = useRef(0);

  // Broadcast local mouse position
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

  // Subscribe to peer position changes
  useEffect(() => {
    const unsub = useCollaborationStore.subscribe(state => {
      posRef.current = {
        nx: state.peerMouseNX,
        ny: state.peerMouseNY,
        active: state.peerMouseActive &&
          state.status === 'connected' &&
          state.listenMode === 'shared',
      };
    });
    return unsub;
  }, []);

  // RAF-driven cursor rendering
  useEffect(() => {
    let rafId: number;

    const tick = () => {
      const g = graphicsRef.current;
      if (!g) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      g.clear();
      const { nx, ny, active } = posRef.current;

      if (active) {
        const x = nx * width;
        const y = ny * height;

        // Draw arrow cursor
        g.moveTo(x, y);
        g.lineTo(x, y + 18);
        g.lineTo(x + 4.5, y + 13.5);
        g.lineTo(x + 8.5, y + 21.5);
        g.lineTo(x + 11.5, y + 20);
        g.lineTo(x + 7.5, y + 12);
        g.lineTo(x + 14, y + 12);
        g.closePath();
        g.fill({ color: CURSOR_COLOR });
        g.stroke({ color: 0xffffff, width: 1.5 });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [width, height]);

  return (
    <pixiContainer layout={{ position: 'absolute', width, height }} interactiveChildren={false}>
      <pixiGraphics
        ref={graphicsRef}
        draw={() => {}}
        layout={{ position: 'absolute', width, height }}
      />
    </pixiContainer>
  );
};
