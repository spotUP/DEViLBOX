/**
 * PixiHelpModal — GL-native interactive help system.
 * 4 tabs: Keyboard Shortcuts, Standard Effects, Chip Effects, Tutorial.
 * GL replacement for src/components/help/HelpModal.tsx
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PixiModal, PixiModalFooter, PixiButton } from '../components';
import { PixiScrollView } from '../components/PixiScrollView';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { CHIP_EFFECT_REFERENCE } from '../../data/ChipEffectReference';
import { useTrackerStore, useCursorStore, useInstrumentStore } from '@stores';
import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';

// ── Types ───────────────────────────────────────────────────────────────────

type HelpTab = 'shortcuts' | 'effects' | 'chip-effects' | 'tutorial';

interface PixiHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: HelpTab;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

interface EffectCommand {
  code: string;
  name: string;
  description: string;
  paramRange: string;
  example?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const W = 800;
const H = 560;
const CONTENT_W = W - 24;
const CONTENT_H = H - 36 - 36 - 44; // header, tabs, footer
const HIGHLIGHT = 0xFDE047;

const KEYBOARD_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: '↑ ↓ ← →', description: 'Move cursor in pattern' },
      { keys: 'Tab', description: 'Next channel' },
      { keys: 'Shift+Tab', description: 'Previous channel' },
      { keys: 'Home', description: 'Jump to row 0' },
      { keys: 'End', description: 'Jump to last row' },
      { keys: 'Page Up/Down', description: 'Jump 16 rows up/down' },
      { keys: 'Ctrl+↑/↓', description: 'Fast cursor (16 rows)' },
      { keys: 'F9', description: 'Jump to row 0 (0%)' },
      { keys: 'F10', description: 'Jump to 25% of pattern' },
      { keys: 'F11', description: 'Jump to 50% of pattern' },
      { keys: 'F12', description: 'Jump to 75% of pattern' },
    ],
  },
  {
    title: 'Note Entry',
    shortcuts: [
      { keys: 'Z,S,X,D,C...', description: 'Piano keys lower row (C-B)' },
      { keys: 'Q,2,W,3,E...', description: 'Piano keys upper row (+1 octave)' },
      { keys: 'F1-F7', description: 'Select octave 1-7' },
      { keys: '0-9, A-F', description: 'Hex digits (instrument, volume, effect)' },
      { keys: 'CapsLock', description: 'Note off (===)' },
      { keys: 'Space', description: 'Stop + Toggle Edit mode' },
      { keys: 'Enter', description: 'Toggle Edit/Record mode' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: 'Delete', description: 'Clear note' },
      { keys: 'Shift+Del', description: 'Clear note + instrument' },
      { keys: 'Ctrl+Del', description: 'Clear all columns' },
      { keys: 'Backspace', description: 'Clear and move up' },
      { keys: 'Insert', description: 'Insert row (shift down)' },
      { keys: 'Shift+↑/↓', description: 'Change instrument number' },
    ],
  },
  {
    title: 'Block Operations (FT2 Style)',
    shortcuts: [
      { keys: 'Alt+Arrow', description: 'Mark block selection' },
      { keys: 'Shift+F3', description: 'Cut block' },
      { keys: 'Shift+F4', description: 'Copy block' },
      { keys: 'Shift+F5', description: 'Paste block' },
      { keys: 'Ctrl+F3', description: 'Cut channel' },
      { keys: 'Ctrl+F4', description: 'Copy channel' },
      { keys: 'Ctrl+F5', description: 'Paste channel' },
      { keys: 'Alt+F3', description: 'Cut pattern' },
      { keys: 'Alt+F4', description: 'Copy pattern' },
      { keys: 'Alt+F5', description: 'Paste pattern' },
    ],
  },
  {
    title: 'Track Jump (FT2 Style)',
    shortcuts: [
      { keys: 'Alt+Q,W,E,R,T,Y,U,I', description: 'Jump to tracks 1-8' },
      { keys: 'Alt+A,S,D,F,G,H,J,K', description: 'Jump to tracks 9-16' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: '?', description: 'Show this help' },
      { keys: 'Ctrl+Shift+E', description: 'Export dialog' },
      { keys: 'Ctrl+Shift+P', description: 'Toggle patterns panel' },
      { keys: 'Escape', description: 'Close dialogs / Stop playback' },
    ],
  },
];

const EFFECT_COMMANDS: EffectCommand[] = [
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

const TABS: { id: HelpTab; label: string }[] = [
  { id: 'shortcuts', label: 'KEYBOARD SHORTCUTS' },
  { id: 'effects', label: 'STANDARD EFFECTS' },
  { id: 'chip-effects', label: 'CHIP EFFECTS' },
  { id: 'tutorial', label: 'TUTORIAL' },
];

// ── Sub-components ──────────────────────────────────────────────────────────

/** Keyboard shortcut group section */
const ShortcutSection: React.FC<{ group: ShortcutGroup; width: number }> = ({ group, width }) => {
  const theme = usePixiTheme();
  return (
    <layoutContainer
      layout={{
        flexDirection: 'column',
        gap: 2,
        padding: 8,
        backgroundColor: theme.bgTertiary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 4,
        width,
      }}
    >
      <pixiBitmapText
        text={group.title.toUpperCase()}
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={0x60A5FA}
        layout={{ marginBottom: 4 }}
      />
      {group.shortcuts.map((s, i) => (
        <layoutContainer
          key={`${group.title}-${i}`}
          layout={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingTop: 1,
            paddingBottom: 1,
          }}
        >
          <layoutContainer
            layout={{
              width: 140,
              paddingLeft: 4,
              paddingRight: 4,
              paddingTop: 2,
              paddingBottom: 2,
              backgroundColor: theme.bg.color,
              borderWidth: 1,
              borderColor: theme.border.color,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <pixiBitmapText
              text={s.keys}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
              tint={HIGHLIGHT}
              layout={{}}
            />
          </layoutContainer>
          <pixiBitmapText
            text={s.description}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
            tint={theme.text.color}
            layout={{}}
          />
        </layoutContainer>
      ))}
    </layoutContainer>
  );
};

/** Effect command card */
const EffectCard: React.FC<{ effect: EffectCommand; width: number }> = ({ effect, width }) => {
  const theme = usePixiTheme();
  return (
    <layoutContainer
      layout={{
        flexDirection: 'row',
        gap: 8,
        padding: 6,
        backgroundColor: theme.bgTertiary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 4,
        width,
        alignItems: 'flex-start',
      }}
    >
      <layoutContainer
        layout={{
          width: 40,
          paddingTop: 2,
          paddingBottom: 2,
          backgroundColor: theme.bg.color,
          borderWidth: 1,
          borderColor: theme.accent.color,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <pixiBitmapText
          text={effect.code}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
          tint={HIGHLIGHT}
          layout={{}}
        />
      </layoutContainer>
      <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 2 }}>
        <pixiBitmapText
          text={effect.name}
          style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 12, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{}}
        />
        <pixiBitmapText
          text={effect.description}
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        <pixiBitmapText
          text={`Range: ${effect.paramRange}`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textSecondary.color}
          layout={{}}
        />
        {effect.example && (
          <pixiBitmapText
            text={`Example: ${effect.example}`}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
            tint={theme.textSecondary.color}
            layout={{}}
          />
        )}
      </layoutContainer>
    </layoutContainer>
  );
};

