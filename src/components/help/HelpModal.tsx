/**
 * HelpModal - Interactive Help System
 * Provides keyboard shortcuts, effect commands reference, and tutorials
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Keyboard, Zap, BookOpen, Cpu } from 'lucide-react';
import { CHIP_EFFECT_REFERENCE } from '../../data/ChipEffectReference';
import { useTrackerStore, useCursorStore, useInstrumentStore } from '../../stores';
import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import { useKeyboardStore } from '../../stores/useKeyboardStore';

type HelpTab = 'shortcuts' | 'effects' | 'chip-effects' | 'tutorial';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: HelpTab;
}

interface ShortcutGroup {
  title: string;
  shortcuts: {
    keys: string;
    description: string;
  }[];
}

interface EffectCommand {
  code: string;
  name: string;
  description: string;
  paramRange: string;
  example?: string;
}

/** Build shortcut groups dynamically from the active keyboard scheme JSON */
function buildShortcutGroups(schemeData: Record<string, string> | null): ShortcutGroup[] {
  if (!schemeData || Object.keys(schemeData).length === 0) {
    // Fallback: minimal hardcoded set
    return [{
      title: 'Note Entry',
      shortcuts: [
        { keys: 'Z,S,X,D,C...', description: 'Piano keys lower row (C-B)' },
        { keys: 'Q,2,W,3,E...', description: 'Piano keys upper row (+1 octave)' },
        { keys: '0-9, A-F', description: 'Hex digits (instrument, volume, effect)' },
      ],
    }];
  }

  // Categorize by command name prefix
  const cats: Record<string, { keys: string; description: string }[]> = {};
  const addTo = (cat: string, keys: string, cmd: string) => {
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push({ keys, description: cmd.replace(/_/g, ' ') });
  };

  for (const [key, cmd] of Object.entries(schemeData)) {
    if (typeof cmd !== 'string') continue;
    if (/^(play_|stop|pause|continue_)/.test(cmd)) addTo('Transport', key, cmd);
    else if (/^(cursor_|jump_to_|goto_|seek_|scroll_|snap_|screen_|song_start|song_end|stay_in)/.test(cmd)) addTo('Navigation', key, cmd);
    else if (/^(insert_|delete_|clear_|roll_|advance_|backspace)/.test(cmd)) addTo('Editing', key, cmd);
    else if (/^(select_|mark_block|block_|unmark|copy_|cut_|paste_|quick_)/.test(cmd)) addTo('Selection & Clipboard', key, cmd);
    else if (/^transpose_/.test(cmd)) addTo('Transpose', key, cmd);
    else if (/^(set_octave|next_octave|prev_octave)/.test(cmd)) addTo('Octave', key, cmd);
    else if (/^(set_instrument|next_instrument|prev_instrument|set_sample|instrument_|swap_instrument)/.test(cmd)) addTo('Instruments', key, cmd);
    else if (/^(mute_|solo_|unmute_|set_track|set_multi|reset_channel|channel_)/.test(cmd)) addTo('Channels', key, cmd);
    else if (/^(next_pattern|prev_pattern|next_block|prev_block|clone_|next_order|prev_order|next_sequence|prev_sequence|set_position|save_position|goto_position|sequence_|set_playback)/.test(cmd)) addTo('Patterns & Position', key, cmd);
    else if (/^(increase_|decrease_|set_step|set_edit|set_quantize|double_block|halve_block)/.test(cmd)) addTo('Step & Volume', key, cmd);
    else if (/^(toggle_|show_|open_|view_|close_|help$|configure|order_list|layout_|display_|cycle_|switch_to)/.test(cmd)) addTo('View & Settings', key, cmd);
    else if (/^(undo|redo|save_|export_|load_|new_|fast_save)/.test(cmd)) addTo('File & History', key, cmd);
    else if (/^(tracker_|power_cut|dj_)/.test(cmd)) addTo('DJ & Scratch', key, cmd);
    else addTo('Other', key, cmd);
  }

  // Always prepend note entry (not in schemes — handled by keyboard piano input)
  const groups: ShortcutGroup[] = [{
    title: 'Note Entry',
    shortcuts: [
      { keys: 'Z,S,X,D,C...', description: 'Piano keys lower row (C-B)' },
      { keys: 'Q,2,W,3,E...', description: 'Piano keys upper row (+1 octave)' },
      { keys: '0-9, A-F', description: 'Hex digits (instrument, volume, effect)' },
    ],
  }];

  const catOrder = ['Transport', 'Navigation', 'Editing', 'Selection & Clipboard', 'Transpose',
    'Octave', 'Instruments', 'Channels', 'Patterns & Position', 'Step & Volume',
    'View & Settings', 'File & History', 'DJ & Scratch', 'Other'];
  for (const cat of catOrder) {
    if (cats[cat]?.length) {
      groups.push({ title: cat, shortcuts: cats[cat] });
    }
  }
  return groups;
}

