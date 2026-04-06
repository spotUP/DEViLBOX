/**
 * PixiSampleEditor — GL-native sample editor for the instrument editor.
 *
 * Features:
 * - Canvas-based waveform display drawn via pixiGraphics
 * - Loop start/end markers (draggable)
 * - Zoom controls (zoom in/out/fit)
 * - Sample info display (length, rate, bit depth)
 * - Playback cursor during preview
 *
 * Data comes from the instrument store (sample URL -> decoded AudioBuffer).
 * DOM reference: src/components/instruments/SampleEditor.tsx
 */

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PixiLabel, PixiButton, PixiSlider } from '../../components';
import { useInstrumentStore, useTrackerStore } from '@stores';
import { scan9xxOffsets } from '@/lib/analysis/scan9xxOffsets';
import type { InstrumentConfig, DeepPartial } from '@typedefs/instrument';
import { bufferToDataUrl } from '@/utils/audio/SampleProcessing';
import { PixiBeatSyncDialog } from '../../dialogs/PixiBeatSyncDialog';
import { PixiSpectrumFilterPanel } from '../../dialogs/PixiSpectrumFilterPanel';

// ── Types ───────────────────────────────────────────────────────────────

interface PixiSampleEditorProps {
  instrument: InstrumentConfig;
  width: number;
  height: number;
}

type LoopType = 'off' | 'forward' | 'pingpong';

// ── Component ───────────────────────────────────────────────────────────

