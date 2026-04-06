/**
 * CellContextMenu - Right-click menu for pattern editor cells
 */

import React, { useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Scissors,
  Copy,
  ClipboardPaste,
  Trash2,
  ArrowDown,
  ArrowUp,
  TrendingUp,
  Wand2,
  Columns,
  LayoutGrid,
  BarChart3,
  Music,
  Link,
  X,
  Zap,
  Minus,
} from 'lucide-react';
import { ContextMenu, type MenuItemType } from '@components/common/ContextMenu';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useCursorStore } from '@stores/useCursorStore';
import { useAutomationStore } from '@stores/useAutomationStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useFormatStore } from '@stores/useFormatStore';
import { useUIStore } from '@stores/useUIStore';
import { getNKSParametersForSynth } from '@/midi/performance/synthParameterMaps';
import type { SynthType } from '@typedefs/instrument';
import { getParamsForFormat, groupParams, type AutomationFormat } from '@/engine/automation/AutomationParams';
import {
  CHORD_TYPES, ARP_PRESETS_UNIQUE,
  chordNotes, invertChord, chordLabel, arpLabel,
  xmNoteShortName,
} from '@/lib/chordDefinitions';
import { Layers } from 'lucide-react';

interface CellContextMenuProps {
  isOpen?: boolean;
  position: { x: number; y: number } | null;
  onClose: () => void;
  rowIndex: number;
  channelIndex: number;
  onInterpolate?: () => void;
  onHumanize?: () => void;
  onStrum?: () => void;
  onLegato?: () => void;
  onOpenParameterEditor?: (field: 'volume' | 'effect' | 'effectParam') => void;
  // B/D Animation Ops
  onReverseVisual?: () => void;
  onPolyrhythm?: () => void;
  onFibonacci?: () => void;
  onEuclidean?: () => void;
  onPingPong?: () => void;
  onGlitch?: () => void;
  onStrobe?: () => void;
  onVisualEcho?: () => void;
  onConverge?: () => void;
  onSpiral?: () => void;
  onBounce?: () => void;
  onChaos?: () => void;
}

