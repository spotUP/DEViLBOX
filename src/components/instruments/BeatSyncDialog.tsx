/**
 * BeatSyncDialog - Fit a sample to a target number of tracker rows at a given BPM/speed.
 *
 * Methods:
 *   Resample  — changes pitch, preserves transients exactly
 *   Time-stretch — preserves pitch via WSOLA overlap-add
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import { Clock, Play, Square } from 'lucide-react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { useTransportStore } from '@stores/useTransportStore';
import {
  calculateTargetDurationMs,
  previewBeatSync,
  type BeatSyncParams,
} from '@/lib/audio/BeatSyncProcessor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BeatSyncDialogProps {
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
  return `×${ratio.toFixed(4)}  (${sign}${pct}%)`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const BeatSyncDialog: React.FC<BeatSyncDialogProps> = ({
  isOpen,
  onClose,
  audioBuffer,
  onApply,
}) => {
  const storeBpm = useTransportStore((s) => s.bpm);
  const storeSpeed = useTransportStore((s) => s.speed);

  const [bpm, setBpm] = useState(storeBpm);
  const [speed, setSpeed] = useState(storeSpeed);
  const [targetRows, setTargetRows] = useState(16);
  const [customRows, setCustomRows] = useState('');
  const [useCustomRows, setUseCustomRows] = useState(false);
  const [method, setMethod] = useState<Method>('resample');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewPlayerRef = useRef<Tone.Player | null>(null);
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

  const effectiveRows = useCustomRows
    ? Math.max(1, parseInt(customRows, 10) || 1)
    : targetRows;

  const originalDurationMs = audioBuffer
    ? (audioBuffer.length / audioBuffer.sampleRate) * 1000
    : 0;

  const targetDurationMs = calculateTargetDurationMs(bpm, speed, effectiveRows);
  const ratio = originalDurationMs > 0 ? targetDurationMs / originalDurationMs : 1;

  // ─── Preview ───────────────────────────────────────────────────────────────

  const stopPreview = useCallback(() => {
    try {
      previewPlayerRef.current?.stop();
    } catch (_) {
      // ignore
    }
    previewPlayerRef.current?.disconnect();
    previewPlayerRef.current = null;
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
      const params: BeatSyncParams = { bpm, speed, targetRows: effectiveRows, method };
      const result = await previewBeatSync(audioBuffer, params);
      previewBufferRef.current = result.buffer;

      const toneBuffer = new Tone.ToneAudioBuffer(result.buffer);
      const player = new Tone.Player(toneBuffer).toDestination();
      previewPlayerRef.current = player;

      await Tone.start();
      player.start();
      setIsPreviewing(true);

      // Auto-stop when done
      const durationSec = result.buffer.length / result.buffer.sampleRate;
      setTimeout(() => {
        if (previewPlayerRef.current === player) {
          stopPreview();
        }
      }, (durationSec + 0.2) * 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setIsProcessing(false);
    }
  }, [audioBuffer, bpm, speed, effectiveRows, method, isPreviewing, stopPreview]);

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
        const params: BeatSyncParams = { bpm, speed, targetRows: effectiveRows, method };
        const result = await previewBeatSync(audioBuffer, params);
        resultBuffer = result.buffer;
      }

      onApply(resultBuffer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
      setIsProcessing(false);
    }
  }, [audioBuffer, bpm, speed, effectiveRows, method, stopPreview, onApply]);

  // Invalidate cached preview buffer whenever params change
  useEffect(() => {
    previewBufferRef.current = null;
  }, [bpm, speed, effectiveRows, method]);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { stopPreview(); onClose(); }}
      onConfirm={handleApply}
      confirmDisabled={!audioBuffer || isProcessing}
      size="md"
    >
      <ModalHeader
        title="Beat Sync"
        subtitle="Fit sample to tracker rows"
        icon={<Clock size={16} />}
        onClose={() => { stopPreview(); onClose(); }}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ─── BPM / Speed row ─── */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider">BPM</span>
            <input
              type="number"
              min={20}
              max={999}
              value={bpm}
              onChange={(e) => setBpm(Math.max(20, Math.min(999, parseInt(e.target.value, 10) || 125)))}
              className="bg-dark-bgTertiary border border-dark-border rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-accent-primary w-full"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider">Speed (ticks/row)</span>
            <input
              type="number"
              min={1}
              max={31}
              value={speed}
              onChange={(e) => setSpeed(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 6)))}
              className="bg-dark-bgTertiary border border-dark-border rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-accent-primary w-full"
            />
          </label>
        </div>

        {/* ─── Target Rows ─── */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider">Target Rows</span>
          <div className="flex flex-wrap gap-1">
            {ROW_PRESETS.map((r) => (
              <button
                key={r}
                onClick={() => { setTargetRows(r); setUseCustomRows(false); }}
                className={
                  'px-2 py-1 rounded text-[11px] font-bold transition-colors border ' +
                  (!useCustomRows && targetRows === r
                    ? 'bg-cyan-500 text-text-primary border-cyan-500'
                    : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20')
                }
              >
                {r}
              </button>
            ))}
            <button
              onClick={() => setUseCustomRows(true)}
              className={
                'px-2 py-1 rounded text-[11px] font-bold transition-colors border ' +
                (useCustomRows
                  ? 'bg-cyan-500 text-text-primary border-cyan-500'
                  : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20')
              }
            >
              Custom
            </button>
          </div>
          {useCustomRows && (
            <input
              type="number"
              min={1}
              value={customRows}
              placeholder="e.g. 48"
              onChange={(e) => setCustomRows(e.target.value)}
              className="bg-dark-bgTertiary border border-dark-border rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-accent-primary w-24"
              autoFocus
            />
          )}
        </div>

        {/* ─── Method ─── */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider">Method</span>
          <div className="flex gap-2">
            {(['resample', 'timestretch'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={
                  'flex-1 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider transition-colors border ' +
                  (method === m
                    ? 'bg-accent-primary text-text-primary border-accent-primary'
                    : 'bg-dark-bgTertiary text-text-secondary border-dark-border hover:border-accent-primary/50')
                }
              >
                {m === 'resample' ? 'Resample' : 'Time-Stretch'}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-text-muted">
            {method === 'resample'
              ? 'Changes pitch to fit duration. Fast, exact.'
              : 'Preserves pitch via WSOLA overlap-add. Slower.'}
          </p>
        </div>

        {/* ─── Readout ─── */}
        <div className="bg-dark-bgTertiary rounded border border-dark-border p-3 space-y-1.5 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-text-muted">Original</span>
            <span className="text-text-primary">{formatMs(originalDurationMs)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Target ({effectiveRows} rows)</span>
            <span className="text-cyan-400">{formatMs(targetDurationMs)}</span>
          </div>
          <div className="border-t border-dark-border pt-1.5 flex justify-between">
            <span className="text-text-muted">Ratio</span>
            <span className={ratio > 1.5 || ratio < 0.5 ? 'text-accent-warning' : 'text-text-secondary'}>
              {originalDurationMs > 0 ? formatRatio(ratio) : '—'}
            </span>
          </div>
        </div>

        {/* ─── Error ─── */}
        {error && (
          <div className="bg-accent-error/10 border border-accent-error/30 rounded px-3 py-2 text-xs text-accent-error">
            {error}
          </div>
        )}
      </div>

      <ModalFooter align="between">
        <button
          onClick={handlePreview}
          disabled={!audioBuffer || isProcessing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase transition-colors border disabled:opacity-40 disabled:cursor-not-allowed bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20"
        >
          {isPreviewing ? <Square size={11} /> : <Play size={11} />}
          {isPreviewing ? 'Stop' : 'Preview'}
        </button>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => { stopPreview(); onClose(); }}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!audioBuffer || isProcessing}
            onClick={handleApply}
          >
            {isProcessing ? 'Processing…' : 'Apply'}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
};
