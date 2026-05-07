/**
 * InstrumentList - Unified scrollable list of all instruments
 * Supports both default styling and FT2 styling variants
 * Shows instrument number, name, and synth type
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useUIStore } from '@stores/useUIStore';
import { useShallow } from 'zustand/react/shallow';
import { getSynthInfo } from '@constants/synthCategories';
import { getSynthBadge } from '@constants/channelTypeCompat';
import { useInstrumentTypeStore } from '@stores/useInstrumentTypeStore';
import { instrumentTypeLabel } from '@/bridge/analysis/AudioSetInstrumentMap';
import type { InstrumentType } from '@/bridge/analysis/AudioSetInstrumentMap';
import { analyzeSampleForClassification } from '@/bridge/analysis/SampleSpectrum';
import { Plus, Trash2, Copy, Repeat, Repeat1, Pencil, ExternalLink, Download, Upload } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

import { InstrumentContextMenu } from './InstrumentContextMenu';
import { AddInstrumentDialog } from './AddInstrumentDialog';
import { focusPopout } from '@components/ui/PopOutWindow';
import { getToneEngine } from '@engine/ToneEngine';
import * as Tone from 'tone';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';
import {
  DEFAULT_TB303,
  DEFAULT_DRUM_MACHINE,
  DEFAULT_CHIP_SYNTH,
  DEFAULT_PWM_SYNTH,
  DEFAULT_WAVETABLE,
  DEFAULT_GRANULAR,
  DEFAULT_SUPERSAW,
  DEFAULT_POLYSYNTH,
  DEFAULT_ORGAN,
  DEFAULT_STRING_MACHINE,
  DEFAULT_FORMANT_SYNTH,
  DEFAULT_FURNACE,
  DEFAULT_CHIPTUNE_MODULE,
  DEFAULT_WOBBLE_BASS,
  DEFAULT_DRUMKIT,
} from '@typedefs/instrument';
import { exportAsAhi } from '@lib/export/HivelyExporter';
import { parseAhiFile } from '@lib/import/formats/HivelyParser';
import { exportMusicLineInstrument } from '@lib/export/MusicLineExporter';
import { parseMusicLineInstrument } from '@lib/import/formats/MusicLineParser';
import { SYSTEM_PRESETS } from '@constants/systemPresets';

interface InstrumentListProps {
  /** Optional: Compact mode for sidebar */
  compact?: boolean;
  /** Optional: Max height for scrolling */
  maxHeight?: string;
  /** Optional: Show add/delete buttons */
  showActions?: boolean;
  /** Optional: Callback when instrument changes */
  onInstrumentChange?: (id: number) => void;
  /** Optional: Preview instrument on click */
  showPreviewOnClick?: boolean;
  /** Optional: Show edit button in action bar */
  showEditButton?: boolean;
  /** Optional: Callback when edit button is clicked */
  onEditInstrument?: (id: number) => void;
  /** Optional: Use FT2 styling */
  variant?: 'default' | 'ft2';
  /** Optional: Callback when create new is clicked */
  onCreateNew?: () => void;
}