export const CellContextMenu: React.FC<CellContextMenuProps> = ({
  position,
  onClose,
  rowIndex,
  channelIndex,
  onInterpolate,
  onHumanize,
  onStrum,
  onLegato,
  onOpenParameterEditor,
  onReverseVisual,
  onPolyrhythm,
  onFibonacci,
  onEuclidean,
  onPingPong,
  onGlitch,
  onStrobe,
  onVisualEcho,
  onConverge,
  onSpiral,
  onBounce,
  onChaos,
}) => {
  const cursor = useCursorStore((s) => s.cursor);
  const selection = useCursorStore((s) => s.selection);
  const selectColumn = useCursorStore((s) => s.selectColumn);
  const selectChannel = useCursorStore((s) => s.selectChannel);
  const clearSelection = useCursorStore((s) => s.clearSelection);
  const {
    patterns,
    currentPatternIndex,
    setCell,
    copySelection,
    cutSelection,
    paste,
    transposeSelection,
    interpolateSelection,
    removeChannel,
    setChannelMeta,
  } = useTrackerStore(useShallow((s) => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
    setCell: s.setCell,
    copySelection: s.copySelection,
    cutSelection: s.cutSelection,
    paste: s.paste,
    transposeSelection: s.transposeSelection,
    interpolateSelection: s.interpolateSelection,
    removeChannel: s.removeChannel,
    setChannelMeta: s.setChannelMeta,
  })));

  const pattern = patterns[currentPatternIndex];
  const hasSelection = !!selection;

  // Block handlers
  const handleCopyBlock = useCallback(() => {
    if (!hasSelection) return;
    copySelection();
    onClose();
  }, [hasSelection, copySelection, onClose]);

  const handleCutBlock = useCallback(() => {
    if (!hasSelection) return;
    cutSelection();
    onClose();
  }, [hasSelection, cutSelection, onClose]);

  const handlePasteBlock = useCallback(() => {
    paste();
    onClose();
  }, [paste, onClose]);

  const handleTransposeBlock = useCallback((semitones: number) => {
    if (!hasSelection) return;
    transposeSelection(semitones);
    onClose();
  }, [hasSelection, transposeSelection, onClose]);

  const handleInterpolateBlock = useCallback((column: 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan' | 'effParam' | 'effParam2') => {
    if (!selection || !pattern) return;
    const minRow = Math.min(selection.startRow, selection.endRow);
    const maxRow = Math.max(selection.startRow, selection.endRow);
    
    // Search for first non-empty value in the selected range across ALL selected channels
    // For now, let's interpolate based on the channel that was right-clicked
    const ch = channelIndex;
    
    // Map column names to cell property names
    const cellProp = column === 'effParam' ? 'eff' : column === 'effParam2' ? 'eff2' : column;
    
    // Search for first non-empty value
    let startVal: number | null = null;
    for (let r = minRow; r <= maxRow; r++) {
      const val = pattern.channels[ch].rows[r][cellProp] as number;
      if (val !== undefined && val !== 0) {
        // For volume, 0 is technically a value (silence), but in tracker 0 usually means "no change"
        // In XM volume column, 0x10-0x50 is volume. 0x00 is empty.
        startVal = val;
        break;
      }
    }

    // Search for last non-empty value
    let endVal: number | null = null;
    for (let r = maxRow; r >= minRow; r--) {
      const val = pattern.channels[ch].rows[r][cellProp] as number;
      if (val !== undefined && val !== 0) {
        endVal = val;
        break;
      }
    }

    // If we didn't find any values, abort
    if (startVal === null || endVal === null) {
      onClose();
      return;
    }

    interpolateSelection(column, startVal, endVal);
    onClose();
  }, [selection, pattern, channelIndex, interpolateSelection, onClose]);

  const handleClearBlock = useCallback(() => {
    clearSelection();
    onClose();
  }, [clearSelection, onClose]);

  // Copy cell to clipboard (legacy single cell)
  const handleCopy = useCallback(() => {
    if (!pattern) return;
    const cell = pattern.channels[channelIndex].rows[rowIndex];
    localStorage.setItem('devilbox-cell-clipboard', JSON.stringify(cell));
  }, [pattern, channelIndex, rowIndex]);

  // Cut cell
  const handleCut = useCallback(() => {
    handleCopy();
    setCell(channelIndex, rowIndex, {
      note: 0,        // XM format: 0 = no note
      instrument: 0,  // XM format: 0 = no instrument
      volume: 0,      // XM format: 0x00 = nothing
      effTyp: 0,      // XM format: 0 = no effect
      eff: 0,         // XM format: 0x00 = no parameter
    });
  }, [handleCopy, setCell, channelIndex, rowIndex]);

  // Paste cell
  const handlePaste = useCallback(() => {
    const clipboardData = localStorage.getItem('devilbox-cell-clipboard');
    if (clipboardData) {
      try {
        const cell = JSON.parse(clipboardData);
        setCell(channelIndex, rowIndex, cell);
      } catch (e) {
        console.error('Failed to paste cell:', e);
      }
    }
  }, [setCell, channelIndex, rowIndex]);

  // Clear cell
  const handleClear = useCallback(() => {
    setCell(channelIndex, rowIndex, {
      note: 0,        // XM format: 0 = no note
      instrument: 0,  // XM format: 0 = no instrument
      volume: 0,      // XM format: 0x00 = nothing
      effTyp: 0,      // XM format: 0 = no effect
      eff: 0,         // XM format: 0x00 = no parameter
    });
  }, [setCell, channelIndex, rowIndex]);

  // Insert row (shift down)
  const handleInsertRow = useCallback(() => {
    if (!pattern) return;
    // Shift all rows down from current position
    for (let row = pattern.length - 1; row > rowIndex; row--) {
      const prevCell = pattern.channels[channelIndex].rows[row - 1];
      setCell(channelIndex, row, prevCell);
    }
    // Clear current row
    setCell(channelIndex, rowIndex, {
      note: 0,        // XM format: 0 = no note
      instrument: 0,  // XM format: 0 = no instrument
      volume: 0,      // XM format: 0x00 = nothing
      effTyp: 0,      // XM format: 0 = no effect
      eff: 0,         // XM format: 0x00 = no parameter
    });
  }, [pattern, channelIndex, rowIndex, setCell]);

  // Delete row (shift up)
  const handleDeleteRow = useCallback(() => {
    if (!pattern) return;
    // Shift all rows up from current position
    for (let row = rowIndex; row < pattern.length - 1; row++) {
      const nextCell = pattern.channels[channelIndex].rows[row + 1];
      setCell(channelIndex, row, nextCell);
    }
    // Clear last row
    setCell(channelIndex, pattern.length - 1, {
      note: 0,        // XM format: 0 = no note
      instrument: 0,  // XM format: 0 = no instrument
      volume: 0,      // XM format: 0x00 = nothing
      effTyp: 0,      // XM format: 0 = no effect
      eff: 0,         // XM format: 0x00 = no parameter
    });
  }, [pattern, channelIndex, rowIndex, setCell]);

  // Select entire column
  const handleSelectColumn = useCallback(() => {
    selectColumn(channelIndex, cursor.columnType);
    onClose();
  }, [channelIndex, cursor.columnType, selectColumn, onClose]);

  // Select entire channel
  const handleSelectChannel = useCallback(() => {
    selectChannel(channelIndex);
    onClose();
  }, [channelIndex, selectChannel, onClose]);

  // Remove channel
  const handleRemoveChannel = useCallback(() => {
    removeChannel(channelIndex);
    onClose();
  }, [removeChannel, channelIndex, onClose]);

  // Automation submenu items (NKS + register params)
  const automationMenuItems = useMemo((): MenuItemType[] => {
    const { setActiveParameter, setShowLane, getShowLane, getCurvesForPattern, removeCurve, addCurve, addPoint } = useAutomationStore.getState();
    const showLane = getShowLane(channelIndex);
    const items: MenuItemType[] = [];

    // Helper: register a parameter, create the curve and seed a point at row 0
    // so the lane is immediately visible with a value at full level (C40 / vol 64).
    const pat = patterns[currentPatternIndex];
    const ensureAutomationCurve = (paramId: string) => {
      setActiveParameter(channelIndex, paramId);
      setShowLane(channelIndex, true);
      if (!useUIStore.getState().showAutomationLanes) useUIStore.getState().toggleAutomationLanes();
      if (!pat) return;
      const existing = getCurvesForPattern(pat.id, channelIndex).find((c) => c.parameter === paramId);
      let curveId = existing?.id;
      if (!curveId) {
        curveId = addCurve(pat.id, channelIndex, paramId);
        if (!curveId) return;
      }
      if (!existing || existing.points.length === 0) {
        addPoint(curveId, 0, 1);
      }
    };

    // NKS synth params
    const channel = patterns[currentPatternIndex]?.channels[channelIndex];
    if (channel?.instrumentId != null) {
      const inst = useInstrumentStore.getState().instruments[channel.instrumentId];
      if (inst) {
        const nksParams = getNKSParametersForSynth(inst.synthType as SynthType)
          .filter(p => p.isAutomatable).slice(0, 8);
        for (const p of nksParams) {
          items.push({
            id: `auto-nks-${p.id}`,
            label: p.name,
            onClick: () => ensureAutomationCurve(p.id),
          });
        }
      }
    }

    // Register params (SID/Paula/Furnace)
    const editorMode = useFormatStore.getState().editorMode;
    const furnaceNative = useFormatStore.getState().furnaceNative;
    const fmtMap: Record<string, AutomationFormat> = {
      goattracker: 'gtultra', furnace: 'furnace', hively: 'hively',
      klystrack: 'klystrack', sc68: 'sc68', classic: 'uade',
    };
    const fmt = fmtMap[editorMode];
    if (fmt) {
      const config = fmt === 'furnace' && furnaceNative
        ? { chipIds: furnaceNative.chipIds, channelCount: furnaceNative.subsongs[furnaceNative.activeSubsong]?.channels.length ?? 4 }
        : undefined;
      const groups = groupParams(getParamsForFormat(fmt, config));
      if (groups.length > 0) {
        if (items.length > 0) items.push({ type: 'divider' });
        items.push({
          id: 'register-params',
          label: 'Register Params',
          submenu: groups.map(g => ({
            id: `reg-g-${g.label}`,
            label: g.label,
            submenu: g.params.map(p => ({
              id: `reg-${p.id}`,
              label: p.label,
              onClick: () => ensureAutomationCurve(p.id),
            })),
          })),
        });
      }
    }

    // Show/hide + clear
    items.push({ type: 'divider' });
    items.push({
      id: 'auto-toggle',
      label: showLane ? 'Hide Lane' : 'Show Lane',
      onClick: () => {
        setShowLane(channelIndex, !showLane);
        if (!showLane && !useUIStore.getState().showAutomationLanes) useUIStore.getState().toggleAutomationLanes();
      },
    });
    const curves = pat ? getCurvesForPattern(pat.id, channelIndex) : [];
    if (curves.length > 0) {
      items.push({
        id: 'auto-clear',
        label: 'Clear Automation',
        danger: true,
        onClick: () => curves.forEach(c => removeCurve(c.id)),
      });
    }

    return [{
      id: 'automation',
      label: 'Automation',
      submenu: items,
    }];
  }, [channelIndex, patterns, currentPatternIndex]);

  const menuItems = useMemo((): MenuItemType[] => [
    // Block Operations (if selection active)
    ...(hasSelection ? [
      {
        id: 'block-header',
        label: 'BLOCK OPERATIONS',
        disabled: true,
        className: 'text-accent-primary font-bold text-[10px] tracking-widest'
      },
      {
        id: 'block-copy',
        label: 'Copy Block',
        icon: <Copy size={14} />,
        onClick: handleCopyBlock,
      },
      {
        id: 'block-cut',
        label: 'Cut Block',
        icon: <Scissors size={14} />,
        onClick: handleCutBlock,
      },
      {
        id: 'block-paste',
        label: 'Paste Block',
        icon: <ClipboardPaste size={14} />,
        onClick: handlePasteBlock,
      },
      {
        id: 'block-transpose',
        label: 'Transpose Block',
        icon: <TrendingUp size={14} />,
        submenu: [
          { id: 'transpose-up-1', label: '+1 Semitone', onClick: () => handleTransposeBlock(1) },
          { id: 'transpose-down-1', label: '-1 Semitone', onClick: () => handleTransposeBlock(-1) },
          { id: 'transpose-up-12', label: '+1 Octave', onClick: () => handleTransposeBlock(12) },
          { id: 'transpose-down-12', label: '-1 Octave', onClick: () => handleTransposeBlock(-12) },
        ]
      },
      {
        id: 'block-interpolate',
        label: 'Interpolate Block',
        icon: <TrendingUp size={14} />,
        submenu: [
          { id: 'interp-vol', label: 'Interpolate Volume', onClick: () => handleInterpolateBlock('volume') },
          { id: 'interp-eff1', label: 'Interpolate Effect 1', onClick: () => handleInterpolateBlock('effParam') },
          { id: 'interp-eff2', label: 'Interpolate Effect 2', onClick: () => handleInterpolateBlock('effParam2') },
          { id: 'interp-cutoff', label: 'Interpolate Cutoff', onClick: () => handleInterpolateBlock('cutoff') },
          { id: 'interp-res', label: 'Interpolate Resonance', onClick: () => handleInterpolateBlock('resonance') },
        ]
      },
      {
        id: 'block-bd-ops',
        label: 'B/D Operations',
        icon: <Zap size={14} />,
        submenu: [
          { id: 'bd-reverse', label: 'Reverse Visual', onClick: onReverseVisual },
          { id: 'bd-poly', label: 'Polyrhythm', onClick: onPolyrhythm },
          { id: 'bd-fib', label: 'Fibonacci Sequence', onClick: onFibonacci },
          { id: 'bd-eucl', label: 'Euclidean Pattern', onClick: onEuclidean },
          { id: 'bd-pingpong', label: 'Ping-Pong', onClick: onPingPong },
          { id: 'bd-glitch', label: 'Glitch', onClick: onGlitch },
          { id: 'bd-strobe', label: 'Strobe', onClick: onStrobe },
          { id: 'bd-echo', label: 'Visual Echo', onClick: onVisualEcho },
          { id: 'bd-converge', label: 'Converge', onClick: onConverge },
          { id: 'bd-spiral', label: 'Spiral', onClick: onSpiral },
          { id: 'bd-bounce', label: 'Bounce', onClick: onBounce },
          { id: 'bd-chaos', label: 'Chaos', onClick: onChaos },
        ]
      },
      {
        id: 'block-clear',
        label: 'Deselect Block',
        icon: <X size={14} />,
        onClick: handleClearBlock,
      },
      { type: 'divider' as const },
    ] : []),

    // Single Cell Operations (header)
    {
      id: 'cell-header',
      label: 'CELL OPERATIONS',
      disabled: true,
      className: 'text-text-muted font-bold text-[10px] tracking-widest'
    },
    // Cut/Copy/Paste (Single Cell)
    {
      id: 'cut',
      label: 'Cut Cell',
      icon: <Scissors size={14} />,
      shortcut: 'Ctrl+X',
      onClick: handleCut,
    },
    {
      id: 'copy',
      label: 'Copy Cell',
      icon: <Copy size={14} />,
      shortcut: 'Ctrl+C',
      onClick: handleCopy,
    },
    {
      id: 'paste',
      label: 'Paste Cell',
      icon: <ClipboardPaste size={14} />,
      shortcut: 'Ctrl+V',
      onClick: handlePaste,
    },
    {
      id: 'clear',
      label: 'Clear',
      icon: <Trash2 size={14} />,
      shortcut: 'Del',
      onClick: handleClear,
    },
    { type: 'divider' },
    // Insert/Delete row
    {
      id: 'insert-row',
      label: 'Insert Row',
      icon: <ArrowDown size={14} />,
      shortcut: 'Ins',
      onClick: handleInsertRow,
    },
    {
      id: 'delete-row',
      label: 'Delete Row',
      icon: <ArrowUp size={14} />,
      shortcut: 'Backspace',
      onClick: handleDeleteRow,
    },
    { type: 'divider' },
    // Interpolate/Humanize
    {
      id: 'interpolate',
      label: 'Interpolate',
      icon: <TrendingUp size={14} />,
      shortcut: 'Ctrl+I',
      onClick: onInterpolate,
    },
    {
      id: 'humanize',
      label: 'Humanize',
      icon: <Wand2 size={14} />,
      shortcut: 'Ctrl+H',
      onClick: onHumanize,
    },
    {
      id: 'strum',
      label: 'Strum/Arpeggiate',
      icon: <Music size={14} />,
      onClick: onStrum,
    },
    {
      id: 'legato',
      label: 'Legato (Connect Notes)',
      icon: <Link size={14} />,
      onClick: onLegato,
    },
    { type: 'divider' },
    // ── Insert Chord / Arpeggio helpers ──
    ...(() => {
      const cell = pattern?.channels[channelIndex]?.rows[rowIndex];
      const hasNote = cell && cell.note >= 1 && cell.note <= 96;
      if (!hasNote || !cell) return [
        { id: 'insert-chord', label: 'Insert Chord', icon: <Music size={14} />, disabled: true },
        { id: 'bake-chord', label: 'Bake Chord (1 channel)', icon: <Layers size={14} />, disabled: true },
        { id: 'insert-arp', label: 'Insert Arpeggio', icon: <Zap size={14} />, disabled: true },
      ] as MenuItemType[];

      const rootNote = cell.note;
      const rootInst = cell.instrument || 1;

      const makeChordAction = (intervals: readonly number[], inversion: number) => () => {
        let notes = chordNotes(rootNote, intervals);
        if (inversion > 0) notes = invertChord(notes, inversion);
        const neededCols = Math.min(4, notes.length);
        const currentCols = pattern?.channels[channelIndex]?.channelMeta?.noteCols ?? 1;
        if (neededCols > currentCols) setChannelMeta(channelIndex, { noteCols: neededCols });
        const update: Record<string, number> = {};
        if (notes.length >= 2) { update.note2 = notes[1]; update.instrument2 = rootInst; }
        if (notes.length >= 3) { update.note3 = notes[2]; update.instrument3 = rootInst; }
        if (notes.length >= 4) { update.note4 = notes[3]; update.instrument4 = rootInst; }
        setCell(channelIndex, rowIndex, update);
        onClose();
      };

      const triadItems: MenuItemType[] = CHORD_TYPES
        .filter(c => c.category === 'triad')
        .map(chord => ({ id: `chord-${chord.short || 'maj'}`, label: chordLabel(chord, rootNote), onClick: makeChordAction(chord.intervals, 0) }));
      const seventhItems: MenuItemType[] = CHORD_TYPES
        .filter(c => c.category === 'seventh')
        .map(chord => ({ id: `chord-${chord.short}`, label: chordLabel(chord, rootNote), onClick: makeChordAction(chord.intervals, 0) }));
      const inversionItems: MenuItemType[] = [
        { id: 'inv-1st', label: '1st Inversion', submenu: CHORD_TYPES.filter(c => c.category === 'triad').map(chord => ({
          id: `inv1-${chord.short || 'maj'}`, label: chordLabel(chord, rootNote), onClick: makeChordAction(chord.intervals, 1),
        })) },
        { id: 'inv-2nd', label: '2nd Inversion', submenu: CHORD_TYPES.filter(c => c.category === 'triad').map(chord => ({
          id: `inv2-${chord.short || 'maj'}`, label: chordLabel(chord, rootNote), onClick: makeChordAction(chord.intervals, 2),
        })) },
      ];

      // ── Bake Chord: render chord notes to a single mixed sample ──
      const makeBakeChordAction = (intervals: readonly number[], inversion: number, chordShort: string) => async () => {
        let notes = chordNotes(rootNote, intervals);
        if (inversion > 0) notes = invertChord(notes, inversion);

        // Get instrument config
        const instConfig = useInstrumentStore.getState().instruments.find(i => i.id === rootInst);
        if (!instConfig) { onClose(); return; }

        // Convert XM note numbers to note strings for SynthBaker
        const noteStrings = notes.map(n => {
          const name = xmNoteShortName(n);
          // xmNoteShortName returns "C4" but Tone.js wants "C4" — compatible
          return name;
        });

        // Only block Sampler (already a sample)
        if (instConfig.synthType === 'Sampler') {
          onClose();
          return;
        }

        onClose();
        useUIStore.getState().setStatusMessage('Baking chord...');

        try {
          const { isDevilboxSynth } = await import('@typedefs/synth');
          const { getToneEngine } = await import('@engine/ToneEngine');
          const engine = getToneEngine();

          // Check if loaded instrument is a WASM synth needing live bake
          const loadedInst = engine.getInstrument(rootInst, instConfig);
          const needsLiveBake = loadedInst && isDevilboxSynth(loadedInst);

          let buffer: AudioBuffer;
          if (needsLiveBake) {
            buffer = await engine.liveBakeChord(rootInst, instConfig, noteStrings);
          } else {
            const { SynthBaker } = await import('@/lib/audio/SynthBaker');
            buffer = await SynthBaker.bakeChord(instConfig, noteStrings);
          }

          // Encode AudioBuffer as WAV (browsers can't decode raw PCM)
          const pcmData = buffer.getChannelData(0);
          const { encodeWav } = await import('@/lib/import/WavEncoder');
          const wavDataUrl = encodeWav({
            pcmData,
            sampleRate: buffer.sampleRate,
            channels: 1,
            bitDepth: 16,
            name: 'baked-chord',
          });

          // Convert data URL to blob URL + ArrayBuffer for storage
          const wavResponse = await fetch(wavDataUrl);
          const wavArrayBuffer = await wavResponse.arrayBuffer();
          const blobUrl = URL.createObjectURL(new Blob([wavArrayBuffer], { type: 'audio/wav' }));

          // Build instrument name: "SourceName C5Maj" truncated to 22 chars
          const rootName = xmNoteShortName(rootNote);
          const chordSuffix = `${rootName}${chordShort}`;
          const srcName = instConfig.name || 'Synth';
          const fullName = `${srcName} ${chordSuffix}`.slice(0, 22);

          // Create new sampler instrument with the baked chord
          const createInstrument = useInstrumentStore.getState().createInstrument;
          const newId = createInstrument({
            name: fullName,
            synthType: 'Sampler',
            sample: {
              audioBuffer: wavArrayBuffer,
              url: blobUrl,
              baseNote: 'C-4',
              loop: false,
              loopStart: 0,
              loopEnd: 0,
              detune: 0,
              reverse: false,
              playbackRate: 1,
              sampleRate: buffer.sampleRate,
            },
            envelope: { attack: 0, decay: 0, sustain: 100, release: 50 },
          });

          // Replace cell with C-4 + new baked instrument
          // XM note for C-4 = 49 (C-0=1, each octave +12)
          setCell(channelIndex, rowIndex, { note: 49, instrument: newId });
          useUIStore.getState().setStatusMessage(`Baked: ${fullName}`);
        } catch (err) {
          console.error('[BakeChord] Failed:', err);
          useUIStore.getState().setStatusMessage('Bake chord failed');
        }
      };

      const bakeTriadItems: MenuItemType[] = CHORD_TYPES
        .filter(c => c.category === 'triad')
        .map(chord => ({ id: `bake-${chord.short || 'maj'}`, label: chordLabel(chord, rootNote), onClick: makeBakeChordAction(chord.intervals, 0, chord.short || 'Maj') }));
      const bakeSeventhItems: MenuItemType[] = CHORD_TYPES
        .filter(c => c.category === 'seventh')
        .map(chord => ({ id: `bake-${chord.short}`, label: chordLabel(chord, rootNote), onClick: makeBakeChordAction(chord.intervals, 0, chord.short) }));
      const bakeInversionItems: MenuItemType[] = [
        { id: 'bake-inv-1st', label: '1st Inversion', submenu: CHORD_TYPES.filter(c => c.category === 'triad').map(chord => ({
          id: `bake-inv1-${chord.short || 'maj'}`, label: chordLabel(chord, rootNote), onClick: makeBakeChordAction(chord.intervals, 1, chord.short || 'Maj'),
        })) },
        { id: 'bake-inv-2nd', label: '2nd Inversion', submenu: CHORD_TYPES.filter(c => c.category === 'triad').map(chord => ({
          id: `bake-inv2-${chord.short || 'maj'}`, label: chordLabel(chord, rootNote), onClick: makeBakeChordAction(chord.intervals, 2, chord.short || 'Maj'),
        })) },
      ];

      const makeArpAction = (param: number) => () => {
        if (selection) {
          const startRow = Math.min(selection.startRow, selection.endRow);
          const endRow = Math.max(selection.startRow, selection.endRow);
          const startCh = Math.min(selection.startChannel, selection.endChannel);
          const endCh = Math.max(selection.startChannel, selection.endChannel);
          for (let c = startCh; c <= endCh; c++) {
            for (let r = startRow; r <= endRow; r++) {
              const rc = pattern?.channels[c]?.rows[r];
              if (!rc) continue;
              if (!rc.effTyp && !rc.eff) setCell(c, r, { effTyp: 0, eff: param });
              else if (!rc.effTyp2 && !rc.eff2) setCell(c, r, { effTyp2: 0, eff2: param });
              else setCell(c, r, { effTyp: 0, eff: param });
            }
          }
        } else {
          if (!cell.effTyp && !cell.eff) setCell(channelIndex, rowIndex, { effTyp: 0, eff: param });
          else if (!cell.effTyp2 && !cell.eff2) setCell(channelIndex, rowIndex, { effTyp2: 0, eff2: param });
          else setCell(channelIndex, rowIndex, { effTyp: 0, eff: param });
        }
        onClose();
      };

      return [
        {
          id: 'insert-chord',
          label: 'Insert Chord',
          icon: <Music size={14} />,
          submenu: [
            ...triadItems,
            { type: 'divider' as const },
            ...seventhItems,
            { type: 'divider' as const },
            ...inversionItems,
          ],
        },
        {
          id: 'bake-chord',
          label: 'Bake Chord (1 channel)',
          icon: <Layers size={14} />,
          submenu: [
            ...bakeTriadItems,
            { type: 'divider' as const },
            ...bakeSeventhItems,
            { type: 'divider' as const },
            ...bakeInversionItems,
          ],
        },
        {
          id: 'insert-arp',
          label: selection ? 'Insert Arpeggio (selection)' : 'Insert Arpeggio',
          icon: <Zap size={14} />,
          submenu: ARP_PRESETS_UNIQUE.map(arp => ({
            id: `arp-${arp.label}`,
            label: arpLabel(arp, rootNote),
            onClick: makeArpAction(arp.param),
          })),
        },
      ] as MenuItemType[];
    })(),
    { type: 'divider' },
    // Visual Parameter Editor
    {
      id: 'param-editor',
      label: 'Visual Parameter Editor',
      icon: <BarChart3 size={14} />,
      submenu: [
        {
          id: 'param-volume',
          label: 'Edit Volume...',
          onClick: () => onOpenParameterEditor?.('volume'),
        },
        {
          id: 'param-effect',
          label: 'Edit Effect Type...',
          onClick: () => onOpenParameterEditor?.('effect'),
        },
        {
          id: 'param-effectparam',
          label: 'Edit Effect Parameter...',
          onClick: () => onOpenParameterEditor?.('effectParam'),
        },
      ],
    },
    { type: 'divider' },
    // Selection
    {
      id: 'select-column',
      label: 'Select Column',
      icon: <Columns size={14} />,
      onClick: handleSelectColumn,
    },
    {
      id: 'select-channel',
      label: 'Select Channel',
      icon: <LayoutGrid size={14} />,
      onClick: handleSelectChannel,
    },
    // Automation
    { type: 'divider' as const },
    ...automationMenuItems,
    ...(pattern && pattern.channels.length > 1 ? [
      { type: 'divider' as const },
      {
        id: 'note-columns',
        label: 'Note Columns',
        icon: <Columns size={14} />,
        submenu: [
          { id: 'notecols-1', label: '1 Column', onClick: () => { setChannelMeta(channelIndex, { noteCols: 1 }); onClose(); } },
          { id: 'notecols-2', label: '2 Columns', onClick: () => { setChannelMeta(channelIndex, { noteCols: 2 }); onClose(); } },
          { id: 'notecols-3', label: '3 Columns', onClick: () => { setChannelMeta(channelIndex, { noteCols: 3 }); onClose(); } },
          { id: 'notecols-4', label: '4 Columns', onClick: () => { setChannelMeta(channelIndex, { noteCols: 4 }); onClose(); } },
        ],
      },
      {
        id: 'remove-channel',
        label: 'Remove Channel',
        icon: <Minus size={14} />,
        onClick: handleRemoveChannel,
      },
    ] : []),
  ], [
    handleCut,
    handleCopy,
    handlePaste,
    handleClear,
    handleInsertRow,
    handleDeleteRow,
    onInterpolate,
    onHumanize,
    onStrum,
    onLegato,
    onOpenParameterEditor,
    handleSelectColumn,
    handleSelectChannel,
    handleRemoveChannel,
    setChannelMeta,
    pattern,
    hasSelection,
    handleCopyBlock,
    handleCutBlock,
    handlePasteBlock,
    handleTransposeBlock,
    handleInterpolateBlock,
    handleClearBlock,
    onReverseVisual,
    onPolyrhythm,
    onFibonacci,
    onEuclidean,
    onPingPong,
    onGlitch,
    onStrobe,
    onVisualEcho,
    onConverge,
    onSpiral,
    onBounce,
    onChaos,
    channelIndex,
    rowIndex,
    onClose,
    selection,
    setCell,
    automationMenuItems,
  ]);

  if (!position) return null;

  return (
    <ContextMenu
      items={menuItems}
      position={position}
      onClose={onClose}
    />
  );
};

// Hook for using cell context menu
// eslint-disable-next-line react-refresh/only-export-components
export const useCellContextMenu = () => {
  const [menuState, setMenuState] = React.useState<{
    position: { x: number; y: number } | null;
    rowIndex: number;
    channelIndex: number;
  }>({
    position: null,
    rowIndex: 0,
    channelIndex: 0,
  });

  const openMenu = useCallback((
    e: React.MouseEvent,
    rowIndex: number,
    channelIndex: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({
      position: { x: e.clientX, y: e.clientY },
      rowIndex,
      channelIndex,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState((prev) => ({ ...prev, position: null }));
  }, []);

  // Handler for canvas context menu events (calculates row/channel from event)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // The canvas caller should set data attributes or we compute from position
    // For now, return early - the caller should use openMenu directly
    e.preventDefault();
  }, []);

  return {
    ...menuState,
    openMenu,
    closeMenu,
    isOpen: menuState.position !== null,
    // Additional properties for PatternEditorCanvas compatibility
    handleContextMenu,
    cellInfo: menuState.position ? {
      rowIndex: menuState.rowIndex,
      channelIndex: menuState.channelIndex,
    } : null,
  };
};
