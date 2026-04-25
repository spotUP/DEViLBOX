/**
 * AutoDubPanel — Auto Dub settings popover (intensity + move blacklist).
 *
 * All controls (ON/OFF toggle, style selection, audition) now live in the
 * DubDeckStrip header. This panel is purely the configuration detail panel,
 * opened by the ⚙ gear icon next to the AUTO DUB button.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDubStore } from '@/stores/useDubStore';
import { startAutoDub, stopAutoDub, isAutoDubRunning, AUTO_DUB_RULE_MOVES, runChannelAudioScrub, cancelChannelScrub } from '@/engine/dub/AutoDub';
import { useTransportStore } from '@/stores/useTransportStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { supportsChannelIsolation } from '@engine/tone/ChannelRoutedEffects';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useMixerStore } from '@/stores/useMixerStore';

interface AutoDubPanelProps {
  busEnabled: boolean;
  /** Whether the settings popover is open (controlled by parent DubDeckStrip). */
  open?: boolean;
  /** Called when the popover should close. */
  onClose?: () => void;
  /** Ref to the trigger button — used to position the popover. */
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
}

export const AutoDubPanel: React.FC<AutoDubPanelProps> = ({ busEnabled, open: openProp, onClose, anchorRef }) => {
  // Self-contained mode: when open/onClose/anchorRef are not provided (e.g. DJView),
  // the panel manages its own open state and renders its own trigger button.
  const selfContained = openProp === undefined;
  const [selfOpen, setSelfOpen] = useState(false);
  const selfBtnRef = useRef<HTMLButtonElement | null>(null);
  const open = selfContained ? selfOpen : openProp!;
  const effectiveOnClose = selfContained ? () => setSelfOpen(false) : onClose!;
  const effectiveAnchorRef = selfContained ? selfBtnRef : anchorRef!;
  const enabled = useDubStore(s => s.autoDubEnabled);
  const setEnabled = useDubStore(s => s.setAutoDubEnabled);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const intensity = useDubStore(s => s.autoDubIntensity);
  const setIntensity = useDubStore(s => s.setAutoDubIntensity);
  const blacklist = useDubStore(s => s.autoDubMoveBlacklist);
  const setBlacklist = useDubStore(s => s.setAutoDubMoveBlacklist);
  const editorMode = useFormatStore(s => s.editorMode);
  const hasSidData = useFormatStore(s => s.c64SidFileData !== null);

  const [pos, setPos] = useState({ top: 0, left: 0 });
  const dropRef = useRef<HTMLDivElement | null>(null);

  // Position popover below the anchor button when it opens
  useEffect(() => {
    if (open && effectiveAnchorRef.current) {
      const r = effectiveAnchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.right - 288 });
    }
  }, [open, effectiveAnchorRef]);

  // Click outside closes popover
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (effectiveAnchorRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      effectiveOnClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open, effectiveOnClose, effectiveAnchorRef]);

  // Escape key closes popover
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') effectiveOnClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, effectiveOnClose]);

  const toggleMove = useCallback((moveId: string, allowed: boolean) => {
    const current = new Set(blacklist);
    if (allowed) current.delete(moveId);
    else current.add(moveId);
    setBlacklist(Array.from(current));
  }, [blacklist, setBlacklist]);

  // When user stops playback mid-scrub, cancel the scrub
  useEffect(() => {
    if (!isPlaying && isAnalyzing) cancelChannelScrub();
  }, [isPlaying, isAnalyzing]);

  // Keep runtime engine in sync with store flag
  useEffect(() => {
    if (enabled && busEnabled) {
      if (!isAutoDubRunning()) {
        // Seed a baseline 15% send on channels that are fully at 0 so the
        // bus has some ambient wet signal between AutoDub moves.
        {
          const { channels, setChannelDubSend } = useMixerStore.getState();
          const visibleCount = Math.min(channels.length, 16);
          for (let i = 0; i < visibleCount; i++) {
            if ((channels[i]?.dubSend ?? 0) === 0) setChannelDubSend(i, 0.15);
          }
        }

        if (!isPlaying) {
          setIsAnalyzing(true);
          runChannelAudioScrub((done) => {
            setIsAnalyzing(false);
            if (done) startAutoDub();
          }).catch(() => {
            setIsAnalyzing(false);
            startAutoDub();
          });
        } else {
          startAutoDub();
        }

        const isSID = hasSidData || ['sidfactory2', 'cheesecutter', 'goattracker'].includes(editorMode);
        if (isSID) {
          import('@hooks/drumpad/useMIDIPadRouting').then(({ getDrumPadEngine }) => {
            const dpEngine = getDrumPadEngine();
            const dubBus = dpEngine?.getDubBus?.();
            const hasVoiceTaps = dubBus && [0, 1, 2].some(i => (dubBus as any).channelTaps?.has(i));
            useNotificationStore.getState().addNotification({
              type: 'info',
              message: hasVoiceTaps
                ? 'SID mode: per-voice echo throws active (jsSID engine)'
                : 'SID mode: mutes work per-voice, echo throws apply to full mix',
            });
          }).catch(() => {});
        } else if (!supportsChannelIsolation(editorMode)) {
          useNotificationStore.getState().addNotification({
            type: 'warning',
            message: `Auto Dub: "${editorMode}" has no per-channel isolation — echo throws apply to the full mix`,
          });
        }
      }
    } else {
      if (isAutoDubRunning()) stopAutoDub();
    }
  }, [enabled, busEnabled, editorMode, hasSidData, isPlaying]);

  // Panic event halts Auto Dub
  useEffect(() => {
    const onPanic = () => {
      if (isAutoDubRunning()) stopAutoDub();
      setEnabled(false);
    };
    window.addEventListener('dub-panic', onPanic);
    return () => window.removeEventListener('dub-panic', onPanic);
  }, [setEnabled]);

  const activeCount = AUTO_DUB_RULE_MOVES.length - blacklist.filter(m => AUTO_DUB_RULE_MOVES.includes(m)).length;

  const settingsPanel = open ? createPortal(
    <div
      ref={dropRef}
      className="fixed z-[99989] w-72 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl p-3 font-mono text-[11px]"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-text-secondary font-bold text-xs">AUTO DUB SETTINGS</span>
        {isAnalyzing && <span className="text-accent-warning text-xs animate-pulse">Analyzing...</span>}
      </div>

      {/* Intensity slider */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-text-muted text-xs w-16 shrink-0">Intensity</span>
        <input
          type="range" min={0} max={1} step={0.01}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
          className="flex-1 accent-accent-highlight disabled:opacity-50"
          disabled={!enabled}
          title={`${(intensity * 100).toFixed(0)}%`}
        />
        <span className="w-8 text-right text-text-secondary text-xs">{(intensity * 100).toFixed(0)}%</span>
      </div>

      {/* Move blacklist */}
      <div className="border-t border-dark-border pt-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-text-secondary font-bold text-xs">
            MOVES {activeCount}/{AUTO_DUB_RULE_MOVES.length}
          </span>
          <button
            type="button"
            className="text-text-muted hover:text-accent-highlight text-xs"
            onClick={() => setBlacklist([])}
            disabled={blacklist.length === 0}
          >
            reset
          </button>
        </div>
        <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
          {AUTO_DUB_RULE_MOVES.map(moveId => {
            const allowed = !blacklist.includes(moveId);
            return (
              <label
                key={moveId}
                className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-dark-bgHover cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={allowed}
                  onChange={(e) => toggleMove(moveId, e.target.checked)}
                  className="accent-accent-highlight"
                />
                <span className={`text-xs ${allowed ? 'text-text-primary' : 'text-text-muted line-through'}`}>
                  {moveId}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  // Self-contained mode (DJView): render own trigger button + settings panel
  if (selfContained) {
    return (
      <>
        <button
          ref={selfBtnRef}
          type="button"
          className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all ${
            selfOpen || enabled
              ? 'border-accent-highlight bg-accent-highlight/20 text-accent-highlight'
              : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
          }`}
          onClick={() => setSelfOpen(v => !v)}
          title="Auto Dub — autonomous dub performer"
        >
          {isAnalyzing ? 'Analyzing...' : `Auto Dub${enabled ? ' ON' : ''}`}
        </button>
        {settingsPanel}
      </>
    );
  }

  // Controlled mode (DubDeckStrip): just the portal panel
  return settingsPanel;
};
