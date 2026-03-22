/**
 * DJ3DOverlay — Three.js 3D turntable + mixer overlay for GL mode.
 * Rendered in the DOM React tree (not Pixi) to avoid reconciler conflicts.
 */

import React, { Suspense, useRef } from 'react';
import { useDJStore } from '@/stores/useDJStore';

const DeckVinyl3DView = React.lazy(() => import('./DeckVinyl3DView'));
const MixerVestax3DView = React.lazy(() => import('./MixerVestax3DView'));
const R3FCanvas = React.lazy(() =>
  import('@react-three/fiber').then((mod) => ({ default: mod.Canvas }))
);
const ViewPort = React.lazy(() =>
  import('@react-three/drei').then((mod) => {
    const Port = mod.View.Port;
    return { default: Port as React.ComponentType };
  })
);

export const DJ3DOverlay: React.FC = () => {
  const thirdDeckActive = useDJStore(s => s.thirdDeckActive);
  const overlayRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={overlayRef} className="w-full h-full">
      <Suspense fallback={
        <div className="flex items-center justify-center w-full h-full text-text-muted text-sm">
          Loading 3D views...
        </div>
      }>
        <div className={`w-full h-full grid gap-2 p-2 ${
          thirdDeckActive
            ? 'grid-cols-[1fr_400px_1fr_1fr]'
            : 'grid-cols-[1fr_400px_1fr]'
        }`}>
          <div className="min-h-0 min-w-0 overflow-hidden">
            <DeckVinyl3DView deckId="A" />
          </div>
          <div className="min-h-0 min-w-0 overflow-hidden">
            <MixerVestax3DView />
          </div>
          <div className="min-h-0 min-w-0 overflow-hidden">
            <DeckVinyl3DView deckId="B" />
          </div>
          {thirdDeckActive && (
            <div className="min-h-0 min-w-0 overflow-hidden">
              <DeckVinyl3DView deckId="C" />
            </div>
          )}
        </div>

        {/* Shared R3F Canvas for drei View scissor rendering */}
        <div className="fixed inset-0 pointer-events-none" style={{ top: 36, zIndex: 1 }}>
          <R3FCanvas
            style={{ position: 'absolute', inset: 0 }}
            eventSource={overlayRef as React.RefObject<HTMLDivElement>}
            eventPrefix="client"
          >
            <ViewPort />
          </R3FCanvas>
        </div>
      </Suspense>
    </div>
  );
};