const EFFECT_COMMANDS: EffectCommand[] = [
  // Main Effects 0-9
  {
    code: '0xy',
    name: 'Arpeggio',
    description: 'Cycle between note, note+x, note+y semitones each tick',
    paramRange: 'x,y: 0-F (0-15 semitones)',
    example: '037 = Major chord (C, D#, G)',
  },
  {
    code: '1xx',
    name: 'Portamento Up',
    description: 'Slide pitch up by xx units per tick',
    paramRange: 'xx: 00-FF (speed)',
    example: '110 = Slow slide up',
  },
  {
    code: '2xx',
    name: 'Portamento Down',
    description: 'Slide pitch down by xx units per tick',
    paramRange: 'xx: 00-FF (speed)',
    example: '220 = Slow slide down',
  },
  {
    code: '3xx',
    name: 'Tone Portamento',
    description: 'Slide from current pitch to target note (note not retriggered)',
    paramRange: 'xx: 00-FF (speed)',
    example: '310 = Smooth glide to new note',
  },
  {
    code: '4xy',
    name: 'Vibrato',
    description: 'Oscillate pitch. x=speed, y=depth',
    paramRange: 'x: 0-F (speed), y: 0-F (depth)',
    example: '486 = Medium vibrato',
  },
  {
    code: '5xy',
    name: 'Tone Porta + Volume Slide',
    description: 'Continue tone portamento with volume slide',
    paramRange: 'x: Vol up, y: Vol down (0-F)',
    example: '502 = Porta with fade out',
  },
  {
    code: '6xy',
    name: 'Vibrato + Volume Slide',
    description: 'Continue vibrato with volume slide',
    paramRange: 'x: Vol up, y: Vol down (0-F)',
    example: '640 = Vibrato with fade in',
  },
  {
    code: '7xy',
    name: 'Tremolo',
    description: 'Oscillate volume. x=speed, y=depth',
    paramRange: 'x: 0-F (speed), y: 0-F (depth)',
    example: '742 = Volume pulse',
  },
  {
    code: '8xx',
    name: 'Set Panning',
    description: 'Set stereo position for channel',
    paramRange: 'xx: 00=Left, 80=Center, FF=Right',
    example: '800 = Hard left, 8FF = Hard right',
  },
  {
    code: '9xx',
    name: 'Sample Offset',
    description: 'Start sample playback at offset (xx × 256)',
    paramRange: 'xx: 00-FF (offset in 256-sample units)',
    example: '980 = Start halfway through',
  },
  // Main Effects A-F
  {
    code: 'Axy',
    name: 'Volume Slide',
    description: 'Slide volume per tick. x=up, y=down (one must be 0)',
    paramRange: 'x/y: 0-F per tick',
    example: 'A0F = Fade out fast, A40 = Fade in',
  },
  {
    code: 'Bxx',
    name: 'Position Jump',
    description: 'Jump to song position xx and play pattern from start',
    paramRange: 'xx: 00-FF (pattern index)',
    example: 'B00 = Jump to start',
  },
  {
    code: 'Cxx',
    name: 'Set Volume',
    description: 'Set channel volume directly (max 40)',
    paramRange: 'xx: 00-40 (0-64 decimal)',
    example: 'C40 = Full volume, C20 = Half',
  },
  {
    code: 'Dxx',
    name: 'Pattern Break',
    description: 'Jump to row xx of next pattern (decimal coded)',
    paramRange: 'xx: Row number (decimal: D32 = row 32)',
    example: 'D00 = Next pattern row 0',
  },
  {
    code: 'Fxx',
    name: 'Set Speed/BPM',
    description: '01-1F sets ticks per row, 20-FF sets BPM',
    paramRange: 'xx: 01-1F=Speed, 20-FF=BPM',
    example: 'F06 = 6 ticks/row, F8C = 140 BPM',
  },
  // E-Commands
  {
    code: 'E1x',
    name: 'Fine Porta Up',
    description: 'Fine pitch slide up (once per row, not per tick)',
    paramRange: 'x: 0-F (amount)',
    example: 'E14 = Small pitch bend up',
  },
  {
    code: 'E2x',
    name: 'Fine Porta Down',
    description: 'Fine pitch slide down (once per row)',
    paramRange: 'x: 0-F (amount)',
    example: 'E24 = Small pitch bend down',
  },
  {
    code: 'E3x',
    name: 'Glissando Control',
    description: 'Round portamento to nearest semitone',
    paramRange: 'x: 0=Off, 1=On',
    example: 'E31 = Enable glissando',
  },
  {
    code: 'E4x',
    name: 'Vibrato Waveform',
    description: 'Set vibrato oscillator shape (+4 to not retrig)',
    paramRange: '0=Sine, 1=Ramp, 2=Square, 3=Random',
    example: 'E40 = Sine, E42 = Square',
  },
  {
    code: 'E5x',
    name: 'Set Finetune',
    description: 'Override sample finetune value',
    paramRange: 'x: 0-F (signed: 8=0, 0-7=+, 9-F=-)',
    example: 'E58 = Normal tuning',
  },
  {
    code: 'E6x',
    name: 'Pattern Loop',
    description: 'Set loop start (x=0) or loop x times',
    paramRange: 'x: 0=Set start, 1-F=Loop count',
    example: 'E60 = Mark start, E63 = Loop 3×',
  },
  {
    code: 'E7x',
    name: 'Tremolo Waveform',
    description: 'Set tremolo oscillator shape (+4 to not retrig)',
    paramRange: '0=Sine, 1=Ramp, 2=Square, 3=Random',
    example: 'E70 = Sine tremolo',
  },
  {
    code: 'E8x',
    name: 'Set Panning (Coarse)',
    description: 'Set pan position (16 positions)',
    paramRange: 'x: 0-F (0=Left, 8=Center, F=Right)',
    example: 'E80 = Left, E8F = Right',
  },
  {
    code: 'E9x',
    name: 'Retrigger Note',
    description: 'Retrigger note every x ticks',
    paramRange: 'x: 1-F (tick interval)',
    example: 'E93 = Retrigger every 3 ticks',
  },
  {
    code: 'EAx',
    name: 'Fine Volume Up',
    description: 'Fine volume increase (once per row)',
    paramRange: 'x: 0-F (amount)',
    example: 'EA2 = Small volume boost',
  },
  {
    code: 'EBx',
    name: 'Fine Volume Down',
    description: 'Fine volume decrease (once per row)',
    paramRange: 'x: 0-F (amount)',
    example: 'EB2 = Small volume cut',
  },
  {
    code: 'ECx',
    name: 'Note Cut',
    description: 'Cut note (set volume to 0) at tick x',
    paramRange: 'x: 0-F (tick number)',
    example: 'EC4 = Cut after 4 ticks',
  },
  {
    code: 'EDx',
    name: 'Note Delay',
    description: 'Delay note trigger by x ticks',
    paramRange: 'x: 0-F (delay in ticks)',
    example: 'ED3 = Play note at tick 3',
  },
  {
    code: 'EEx',
    name: 'Pattern Delay',
    description: 'Delay pattern by x rows (repeat current row)',
    paramRange: 'x: 0-F (rows to delay)',
    example: 'EE2 = Delay 2 rows',
  },
  // Extended Commands G-X
  {
    code: 'Gxx',
    name: 'Set Global Volume',
    description: 'Set master volume for all channels',
    paramRange: 'xx: 00-40 (0-64 decimal)',
    example: 'G40 = Full global volume',
  },
  {
    code: 'Hxy',
    name: 'Global Volume Slide',
    description: 'Slide global volume. x=up, y=down',
    paramRange: 'x/y: 0-F per tick',
    example: 'H01 = Slow global fade out',
  },
  {
    code: 'Lxx',
    name: 'Set Envelope Position',
    description: 'Jump to position in volume/pan envelope',
    paramRange: 'xx: 00-FF (envelope tick)',
    example: 'L20 = Jump to tick 32',
  },
  {
    code: 'Pxy',
    name: 'Panning Slide',
    description: 'Slide pan position. x=right, y=left',
    paramRange: 'x/y: 0-F per tick',
    example: 'P0F = Pan left fast',
  },
  {
    code: 'Rxy',
    name: 'Multi Retrig',
    description: 'Retrig with volume change. x=interval, y=vol change',
    paramRange: 'x: interval, y: 0=none,1-5=-1-16,6=×⅔,7=×½,9-D=+1-16,E=×1.5,F=×2',
    example: 'R31 = Retrig every 3 ticks, vol -1',
  },
  {
    code: 'Txy',
    name: 'Tremor',
    description: 'Rapidly toggle volume on/off',
    paramRange: 'x: on-time ticks, y: off-time ticks',
    example: 'T31 = 3 ticks on, 1 tick off',
  },
  {
    code: 'X1x',
    name: 'Extra Fine Porta Up',
    description: 'Very fine pitch slide up (speed/4)',
    paramRange: 'x: 0-F (amount)',
    example: 'X14 = Very fine slide up',
  },
  {
    code: 'X2x',
    name: 'Extra Fine Porta Down',
    description: 'Very fine pitch slide down (speed/4)',
    paramRange: 'x: 0-F (amount)',
    example: 'X24 = Very fine slide down',
  },
];

