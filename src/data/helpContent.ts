/**
 * helpContent.ts — Shared data constants for the Help system.
 * Used by both HelpModal (DOM) and PixiHelpModal (Pixi GL).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type HelpTab = 'manual' | 'shortcuts' | 'effects' | 'chip-effects' | 'tutorial';

export interface EffectCommand {
  code: string;
  name: string;
  description: string;
  paramRange: string;
  example?: string;
}

export interface TutorialStep {
  step: number;
  title: string;
  content: string[];
}

// ── Effect Commands ───────────────────────────────────────────────────────────

export const EFFECT_COMMANDS: EffectCommand[] = [
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

// ── Tutorial Steps ────────────────────────────────────────────────────────────

export const TUTORIAL_STEPS: TutorialStep[] = [
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

// ── Tab definitions ───────────────────────────────────────────────────────────

export const HELP_TABS: { id: HelpTab; label: string }[] = [
  { id: 'manual', label: 'MANUAL' },
  { id: 'shortcuts', label: 'KEYBOARD SHORTCUTS' },
  { id: 'effects', label: 'STANDARD EFFECTS' },
  { id: 'chip-effects', label: 'CHIP EFFECTS' },
  { id: 'tutorial', label: 'TUTORIAL' },
];