// PERFORMANCE: Memoize to prevent expensive re-renders on every scroll step
export const InstrumentList: React.FC<InstrumentListProps> = memo(({
  compact = false,
  maxHeight = '300px',
  showActions = true,
  onInstrumentChange,
  showPreviewOnClick = false,
  showEditButton = false,
  onEditInstrument,
  variant = 'default',
}) => {
  const {
    instruments,
    currentInstrumentId,
    setCurrentInstrument,
    createInstrument,
    deleteInstrument,
    cloneInstrument,
    updateInstrument,
  } = useInstrumentStore(useShallow((state) => ({
    instruments: state.instruments,
    currentInstrumentId: state.currentInstrumentId,
    setCurrentInstrument: state.setCurrentInstrument,
    createInstrument: state.createInstrument,
    deleteInstrument: state.deleteInstrument,
    cloneInstrument: state.cloneInstrument,
    updateInstrument: state.updateInstrument,
  })));

  const { useHexNumbers, setInstrumentEditorPoppedOut, instrumentEditorPoppedOut, activeSystemPreset, showNewInstrumentBrowser, setShowNewInstrumentBrowser } = useUIStore(useShallow(s => ({
    useHexNumbers: s.useHexNumbers,
    setInstrumentEditorPoppedOut: s.setInstrumentEditorPoppedOut,
    instrumentEditorPoppedOut: s.instrumentEditorPoppedOut,
    activeSystemPreset: s.activeSystemPreset,
    showNewInstrumentBrowser: s.showNewInstrumentBrowser,
    setShowNewInstrumentBrowser: s.setShowNewInstrumentBrowser,
  })));
  const cedResults = useInstrumentTypeStore(s => s.results);
  const cedPending = useInstrumentTypeStore(s => s.pendingIds);
  const setManualType = useInstrumentTypeStore(s => s.setManualType);
  const [typePickerFor, setTypePickerFor] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const isPreviewingRef = useRef(false);
  const previewInfoRef = useRef<{ instId: number; note: string; inst: InstrumentConfig; type?: 'gt' | 'sf2' } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const isFT2 = variant === 'ft2';

  // Inject animation keyframes once
  useEffect(() => {
    const id = 'instrument-list-keyframes';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = `
        @keyframes ft2-select-flash {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes ced-scan {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(500%); }
        }
      `;
      document.head.appendChild(s);
    }
  }, []);

  // Flash animation — briefly highlights a newly selected row
  const [flashId, setFlashId] = useState<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  // Scroll to selected + fire flash animation when selection changes
  useEffect(() => {
    if (currentInstrumentId == null) return;
    setFlashId(currentInstrumentId);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashId(null), 380);
    if (selectedRef.current && listRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); };
  }, [currentInstrumentId]);

  // Start previewing an instrument (called after hold delay)
  const startPreview = useCallback(async (inst: InstrumentConfig) => {
    try {
      await Tone.start();
      let attempts = 0;
      while (Tone.context.state !== 'running' && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 50));
        attempts++;
      }
      if (Tone.context.state !== 'running') return;

      if (previewTimeoutRef.current) window.clearTimeout(previewTimeoutRef.current);

      const engine = getToneEngine();
      await engine.ensureInstrumentReady(inst);

      const isModSample = inst.metadata?.modPlayback?.usePeriodPlayback
        || (inst as any).modPlayback?.usePeriodPlayback;
      const isSampleInst = inst.type === 'sample' || inst.synthType === 'Sampler' || inst.synthType === 'Player';
      const rawPreviewNote = (isSampleInst && inst.sample?.baseNote)
        ? inst.sample.baseNote
        : isModSample
          ? (inst.sample?.baseNote || 'C4')
          : 'C4';
      const previewNote = rawPreviewNote.replace('-', '');
      const now = Tone.now();

      const toneInst = engine.getInstrument(inst.id, inst);
      const isEmptySampler = toneInst && inst.synthType === 'Sampler' && !inst.sample?.url && !inst.sample?.audioBuffer;

      // GT Ultra SID: hold-to-preview via WASM SID engine
      if (inst.synthType === 'GTUltraSynth') {
        const { useGTUltraStore } = await import('@stores/useGTUltraStore');
        const gtEngine = useGTUltraStore.getState().engine;
        if (gtEngine) {
          const gtInstIdx = Math.max(1, Math.min(63, inst.id));
          gtEngine.playTestNote(0, 0x60 + 3 * 12, gtInstIdx);
          isPreviewingRef.current = true;
          previewInfoRef.current = { instId: inst.id, note: previewNote, inst, type: 'gt' };
        }
        return;
      }

      if (inst.synthType === 'UADESynth') return;

      // SF2: hold-to-preview via SF2Engine's memory-mapped note trigger
      if (inst.synthType === 'SF2Synth') {
        const { getTrackerReplayer } = await import('@/engine/TrackerReplayer');
        const sf2Engine = getTrackerReplayer()?.getSF2Engine?.();
        if (sf2Engine?.canEdit) {
          const sf2InstIdx = Math.max(0, inst.id - 1); // 0-based for driver
          // Extract octave from previewNote (e.g. "C4" → 4)
          const octave = parseInt(previewNote.slice(-1), 10) || 4;
          const sf2Note = 0x30 + (octave - 4) * 12;
          sf2Engine.playTestNote(0, sf2Note, sf2InstIdx);
          isPreviewingRef.current = true;
          previewInfoRef.current = { instId: inst.id, note: previewNote, inst, type: 'sf2' };
        }
        return;
      }

      if (!toneInst || isEmptySampler) {
        // Fallback oscillator — self-timed (400ms)
        const wfMap: Record<string, OscillatorType> = {
          StartrekkerAMSynth: 'sine', C64SID: 'square', Sc68Synth: 'square', Sampler: 'triangle',
        };
        const wf = wfMap[inst.synthType ?? ''] ?? 'triangle';
        const osc = new Tone.Oscillator(Tone.Frequency(previewNote).toFrequency(), wf).toDestination();
        const env = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.1 }).toDestination();
        osc.connect(env);
        osc.start(now);
        env.triggerAttack(now);
        previewTimeoutRef.current = window.setTimeout(() => {
          env.triggerRelease(Tone.now());
          setTimeout(() => { osc.stop(); osc.dispose(); env.dispose(); }, 200);
        }, 400);
        return;
      }

      // Main path: trigger attack, hold until mouseUp releases
      engine.triggerNoteAttack(inst.id, previewNote, now, 0.8, inst);
      isPreviewingRef.current = true;
      previewInfoRef.current = { instId: inst.id, note: previewNote, inst };
    } catch (error) {
      console.warn('[InstrumentList] Preview failed:', error);
    }
  }, []);

  // Stop the current preview (called on mouseUp / mouseLeave)
  const stopPreview = useCallback(() => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!isPreviewingRef.current || !previewInfoRef.current) return;
    const info = previewInfoRef.current;
    isPreviewingRef.current = false;
    previewInfoRef.current = null;
    try {
      if (info.type === 'gt') {
        import('@stores/useGTUltraStore').then(({ useGTUltraStore }) => {
          useGTUltraStore.getState().engine?.releaseTestNote(0);
        });
      } else if (info.type === 'sf2') {
        import('@/engine/TrackerReplayer').then(({ getTrackerReplayer }) => {
          getTrackerReplayer()?.getSF2Engine?.()?.releaseTestNote(0);
        });
      } else {
        const engine = getToneEngine();
        engine.triggerNoteRelease(info.instId, info.note, Tone.now(), info.inst);
      }
    } catch { /* non-fatal */ }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    if (previewTimeoutRef.current) window.clearTimeout(previewTimeoutRef.current);
  }, []);

  const handleSelect = (id: number, _inst: InstrumentConfig) => {
    setCurrentInstrument(id);
    onInstrumentChange?.(id);
  };

  // Hold-to-preview: mouseDown starts a timer, mouseUp releases
  const handlePreviewDown = useCallback((inst: InstrumentConfig) => {
    if (!showPreviewOnClick) return;
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => startPreview(inst), 200);
    document.addEventListener('mouseup', () => stopPreview(), { once: true });
  }, [showPreviewOnClick, startPreview, stopPreview]);

  const handlePreviewUp = useCallback(() => {
    stopPreview();
  }, [stopPreview]);

  const handleAdd = () => {
    setShowNewInstrumentBrowser(true);
  };

  const handleCreateWithSynthType = (synthType: SynthType) => {
    // Format compat warning handled by createInstrument in the store
    const synthInfo = getSynthInfo(synthType);
    const config: Partial<InstrumentConfig> = {
      synthType,
      name: synthInfo.name,
    };
    // Initialize synth-specific sub-configs
    switch (synthType) {
      case 'TB303': config.tb303 = { ...DEFAULT_TB303 }; break;
      case 'DrumMachine': config.drumMachine = { ...DEFAULT_DRUM_MACHINE }; break;
      case 'ChipSynth': config.chipSynth = { ...DEFAULT_CHIP_SYNTH }; break;
      case 'PWMSynth': config.pwmSynth = { ...DEFAULT_PWM_SYNTH }; break;
      case 'Wavetable': config.wavetable = { ...DEFAULT_WAVETABLE }; break;
      case 'GranularSynth': config.granular = { ...DEFAULT_GRANULAR }; break;
      case 'SuperSaw': config.superSaw = { ...DEFAULT_SUPERSAW }; break;
      case 'PolySynth': config.polySynth = { ...DEFAULT_POLYSYNTH }; break;
      case 'Organ': config.organ = { ...DEFAULT_ORGAN }; break;
      case 'StringMachine': config.stringMachine = { ...DEFAULT_STRING_MACHINE }; break;
      case 'FormantSynth': config.formantSynth = { ...DEFAULT_FORMANT_SYNTH }; break;
      case 'Furnace': config.furnace = { ...DEFAULT_FURNACE }; break;
      case 'ChiptuneModule': config.chiptuneModule = { ...DEFAULT_CHIPTUNE_MODULE }; break;
      case 'WobbleBass': config.wobbleBass = { ...DEFAULT_WOBBLE_BASS }; break;
      case 'DrumKit': config.drumKit = { ...DEFAULT_DRUMKIT }; break;
    }
    createInstrument(config as any);
    setShowNewInstrumentBrowser(false);
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (instruments.length > 1) {
      deleteInstrument(id);
    }
  };

  const handleClone = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    cloneInstrument(id);
  };

  // Start editing instrument name
  const handleStartEdit = (e: React.MouseEvent, id: number, name: string) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingName(name);
    // Focus the input after render
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  // Save edited name
  const handleSaveEdit = () => {
    if (editingId !== null && editingName.trim()) {
      updateInstrument(editingId, { name: editingName.trim() });
    }
    setEditingId(null);
    setEditingName('');
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  // Handle key press in edit input
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  // Pop out instrument editor for a specific instrument
  const handlePopOut = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setCurrentInstrument(id);
    if (instrumentEditorPoppedOut) {
      focusPopout('DEViLBOX — Instrument Editor');
    } else {
      setInstrumentEditorPoppedOut(true);
    }
  };

  const handleSaveAhi = useCallback((e: React.MouseEvent, inst: InstrumentConfig) => {
    e.stopPropagation();
    if (!inst.hively) return;
    const bytes = exportAsAhi(inst.hively, inst.name);
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${inst.name.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'instrument'}.ahi`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleLoadAhi = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ahi';
    input.onchange = async (ev: Event) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const { config, name } = parseAhiFile(buffer);
        updateInstrument(id, { hively: config, name });
      } catch (err) {
        console.error('[AhiLoad] Failed to parse .ahi:', err);
      }
    };
    input.click();
  }, [updateInstrument]);

  const handleSaveMli = useCallback((e: React.MouseEvent, inst: InstrumentConfig) => {
    e.stopPropagation();
    const bytes = exportMusicLineInstrument(inst);
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${inst.name.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'instrument'}.mli`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleLoadMli = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mli';
    input.onchange = async (ev: Event) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const result = parseMusicLineInstrument(new Uint8Array(buffer));
        if (result) {
          updateInstrument(id, { ...result, id });
        }
      } catch (err) {
        console.error('[MliLoad] Failed to parse .mli:', err);
      }
    };
    input.click();
  }, [updateInstrument]);

    const handleDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData('application/x-devilbox-instrument', JSON.stringify({ id }));
    e.dataTransfer.effectAllowed = 'copy';
    
    // Set a custom drag image or styling if desired
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '0.5';
    
    // Reset opacity after a short delay (so it doesn't affect the drag image)
    setTimeout(() => {
      target.style.opacity = '1';
    }, 0);
  };

  // Sort instruments by ID
  const sortedInstruments = [...instruments].sort((a, b) => a.id - b.id);

  // Filter by active system preset's compatible synth types (if any)
  const activePreset = activeSystemPreset
    ? SYSTEM_PRESETS.find((p) => p.id === activeSystemPreset)
    : null;
  const allowedSynthTypes = activePreset?.compatibleSynthTypes ?? null;
  const visibleInstruments = allowedSynthTypes
    ? sortedInstruments.filter((i) => allowedSynthTypes.includes(i.synthType ?? ''))
    : sortedInstruments;
  const isFiltered = allowedSynthTypes !== null && visibleInstruments.length < sortedInstruments.length;

  // Get icon component dynamically
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as unknown as Record<string, LucideIcons.LucideIcon>)[iconName];
    return Icon || LucideIcons.Music2;
  };

  // Show action bar if any action buttons are enabled
  const showActionBar = isFT2;

  return (
    <div className={`flex flex-col h-full ${isFT2 ? 'bg-ft2-bg border-l border-ft2-border' : ''}`}>
      {/* Action Buttons (FT2 variant) */}
      {showActionBar && (
        <div className="px-2 py-2 bg-ft2-header border-b border-ft2-border flex-shrink-0">
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={handleAdd}
              className="flex flex-col items-center gap-0.5 px-1 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight transition-colors text-ft2-text"
              title="Add new instrument"
            >
              <Plus size={14} />
              <span className="text-[8px] font-bold">ADD</span>
            </button>
            {showEditButton && (
              <button
                onClick={() => onEditInstrument?.(currentInstrumentId!)}
                className="flex flex-col items-center gap-0.5 px-1 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight transition-colors text-ft2-text"
                title="Edit current instrument"
              >
                <Pencil size={14} />
                <span className="text-[8px] font-bold">EDIT</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active system filter banner */}
      {isFiltered && activePreset && (
        <div className="px-3 py-1.5 text-[10px] text-accent-primary bg-accent-primary/10 border-b border-accent-primary/20 flex items-center gap-1.5 shrink-0">
          <span className="font-semibold">Filter:</span>
          <span className="text-text-muted">
            Showing instruments compatible with {activePreset.name}
          </span>
        </div>
      )}

      {/* Scrollable list */}
      <div
        ref={listRef}
        className={`flex-1 overflow-y-auto ${isFT2 ? 'scrollbar-ft2 min-h-0' : 'scrollbar-modern'}`}
        style={!isFT2 ? { maxHeight } : undefined}
      >
        <div className="flex flex-col">
        {visibleInstruments.map((instrument, index) => {
          const displayNum = index + 1; // 1-based display number
          const synthInfo = getSynthInfo(instrument.synthType);
          const isSelected = instrument.id === currentInstrumentId;
          const IconComponent = getIcon(synthInfo?.icon || 'Music2');

          if (isFT2) {
            // FT2 Styling
            return (
              <InstrumentContextMenu key={instrument.id} instrumentId={instrument.id} onEdit={() => onEditInstrument?.(instrument.id)}>
              <div
                ref={isSelected ? selectedRef : undefined}
                onClick={() => handleSelect(instrument.id, instrument)}
                onDoubleClick={() => onEditInstrument?.(instrument.id)}
                onMouseDown={() => handlePreviewDown(instrument)}
                onMouseUp={handlePreviewUp}
                onMouseLeave={handlePreviewUp}
                draggable="true"
                onDragStart={(e) => handleDragStart(e, instrument.id)}
                className={`
                  instrument-list-item
                  flex items-center gap-2 px-2 py-1.5 cursor-pointer
                  transition-all duration-200 ease-out group relative overflow-hidden
                  ${isSelected
                    ? 'bg-ft2-cursor text-ft2-bg'
                    : 'hover:bg-ft2-header text-ft2-text'
                  }
                `}
              >
                {/* Flash overlay — fades out after selection */}
                {flashId === instrument.id && (
                  <span
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'rgba(255,255,255,0.18)',
                      animation: 'ft2-select-flash 380ms cubic-bezier(0.4,0,0.2,1) forwards',
                    }}
                  />
                )}

                {/* ID */}
                <span className={`font-mono text-xs font-bold w-6 ${isSelected ? 'text-ft2-bg' : 'text-ft2-highlight'}`}>
                  {useHexNumbers
                    ? displayNum.toString(16).toUpperCase().padStart(2, '0')
                    : displayNum.toString(10).padStart(2, '0')
                  }
                </span>

                {/* Icon */}
                <IconComponent size={12} className={`shrink-0 ${isSelected ? 'text-ft2-bg' : (synthInfo?.color || 'text-ft2-highlight')}`} />

                {/* Name (double-click to edit) */}
                {editingId === instrument.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={handleEditKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-mono bg-ft2-bg border border-ft2-cursor px-1 py-0.5 rounded text-ft2-text focus:outline-none w-24"
                    autoFocus
                  />
                ) : (
                  <span
                    className="text-xs font-mono whitespace-nowrap shrink-0 cursor-text"
                    onDoubleClick={(e) => handleStartEdit(e, instrument.id, instrument.name)}
                    title={instrument.name}
                  >
                    {instrument.name}
                  </span>
                )}

                {/* Synth Type Badge */}
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border shrink-0 ${isSelected ? 'bg-transparent text-ft2-bg border-ft2-bg/60' : 'bg-ft2-header text-ft2-textDim border-ft2-border'}`}>
                  {instrument.metadata?.displayType || synthInfo?.shortName || instrument.synthType}
                </span>

                {/* Channel Type Badge (hardware affinity) */}
                {(() => {
                  const badge = getSynthBadge(instrument.synthType);
                  return (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-bold border shrink-0"
                      style={isSelected
                        ? { backgroundColor: 'transparent', color: 'var(--color-ft2-bg)', borderColor: 'var(--color-ft2-bg)' }
                        : { backgroundColor: `${badge.cssColor}20`, color: badge.cssColor, borderColor: `${badge.cssColor}40` }
                      }
                    >
                      {badge.label}
                    </span>
                  );
                })()}

                {/* Instrument type tag — clickable to assign/override manually */}
                {(() => {
                  const ced = cedResults.get(instrument.id);
                  const isPending = cedPending.has(instrument.id);
                  const isManual = ced?.confidence === 1.0 && ced.topLabels[0]?.label === ced.instrumentType;
                  const open = typePickerFor === instrument.id;
                  const toggle = (e: React.MouseEvent) => { e.stopPropagation(); setTypePickerFor(open ? null : instrument.id); };

                  let badgeEl: React.ReactNode = null;

                  if (ced && ced.instrumentType !== 'unknown' && ced.confidence >= 0.05) {
                    badgeEl = (
                      <span
                        className={`text-[9px] px-1 py-0.5 rounded font-mono font-bold border shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-ft2-bg/20 text-ft2-bg border-ft2-bg/30'
                            : isManual
                              ? 'bg-accent-highlight/15 text-accent-highlight border-accent-highlight/40'
                              : 'bg-accent-primary/10 text-accent-primary border-accent-primary/30'
                        }`}
                        title={isManual ? 'Manual — click to change' : `CED ${Math.round(ced.confidence * 100)}% — click to override`}
                        onClick={toggle}
                      >
                        {instrumentTypeLabel(ced.instrumentType)}
                      </span>
                    );
                  } else if (isPending) {
                    badgeEl = (
                      <span
                        className={`text-[9px] px-1 py-0.5 rounded font-mono border shrink-0 ${
                          isSelected ? 'text-ft2-bg/50 border-ft2-bg/20' : 'text-text-muted border-dark-border'
                        }`}
                        title="Analysing…"
                      >
                        ···
                      </span>
                    );
                  } else {
                    const url = instrument.sample?.url;
                    if (typeof url === 'string' && url.startsWith('data:audio/wav;base64,')) {
                      const spec = analyzeSampleForClassification(url);
                      if (spec && spec.role !== 'empty' && spec.confidence >= 0.6) {
                        const label = spec.role === 'bass'
                          ? (spec.subrole === 'sub' ? 'SUB' : 'BASS')
                          : spec.subrole ? spec.subrole.toUpperCase() : spec.role.toUpperCase();
                        badgeEl = (
                          <span
                            className={`text-[9px] px-1 py-0.5 rounded font-mono font-bold border shrink-0 cursor-pointer ${
                              isSelected ? 'bg-ft2-bg/20 text-ft2-bg/80 border-ft2-bg/20' : 'bg-accent-secondary/10 text-accent-secondary border-accent-secondary/30'
                            }`}
                            title={`Spectral ${Math.round(spec.confidence * 100)}% — click to override`}
                            onClick={toggle}
                          >
                            {label}
                          </span>
                        );
                      }
                    }
                    if (!badgeEl) {
                      badgeEl = (
                        <span
                          className={`text-[9px] px-1 py-0.5 rounded font-mono border shrink-0 cursor-pointer opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity ${
                            isSelected ? 'text-ft2-bg border-ft2-bg/30' : 'text-text-muted border-dark-borderLight'
                          }`}
                          title="Click to classify"
                          onClick={toggle}
                        >
                          ?
                        </span>
                      );
                    }
                  }

                  return (
                    <div className="relative shrink-0">
                      {badgeEl}
                      {open && (
                        <InstrumentTypePicker
                          current={isManual ? ced!.instrumentType : null}
                          onSelect={type => { setManualType(instrument.id, type); setTypePickerFor(null); }}
                          onClose={() => setTypePickerFor(null)}
                        />
                      )}
                    </div>
                  );
                })()}

                {/* CED scan progress bar — sweeps across the row bottom while pending */}
                {cedPending.has(instrument.id) && (
                  <span
                    className="absolute bottom-0 left-0 h-[2px] w-1/5 pointer-events-none"
                    style={{
                      background: isSelected
                        ? 'rgba(255,255,255,0.5)'
                        : 'var(--color-accent-primary, #6366f1)',
                      animation: 'ced-scan 1.4s ease-in-out infinite',
                    }}
                  />
                )}

                {/* Actions (visible on hover, always visible when selected) */}
                {showActions && (
                  <div className={`instrument-action-buttons flex gap-0.5 absolute right-1 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                    <button
                      onClick={(e) => handlePopOut(e, instrument.id)}
                      className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20 text-ft2-bg' : 'hover:bg-ft2-border text-accent-highlight'}`}
                      title="Pop out editor"
                    >
                      <ExternalLink size={10} />
                    </button>
                    <button
                      onClick={(e) => handleClone(e, instrument.id)}
                      className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20' : 'hover:bg-ft2-border'}`}
                      title="Duplicate"
                    >
                      <Copy size={10} />
                    </button>
                    {instrument.synthType === 'HivelySynth' && (
                      <>
                        <button
                          onClick={(e) => handleSaveAhi(e, instrument)}
                          className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20 text-ft2-bg' : 'hover:bg-ft2-border text-yellow-400'}`}
                          title="Save as .ahi instrument file"
                        >
                          <Download size={10} />
                        </button>
                        <button
                          onClick={(e) => handleLoadAhi(e, instrument.id)}
                          className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20 text-ft2-bg' : 'hover:bg-ft2-border text-yellow-400'}`}
                          title="Load .ahi instrument file"
                        >
                          <Upload size={10} />
                        </button>
                      </>
                    )}
                    {instrument.synthType === 'Sampler' && (
                      <>
                        <button
                          onClick={(e) => handleSaveMli(e, instrument)}
                          className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20 text-ft2-bg' : 'hover:bg-ft2-border text-orange-400'}`}
                          title="Save as .mli instrument file"
                        >
                          <Download size={10} />
                        </button>
                        <button
                          onClick={(e) => handleLoadMli(e, instrument.id)}
                          className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20 text-ft2-bg' : 'hover:bg-ft2-border text-orange-400'}`}
                          title="Load .mli instrument file"
                        >
                          <Upload size={10} />
                        </button>
                      </>
                    )}
                    {instruments.length > 1 && (
                      <button
                        onClick={(e) => handleDelete(e, instrument.id)}
                        className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20 text-ft2-bg' : 'hover:bg-ft2-border text-red-400'}`}
                        title="Delete"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              </InstrumentContextMenu>
            );
          }

          // Default Styling
          return (
            <InstrumentContextMenu key={instrument.id} instrumentId={instrument.id} onEdit={() => onEditInstrument?.(instrument.id)}>
              <div
                ref={isSelected ? selectedRef : undefined}
                onClick={() => handleSelect(instrument.id, instrument)}
                onDoubleClick={() => onEditInstrument?.(instrument.id)}
                onMouseDown={() => handlePreviewDown(instrument)}
                onMouseUp={handlePreviewUp}
                onMouseLeave={handlePreviewUp}
                draggable="true"
                onDragStart={(e) => handleDragStart(e, instrument.id)}
                className={`
                  group flex items-center gap-2 px-3 py-2 cursor-pointer transition-all relative
                  ${isSelected
                    ? 'bg-accent-primary/20 border-l-2 border-accent-primary'
                    : 'hover:bg-dark-bgHover border-l-2 border-transparent'
                  }
                `}
              >
                {/* Instrument number */}
                <span
                  className={`
                    font-mono text-xs w-6 text-center
                    ${isSelected ? 'text-accent-primary' : 'text-text-muted'}
                  `}
                >
                  {String(displayNum).padStart(2, '0')}
                </span>

                {/* Synth type icon */}
                <IconComponent
                  size={compact ? 12 : 14}
                  className={`shrink-0 ${synthInfo?.color || 'text-accent-primary'}`}
                />

                {/* Instrument name (double-click to edit) */}
                {editingId === instrument.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={handleEditKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm bg-dark-bg border border-accent-primary px-1 py-0.5 rounded text-text-primary focus:outline-none w-28"
                    autoFocus
                  />
                ) : (
                  <span
                    className={`
                      text-sm whitespace-nowrap cursor-text
                      ${isSelected ? 'text-text-primary' : 'text-text-secondary'}
                    `}
                    onDoubleClick={(e) => handleStartEdit(e, instrument.id, instrument.name)}
                    title="Double-click to rename"
                  >
                    {instrument.name}
                  </span>
                )}

                {/* Synth type badge (non-compact only) */}
                {!compact && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold font-mono border bg-dark-bgSecondary text-text-muted border-dark-border">
                    {instrument.metadata?.displayType || synthInfo?.shortName || instrument.synthType}
                  </span>
                )}

                {/* Channel Type Badge (non-compact only) */}
                {!compact && (() => {
                  const badge = getSynthBadge(instrument.synthType);
                  return (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-bold border"
                      style={{
                        backgroundColor: `${badge.cssColor}20`,
                        color: badge.cssColor,
                        borderColor: `${badge.cssColor}40`,
                      }}
                    >
                      {badge.label}
                    </span>
                  );
                })()}

                {/* CED scan progress bar (default variant) */}
                {cedPending.has(instrument.id) && (
                  <span
                    className="absolute bottom-0 left-0 h-[2px] w-1/5 pointer-events-none"
                    style={{
                      background: 'var(--color-accent-primary, #6366f1)',
                      animation: 'ced-scan 1.4s ease-in-out infinite',
                    }}
                  />
                )}

                {/* Sample loop indicator - enhanced visibility */}
                {instrument.sample?.loop && (
                  <span
                    className="flex items-center gap-0.5 ml-auto"
                    title={instrument.sample.loopType === 'pingpong' ? 'Ping-pong loop' : 'Forward loop'}
                  >
                    {instrument.sample.loopType === 'pingpong' ? (
                      <>
                        <Repeat size={12} className="shrink-0 text-blue-400" />
                        <span className="text-[9px] text-blue-400 font-bold leading-none">↔</span>
                      </>
                    ) : (
                      <>
                        <Repeat1 size={12} className="shrink-0 text-green-400" />
                        <span className="text-[9px] text-green-400 font-bold leading-none">→</span>
                      </>
                    )}
                  </span>
                )}

                {/* Actions (on hover) */}
                {showActions && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2">
                    <button
                      onClick={(e) => handlePopOut(e, instrument.id)}
                      className="p-1 text-text-muted hover:text-accent-highlight"
                      title="Pop out editor"
                    >
                      <ExternalLink size={12} />
                    </button>
                    <button
                      onClick={(e) => handleClone(e, instrument.id)}
                      className="p-1 text-text-muted hover:text-accent-primary"
                      title="Clone instrument"
                    >
                      <Copy size={12} />
                    </button>
                    {instruments.length > 1 && (
                      <button
                        onClick={(e) => handleDelete(e, instrument.id)}
                        className="p-1 text-text-muted hover:text-accent-error"
                        title="Delete instrument"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </InstrumentContextMenu>
          );
        })}
        </div>
      </div>

      {/* Footer with count */}
      <div className={
        isFT2
          ? 'px-3 py-1.5 bg-ft2-header border-t border-ft2-border'
          : 'px-3 py-1 border-t border-dark-border bg-dark-bgSecondary'
      }>
        <span className={isFT2 ? 'text-ft2-textDim text-[10px] font-mono' : 'text-[10px] text-text-muted'}>
          {isFiltered
            ? `${visibleInstruments.length} of ${instruments.length} instrument${instruments.length !== 1 ? 's' : ''}`
            : `${instruments.length} instrument${instruments.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Add Instrument Dialog (unified: Synth / Preset / Sample / Library) */}
      {showNewInstrumentBrowser && (
        <AddInstrumentDialog
          onClose={() => setShowNewInstrumentBrowser(false)}
          onCreateWithSynthType={(type) => handleCreateWithSynthType(type)}
        />
      )}
    </div>
  );
});

InstrumentList.displayName = 'InstrumentList';

// ── Instrument Type Picker ────────────────────────────────────────────────────

const TYPE_GROUPS: Array<{ label: string; types: InstrumentType[] }> = [
  { label: 'Drums', types: ['kick', 'snare', 'hihat', 'cymbal', 'drum', 'percussion'] },
  { label: 'Melodic', types: ['bass', 'guitar', 'piano', 'keyboard', 'organ', 'synthesizer', 'pad', 'strings', 'brass', 'wind', 'voice'] },
  { label: 'Other', types: ['sampler'] },
];

const TYPE_NAMES: Record<InstrumentType, string> = {
  kick: 'Kick', snare: 'Snare', hihat: 'Hi-hat', cymbal: 'Cymbal', drum: 'Drum', percussion: 'Perc',
  bass: 'Bass', guitar: 'Guitar', piano: 'Piano', keyboard: 'Keys', organ: 'Organ',
  synthesizer: 'Synth', pad: 'Pad', strings: 'Strings', brass: 'Brass', wind: 'Wind',
  voice: 'Voice', sampler: 'Sampler', unknown: 'Unknown',
};

interface InstrumentTypePickerProps {
  current: InstrumentType | null | undefined;
  onSelect: (type: InstrumentType | null) => void;
  onClose: () => void;
}

const InstrumentTypePicker: React.FC<InstrumentTypePickerProps> = ({ current, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-[9999] bg-dark-bg border border-dark-border rounded shadow-xl p-2 min-w-[160px]"
      onClick={e => e.stopPropagation()}
    >
      {TYPE_GROUPS.map(group => (
        <div key={group.label} className="mb-1.5 last:mb-0">
          <div className="text-[9px] text-text-muted font-mono uppercase px-1 mb-0.5">{group.label}</div>
          <div className="flex flex-wrap gap-1">
            {group.types.map(type => (
              <button
                key={type}
                onClick={() => onSelect(type)}
                className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border transition-colors ${
                  current === type
                    ? 'bg-accent-highlight/20 text-accent-highlight border-accent-highlight/50'
                    : 'bg-dark-bgSecondary text-text-secondary border-dark-border hover:border-accent-primary hover:text-accent-primary'
                }`}
              >
                {TYPE_NAMES[type]}
              </button>
            ))}
          </div>
        </div>
      ))}
      {current && (
        <button
          onClick={() => onSelect(null)}
          className="mt-1.5 w-full text-[9px] px-1.5 py-0.5 rounded font-mono border border-dark-borderLight text-text-muted hover:text-accent-error hover:border-accent-error/40 transition-colors"
        >
          ✕ Reset to auto
        </button>
      )}
    </div>
  );
};