const TUTORIAL_STEPS = [
  {
    step: 1,
    title: 'Welcome to DEViLBOX',
    content: [
      'DEViLBOX is a TB-303 acid tracker with Devil Fish mod for creating acid basslines.',
      'This tutorial will guide you through creating your first pattern.',
    ],
  },
  {
    step: 2,
    title: 'Understanding the Pattern Editor',
    content: [
      'The pattern editor shows rows (0-63) and channels (1-4+).',
      'Each cell can contain: NOTE, INSTRUMENT, VOLUME, and EFFECT.',
      'The cyan horizontal bar shows your current edit position.',
    ],
  },
  {
    step: 3,
    title: 'Entering Notes',
    content: [
      '1. Enable RECORD mode (press CapsLock or click REC button)',
      '2. Use QWERTY keys as piano: Q=C, W=C#, E=D, R=D#, T=E, etc.',
      '3. Press Z/X to change octave',
      '4. Use arrow keys to navigate',
    ],
  },
  {
    step: 4,
    title: 'Working with Instruments',
    content: [
      'Switch to the INSTRUMENT panel to select and edit sounds.',
      'The default TB-303 instrument is perfect for acid basslines.',
      'Try adjusting the CUTOFF and RESONANCE knobs for that squelchy sound!',
    ],
  },
  {
    step: 5,
    title: 'Using Effects',
    content: [
      'Effects add movement to your notes.',
      'Common effects:',
      '• 1xx/2xx - Pitch slides',
      '• Axy - Volume fade',
      '• Fxx - Change tempo',
      'See the EFFECT COMMANDS tab for the full list!',
    ],
  },
  {
    step: 6,
    title: 'Playback Controls',
    content: [
      'Press SPACE to play/pause your pattern.',
      'Press F5 to play from start.',
      'Press F8 to stop playback.',
      'The playback position follows the pattern automatically.',
    ],
  },
  {
    step: 7,
    title: 'Saving Your Work',
    content: [
      'Use Ctrl+S to save your project.',
      'Export your song via the Export dialog (File menu).',
      'Share individual patterns as SFX or instruments as presets!',
    ],
  },
];

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, initialTab = 'shortcuts' }) => {
  const [activeTab, setActiveTab] = useState<HelpTab>(initialTab);
  const [schemeData, setSchemeData] = useState<Record<string, string> | null>(null);
  const activeScheme = useKeyboardStore((s) => s.activeScheme);

  // Load the active keyboard scheme JSON for the shortcuts tab
  useEffect(() => {
    if (!isOpen) return;
    const isMac = navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac');
    fetch(`/keyboard-schemes/${activeScheme}.json`)
      .then(r => r.json())
      .then(data => {
        const plat = data.platform || data;
        setSchemeData(plat[isMac ? 'mac' : 'pc'] || plat.pc || {});
      })
      .catch(() => setSchemeData(null));
  }, [isOpen, activeScheme]);

  const shortcutGroups = useMemo(() => buildShortcutGroups(schemeData), [schemeData]);

  // Sync tab when initialTab changes or modal re-opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  const [tutorialStep, setTutorialStep] = useState(0);

  const cursor = useCursorStore((s) => s.cursor);
  const { patterns, currentPatternIndex } = useTrackerStore();
  const { instruments } = useInstrumentStore();

  const currentChip = useMemo(() => {
    const pattern = patterns[currentPatternIndex];
    if (!pattern) return null;
    const cell = pattern.channels[cursor.channelIndex]?.rows[cursor.rowIndex];
    if (!cell?.instrument) return null;
    const inst = instruments.find(i => i.id === cell.instrument);
    if (!inst || !inst.synthType.startsWith('Furnace')) return null;
    
    // Extract chip type from instrument furnace config if available
    if (inst.furnace?.chipType !== undefined) {
      return inst.furnace.chipType;
    }

    // Map synthType string to FurnaceChipType as fallback
    const typeMap: Record<string, number> = {
      'FurnaceNES': FurnaceChipType.NES,
      'FurnaceGB': FurnaceChipType.GB,
      'FurnaceC64': FurnaceChipType.SID,
      'FurnaceSID6581': FurnaceChipType.SID_6581,
      'FurnaceSID8580': FurnaceChipType.SID_8580,
      'FurnaceOPL': FurnaceChipType.OPL3,
      'FurnaceOPL3': FurnaceChipType.OPL3,
      'FurnaceOPLL': FurnaceChipType.OPLL,
      'FurnaceOPN': FurnaceChipType.OPN,
      'FurnaceOPN2': FurnaceChipType.OPN2,
      'FurnaceOPM': FurnaceChipType.OPM,
      'FurnacePCE': FurnaceChipType.PCE,
      'FurnaceAY': FurnaceChipType.AY,
      'FurnaceSNES': FurnaceChipType.SNES,
      'FurnaceAmiga': FurnaceChipType.AMIGA,
    };
    return typeMap[inst.synthType] ?? null;
  }, [cursor, patterns, currentPatternIndex, instruments]);

  const chipEffects = useMemo(() => {
    if (currentChip === null) return [];
    return CHIP_EFFECT_REFERENCE[currentChip] || [];
  }, [currentChip]);

  const chipName = useMemo(() => {
    if (currentChip === null) return 'Selected Chip';
    // Find key name in FurnaceChipType
    const entry = Object.entries(FurnaceChipType).find(([_, val]) => val === currentChip);
    return entry ? entry[0] : 'Selected Chip';
  }, [currentChip]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-ft2-bg border-2 border-ft2-border shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-ft2-header border-b-2 border-ft2-border px-4 py-3 flex items-center justify-between">
          <h2 className="font-mono text-lg font-bold text-ft2-text">
            HELP & DOCUMENTATION
          </h2>
          <button
            onClick={onClose}
            className="text-ft2-textDim hover:text-ft2-text transition-colors"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-ft2-panel border-b border-ft2-border flex">
          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`
              flex-1 px-4 py-3 font-mono text-sm transition-colors border-r border-ft2-border
              ${activeTab === 'shortcuts'
                ? 'bg-ft2-cursor text-ft2-bg font-bold'
                : 'text-ft2-text hover:bg-ft2-bg'
              }
            `}
          >
            <Keyboard size={16} className="inline mr-2" />
            KEYBOARD SHORTCUTS
          </button>
          <button
            onClick={() => setActiveTab('effects')}
            className={`
              flex-1 px-4 py-3 font-mono text-sm transition-colors border-r border-ft2-border
              ${activeTab === 'effects'
                ? 'bg-ft2-cursor text-ft2-bg font-bold'
                : 'text-ft2-text hover:bg-ft2-bg'
              }
            `}
          >
            <Zap size={16} className="inline mr-2" />
            STANDARD EFFECTS
          </button>
          <button
            onClick={() => setActiveTab('chip-effects')}
            className={`
              flex-1 px-4 py-3 font-mono text-sm transition-colors border-r border-ft2-border
              ${activeTab === 'chip-effects'
                ? 'bg-ft2-cursor text-ft2-bg font-bold'
                : 'text-ft2-text hover:bg-ft2-bg'
              }
            `}
          >
            <Cpu size={16} className="inline mr-2" />
            CHIP EFFECTS
          </button>
          <button
            onClick={() => setActiveTab('tutorial')}
            className={`
              flex-1 px-4 py-3 font-mono text-sm transition-colors
              ${activeTab === 'tutorial'
                ? 'bg-ft2-cursor text-ft2-bg font-bold'
                : 'text-ft2-text hover:bg-ft2-bg'
              }
            `}
          >
            <BookOpen size={16} className="inline mr-2" />
            TUTORIAL
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-ft2 p-6">
          {/* Keyboard Shortcuts Tab */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-6">
              <div className="text-xs font-mono text-ft2-textDim mb-2">
                Active scheme: <span className="text-ft2-highlight">{activeScheme}</span>
              </div>
              {shortcutGroups.map((group, idx) => (
                <div key={idx} className="bg-ft2-panel border border-ft2-border p-4">
                  <h3 className="text-sm font-mono font-bold text-ft2-highlight mb-3">
                    {group.title.toUpperCase()}
                  </h3>
                  <div className="space-y-2">
                    {group.shortcuts.map((shortcut, sidx) => (
                      <div
                        key={sidx}
                        className="flex items-start gap-4 text-xs font-mono"
                      >
                        <div className="flex-shrink-0 w-32 px-2 py-1 bg-ft2-bg border border-ft2-border text-ft2-highlight font-bold text-center">
                          {shortcut.keys}
                        </div>
                        <div className="flex-1 text-ft2-text py-1">
                          {shortcut.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Effect Commands Tab */}
          {activeTab === 'effects' && (
            <div className="space-y-4">
              <div className="bg-ft2-panel border border-ft2-border p-4 mb-4">
                <p className="text-xs font-mono text-ft2-text leading-relaxed">
                  Effect commands follow the FastTracker 2 format: 3 hex characters (0xy-Fxx).
                  Enter effects in the EFFECT column. Multiple effects can be chained across rows.
                </p>
              </div>

              <div className="grid gap-3">
                {EFFECT_COMMANDS.map((effect, idx) => (
                  <div
                    key={idx}
                    className="bg-ft2-panel border border-ft2-border p-3 hover:border-ft2-highlight transition-colors"
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-shrink-0 w-12 px-2 py-1 bg-ft2-bg border border-ft2-cursor text-ft2-highlight font-bold text-xs font-mono text-center">
                        {effect.code}
                      </div>
                      <div className="flex-1">
                        <div className="font-mono text-sm font-bold text-ft2-text mb-1">
                          {effect.name}
                        </div>
                        <div className="text-xs font-mono text-ft2-textDim mb-1">
                          {effect.description}
                        </div>
                        <div className="text-xs font-mono text-ft2-text">
                          <span className="text-ft2-highlight">Range:</span> {effect.paramRange}
                        </div>
                        {effect.example && (
                          <div className="text-xs font-mono text-ft2-text mt-1">
                            <span className="text-ft2-highlight">Example:</span> {effect.example}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chip Effects Tab */}
          {activeTab === 'chip-effects' && (
            <div className="space-y-4">
              <div className="bg-ft2-panel border border-ft2-border p-4 mb-4">
                <h3 className="text-sm font-mono font-bold text-ft2-highlight mb-2">
                  {currentChip !== null ? `CHIP EFFECTS: ${chipName}` : 'CHIP EFFECTS'}
                </h3>
                <p className="text-xs font-mono text-ft2-text leading-relaxed">
                  {currentChip !== null 
                    ? `These effects are specific to the ${chipName} sound chip used by the current instrument. They use effect codes 10xx and above.`
                    : 'Select a chip-based instrument (Furnace) in the tracker to see its specific effect commands here.'
                  }
                </p>
              </div>

              {chipEffects.length > 0 ? (
                <div className="grid gap-3">
                  {chipEffects.map((effect, idx) => (
                    <div
                      key={idx}
                      className="bg-ft2-panel border border-ft2-border p-3 hover:border-ft2-highlight transition-colors"
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <div className="flex-shrink-0 w-12 px-2 py-1 bg-ft2-bg border border-ft2-cursor text-ft2-highlight font-bold text-xs font-mono text-center">
                          {effect.command}
                        </div>
                        <div className="flex-1">
                          <div className="font-mono text-sm font-bold text-ft2-text mb-1">
                            {effect.name}
                          </div>
                          <div className="text-xs font-mono text-ft2-textDim">
                            {effect.desc}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : currentChip !== null ? (
                <div className="text-center py-8 text-ft2-textDim font-mono text-sm">
                  No specific chip effects defined for {chipName} yet.
                </div>
              ) : (
                <div className="text-center py-8 text-ft2-textDim font-mono text-sm">
                  No chip-based instrument selected.
                </div>
              )}
            </div>
          )}

          {/* Tutorial Tab */}
          {activeTab === 'tutorial' && (
            <div className="space-y-4">
              <div className="bg-ft2-panel border-2 border-ft2-cursor p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-mono font-bold text-ft2-highlight">
                    STEP {TUTORIAL_STEPS[tutorialStep].step} OF {TUTORIAL_STEPS.length}
                  </h3>
                  <div className="text-xs font-mono text-ft2-textDim">
                    {Math.round((tutorialStep / (TUTORIAL_STEPS.length - 1)) * 100)}% Complete
                  </div>
                </div>

                <h4 className="text-xl font-mono font-bold text-ft2-text mb-4">
                  {TUTORIAL_STEPS[tutorialStep].title}
                </h4>

                <div className="space-y-3">
                  {TUTORIAL_STEPS[tutorialStep].content.map((paragraph, idx) => (
                    <p key={idx} className="text-sm font-mono text-ft2-text leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>

              {/* Tutorial Navigation */}
              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={() => setTutorialStep(Math.max(0, tutorialStep - 1))}
                  disabled={tutorialStep === 0}
                  className={`
                    px-4 py-2 font-mono text-sm border transition-colors
                    ${tutorialStep === 0
                      ? 'bg-ft2-panel text-ft2-textDim border-ft2-border cursor-not-allowed'
                      : 'bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight'
                    }
                  `}
                >
                  ← PREVIOUS
                </button>

                <div className="flex gap-1">
                  {TUTORIAL_STEPS.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setTutorialStep(idx)}
                      className={`
                        w-8 h-8 text-xs font-mono border transition-colors
                        ${idx === tutorialStep
                          ? 'bg-ft2-cursor text-ft2-bg border-ft2-cursor font-bold'
                          : 'bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight'
                        }
                      `}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() =>
                    setTutorialStep(Math.min(TUTORIAL_STEPS.length - 1, tutorialStep + 1))
                  }
                  disabled={tutorialStep === TUTORIAL_STEPS.length - 1}
                  className={`
                    px-4 py-2 font-mono text-sm border transition-colors
                    ${tutorialStep === TUTORIAL_STEPS.length - 1
                      ? 'bg-ft2-panel text-ft2-textDim border-ft2-border cursor-not-allowed'
                      : 'bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight'
                    }
                  `}
                >
                  NEXT →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-ft2-panel border-t-2 border-ft2-border px-4 py-3 flex items-center justify-between">
          <div className="text-xs font-mono text-ft2-textDim">
            Press <span className="text-ft2-highlight">?</span> anytime to open this help
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-ft2-cursor text-ft2-bg font-mono text-sm font-bold hover:bg-ft2-highlight transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
