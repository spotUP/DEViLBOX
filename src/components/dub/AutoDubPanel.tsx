/**
 * AutoDubPanel — toggle button + portal dropdown for autonomous dub performance.
 *
 * Renders a single "Auto Dub" button inline. Clicking it opens a dropdown
 * (via createPortal) containing: ON/OFF toggle, persona picker, voicing apply,
 * audition, move blacklist, and intensity slider. Matches the Auto DJ dropdown
 * pattern in DJView.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDubStore, type AutoDubPersonaId } from '@/stores/useDubStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { startAutoDub, stopAutoDub, isAutoDubRunning, AUTO_DUB_RULE_MOVES, runChannelAudioScrub, cancelChannelScrub } from '@/engine/dub/AutoDub';
import { useTransportStore } from '@/stores/useTransportStore';
import { getPersona, AUTO_DUB_PERSONAS } from '@/engine/dub/AutoDubPersonas';
import { fire as fireDub } from '@/engine/dub/DubRouter';
import { useFormatStore } from '@/stores/useFormatStore';
import { supportsChannelIsolation } from '@engine/tone/ChannelRoutedEffects';
import { useNotificationStore } from '@/stores/useNotificationStore';

interface AutoDubPanelProps {
  busEnabled: boolean;
}

export const AutoDubPanel: React.FC<AutoDubPanelProps> = ({ busEnabled }) => {
  const enabled = useDubStore(s => s.autoDubEnabled);
  const setEnabled = useDubStore(s => s.setAutoDubEnabled);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const intensity = useDubStore(s => s.autoDubIntensity);
  const setIntensity = useDubStore(s => s.setAutoDubIntensity);
  const persona = useDubStore(s => s.autoDubPersona);
  const setPersona = useDubStore(s => s.setAutoDubPersona);
  const blacklist = useDubStore(s => s.autoDubMoveBlacklist);
  const setBlacklist = useDubStore(s => s.setAutoDubMoveBlacklist);
  const setDubBus = useDrumPadStore(s => s.setDubBus);
  const editorMode = useFormatStore(s => s.editorMode);
  const hasSidData = useFormatStore(s => s.c64SidFileData !== null);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);

  // Click outside closes dropdown
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

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
        if (!isPlaying) {
          // Song is stopped — run a silent 5-second scrub to warm up the
          // runtime channel classifier before AutoDub fires its first move.
          setIsAnalyzing(true);
          runChannelAudioScrub((done) => {
            setIsAnalyzing(false);
            if (done) startAutoDub();
          }).catch(() => {
            setIsAnalyzing(false);
            startAutoDub(); // fall through even if scrub fails
          });
        } else {
          startAutoDub(); // Already playing — classifier is already running
        }
        // Warn if format lacks per-channel isolation (echo throws won't target individual channels)
        const isSID = hasSidData || ['sidfactory2', 'cheesecutter', 'goattracker'].includes(editorMode);
        if (isSID) {
          // Check if per-voice taps are available (jsSID with external AudioContext)
          import('@hooks/drumpad/useMIDIPadRouting').then(({ getDrumPadEngine }) => {
            const dpEngine = getDrumPadEngine();
            const dubBus = dpEngine?.getDubBus?.();
            // If per-voice taps exist (channelTaps has entries 0-2), per-channel echo throws work
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

  const handlePersonaChange = useCallback((id: AutoDubPersonaId) => {
    setPersona(id);
    setIntensity(getPersona(id).intensityDefault);
  }, [setPersona, setIntensity]);

  const applyPersonaVoice = useCallback(() => {
    const p = getPersona(persona);
    if (p.suggestedCharacterPreset) {
      setDubBus({ characterPreset: p.suggestedCharacterPreset });
    }
  }, [persona, setDubBus]);

  const auditionPersona = useCallback(() => {
    if (!busEnabled) setDubBus({ enabled: true });
    const p = getPersona(persona);
    fireDub(p.signatureMove, undefined, p.paramOverrides?.[p.signatureMove] ?? {}, 'live');
  }, [persona, busEnabled, setDubBus]);

  const handleToggle = useCallback(() => {
    if (!enabled && !busEnabled) setDubBus({ enabled: true });
    setEnabled(!enabled);
  }, [enabled, busEnabled, setEnabled, setDubBus]);

  const controlsDisabled = !enabled;
  const personaOptions = Object.values(AUTO_DUB_PERSONAS).map(p => ({ id: p.id, label: p.label }));
  const activeCount = AUTO_DUB_RULE_MOVES.length - blacklist.filter(m => AUTO_DUB_RULE_MOVES.includes(m)).length;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all ${
          open || enabled
            ? 'border-accent-highlight bg-accent-highlight/20 text-accent-highlight'
            : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
        }`}
        onClick={() => {
          if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 4, left: r.left });
          }
          setOpen(v => !v);
        }}
        title="Auto Dub — autonomous dub performer"
      >
        {isAnalyzing ? 'Analyzing...' : `Auto Dub${enabled ? ' ON' : ''}`}
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[99989] w-72 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl p-3 font-mono text-[11px]"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* Header: ON/OFF + Audition */}
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-bold transition-colors ${
                enabled
                  ? 'bg-accent-highlight/20 border-accent-highlight text-accent-highlight'
                  : 'bg-dark-bgTertiary border-dark-border text-text-primary hover:text-accent-highlight hover:border-accent-highlight'
              }`}
              onClick={handleToggle}
            >
              {enabled ? '● AUTO DUB ON' : '○ AUTO DUB OFF'}
            </button>
            <button
              type="button"
              className="px-2 py-1.5 rounded-md border bg-dark-bgTertiary border-dark-border text-text-muted hover:text-accent-highlight hover:border-accent-highlight transition-colors"
              onClick={auditionPersona}
              title={`Audition ${getPersona(persona).label}`}
            >
              ▶
            </button>
          </div>

          {/* Persona selector */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-text-muted text-xs w-16 shrink-0">Persona</span>
            <select
              className="flex-1 bg-dark-bgTertiary border border-dark-border rounded px-2 py-1 text-text-primary text-[11px] focus:ring-1 focus:ring-accent-highlight disabled:opacity-50"
              value={persona}
              onChange={(e) => handlePersonaChange(e.target.value as AutoDubPersonaId)}
              disabled={controlsDisabled}
              title={getPersona(persona).description}
            >
              {personaOptions.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            {getPersona(persona).suggestedCharacterPreset && (
              <button
                type="button"
                className="px-2 py-1 rounded border bg-dark-bgTertiary border-dark-border text-text-muted hover:text-accent-highlight hover:border-accent-highlight transition-colors disabled:opacity-50"
                onClick={applyPersonaVoice}
                disabled={controlsDisabled}
                title={`Load ${getPersona(persona).label}'s bus voicing`}
              >
                ♫
              </button>
            )}
          </div>

          {/* Intensity slider */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-text-muted text-xs w-16 shrink-0">Intensity</span>
            <input
              type="range" min={0} max={1} step={0.01}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="flex-1 accent-accent-highlight disabled:opacity-50"
              disabled={controlsDisabled}
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
      )}
    </>
  );
};
