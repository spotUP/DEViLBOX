/**
 * PixiSplitView — Three-panel horizontal split: Tracker | Instrument Editor | Mixer
 *
 * Pixi equivalent of the DOM SplitView (src/components/studio/SplitView.tsx).
 * Fixed equal-width columns (no draggable dividers).
 */

import { useCallback, useEffect, useRef } from 'react';
import { usePixiTheme } from '../theme';
import { PixiViewHeader, VIEW_HEADER_HEIGHT } from '../components';
import { PixiPatternEditor } from './tracker/PixiPatternEditor';
import { PixiFT2Toolbar } from './tracker/PixiFT2Toolbar';
import { PixiEditorControlsBar } from './tracker/PixiEditorControlsBar';
import { PixiInstrumentEditor } from './PixiInstrumentEditor';
import { PixiMixerChannelStrip } from '../mixer/PixiMixerChannelStrip';
import { PixiLabel } from '../components/PixiLabel';
import { PixiButton } from '../components/PixiButton';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useUIStore } from '@stores/useUIStore';
import { useMixerStore } from '@stores/useMixerStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { getToneEngine } from '@engine/ToneEngine';
import { TITLE_H } from '../workbench/workbenchLayout';

const DIVIDER_W = 2;
const NUM_CHANNELS = 16;

// ─── Instrument Panel (reads from store) ─────────────────────────────────────

