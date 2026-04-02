/**
 * PixiDJStreamPanel — GL-native live streaming control panel.
 *
 * Matches the DOM DJStreamControl functionality: platform selection
 * (YouTube/Twitch/Custom RTMP), stream key input, and go-live/stop controls.
 * Uses window.prompt() for stream key entry since Pixi has no native text input.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PixiButton, PixiSelect, PixiLabel } from '../../components';
import type { SelectOption } from '../../components';
import { PIXI_FONTS } from '../../fonts';
import { DJVideoCapture, getCaptureCanvas, type VideoSource } from '@/engine/dj/streaming/DJVideoCapture';
import { DJLiveStream } from '@/engine/dj/streaming/DJLiveStream';

type StreamPlatform = 'youtube' | 'twitch' | 'custom';

const PLATFORM_INFO: Record<StreamPlatform, { label: string; placeholder: string; help: string }> = {
  youtube: {
    label: 'YouTube',
    placeholder: 'xxxx-xxxx-xxxx-xxxx',
    help: 'YouTube Studio > Go Live > Stream > Stream key',
  },
  twitch: {
    label: 'Twitch',
    placeholder: 'live_xxxxxxxxxxxxxxxxx',
    help: 'Twitch Dashboard > Settings > Stream > Primary Stream key',
  },
  custom: {
    label: 'Custom RTMP',
    placeholder: 'rtmp://server/app/key',
    help: 'Full RTMP URL including stream key',
  },
};

const PLATFORM_OPTIONS: SelectOption[] = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'twitch', label: 'Twitch' },
  { value: 'custom', label: 'Custom RTMP' },
];

const PANEL_WIDTH = 220;

interface PixiDJStreamPanelProps {
  /** Called when stream starts or stops (updates parent isLive state) */
  onLiveChange: (isLive: boolean) => void;
  /** Whether we are currently live */
  isLive: boolean;
}

export const PixiDJStreamPanel: React.FC<PixiDJStreamPanelProps> = ({ onLiveChange, isLive }) => {
  const theme = usePixiTheme();

  const [platform, setPlatform] = useState<StreamPlatform>('youtube');
  const [streamKey, setStreamKey] = useState('');
  const [status, setStatus] = useState('');
  const [duration, setDuration] = useState(0);

  const captureRef = useRef<DJVideoCapture | null>(null);
  const streamRef = useRef<DJLiveStream | null>(null);
  const timerRef = useRef<number>(0);

  // Duration timer
  useEffect(() => {
    if (!isLive) return;
    timerRef.current = window.setInterval(() => {
      if (streamRef.current) setDuration(streamRef.current.durationMs);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isLive]);

  const info = PLATFORM_INFO[platform];

  const handleSetKey = useCallback(() => {
    const key = window.prompt(`Enter your ${info.label} stream key:`, streamKey);
    if (key !== null) setStreamKey(key);
  }, [info.label, streamKey]);

  const handleGoLive = useCallback(async () => {
    if (!streamKey.trim()) {
      alert(`Enter your ${info.label} stream key first`);
      return;
    }

    try {
      const source: VideoSource = getCaptureCanvas('vj') ? 'vj' : 'dj-ui';
      if (!getCaptureCanvas(source)) {
        alert('No capture canvas available. Switch to VJ View or enable the DJ UI.');
        return;
      }

      setStatus('Connecting...');
      const capture = new DJVideoCapture();
      const mediaStream = capture.startCapture(source, source === 'vj' ? 60 : 30);

      const liveStream = new DJLiveStream();
      liveStream.onStatusChange = (s) => {
        setStatus(s === 'live' ? `LIVE on ${info.label}` : s === 'connecting' ? 'Connecting...' : s);
        if (s === 'error' || s === 'stopped') {
          onLiveChange(false);
          capture.stopCapture();
        }
      };
      liveStream.onError = (err) => setStatus(`Error: ${err}`);

      await liveStream.startStream(mediaStream, streamKey.trim(), platform);

      captureRef.current = capture;
      streamRef.current = liveStream;
      onLiveChange(true);
    } catch (err) {
      setStatus(`Failed: ${(err as Error).message}`);
      onLiveChange(false);
    }
  }, [streamKey, platform, info.label, onLiveChange]);

  const handleStop = useCallback(() => {
    streamRef.current?.stopStream();
    captureRef.current?.stopCapture();
    streamRef.current = null;
    captureRef.current = null;
    onLiveChange(false);
    setDuration(0);
    setStatus('');
  }, [onLiveChange]);

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
  };

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, PANEL_WIDTH, 130, 4);
    g.fill({ color: theme.bgSecondary.color, alpha: 0.95 });
    g.roundRect(0, 0, PANEL_WIDTH, 130, 4);
    g.stroke({ color: theme.border.color, width: 1, alpha: 0.5 });
  }, [theme]);

  // Masked stream key display
  const maskedKey = streamKey
    ? (platform === 'custom' ? streamKey : '*'.repeat(Math.min(streamKey.length, 20)))
    : info.placeholder;

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, width: PANEL_WIDTH, padding: 6 }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', top: -6, left: -6 }} />

      {/* Platform selector */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <PixiLabel text="Platform" size="xs" color="textMuted" />
        <PixiSelect
          value={platform}
          options={PLATFORM_OPTIONS}
          width={130}
          onChange={(v) => setPlatform(v as StreamPlatform)}
        />
      </pixiContainer>

      {/* Help text */}
      <pixiBitmapText
        text={info.help}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: theme.textMuted.color }}
        layout={{ maxWidth: PANEL_WIDTH - 12 }}
      />

      {/* Stream key (click to enter via prompt) */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <PixiLabel text="Key" size="xs" color="textMuted" />
        <PixiButton
          label={maskedKey}
          size="sm"
          variant="ghost"
          onClick={handleSetKey}
        />
      </pixiContainer>

      {/* Go Live / Stop + status */}
      {isLive ? (
        <pixiContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <PixiButton
            label={`STOP (${formatDuration(duration)})`}
            size="sm"
            color="red"
            onClick={handleStop}
          />
        </pixiContainer>
      ) : (
        <PixiButton
          label={`Go Live on ${info.label}`}
          size="sm"
          color={streamKey.trim() ? 'green' : undefined}
          onClick={handleGoLive}
        />
      )}

      {/* Status message */}
      {status ? (
        <pixiBitmapText
          text={status}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: theme.textMuted.color }}
          layout={{ maxWidth: PANEL_WIDTH - 12 }}
        />
      ) : null}
    </pixiContainer>
  );
};
