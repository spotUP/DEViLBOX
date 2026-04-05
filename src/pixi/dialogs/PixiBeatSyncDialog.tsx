/**
 * PixiBeatSyncDialog — Fit a sample to a target number of tracker rows at a given BPM/speed.
 * Matches DOM: src/components/instruments/BeatSyncDialog.tsx
 *
 * Methods:
 *   Resample    — changes pitch, preserves transients exactly
 *   Time-stretch — preserves pitch via WSOLA overlap-add
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiLabel } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useTransportStore } from '@stores/useTransportStore';
import {
  calculateTargetDurationMs,
  previewBeatSync,
  type BeatSyncParams,
} from '@/lib/audio/BeatSyncProcessor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PixiBeatSyncDialogProps {
  isOpen: boolean;
  onClose: () => void;
  audioBuffer: AudioBuffer | null;
  onApply: (newBuffer: AudioBuffer) => void;
}

type Method = 'resample' | 'timestretch';

const ROW_PRESETS = [1, 2, 4, 8, 16, 32, 64] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms >= 1000) {
    return (ms / 1000).toFixed(3) + ' s';
  }
  return ms.toFixed(1) + ' ms';
}

function formatRatio(ratio: number): string {
  const pct = ((ratio - 1) * 100).toFixed(1);
  const sign = ratio >= 1 ? '+' : '';
  return `x${ratio.toFixed(4)}  (${sign}${pct}%)`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PixiBeatSyncDialog: React.FC<PixiBeatSyncDialogProps> = ({
  isOpen,
  onClose,
  audioBuffer,
  onApply,
}) => {
  const theme = usePixiTheme();
  const storeBpm = useTransportStore((s) => s.bpm);
  const storeSpeed = useTransportStore((s) => s.speed);

  const [bpm, setBpm] = useState(storeBpm);
  const [speed, setSpeed] = useState(storeSpeed);
  const [targetRows, setTargetRows] = useState(16);
  const [method, setMethod] = useState<Method>('resample');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewBufferRef = useRef<AudioBuffer | null>(null);

  // Sync BPM/speed from store when dialog opens
  useEffect(() => {
    if (isOpen) {
      setBpm(storeBpm);
      setSpeed(storeSpeed);
      setError(null);
    }
  }, [isOpen, storeBpm, storeSpeed]);

  // Stop preview on close
  useEffect(() => {
    if (!isOpen) {
      stopPreview();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const originalDurationMs = audioBuffer
    ? (audioBuffer.length / audioBuffer.sampleRate) * 1000
    : 0;

  const targetDurationMs = calculateTargetDurationMs(bpm, speed, targetRows);
  const ratio = originalDurationMs > 0 ? targetDurationMs / originalDurationMs : 1;

  // ─── Preview ───────────────────────────────────────────────────────────────

  const stopPreview = useCallback(() => {
    try {
      previewSourceRef.current?.stop();
    } catch (_) {
      // ignore — already stopped
    }
    previewSourceRef.current?.disconnect();
    previewSourceRef.current = null;
    previewCtxRef.current?.close().catch(() => undefined);
    previewCtxRef.current = null;
    setIsPreviewing(false);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!audioBuffer) return;
    if (isPreviewing) {
      stopPreview();
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const params: BeatSyncParams = { bpm, speed, targetRows, method };
      const result = await previewBeatSync(audioBuffer, params);
      previewBufferRef.current = result.buffer;

      const ctx = new AudioContext();
      previewCtxRef.current = ctx;

      const source = ctx.createBufferSource();
      source.buffer = result.buffer;
      source.connect(ctx.destination);
      source.start(0);
      previewSourceRef.current = source;
      setIsPreviewing(true);

      // Auto-stop when done
      const durationSec = result.buffer.length / result.buffer.sampleRate;
      source.onended = () => {
        if (previewSourceRef.current === source) {
          stopPreview();
        }
      };
      setTimeout(() => {
        if (previewSourceRef.current === source) {
          stopPreview();
        }
      }, (durationSec + 0.5) * 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setIsProcessing(false);
    }
  }, [audioBuffer, bpm, speed, targetRows, method, isPreviewing, stopPreview]);

  // ─── Apply ─────────────────────────────────────────────────────────────────

  const handleApply = useCallback(async () => {
    if (!audioBuffer) return;
    stopPreview();

    setIsProcessing(true);
    setError(null);
    try {
      let resultBuffer: AudioBuffer;

      // Reuse preview buffer if params haven't changed
      if (previewBufferRef.current) {
        resultBuffer = previewBufferRef.current;
      } else {
        const params: BeatSyncParams = { bpm, speed, targetRows, method };
        const result = await previewBeatSync(audioBuffer, params);
        resultBuffer = result.buffer;
      }

      onApply(resultBuffer);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
      setIsProcessing(false);
    }
  }, [audioBuffer, bpm, speed, targetRows, method, stopPreview, onApply, onClose]);

  // Invalidate cached preview buffer whenever params change
  useEffect(() => {
    previewBufferRef.current = null;
  }, [bpm, speed, targetRows, method]);

  // ─── Numeric spinner (BPM / Speed) ────────────────────────────────────────

  const handleClose = useCallback(() => {
    stopPreview();
    onClose();
  }, [stopPreview, onClose]);

  if (!isOpen) return null;

  // Ratio is extreme — warn the user
  const ratioWarning = originalDurationMs > 0 && (ratio > 1.5 || ratio < 0.5);

  return (
    <PixiModal isOpen={isOpen} onClose={handleClose} width={420} height={420}>
      <PixiModalHeader title="Beat Sync" subtitle="Fit sample to tracker rows" onClose={handleClose} />

      {/* Body */}
      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 14, overflow: 'hidden' }}>

        {/* ─── BPM / Speed row ─── */}
        <layoutContainer layout={{ flexDirection: 'row', gap: 12 }}>
          {/* BPM */}
          <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 4 }}>
            <PixiLabel text="BPM" size="xs" weight="bold" color="textMuted" />
            <layoutContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <PixiButton label="-" variant="ghost" size="sm" onClick={() => setBpm(Math.max(20, bpm - 1))} />
              <pixiBitmapText
                text={String(bpm)}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 16, fill: 0xffffff }}
                tint={theme.text.color}
                layout={{ minWidth: 36, alignSelf: 'center' }}
              />
              <PixiButton label="+" variant="ghost" size="sm" onClick={() => setBpm(Math.min(999, bpm + 1))} />
            </layoutContainer>
          </layoutContainer>

          {/* Speed */}
          <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 4 }}>
            <PixiLabel text="Speed (ticks/row)" size="xs" weight="bold" color="textMuted" />
            <layoutContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <PixiButton label="-" variant="ghost" size="sm" onClick={() => setSpeed(Math.max(1, speed - 1))} />
              <pixiBitmapText
                text={String(speed)}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 16, fill: 0xffffff }}
                tint={theme.text.color}
                layout={{ minWidth: 36, alignSelf: 'center' }}
              />
              <PixiButton label="+" variant="ghost" size="sm" onClick={() => setSpeed(Math.min(31, speed + 1))} />
            </layoutContainer>
          </layoutContainer>
        </layoutContainer>

        {/* ─── Target Rows ─── */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 6 }}>
          <PixiLabel text="Target Rows" size="xs" weight="bold" color="textMuted" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {ROW_PRESETS.map((r) => (
              <PixiButton
                key={r}
                label={String(r)}
                variant={targetRows === r ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setTargetRows(r)}
              />
            ))}
            {/* Custom rows spinner */}
            <PixiButton label="-" variant="ghost" size="sm" onClick={() => setTargetRows(Math.max(1, targetRows - 1))} />
            <pixiBitmapText
              text={String(targetRows)}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 16, fill: 0xffffff }}
              tint={ROW_PRESETS.includes(targetRows as typeof ROW_PRESETS[number]) ? theme.textMuted.color : theme.accent.color}
              layout={{ minWidth: 30, alignSelf: 'center' }}
            />
            <PixiButton label="+" variant="ghost" size="sm" onClick={() => setTargetRows(Math.min(256, targetRows + 1))} />
          </layoutContainer>
        </layoutContainer>

        {/* ─── Method ─── */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 6 }}>
          <PixiLabel text="Method" size="xs" weight="bold" color="textMuted" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
            <PixiButton
              label="Resample"
              variant={method === 'resample' ? 'primary' : 'default'}
              size="sm"
              onClick={() => setMethod('resample')}
              layout={{ flex: 1 }}
            />
            <PixiButton
              label="Time-Stretch"
              variant={method === 'timestretch' ? 'primary' : 'default'}
              size="sm"
              onClick={() => setMethod('timestretch')}
              layout={{ flex: 1 }}
            />
          </layoutContainer>
          <PixiLabel
            text={method === 'resample'
              ? 'Changes pitch to fit duration. Fast, exact.'
              : 'Preserves pitch via WSOLA overlap-add. Slower.'}
            size="xs"
            color="textMuted"
            font="sans"
          />
        </layoutContainer>

        {/* ─── Readout ─── */}
        <layoutContainer
          layout={{
            flexDirection: 'column',
            gap: 6,
            padding: 12,
            borderRadius: 6,
            backgroundColor: theme.bgTertiary.color,
            borderWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          {/* Original */}
          <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <pixiBitmapText
              text="Original"
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
            <pixiBitmapText
              text={originalDurationMs > 0 ? formatMs(originalDurationMs) : '--'}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{}}
            />
          </layoutContainer>

          {/* Target */}
          <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <pixiBitmapText
              text={`Target (${targetRows} rows)`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
            <pixiBitmapText
              text={formatMs(targetDurationMs)}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
              tint={theme.accent.color}
              layout={{}}
            />
          </layoutContainer>

          {/* Divider */}
          <layoutContainer
            layout={{
              height: 1,
              backgroundColor: theme.border.color,
            }}
          />

          {/* Ratio */}
          <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <pixiBitmapText
              text="Ratio"
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
            <pixiBitmapText
              text={originalDurationMs > 0 ? formatRatio(ratio) : '--'}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
              tint={ratioWarning ? theme.warning.color : theme.textSecondary.color}
              layout={{}}
            />
          </layoutContainer>
        </layoutContainer>

        {/* ─── Error ─── */}
        {error && (
          <layoutContainer
            layout={{
              padding: 10,
              borderRadius: 6,
              backgroundColor: theme.error.color,
              borderWidth: 1,
              borderColor: theme.error.color,
            }}
          >
            <PixiLabel text={error} size="xs" color="text" font="sans" />
          </layoutContainer>
        )}
      </layoutContainer>

      {/* ─── Footer ─── */}
      <PixiModalFooter align="between">
        {/* Preview button on the left */}
        <PixiButton
          icon={isPreviewing ? 'stop' : 'play'}
          label={isPreviewing ? 'Stop' : 'Preview'}
          variant="ghost"
          size="sm"
          disabled={!audioBuffer || isProcessing}
          onClick={handlePreview}
        />

        {/* Cancel / Apply on the right */}
        <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
          <PixiButton label="Cancel" variant="ghost" size="sm" onClick={handleClose} />
          <PixiButton
            label={isProcessing ? 'Processing...' : 'Apply'}
            variant="primary"
            size="sm"
            disabled={!audioBuffer || isProcessing}
            onClick={handleApply}
          />
        </layoutContainer>
      </PixiModalFooter>
    </PixiModal>
  );
};