export const PixiSampleEditor: React.FC<PixiSampleEditorProps> = ({
  instrument,
  width,
  height,
}) => {
  const theme = usePixiTheme();
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);

  // ── Audio buffer ────────────────────────────────────────────────────
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Beat Sync dialog ─────────────────────────────────────────────────
  const [showBeatSync, setShowBeatSync] = useState(false);

  // ── Spectrum Filter panel ─────────────────────────────────────────────
  const [showSpectrumFilter, setShowSpectrumFilter] = useState(false);

  // ── Mic recording ─────────────────────────────────────────────────────
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [micElapsed, setMicElapsed] = useState(0);
  const micTimerRef = useRef<number | null>(null);

  const handleToggleRecord = useCallback(async () => {
    const { getAudioInputManager } = await import('@engine/AudioInputManager');
    const mgr = getAudioInputManager();

    if (isRecordingMic) {
      // Stop
      if (micTimerRef.current) { clearInterval(micTimerRef.current); micTimerRef.current = null; }
      setIsRecordingMic(false);
      mgr.setMonitoring(false);
      const buf = await mgr.stopRecording();
      if (buf) {
        const dataUrl = await bufferToDataUrl(buf);
        setAudioBuffer(buf);
        updateInstrument(instrument.id, {
          parameters: {
            ...(instrument.parameters as Record<string, unknown>),
            sampleUrl: dataUrl,
            sampleInfo: { name: 'Recording', duration: buf.duration, size: 0 },
            startTime: 0, endTime: 1, loopStart: 0, loopEnd: 1,
          },
          sample: instrument.sample ? { ...instrument.sample, url: dataUrl } : undefined,
        });
      }
    } else {
      // Start
      if (!mgr.isConnected()) {
        const ok = await mgr.selectDevice();
        if (!ok) return;
      }
      mgr.setMonitoring(true);
      mgr.startRecording();
      setIsRecordingMic(true);
      setMicElapsed(0);
      const start = Date.now();
      micTimerRef.current = window.setInterval(() => setMicElapsed((Date.now() - start) / 1000), 100);
    }
  }, [isRecordingMic, instrument, updateInstrument]);

  useEffect(() => {
    return () => { if (micTimerRef.current) clearInterval(micTimerRef.current); };
  }, []);

  // ── Persist processed buffer to instrument store ─────────────────────
  const handleBufferProcessed = useCallback(async (buf: AudioBuffer, prefix: string) => {
    setAudioBuffer(buf);
    const dataUrl = await bufferToDataUrl(buf);
    const sampleInfo = (instrument.parameters as Record<string, unknown>)?.sampleInfo as Record<string, unknown> | undefined;
    const name = sampleInfo?.name as string | undefined;
    updateInstrument(instrument.id, {
      parameters: {
        ...instrument.parameters,
        sampleUrl: dataUrl,
        sampleInfo: {
          name: name ? (name.startsWith(prefix + '_') ? name : prefix + '_' + name) : prefix + '_Sample',
          duration: buf.duration,
          size: Math.round(((dataUrl.split(',')[1] || '').length * 3) / 4),
          sampleRate: buf.sampleRate,
          channels: buf.numberOfChannels,
        },
      },
    });
    // Force ToneEngine to recreate its Player with the new buffer
    try {
      const { getToneEngine } = await import('@engine/ToneEngine');
      getToneEngine().invalidateInstrument(instrument.id);
    } catch { /* ToneEngine not active */ }
  }, [instrument.id, instrument.parameters, updateInstrument]);

  // ── View state ──────────────────────────────────────────────────────
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(1);
  const [playbackPosition, _setPlaybackPosition] = useState(0);

  // ── Loop state ──────────────────────────────────────────────────────
  const params = (instrument.parameters || {}) as Record<string, unknown>;
  const loopEnabled = (params.loopEnabled as boolean) ?? instrument.sample?.loop ?? false;
  const loopStart = (params.loopStart as number) ?? 0;
  const loopEnd = (params.loopEnd as number) ?? 1;
  const loopType: LoopType = (params.loopType as LoopType) ?? 'forward';

  // Scan current pattern for 9xx offsets referencing this instrument
  const currentPattern = useTrackerStore((s) => s.patterns[s.currentPatternIndex]);
  const offsetMarkers = useMemo(() => {
    if (!currentPattern || !audioBuffer || !instrument.id) return undefined;
    const offsets = scan9xxOffsets(currentPattern, instrument.id);
    return offsets.length > 0 ? offsets : undefined;
  }, [currentPattern, audioBuffer, instrument.id]);

  // ── Dragging ────────────────────────────────────────────────────────
  const [dragTarget, setDragTarget] = useState<'loopStart' | 'loopEnd' | null>(null);
  const dragRef = useRef<'loopStart' | 'loopEnd' | null>(null);

  // ── Extract sample URL ──────────────────────────────────────────────
  const sampleUrl: string | null =
    (instrument.sample?.url as string) ||
    (params.sampleUrl as string) ||
    (instrument.granular?.sampleUrl as string) ||
    null;

  // ── Load audio buffer when URL changes ──────────────────────────────
  useEffect(() => {
    if (!sampleUrl) {
      setAudioBuffer(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(sampleUrl);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const arrayBuffer = await response.arrayBuffer();
        const ctx = new AudioContext();
        const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        if (!cancelled) setAudioBuffer(buffer);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [sampleUrl]);

  // ── Update helper ───────────────────────────────────────────────────
  const updateParam = useCallback((key: string, value: unknown) => {
    updateInstrument(instrument.id, {
      parameters: { ...instrument.parameters, [key]: value },
    } as DeepPartial<InstrumentConfig>);
  }, [instrument.id, instrument.parameters, updateInstrument]);

  // ── Zoom controls ───────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    const mid = (viewStart + viewEnd) / 2;
    const range = (viewEnd - viewStart) * 0.5;
    setViewStart(Math.max(0, mid - range / 2));
    setViewEnd(Math.min(1, mid + range / 2));
  }, [viewStart, viewEnd]);

  const zoomOut = useCallback(() => {
    const mid = (viewStart + viewEnd) / 2;
    const range = (viewEnd - viewStart) * 2;
    setViewStart(Math.max(0, mid - range / 2));
    setViewEnd(Math.min(1, mid + range / 2));
  }, [viewStart, viewEnd]);

  const zoomFit = useCallback(() => {
    setViewStart(0);
    setViewEnd(1);
  }, []);

  // ── Layout dimensions ───────────────────────────────────────────────
  const TOOLBAR_H = 32;
  const INFO_H = 28;
  const WAVEFORM_H = height - TOOLBAR_H - INFO_H - 16; // 16 for padding
  const WAVEFORM_W = width;

  // ── Waveform drawing ────────────────────────────────────────────────
  const drawWaveform = useCallback((g: Graphics) => {
    g.clear();
    const w = WAVEFORM_W;
    const h = WAVEFORM_H;

    // Background
    g.rect(0, 0, w, h).fill({ color: theme.bg.color, alpha: 1 });

    // Grid lines
    const gridColor = theme.border.color;
    // Center line
    g.moveTo(0, h / 2).lineTo(w, h / 2).stroke({ color: gridColor, width: 1, alpha: 0.5 });
    // Quarter lines
    g.moveTo(0, h / 4).lineTo(w, h / 4).stroke({ color: gridColor, width: 1, alpha: 0.2 });
    g.moveTo(0, h * 3 / 4).lineTo(w, h * 3 / 4).stroke({ color: gridColor, width: 1, alpha: 0.2 });

    if (!audioBuffer) {
      // Empty state — just the background
      return;
    }

    const data = audioBuffer.getChannelData(0);
    const totalSamples = data.length;
    const startSample = Math.floor(viewStart * totalSamples);
    const endSample = Math.floor(viewEnd * totalSamples);
    const visibleSamples = endSample - startSample;

    if (visibleSamples <= 0) return;

    // Draw waveform
    const waveColor = theme.error.color; // Red waveform like DOM version
    const samplesPerPixel = visibleSamples / w;

    g.moveTo(0, h / 2);
    if (samplesPerPixel <= 1) {
      // Zoomed in — draw each sample as a point
      for (let px = 0; px < w; px++) {
        const si = startSample + Math.floor(px * visibleSamples / w);
        if (si >= 0 && si < totalSamples) {
          const y = h / 2 - data[si] * (h / 2) * 0.9;
          if (px === 0) g.moveTo(px, y);
          else g.lineTo(px, y);
        }
      }
      g.stroke({ color: waveColor, width: 1.5 });
    } else {
      // Zoomed out — draw min/max per pixel
      for (let px = 0; px < w; px++) {
        const si = startSample + Math.floor(px * visibleSamples / w);
        const ei = Math.min(totalSamples - 1, startSample + Math.floor((px + 1) * visibleSamples / w));
        let min = 1;
        let max = -1;
        for (let i = si; i <= ei; i++) {
          const v = data[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const yMin = h / 2 - min * (h / 2) * 0.9;
        const yMax = h / 2 - max * (h / 2) * 0.9;
        g.moveTo(px, yMin).lineTo(px, yMax).stroke({ color: waveColor, width: 1 });
      }
    }

    // ── Loop region ────────────────────────────────────────────────────
    if (loopEnabled) {
      const lsX = ((loopStart - viewStart) / (viewEnd - viewStart)) * w;
      const leX = ((loopEnd - viewStart) / (viewEnd - viewStart)) * w;

      // Loop region fill
      if (leX > 0 && lsX < w) {
        const clampedStart = Math.max(0, lsX);
        const clampedEnd = Math.min(w, leX);
        g.rect(clampedStart, 0, clampedEnd - clampedStart, h)
          .fill({ color: theme.accent.color, alpha: 0.1 });
      }

      // Loop start marker
      if (lsX >= 0 && lsX <= w) {
        g.moveTo(lsX, 0).lineTo(lsX, h).stroke({ color: theme.accent.color, width: 2 });
        // Triangle handle
        g.moveTo(lsX, 0).lineTo(lsX + 8, 0).lineTo(lsX, 12).closePath()
          .fill({ color: theme.accent.color });
      }

      // Loop end marker
      if (leX >= 0 && leX <= w) {
        g.moveTo(leX, 0).lineTo(leX, h).stroke({ color: theme.accent.color, width: 2 });
        // Triangle handle (mirrored)
        g.moveTo(leX, 0).lineTo(leX - 8, 0).lineTo(leX, 12).closePath()
          .fill({ color: theme.accent.color });
      }
    }

    // ── 9xx offset markers ────────────────────────────────────────────
    if (offsetMarkers && audioBuffer) {
      const totalSamples = audioBuffer.length;
      const viewStartSample = Math.floor(viewStart * totalSamples);
      const viewEndSample = Math.floor(viewEnd * totalSamples);
      const visibleSamples = viewEndSample - viewStartSample;
      const markerColor = 0x00d2d2; // muted cyan

      for (const val of offsetMarkers) {
        const samplePos = val * 128;
        if (samplePos < viewStartSample || samplePos > viewEndSample) continue;
        const px = ((samplePos - viewStartSample) / visibleSamples) * w;

        // Dashed vertical line (approximate with short segments)
        for (let y = 0; y < h; y += 6) {
          g.moveTo(px, y).lineTo(px, Math.min(y + 3, h)).stroke({ color: markerColor, width: 1, alpha: 0.7 });
        }
      }
    }

    // ── Playback cursor ────────────────────────────────────────────────
    if (playbackPosition > 0) {
      const pX = ((playbackPosition - viewStart) / (viewEnd - viewStart)) * w;
      if (pX >= 0 && pX <= w) {
        g.moveTo(pX, 0).lineTo(pX, h).stroke({ color: theme.warning.color, width: 2 });
      }
    }
  }, [WAVEFORM_W, WAVEFORM_H, audioBuffer, viewStart, viewEnd, loopEnabled, loopStart, loopEnd, playbackPosition, theme, offsetMarkers]);

  // ── Pointer interaction for loop handle dragging ────────────────────
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    if (!audioBuffer || !loopEnabled) return;
    const bounds = (e.currentTarget as unknown as { getBounds(): { x: number; y: number; width: number } }).getBounds();
    const localX = e.global.x - bounds.x;
    const normX = viewStart + (localX / WAVEFORM_W) * (viewEnd - viewStart);

    const threshold = (viewEnd - viewStart) * 0.02; // 2% of visible range
    if (Math.abs(normX - loopStart) < threshold) {
      dragRef.current = 'loopStart';
      setDragTarget('loopStart');
    } else if (Math.abs(normX - loopEnd) < threshold) {
      dragRef.current = 'loopEnd';
      setDragTarget('loopEnd');
    }
  }, [audioBuffer, loopEnabled, loopStart, loopEnd, viewStart, viewEnd, WAVEFORM_W]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!dragRef.current) return;
    const bounds = (e.currentTarget as unknown as { getBounds(): { x: number; y: number; width: number } }).getBounds();
    const localX = e.global.x - bounds.x;
    const normX = Math.max(0, Math.min(1, viewStart + (localX / WAVEFORM_W) * (viewEnd - viewStart)));

    if (dragRef.current === 'loopStart') {
      updateParam('loopStart', Math.min(normX, loopEnd - 0.01));
    } else if (dragRef.current === 'loopEnd') {
      updateParam('loopEnd', Math.max(normX, loopStart + 0.01));
    }
  }, [viewStart, viewEnd, WAVEFORM_W, loopStart, loopEnd, updateParam]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setDragTarget(null);
  }, []);

  // ── Sample info ─────────────────────────────────────────────────────
  const sampleInfo = audioBuffer
    ? {
        length: audioBuffer.length,
        rate: audioBuffer.sampleRate,
        duration: audioBuffer.duration.toFixed(3),
        channels: audioBuffer.numberOfChannels,
      }
    : null;

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <layoutContainer layout={{ width, height, flexDirection: 'column', gap: 4 }}>
      {/* Toolbar */}
      <layoutContainer
        layout={{
          height: TOOLBAR_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 4,
          paddingRight: 4,
        }}
      >
        <PixiLabel text="SAMPLE EDITOR" size="xs" weight="bold" color="textSecondary" />

        <layoutContainer layout={{ flex: 1 }} />

        {/* Zoom controls */}
        <PixiButton
          icon="prev"
          label=""
          variant="ghost"
          size="sm"
          onClick={zoomIn}
          tooltip="Zoom In"
        />
        <PixiButton
          icon="next"
          label=""
          variant="ghost"
          size="sm"
          onClick={zoomOut}
          tooltip="Zoom Out"
        />
        <PixiButton
          label="Fit"
          variant="ghost"
          size="sm"
          onClick={zoomFit}
          tooltip="Zoom to Fit"
        />

        {/* Beat Sync button */}
        <PixiButton
          label="Beat Sync"
          variant="ghost"
          size="sm"
          disabled={!audioBuffer}
          onClick={() => setShowBeatSync(true)}
          tooltip="Fit sample to tracker rows"
        />

        {/* Record from mic */}
        <PixiButton
          label={isRecordingMic ? `REC ${micElapsed.toFixed(1)}s` : 'Rec'}
          variant={isRecordingMic ? 'danger' : 'ghost'}
          size="sm"
          onClick={handleToggleRecord}
          tooltip={isRecordingMic ? 'Stop recording' : 'Record from microphone'}
        />

        {/* Spectrum Filter button */}
        <PixiButton
          label="Filter"
          variant={showSpectrumFilter ? 'primary' : 'ghost'}
          size="sm"
          disabled={!audioBuffer}
          onClick={() => setShowSpectrumFilter(!showSpectrumFilter)}
          tooltip="Spectral filter curve editor"
        />

        {/* Loop toggle */}
        <layoutContainer
          layout={{
            width: 1,
            height: 16,
            backgroundColor: theme.border.color,
            marginLeft: 4,
            marginRight: 4,
          }}
        />
        <layoutContainer
          layout={{
            paddingLeft: 6,
            paddingRight: 6,
            height: 22,
            borderRadius: 4,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: loopEnabled ? theme.accent.color : 0x00000000,
            borderWidth: 1,
            borderColor: loopEnabled ? theme.accent.color : theme.border.color,
          }}
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => updateParam('loopEnabled', !loopEnabled)}
        >
          <PixiLabel
            text="LOOP"
            size="xs"
            weight="semibold"
            color={loopEnabled ? 'text' : 'textMuted'}
          />
        </layoutContainer>

        {loopEnabled && (
          <>
            <layoutContainer
              layout={{
                paddingLeft: 4,
                paddingRight: 4,
                height: 22,
                borderRadius: 4,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: loopType === 'forward' ? theme.accent.color : 0x00000000,
                borderWidth: 1,
                borderColor: loopType === 'forward' ? theme.accent.color : theme.border.color,
              }}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => updateParam('loopType', 'forward')}
            >
              <PixiLabel text="FWD" size="xs" color={loopType === 'forward' ? 'text' : 'textMuted'} />
            </layoutContainer>
            <layoutContainer
              layout={{
                paddingLeft: 4,
                paddingRight: 4,
                height: 22,
                borderRadius: 4,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: loopType === 'pingpong' ? theme.accent.color : 0x00000000,
                borderWidth: 1,
                borderColor: loopType === 'pingpong' ? theme.accent.color : theme.border.color,
              }}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => updateParam('loopType', 'pingpong')}
            >
              <PixiLabel text="PP" size="xs" color={loopType === 'pingpong' ? 'text' : 'textMuted'} />
            </layoutContainer>
          </>
        )}
      </layoutContainer>

      {/* Waveform area */}
      <layoutContainer
        layout={{
          width: WAVEFORM_W,
          height: WAVEFORM_H,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: theme.border.color,
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <layoutContainer layout={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <PixiLabel text="Loading sample..." size="sm" color="textMuted" />
          </layoutContainer>
        ) : error ? (
          <layoutContainer layout={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <PixiLabel text={`Error: ${error}`} size="xs" color="custom" customColor={theme.error.color} />
          </layoutContainer>
        ) : !audioBuffer ? (
          <layoutContainer layout={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <PixiLabel text="No sample loaded" size="sm" color="textMuted" />
            <PixiLabel text="Load a sample in the DOM editor" size="xs" color="textMuted" />
          </layoutContainer>
        ) : (
          <pixiGraphics
            draw={drawWaveform}
            layout={{ width: WAVEFORM_W, height: WAVEFORM_H }}
            eventMode="static"
            cursor={dragTarget ? 'ew-resize' : 'crosshair'}
            onPointerDown={handlePointerDown}
            onGlobalPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerUpOutside={handlePointerUp}
          />
        )}
      </layoutContainer>

      {/* Spectrum Filter Panel */}
      {showSpectrumFilter && (
        <PixiSpectrumFilterPanel
          audioBuffer={audioBuffer}
          selectionStart={-1}
          selectionEnd={-1}
          width={WAVEFORM_W}
          onApply={(buf) => {
            handleBufferProcessed(buf, 'Filter');
            setShowSpectrumFilter(false);
          }}
          onClose={() => setShowSpectrumFilter(false)}
        />
      )}

      {/* Loop sliders (when enabled) */}
      {loopEnabled && audioBuffer && (
        <layoutContainer layout={{ flexDirection: 'row', gap: 12, paddingLeft: 4, paddingRight: 4 }}>
          <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 2 }}>
            <PixiLabel text={`Loop Start: ${(loopStart * 100).toFixed(1)}%`} size="xs" color="textMuted" />
            <PixiSlider
              value={loopStart}
              min={0}
              max={0.99}
              step={0.001}
              onChange={(v) => updateParam('loopStart', Math.min(v, loopEnd - 0.01))}
              orientation="horizontal"
              length={width / 2 - 24}
              thickness={4}
              showValue={false}
            />
          </layoutContainer>
          <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 2 }}>
            <PixiLabel text={`Loop End: ${(loopEnd * 100).toFixed(1)}%`} size="xs" color="textMuted" />
            <PixiSlider
              value={loopEnd}
              min={0.01}
              max={1}
              step={0.001}
              onChange={(v) => updateParam('loopEnd', Math.max(v, loopStart + 0.01))}
              orientation="horizontal"
              length={width / 2 - 24}
              thickness={4}
              showValue={false}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* Sample info bar */}
      <layoutContainer
        layout={{
          height: INFO_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingLeft: 8,
          paddingRight: 8,
          backgroundColor: theme.bgSecondary.color,
          borderRadius: 4,
        }}
      >
        {sampleInfo ? (
          <>
            <PixiLabel
              text={`${sampleInfo.length.toLocaleString()} samples`}
              size="xs"
              color="textMuted"
            />
            <PixiLabel
              text={`${sampleInfo.rate} Hz`}
              size="xs"
              color="textMuted"
            />
            <PixiLabel
              text={`${sampleInfo.duration}s`}
              size="xs"
              color="textMuted"
            />
            <PixiLabel
              text={`${sampleInfo.channels}ch`}
              size="xs"
              color="textMuted"
            />
            <layoutContainer layout={{ flex: 1 }} />
            <PixiLabel
              text={`View: ${(viewStart * 100).toFixed(0)}% - ${(viewEnd * 100).toFixed(0)}%`}
              size="xs"
              color="textMuted"
            />
          </>
        ) : (
          <PixiLabel text="No sample" size="xs" color="textMuted" />
        )}
      </layoutContainer>

      {/* Beat Sync Dialog */}
      <PixiBeatSyncDialog
        isOpen={showBeatSync}
        onClose={() => setShowBeatSync(false)}
        audioBuffer={audioBuffer}
        onApply={(buf) => {
          handleBufferProcessed(buf, 'BeatSync');
          setShowBeatSync(false);
        }}
      />
    </layoutContainer>
  );
};
