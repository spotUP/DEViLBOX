/**
 * StemSeparatorPanel — Shared UI for Demucs stem separation.
 *
 * Used by:
 *  - Sample Editor (replace/extract stems)
 *  - Import Audio Dialog (extract as multiple instruments)
 *  - Beat Slicer (isolate drums, compact mode)
 *
 * Shows model download progress, separation progress, and per-stem action buttons.
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { Play, Square, Replace, Download, Loader2, AlertCircle, Layers, X } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { useStemSeparation } from '@/hooks/useStemSeparation';
import type { UseStemSeparationReturn } from '@/hooks/useStemSeparation';
import type { DemucsModelType } from '@/engine/demucs/types';
import * as Tone from 'tone';

// ── Stem color palette ────────────────────────────────────────────────

const STEM_COLORS: Record<string, string> = {
  drums:  '#f97316', // orange
  bass:   '#3b82f6', // blue
  vocals: '#ec4899', // pink
  other:  '#a855f7', // purple
  guitar: '#22c55e', // green
  piano:  '#eab308', // yellow
};

const STEM_LABELS: Record<string, string> = {
  drums:  'Drums',
  bass:   'Bass',
  vocals: 'Vocals',
  other:  'Other',
  guitar: 'Guitar',
  piano:  'Piano',
};

// ── Props ─────────────────────────────────────────────────────────────

interface StemSeparatorPanelProps {
  /** Source audio to separate */
  audioBuffer: AudioBuffer | null;
  /** Called when user clicks "Replace" on a stem — replaces current sample */
  onReplace?: (stemName: string, buffer: AudioBuffer) => void;
  /** Called when user clicks "Extract" on a stem — creates a new instrument */
  onExtract?: (stemName: string, buffer: AudioBuffer) => void;
  /** Called when user clicks "Extract All" — creates instruments for all stems */
  onExtractAll?: (stems: Map<string, AudioBuffer>) => void;
  /** Which model to use */
  model?: DemucsModelType;
  /** Compact mode for inline use (e.g., BeatSlicer) */
  compact?: boolean;
  /** Close callback */
  onClose?: () => void;
  /** External hook instance (optional — creates its own if not provided) */
  stemHook?: UseStemSeparationReturn;
}

// ── Component ─────────────────────────────────────────────────────────