// ── Main Component ──────────────────────────────────────────────────────────

export const PixiHelpModal: React.FC<PixiHelpModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'shortcuts',
}) => {
  const theme = usePixiTheme();
  const [activeTab, setActiveTab] = useState<HelpTab>(initialTab);
  const [tutorialStep, setTutorialStep] = useState(0);

  // Sync tab when initialTab changes or modal re-opens
  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  // ── Chip Effects logic (matches DOM version exactly) ──────────────────

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

    if (inst.furnace?.chipType !== undefined) {
      return inst.furnace.chipType;
    }

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
    const entry = Object.entries(FurnaceChipType).find(([_, val]) => val === currentChip);
    return entry ? entry[0] : 'Selected Chip';
  }, [currentChip]);

  // ── Tutorial navigation ───────────────────────────────────────────────

  const prevStep = useCallback(() => setTutorialStep(s => Math.max(0, s - 1)), []);
  const nextStep = useCallback(() => setTutorialStep(s => Math.min(TUTORIAL_STEPS.length - 1, s + 1)), []);

  // ── Estimated content heights for scroll view ─────────────────────────

  const shortcutsContentHeight = useMemo(() => {
    let h = 0;
    for (const g of KEYBOARD_SHORTCUTS) {
      h += 24 + g.shortcuts.length * 18 + 16;
    }
    return h + 40;
  }, []);

  const effectsContentHeight = useMemo(() => {
    return 60 + EFFECT_COMMANDS.length * 72;
  }, []);

  const chipEffectsContentHeight = useMemo(() => {
    if (chipEffects.length === 0) return 160;
    return 80 + chipEffects.length * 50;
  }, [chipEffects]);

  if (!isOpen) return null;

  const step = TUTORIAL_STEPS[tutorialStep];
  const progress = Math.round((tutorialStep / (TUTORIAL_STEPS.length - 1)) * 100);

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={W} height={H}>
      {/* Header */}
      <layoutContainer
        layout={{
          width: W,
          height: 36,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 12,
          paddingRight: 12,
          backgroundColor: theme.bgTertiary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <pixiBitmapText
          text="HELP & DOCUMENTATION"
          style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 14, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{}}
        />
        <pixiBitmapText
          text="×"
          style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 18, fill: 0xffffff }}
          tint={theme.textMuted.color}
          eventMode="static"
          cursor="pointer"
          onPointerUp={onClose}
          onClick={onClose}
        />
      </layoutContainer>

      {/* Tab row */}
      <layoutContainer
        layout={{
          width: W,
          height: 32,
          flexDirection: 'row',
          backgroundColor: theme.bgTertiary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <layoutContainer
              key={tab.id}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => setActiveTab(tab.id)}
              onClick={() => setActiveTab(tab.id)}
              layout={{
                flex: 1,
                height: 32,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: isActive ? theme.accent.color : undefined,
                borderRightWidth: 1,
                borderColor: theme.border.color,
              }}
            >
              <pixiBitmapText
                text={tab.label}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                tint={isActive ? theme.bg.color : theme.text.color}
                layout={{}}
              />
            </layoutContainer>
          );
        })}
      </layoutContainer>

      {/* Content area */}
      <pixiContainer layout={{ flex: 1, width: W, padding: 16 }}>
        {/* ── Keyboard Shortcuts ───────────────────────────────────── */}
        {activeTab === 'shortcuts' && (
          <PixiScrollView
            width={CONTENT_W}
            height={CONTENT_H}
            contentHeight={shortcutsContentHeight}
          >
            <layoutContainer layout={{ flexDirection: 'column', gap: 8, width: CONTENT_W }}>
              {KEYBOARD_SHORTCUTS.map((group, idx) => (
                <ShortcutSection key={idx} group={group} width={CONTENT_W - 12} />
              ))}
            </layoutContainer>
          </PixiScrollView>
        )}

        {/* ── Standard Effects ─────────────────────────────────────── */}
        {activeTab === 'effects' && (
          <PixiScrollView
            width={CONTENT_W}
            height={CONTENT_H}
            contentHeight={effectsContentHeight}
          >
            <layoutContainer layout={{ flexDirection: 'column', gap: 6, width: CONTENT_W }}>
              {/* Intro text */}
              <layoutContainer
                layout={{
                  padding: 8,
                  backgroundColor: theme.bgTertiary.color,
                  borderWidth: 1,
                  borderColor: theme.border.color,
                  borderRadius: 4,
                  width: CONTENT_W - 12,
                }}
              >
                <pixiBitmapText
                  text="Effect commands follow the FastTracker 2 format: 3 hex characters (0xy-Fxx). Enter effects in the EFFECT column. Multiple effects can be chained across rows."
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{ maxWidth: CONTENT_W - 40 }}
                />
              </layoutContainer>
              {EFFECT_COMMANDS.map((effect, idx) => (
                <EffectCard key={idx} effect={effect} width={CONTENT_W - 12} />
              ))}
            </layoutContainer>
          </PixiScrollView>
        )}

        {/* ── Chip Effects ─────────────────────────────────────────── */}
        {activeTab === 'chip-effects' && (
          <PixiScrollView
            width={CONTENT_W}
            height={CONTENT_H}
            contentHeight={chipEffectsContentHeight}
          >
            <layoutContainer layout={{ flexDirection: 'column', gap: 6, width: CONTENT_W }}>
              {/* Chip header */}
              <layoutContainer
                layout={{
                  padding: 8,
                  backgroundColor: theme.bgTertiary.color,
                  borderWidth: 1,
                  borderColor: theme.border.color,
                  borderRadius: 4,
                  width: CONTENT_W - 12,
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <pixiBitmapText
                  text={currentChip !== null ? `CHIP EFFECTS: ${chipName}` : 'CHIP EFFECTS'}
                  style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 12, fill: 0xffffff }}
                  tint={HIGHLIGHT}
                  layout={{}}
                />
                <pixiBitmapText
                  text={
                    currentChip !== null
                      ? `These effects are specific to the ${chipName} sound chip used by the current instrument. They use effect codes 10xx and above.`
                      : 'Select a chip-based instrument (Furnace) in the tracker to see its specific effect commands here.'
                  }
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{ maxWidth: CONTENT_W - 40 }}
                />
              </layoutContainer>

              {chipEffects.length > 0 ? (
                chipEffects.map((effect, idx) => (
                  <layoutContainer
                    key={idx}
                    layout={{
                      flexDirection: 'row',
                      gap: 8,
                      padding: 6,
                      backgroundColor: theme.bgTertiary.color,
                      borderWidth: 1,
                      borderColor: theme.border.color,
                      borderRadius: 4,
                      width: CONTENT_W - 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <layoutContainer
                      layout={{
                        width: 40,
                        paddingTop: 2,
                        paddingBottom: 2,
                        backgroundColor: theme.bg.color,
                        borderWidth: 1,
                        borderColor: theme.accent.color,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <pixiBitmapText
                        text={effect.command}
                        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
                        tint={HIGHLIGHT}
                        layout={{}}
                      />
                    </layoutContainer>
                    <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 2 }}>
                      <pixiBitmapText
                        text={effect.name}
                        style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 12, fill: 0xffffff }}
                        tint={theme.text.color}
                        layout={{}}
                      />
                      <pixiBitmapText
                        text={effect.desc}
                        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
                        tint={theme.textMuted.color}
                        layout={{}}
                      />
                    </layoutContainer>
                  </layoutContainer>
                ))
              ) : currentChip !== null ? (
                <pixiBitmapText
                  text={`No specific chip effects defined for ${chipName} yet.`}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                  layout={{ marginTop: 40, alignSelf: 'center' }}
                />
              ) : (
                <pixiBitmapText
                  text="No chip-based instrument selected."
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                  layout={{ marginTop: 40, alignSelf: 'center' }}
                />
              )}
            </layoutContainer>
          </PixiScrollView>
        )}

        {/* ── Tutorial ─────────────────────────────────────────────── */}
        {activeTab === 'tutorial' && (
          <layoutContainer layout={{ flexDirection: 'column', gap: 8, width: CONTENT_W }}>
            {/* Step content */}
            <layoutContainer
              layout={{
                padding: 16,
                backgroundColor: theme.bgTertiary.color,
                borderWidth: 2,
                borderColor: theme.accent.color,
                borderRadius: 4,
                width: CONTENT_W,
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {/* Step header */}
              <layoutContainer
                layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 36 }}
              >
                <pixiBitmapText
                  text={`STEP ${step.step} OF ${TUTORIAL_STEPS.length}`}
                  style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 14, fill: 0xffffff }}
                  tint={HIGHLIGHT}
                  layout={{}}
                />
                <pixiBitmapText
                  text={`${progress}% Complete`}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                  layout={{}}
                />
              </layoutContainer>

              {/* Title */}
              <pixiBitmapText
                text={step.title}
                style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 16, fill: 0xffffff }}
                tint={theme.text.color}
                layout={{ marginBottom: 4 }}
              />

              {/* Content paragraphs */}
              {step.content.map((paragraph, idx) => (
                <pixiBitmapText
                  key={idx}
                  text={paragraph}
                  style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{ maxWidth: CONTENT_W - 40 }}
                />
              ))}
            </layoutContainer>

            {/* Navigation */}
            <layoutContainer
              layout={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: CONTENT_W,
              }}
            >
              <PixiButton
                label="← PREVIOUS"
                variant="ft2"
                size="sm"
                disabled={tutorialStep === 0}
                onClick={prevStep}
              />

              {/* Step number buttons */}
              <layoutContainer layout={{ flexDirection: 'row', gap: 2 }}>
                {TUTORIAL_STEPS.map((_, idx) => {
                  const isCurrent = idx === tutorialStep;
                  return (
                    <layoutContainer
                      key={idx}
                      eventMode="static"
                      cursor="pointer"
                      onPointerUp={() => setTutorialStep(idx)}
                      layout={{
                        width: 24,
                        height: 24,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: isCurrent ? theme.accent.color : theme.bg.color,
                        borderWidth: 1,
                        borderColor: isCurrent ? theme.accent.color : theme.border.color,
                      }}
                    >
                      <pixiBitmapText
                        text={String(idx + 1)}
                        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
                        tint={isCurrent ? theme.bg.color : theme.text.color}
                        layout={{}}
                      />
                    </layoutContainer>
                  );
                })}
              </layoutContainer>

              <PixiButton
                label="NEXT →"
                variant="ft2"
                size="sm"
                disabled={tutorialStep === TUTORIAL_STEPS.length - 1}
                onClick={nextStep}
              />
            </layoutContainer>
          </layoutContainer>
        )}
      </pixiContainer>

      {/* Footer */}
      <PixiModalFooter width={W}>
        <pixiBitmapText
          text="Press ? anytime to open this help"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ flex: 1 }}
        />
        <PixiButton label="CLOSE" variant="primary" size="sm" onClick={onClose} />
      </PixiModalFooter>
    </PixiModal>
  );
};
