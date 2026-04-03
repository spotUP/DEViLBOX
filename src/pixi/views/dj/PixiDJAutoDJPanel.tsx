/**
 * PixiDJAutoDJPanel — GL-native Auto DJ controls for the Pixi DJ view.
 *
 * GL port of src/components/dj/DJAutoDJPanel.tsx.
 * Toggle, skip, transition bars, shuffle, filter — rendered via PixiButton/PixiLabel.
 */

import { useCallback } from 'react';
import { PixiButton } from '../../components/PixiButton';
import { PixiLabel } from '../../components/PixiLabel';
import { useDJStore, type AutoDJStatus } from '@/stores/useDJStore';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { enableAutoDJ, disableAutoDJ, skipAutoDJ } from '@/engine/dj/DJActions';
import { useUIStore } from '@/stores/useUIStore';

const STATUS_LABELS: Record<AutoDJStatus, string> = {
  idle: 'OFF',
  playing: 'Playing',
  preloading: 'Loading...',
  'preload-failed': 'Failed',
  'transition-pending': 'Ready',
  transitioning: 'Mixing...',
};

const PANEL_W = 320;
const PANEL_H = 120;
const PAD = 6;
const BAR_OPTIONS = [4, 8, 16, 32] as const;

interface PixiDJAutoDJPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiDJAutoDJPanel: React.FC<PixiDJAutoDJPanelProps> = ({ isOpen, onClose }) => {
  const enabled = useDJStore(s => s.autoDJEnabled);
  const status = useDJStore(s => s.autoDJStatus);
  const currentIdx = useDJStore(s => s.autoDJCurrentTrackIndex);
  const nextIdx = useDJStore(s => s.autoDJNextTrackIndex);
  const transitionBars = useDJStore(s => s.autoDJTransitionBars);
  const shuffle = useDJStore(s => s.autoDJShuffle);
  const withFilter = useDJStore(s => s.autoDJWithFilter);
  const setConfig = useDJStore(s => s.setAutoDJConfig);

  const activePlaylistId = useDJPlaylistStore(s => s.activePlaylistId);
  const playlists = useDJPlaylistStore(s => s.playlists);
  const activePlaylist = playlists.find(p => p.id === activePlaylistId) ?? null;
  const trackCount = activePlaylist?.tracks.length ?? 0;
  const currentTrack = activePlaylist?.tracks[currentIdx];
  const nextTrack = activePlaylist?.tracks[nextIdx];

  const handleToggle = useCallback(async () => {
    if (enabled) {
      disableAutoDJ();
    } else {
      const error = await enableAutoDJ(0);
      if (error) {
        useUIStore.getState().setStatusMessage(`Auto DJ: ${error}`, false, 4000);
      }
    }
  }, [enabled]);

  const handleSkip = useCallback(async () => {
    await skipAutoDJ();
  }, []);

  if (!isOpen) return null;

  return (
    <pixiContainer
      layout={{
        width: PANEL_W,
        height: PANEL_H,
        flexDirection: 'column',
        padding: PAD,
        gap: 4,
      }}
    >
      {/* Header row */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, height: 24, alignItems: 'center' }}>
        <PixiLabel
          text={`AUTO DJ — ${STATUS_LABELS[status]}`}
          size="xs"
          color={enabled ? 'success' : 'textSecondary'}
          layout={{ flex: 1, height: 24 }}
        />
        <PixiButton
          label="X"
          variant="ghost"
          size="sm"
          onClick={onClose}
          layout={{ width: 24, height: 24 }}
        />
      </pixiContainer>

      {/* Toggle + skip */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, height: 28 }}>
        <PixiButton
          label={enabled ? 'STOP' : 'START'}
          variant={enabled ? 'ft2' : 'ghost'}
          color={enabled ? 'green' : undefined}
          size="sm"
          disabled={false}
          onClick={handleToggle}
          layout={{ flex: 1, height: 28 }}
        />
        {enabled && (
          <PixiButton
            label="SKIP"
            icon="next"
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            layout={{ width: 60, height: 28 }}
          />
        )}
      </pixiContainer>

      {/* Track info */}
      {enabled && (
        <pixiContainer layout={{ flexDirection: 'column', gap: 2 }}>
          <PixiLabel
            text={`NOW: ${currentTrack?.trackName ?? '—'} (${currentIdx + 1}/${trackCount})`}
            size="xs"
            color="success"
            layout={{ height: 12 }}
          />
          <PixiLabel
            text={`NEXT: ${nextTrack?.trackName ?? '—'}`}
            size="xs"
            color="accent"
            layout={{ height: 12 }}
          />
        </pixiContainer>
      )}

      {/* Config row: transition bars + shuffle + filter */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, height: 24, alignItems: 'center' }}>
        <PixiLabel text="Bars:" size="xs" color="textMuted" layout={{ width: 30, height: 24 }} />
        {BAR_OPTIONS.map(bars => (
          <PixiButton
            key={bars}
            label={String(bars)}
            variant={transitionBars === bars ? 'ft2' : 'ghost'}
            color={transitionBars === bars ? 'blue' : undefined}
            size="sm"
            active={transitionBars === bars}
            onClick={() => setConfig({ transitionBars: bars })}
            layout={{ width: 32, height: 24 }}
          />
        ))}
        <pixiContainer layout={{ flex: 1 }} />
        <PixiButton
          label="Shuf"
          variant={shuffle ? 'ft2' : 'ghost'}
          color={shuffle ? 'yellow' : undefined}
          size="sm"
          active={shuffle}
          onClick={() => setConfig({ shuffle: !shuffle })}
          layout={{ width: 40, height: 24 }}
        />
        <PixiButton
          label="HPF"
          variant={withFilter ? 'ft2' : 'ghost'}
          color={withFilter ? 'blue' : undefined}
          size="sm"
          active={withFilter}
          onClick={() => setConfig({ withFilter: !withFilter })}
          layout={{ width: 40, height: 24 }}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
