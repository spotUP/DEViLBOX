/**
 * PixiStatusBar — Bottom status bar for WebGL mode.
 * Renders the actual DOM StatusBar component via PixiDOMOverlay
 * for pixel-perfect parity with the DOM tracker view.
 *
 * Adds a GL-specific compact oscilloscope when audio is active.
 */

import { useCallback, useEffect, useState } from 'react';
import { PixiDOMOverlay } from '../components/PixiDOMOverlay';
import { useUIStore, useAudioStore } from '@stores';
import { useMIDIStore } from '@/stores/useMIDIStore';

/** Main status bar height (matches DOM py-1.5 + text) */
const STATUS_BAR_HEIGHT = 32;
/** MIDI knob panel height when expanded (matches DOM grid + tabs) */
const KNOB_PANEL_HEIGHT = 80;

/**
 * Lazy-loaded wrapper for the DOM StatusBar + optional oscilloscope.
 * Uses dynamic import() to avoid circular dependency issues.
 */
const StatusBarOverlay: React.FC = () => {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);
  const [OscComp, setOscComp] = useState<React.ComponentType<any> | null>(null);
  const isAudioActive = useAudioStore(s => s.contextState === 'running');

  useEffect(() => {
    import('@components/layout/StatusBar').then(m => setComp(() => m.StatusBar));
  }, []);

  useEffect(() => {
    if (isAudioActive) {
      import('@/components/visualization/Oscilloscope').then(m => setOscComp(() => m.Oscilloscope));
    }
  }, [isAudioActive]);

  const handleShowTips = useCallback(() => {
    useUIStore.getState().openModal('tips', { initialTab: 'tips' });
  }, []);

  if (!Comp) return null;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Comp onShowTips={handleShowTips} />
      {/* GL enhancement: compact oscilloscope in the status bar */}
      {isAudioActive && OscComp && (
        <div
          style={{
            position: 'absolute',
            right: '140px',
            bottom: '6px',
            width: '100px',
            height: '20px',
            overflow: 'hidden',
            opacity: 0.8,
            pointerEvents: 'none',
          }}
        >
          <OscComp width={100} height={20} mode="waveform" />
        </div>
      )}
    </div>
  );
};

export const PixiStatusBar: React.FC = () => {
  const hasMIDIDevice = useMIDIStore(s => s.isInitialized && s.inputDevices.length > 0);
  const showKnobBar = useMIDIStore(s => s.showKnobBar);
  const activeView = useUIStore(s => s.activeView);

  // MIDI knob panel shows in tracker/arrangement views when a MIDI device is connected
  const showMIDIPanel = activeView !== 'dj' && hasMIDIDevice && showKnobBar;
  const totalHeight = showMIDIPanel
    ? STATUS_BAR_HEIGHT + KNOB_PANEL_HEIGHT
    : STATUS_BAR_HEIGHT;

  return (
    <PixiDOMOverlay
      layout={{ width: '100%', height: totalHeight }}
      style={{ overflow: 'visible', zIndex: 30 }}
    >
      <StatusBarOverlay />
    </PixiDOMOverlay>
  );
};