const SplitInstrumentPanel: React.FC = () => {
  const theme = usePixiTheme();
  const instruments = useInstrumentStore(s => s.instruments);
  const currentId = useInstrumentStore(s => s.currentInstrumentId);
  const updateInstrument = useInstrumentStore(s => s.updateInstrument);
  const setCurrentInstrument = useInstrumentStore(s => s.setCurrentInstrument);

  const current = instruments.find(i => i.id === currentId) ?? instruments[0];
  const sorted = [...instruments].sort((a, b) => a.id - b.id);
  const idx = sorted.findIndex(i => i.id === currentId);

  const handlePrev = useCallback(() => {
    if (sorted.length === 0) return;
    const prev = idx > 0 ? sorted[idx - 1] : sorted[sorted.length - 1];
    setCurrentInstrument(prev.id);
  }, [idx, sorted, setCurrentInstrument]);

  const handleNext = useCallback(() => {
    if (sorted.length === 0) return;
    const next = idx < sorted.length - 1 ? sorted[idx + 1] : sorted[0];
    setCurrentInstrument(next.id);
  }, [idx, sorted, setCurrentInstrument]);

  if (!current) {
    return (
      <pixiContainer layout={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <PixiLabel text="No instruments" size="sm" color="textMuted" />
      </pixiContainer>
    );
  }

  const navH = 28;

  return (
    <pixiContainer layout={{ width: '100%', height: '100%', flexDirection: 'column' }}>
      {/* Navigation header */}
      <layoutContainer
        layout={{
          width: '100%',
          height: navH,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 4,
          paddingRight: 4,
          gap: 4,
          backgroundColor: theme.bgTertiary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiButton label="<" variant="ghost" size="sm" onClick={handlePrev} />
        <pixiContainer layout={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <PixiLabel
            text={`${String(current.id).padStart(2, '0')}: ${current.name || current.synthType}`}
            size="sm"
            color="textSecondary"
          />
        </pixiContainer>
        <PixiButton label=">" variant="ghost" size="sm" onClick={handleNext} />
      </layoutContainer>

      {/* Editor content */}
      <pixiContainer layout={{ flex: 1, width: '100%', overflow: 'scroll' }}>
        <PixiInstrumentEditor
          synthType={current.synthType}
          config={current as unknown as Record<string, unknown>}
          onChange={(updates) => updateInstrument(current.id, updates)}
          instrumentName={current.name}
        />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Mixer Panel (channel strips with VU meters) ─────────────────────────────

const SplitMixerPanel: React.FC = () => {
  const theme = usePixiTheme();
  const channels = useMixerStore(s => s.channels);
  const isSoloing = useMixerStore(s => s.isSoloing);
  const instruments = useInstrumentStore(s => s.instruments);
  const setChannelVolume = useMixerStore(s => s.setChannelVolume);
  const setChannelPan = useMixerStore(s => s.setChannelPan);
  const handleMuteToggle = useCallback((ch: number) => {
    const chs = useMixerStore.getState().channels;
    useMixerStore.getState().setChannelMute(ch, !chs[ch].muted);
  }, []);
  const handleSoloToggle = useCallback((ch: number) => {
    const chs = useMixerStore.getState().channels;
    useMixerStore.getState().setChannelSolo(ch, !chs[ch].soloed);
  }, []);

  // VU meter levels (rAF loop, no React state)
  const levelsRef = useRef<number[]>(Array(NUM_CHANNELS).fill(0));
  const mountedRef = useRef(true);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const tick = () => {
      if (!mountedRef.current) return;
      try {
        const engine = getToneEngine();
        const channelLevels = engine.getChannelLevels(NUM_CHANNELS);
        const hasSignal = channelLevels.some(l => l > 0);
        if (!hasSignal) {
          const busLevel = engine.getSynthBusLevel();
          if (busLevel > 0) {
            const activeChannels = useTrackerStore.getState().patterns[0]?.channels.length ?? 4;
            for (let i = 0; i < Math.min(activeChannels, channelLevels.length); i++) channelLevels[i] = busLevel;
          }
        }
        levelsRef.current = channelLevels;
      } catch { /* engine not ready */ }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <pixiContainer layout={{ width: '100%', height: '100%', flexDirection: 'column' }}>
      {/* Label */}
      <layoutContainer
        layout={{
          width: '100%',
          height: 28,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          backgroundColor: theme.bgTertiary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel text="MIXER" size="sm" weight="bold" color="textMuted" />
      </layoutContainer>

      {/* Channel strips */}
      <pixiContainer layout={{ flex: 1, width: '100%', flexDirection: 'row', overflow: 'scroll', gap: 2, padding: 4 }}>
        {channels.slice(0, NUM_CHANNELS).map((ch, i) => {
          const inst = instruments.find(ins => ins.id === i + 1);
          return (
            <PixiMixerChannelStrip
              key={i}
              channelIndex={i}
              name={ch.name}
              instrumentName={inst?.name ?? ''}
              volume={ch.volume}
              pan={ch.pan}
              muted={ch.muted}
              soloed={ch.soloed}
              getLevelCallback={() => levelsRef.current[i] ?? 0}
              isSoloing={isSoloing}
              onVolumeChange={setChannelVolume}
              onPanChange={setChannelPan}
              onMuteToggle={handleMuteToggle}
              onSoloToggle={handleSoloToggle}
            />
          );
        })}
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── PixiSplitView ───────────────────────────────────────────────────────────

export const PixiSplitView: React.FC = () => {
  const theme = usePixiTheme();

  // Read dimensions from workbench store (synced by PixiMainLayout)
  const splitWin = useWorkbenchStore(s => s.windows['split']);
  const contentH = splitWin ? (splitWin.height - TITLE_H) : 700;
  const panelW = splitWin ? Math.floor((splitWin.width - DIVIDER_W * 2) / 3) : 400;

  // Tracker view mode (for editor controls bar)
  const viewMode = useUIStore(s => s.trackerViewMode);
  const setViewMode = useUIStore(s => s.setTrackerViewMode);
  const gridChannelIndex = useUIStore(s => s.gridChannelIndex);
  const setGridChannelIndex = useUIStore(s => s.setGridChannelIndex);

  const panelContentH = contentH - VIEW_HEADER_HEIGHT;

  return (
    <pixiContainer layout={{ width: '100%', height: '100%', flexDirection: 'column' }}>
      <PixiViewHeader activeView="split" title="SPLIT" subtitle="TRACKER | INSTRUMENT | MIXER" />

      {/* Three-panel row */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        {/* Left panel — Tracker / Pattern Editor */}
        <pixiContainer layout={{ flex: 1, flexBasis: 0, height: '100%', flexDirection: 'column', overflow: 'hidden' }}>
          <PixiFT2Toolbar />
          <PixiEditorControlsBar
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            gridChannelIndex={gridChannelIndex}
            onGridChannelChange={setGridChannelIndex}
          />
          <pixiContainer layout={{ flex: 1, width: '100%', overflow: 'hidden' }}>
            <PixiPatternEditor width={panelW} height={Math.max(100, panelContentH - 80)} />
          </pixiContainer>
        </pixiContainer>

        {/* Divider 1 */}
        <layoutContainer
          layout={{
            width: DIVIDER_W,
            height: '100%',
            backgroundColor: theme.border.color,
            flexShrink: 0,
          }}
        />

        {/* Center panel — Instrument Editor */}
        <pixiContainer layout={{ flex: 1, flexBasis: 0, height: '100%', flexDirection: 'column', overflow: 'hidden' }}>
          <SplitInstrumentPanel />
        </pixiContainer>

        {/* Divider 2 */}
        <layoutContainer
          layout={{
            width: DIVIDER_W,
            height: '100%',
            backgroundColor: theme.border.color,
            flexShrink: 0,
          }}
        />

        {/* Right panel — Mixer */}
        <pixiContainer layout={{ flex: 1, flexBasis: 0, height: '100%', flexDirection: 'column', overflow: 'hidden' }}>
          <SplitMixerPanel />
        </pixiContainer>
      </pixiContainer>
    </pixiContainer>
  );
};