export const StemSeparatorPanel: React.FC<StemSeparatorPanelProps> = ({
  audioBuffer,
  onReplace,
  onExtract,
  onExtractAll,
  model = '4s',
  compact = false,
  onClose,
  stemHook: externalHook,
}) => {
  const internalHook = useStemSeparation();
  const hook = externalHook ?? internalHook;
  const {
    isBusy, progress, progressMessage, error,
    stemNames, hasStems,
    separate, getStemBuffer, getAllStemBuffers, canSeparate, restoreFromCache, cleanup,
  } = hook;

  // Auto-restore stems from module-level cache on mount/buffer change
  useEffect(() => {
    if (!hasStems && audioBuffer && !isBusy) {
      restoreFromCache(audioBuffer);
    }
  }, [audioBuffer, hasStems, isBusy, restoreFromCache]);

  // Preview playback
  const previewPlayerRef = useRef<Tone.Player | null>(null);
  const previewingStemRef = useRef<string | null>(null);
  const [previewingStem, setPreviewingStem] = React.useState<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewPlayerRef.current) {
        previewPlayerRef.current.stop();
        previewPlayerRef.current.dispose();
        previewPlayerRef.current = null;
      }
      // Only cleanup if using internal hook (external hook is managed by caller)
      if (!externalHook) {
        cleanup();
      }
    };
  }, [cleanup, externalHook]);

  const handleSeparate = useCallback(() => {
    if (!audioBuffer || isBusy) return;
    separate(audioBuffer, model);
  }, [audioBuffer, isBusy, separate, model]);

  const handlePreview = useCallback((stemName: string) => {
    // Stop current preview
    if (previewPlayerRef.current) {
      previewPlayerRef.current.stop();
      previewPlayerRef.current.dispose();
      previewPlayerRef.current = null;
    }

    // If clicking the same stem, just stop
    if (previewingStemRef.current === stemName) {
      previewingStemRef.current = null;
      setPreviewingStem(null);
      return;
    }

    const buf = getStemBuffer(stemName);
    if (!buf) return;

    const player = new Tone.Player(buf).toDestination();
    player.onstop = () => {
      previewingStemRef.current = null;
      setPreviewingStem(null);
    };
    player.start();
    previewPlayerRef.current = player;
    previewingStemRef.current = stemName;
    setPreviewingStem(stemName);
  }, [getStemBuffer]);

  const handleReplace = useCallback((stemName: string) => {
    const buf = getStemBuffer(stemName);
    if (buf && onReplace) onReplace(stemName, buf);
  }, [getStemBuffer, onReplace]);

  const handleExtract = useCallback((stemName: string) => {
    const buf = getStemBuffer(stemName);
    if (buf && onExtract) onExtract(stemName, buf);
  }, [getStemBuffer, onExtract]);

  const handleExtractAll = useCallback(() => {
    if (onExtractAll) {
      onExtractAll(getAllStemBuffers());
    }
  }, [getAllStemBuffers, onExtractAll]);

  const suitable = canSeparate(audioBuffer);

  // ── Compact mode (BeatSlicer inline) ────────────────────────────────
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-[10px] font-mono">
        {isBusy ? (
          <>
            <Loader2 size={12} className="animate-spin text-accent-primary" />
            <span className="text-text-secondary">{Math.round(progress * 100)}%</span>
          </>
        ) : hasStems ? (
          <span className="text-accent-success">✓ Drums isolated</span>
        ) : (
          <button
            onClick={handleSeparate}
            disabled={!suitable}
            className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
            title={!suitable ? 'Sample too short for stem separation' : 'Isolate drums using AI'}
          >
            Isolate Drums
          </button>
        )}
        {error && <span className="text-accent-error text-[9px]">{error}</span>}
      </div>
    );
  }

  // ── Full panel mode ─────────────────────────────────────────────────
  return (
    <div className="bg-dark-bgTertiary border border-dark-borderLight rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-accent-highlight" />
          <span className="text-[11px] font-bold font-mono text-text-primary uppercase">
            Stem Separation
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!hasStems && !isBusy && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSeparate}
              disabled={!suitable || isBusy}
            >
              <Layers size={12} />
              Separate
            </Button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 text-text-muted"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Not suitable warning */}
      {audioBuffer && !suitable && (
        <div className="flex items-center gap-2 text-[10px] text-accent-warning font-mono">
          <AlertCircle size={12} />
          Sample too short ({audioBuffer.duration.toFixed(1)}s). Need 2s+ for stem separation.
        </div>
      )}

      {/* Progress bar */}
      {isBusy && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Loader2 size={12} className="animate-spin text-accent-primary" />
            <span className="text-[10px] font-mono text-text-secondary">
              {progressMessage || 'Processing...'}
            </span>
            <span className="text-[10px] font-mono text-text-muted ml-auto">
              {Math.round(progress * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-dark-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary rounded-full transition-all duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-[10px] text-accent-error font-mono">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {/* Stem rows */}
      {hasStems && (
        <div className="space-y-1">
          {stemNames.map((name) => {
            const color = STEM_COLORS[name] || '#888';
            const label = STEM_LABELS[name] || name;
            const isPreviewing = previewingStem === name;

            return (
              <div
                key={name}
                className="flex items-center gap-2 px-2 py-1.5 rounded bg-dark-bg/50"
              >
                {/* Color dot + label */}
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span
                  className="text-[11px] font-mono font-bold w-14"
                  style={{ color }}
                >
                  {label}
                </span>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {/* Preview */}
                  <button
                    onClick={() => handlePreview(name)}
                    className={`p-1 rounded transition-colors ${
                      isPreviewing
                        ? 'bg-accent-primary/20 text-accent-primary'
                        : 'hover:bg-white/10 text-text-secondary'
                    }`}
                    title={isPreviewing ? 'Stop preview' : `Preview ${label}`}
                  >
                    {isPreviewing ? <Square size={12} /> : <Play size={12} />}
                  </button>

                  {/* Replace */}
                  {onReplace && (
                    <button
                      onClick={() => handleReplace(name)}
                      className="p-1 rounded hover:bg-white/10 text-text-secondary"
                      title={`Replace sample with ${label} stem`}
                    >
                      <Replace size={12} />
                    </button>
                  )}

                  {/* Extract */}
                  {onExtract && (
                    <button
                      onClick={() => handleExtract(name)}
                      className="p-1 rounded hover:bg-white/10 text-text-secondary"
                      title={`Extract ${label} as new instrument`}
                    >
                      <Download size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Extract All */}
          {onExtractAll && stemNames.length > 1 && (
            <div className="flex justify-end pt-1">
              <Button variant="default" size="sm" onClick={handleExtractAll}>
                <Download size={12} />
                Extract All as Instruments
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
