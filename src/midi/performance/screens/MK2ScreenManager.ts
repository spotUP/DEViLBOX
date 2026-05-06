/**
 * MK2ScreenManager — modal screen system for Maschine MK2 OLEDs.
 *
 * The MK2 has two 128×64 monochrome OLED displays. This manager:
 *   1. Owns the current "mode" (instrument, step, mixer, sample, browse, song)
 *   2. Subscribes to Zustand stores and re-renders screens reactively
 *   3. Debounces display writes to ~10 fps
 *   4. Skips unchanged framebuffers to avoid unnecessary HID traffic
 *
 * Each mode is a MK2Screen implementation that renders both displays and
 * defines what knobs/pads/soft buttons do in that context.
 */

import { MK2Display } from '../MK2Display';
import { getMaschineHIDBridge } from '@/midi/MaschineHIDBridge';
import { useTransportStore } from '@/stores/useTransportStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useOscilloscopeStore } from '@/stores/useOscilloscopeStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import type { PadBank } from '@/types/drumpad';

// ── Types ────────────────────────────────────────────────────────────────────

export type MK2Mode =
  | 'instrument'  // PadMode button — default
  | 'step'        // Step button
  | 'mixer'       // Control button
  | 'sample'      // Sampling button
  | 'browse'      // Browse button
  | 'song'        // Navigate button
  | 'playback';   // Auto-activates during playback

export interface MK2ScreenContext {
  /** Current NKS page index */
  nksPage: number;
  /** Mixer: which channel is selected for detail view */
  selectedChannel: number;
  /** Step: cursor row */
  stepCursorRow: number;
  /** Step: cursor channel */
  stepCursorChannel: number;
  /** Browse: scroll position */
  browseScrollPos: number;
}

export interface MK2Screen {
  /** Render both displays. Called on state change (debounced). */
  render(left: MK2Display, right: MK2Display, ctx: MK2ScreenContext): void;
  /** Labels for the 8 soft buttons above the screens (max 4 chars each) */
  softLabels(): string[];
}

// ── Button → mode mapping ────────────────────────────────────────────────────

const BUTTON_TO_MODE: Record<string, MK2Mode> = {
  padMode:   'instrument',
  step:      'step',
  control:   'mixer',
  sampling:  'sample',
  browse:    'browse',
  navigate:  'song',
};

// ── Transport overlay (bottom 8px of left screen) ────────────────────────────

function drawTransportBar(d: MK2Display): void {
  const { W, H, WHITE, BLACK, CHAR_H } = MK2Display;
  const barY = H - CHAR_H;

  // Black bar background
  d.fillRect(0, barY, W, CHAR_H, BLACK);
  // Separator line
  d.hline(0, barY, W, WHITE);

  const transport = useTransportStore.getState();
  const playing = transport.isPlaying;

  // Play/stop indicator
  d.text(2, barY + 1, playing ? '>' : '#', WHITE);

  // BPM
  const bpmStr = `${Math.round(transport.bpm)}bpm`;
  d.text(12, barY + 1, bpmStr, WHITE);

  // Position: pattern.row
  const patStr = `P${transport.currentPatternIndex}`;
  const rowStr = `R${String(transport.currentRow).padStart(2, '0')}`;
  d.text(70, barY + 1, `${patStr} ${rowStr}`, WHITE);

  // Mode indicator (right-aligned)
  const mgr = MK2ScreenManager.getInstance();
  const modeLabel = mgr.mode.substring(0, 4).toUpperCase();
  d.textRight(0, barY + 1, W - 2, modeLabel, WHITE);
}

// ── Soft button label bar (top 9px of left screen) ───────────────────────────

function drawSoftLabels(d: MK2Display, labels: string[]): void {
  const { W, WHITE, BLACK } = MK2Display;
  const slotW = W / 8; // 32px per slot on 256px wide display

  for (let i = 0; i < 8; i++) {
    const label = (labels[i] || '').substring(0, 5);
    const x = Math.round(i * slotW);
    // Center label in slot
    const textW = label.length * MK2Display.CHAR_W;
    const cx = x + Math.round((slotW - textW) / 2);
    d.text(cx, 1, label, WHITE, BLACK);
  }
  // Separator line below labels
  d.hline(0, MK2Display.CHAR_H + 1, W, WHITE);
}

// ── Screen Manager singleton ─────────────────────────────────────────────────

class MK2ScreenManager {
  private static instance: MK2ScreenManager | null = null;

  mode: MK2Mode = 'instrument';
  ctx: MK2ScreenContext = {
    nksPage: 0,
    selectedChannel: 0,
    stepCursorRow: 0,
    stepCursorChannel: 0,
    browseScrollPos: 0,
  };

  private screens = new Map<MK2Mode, MK2Screen>();
  private dirty = true;
  private rafId: number | null = null;
  private lastLeftHash = 0;
  private lastRightHash = 0;
  private unsubscribers: Array<() => void> = [];
  /** Mode to restore when playback stops */
  private modeBeforePlayback: MK2Mode | null = null;
  private started = false;

  private constructor() {}

  static getInstance(): MK2ScreenManager {
    // Survive Vite HMR — store singleton on window to prevent orphaned render loops
    const win = typeof window !== 'undefined' ? window as unknown as Record<string, unknown> : null;
    if (win?.__mk2ScreenManager) {
      MK2ScreenManager.instance = win.__mk2ScreenManager as MK2ScreenManager;
    }
    if (!MK2ScreenManager.instance) {
      MK2ScreenManager.instance = new MK2ScreenManager();
      if (win) win.__mk2ScreenManager = MK2ScreenManager.instance;
    }
    return MK2ScreenManager.instance;
  }

  registerScreen(mode: MK2Mode, screen: MK2Screen): void {
    this.screens.set(mode, screen);
  }

  /** Start reactive rendering. Call after bridge connects. Safe to call multiple times. */
  start(): void {
    if (this.started) {
      // Already running — just force a re-render
      this.markDirty();
      return;
    }
    this.started = true;

    // Subscribe to transport changes — auto-switch to playback mode
    this.unsubscribers.push(
      useTransportStore.subscribe((s, prev) => {
        if (s.isPlaying && !prev.isPlaying) {
          // Playback started → switch to playback screen
          if (this.mode !== 'playback') {
            this.modeBeforePlayback = this.mode;
            this.mode = 'playback';
          }
        } else if (!s.isPlaying && prev.isPlaying) {
          // Playback stopped → restore previous mode
          if (this.modeBeforePlayback) {
            this.mode = this.modeBeforePlayback;
            this.modeBeforePlayback = null;
          }
        }
        this.markDirty();
      }),
    );

    // Subscribe to instrument changes
    this.unsubscribers.push(
      useInstrumentStore.subscribe((s, prev) => {
        if (s.currentInstrumentId !== prev.currentInstrumentId) {
          this.ctx.nksPage = 0;
        }
        this.markDirty();
      }),
    );

    // Subscribe to oscilloscope data (for live playback waveforms)
    this.unsubscribers.push(
      useOscilloscopeStore.subscribe(() => {
        if (this.mode === 'playback') this.markDirty();
      }),
    );

    // Start render loop
    this.scheduleRender();
    // Initial render
    this.markDirty();

    console.log('[MK2ScreenManager] Started, mode:', this.mode);
  }

  stop(): void {
    this.started = false;
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Switch to a different mode. */
  setMode(mode: MK2Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.markDirty();
    console.log('[MK2ScreenManager] Mode →', mode);
  }

  /** Called by MaschineHIDBridge when a button is pressed. */
  handleButton(buttonName: string): boolean {
    const mode = BUTTON_TO_MODE[buttonName];
    if (mode) {
      this.setMode(mode);
      return true;
    }

    // Nav buttons affect context within current mode
    switch (buttonName) {
      case 'navLeft':
      case 'pageLeft':
        this.navigateLeft();
        return true;
      case 'navRight':
      case 'pageRight':
        this.navigateRight();
        return true;
      case 'groupA': case 'groupB': case 'groupC': case 'groupD':
      case 'groupE': case 'groupF': case 'groupG': case 'groupH': {
        const pageIndex = buttonName.charCodeAt(5) - 65; // 'A'=0..'H'=7
        this.ctx.nksPage = pageIndex;
        // Also switch drum pad bank (Group A→Bank A, etc.)
        const bank = buttonName.charAt(5) as PadBank;
        useDrumPadStore.getState().setBank(bank);
        this.markDirty();
        return true;
      }
      // Soft buttons 1-8
      case 'soft1': case 'soft2': case 'soft3': case 'soft4':
      case 'soft5': case 'soft6': case 'soft7': case 'soft8': {
        const softIdx = parseInt(buttonName.slice(4)) - 1;
        this.handleSoftButton(softIdx);
        return true;
      }
      // Solo/Mute → toggle on selected channel (mixer) or cursor channel (step)
      case 'mute': {
        const ch = this.mode === 'step' ? this.ctx.stepCursorChannel : this.ctx.selectedChannel;
        useTrackerStore.getState().toggleChannelMute(ch);
        this.markDirty();
        return true;
      }
      case 'solo': {
        const ch = this.mode === 'step' ? this.ctx.stepCursorChannel : this.ctx.selectedChannel;
        useTrackerStore.getState().toggleChannelSolo(ch);
        this.markDirty();
        return true;
      }
      // Encoder push — enter/confirm in browse mode
      case 'enter':
      case 'nav': {
        if (this.mode === 'browse') {
          const instruments = useInstrumentStore.getState().instruments;
          const inst = instruments[this.ctx.browseScrollPos];
          if (inst) {
            useInstrumentStore.getState().setCurrentInstrument(inst.id);
            this.setMode('instrument');
          }
        }
        return true;
      }
      // Scene/Pattern — quick jump to song/pattern views
      case 'scene':
        this.setMode('song');
        return true;
      case 'pattern':
        this.setMode('step');
        return true;
      // Grid — toggle metronome
      case 'grid':
        useTransportStore.getState().toggleMetronome();
        this.markDirty();
        return true;
      // Volume — switch to mixer
      case 'volume':
        this.setMode('mixer');
        return true;
      // Consumed buttons (no action yet but don't leak to MIDI)
      case 'tempo':
      case 'swing':
      case 'auto':
      case 'all':
      case 'noteRepeat':
      case 'duplicate':
      case 'select':
      case 'shift':
      case 'rec':
      case 'erase':
        return true;
      // Step left/right — move cursor row in step mode, move pattern in song mode
      case 'stepLeft': {
        if (this.mode === 'step') {
          this.ctx.stepCursorRow = Math.max(0, this.ctx.stepCursorRow - 1);
        } else if (this.mode === 'song') {
          const state = useTrackerStore.getState();
          const idx = Math.max(0, state.currentPatternIndex - 1);
          state.setCurrentPattern(idx);
        }
        this.markDirty();
        return true;
      }
      case 'stepRight': {
        if (this.mode === 'step') {
          const state = useTrackerStore.getState();
          const pat = state.patterns[state.currentPatternIndex];
          this.ctx.stepCursorRow = Math.min((pat?.length ?? 64) - 1, this.ctx.stepCursorRow + 1);
        } else if (this.mode === 'song') {
          const state = useTrackerStore.getState();
          const idx = Math.min(state.patterns.length - 1, state.currentPatternIndex + 1);
          state.setCurrentPattern(idx);
        }
        this.markDirty();
        return true;
      }
      default:
        return false;
    }
  }

  /** Called by MaschineHIDBridge when a knob is turned (index 0-7, value 0-127). */
  handleKnob(index: number, value: number): boolean {
    switch (this.mode) {
      case 'mixer': {
        // Knobs 0-7 → channel volumes for channels starting at selectedChannel
        const ch = this.ctx.selectedChannel + index;
        const vol = Math.round((value / 127) * 100);
        useTrackerStore.getState().setChannelVolume(ch, vol);
        this.markDirty();
        return true;
      }
      case 'instrument':
        // Knobs are already routed through NKS CC mapping via MIDIManager
        // Just force re-render for visual feedback
        this.markDirty();
        return false; // let MIDI path handle actual value change
      case 'browse': {
        // First knob scrolls the list
        if (index === 0) {
          const instruments = useInstrumentStore.getState().instruments;
          const maxScroll = Math.max(0, instruments.length - 1);
          this.ctx.browseScrollPos = Math.round((value / 127) * maxScroll);
          this.markDirty();
          return true;
        }
        return false;
      }
      case 'step': {
        // Knob 0 → scroll rows, knob 1 → scroll channels
        if (index === 0) {
          const state = useTrackerStore.getState();
          const pat = state.patterns[state.currentPatternIndex];
          const maxRow = (pat?.length ?? 64) - 1;
          this.ctx.stepCursorRow = Math.round((value / 127) * maxRow);
          this.markDirty();
          return true;
        } else if (index === 1) {
          const state = useTrackerStore.getState();
          const pat = state.patterns[state.currentPatternIndex];
          const maxCh = Math.max(0, (pat?.channels.length ?? 1) - 1);
          this.ctx.stepCursorChannel = Math.round((value / 127) * maxCh);
          this.markDirty();
          return true;
        }
        return false;
      }
      default:
        return false;
    }
  }

  /** Called by MaschineHIDBridge when a pad is pressed (pad 0-15, velocity 0-127). */
  handlePad(pad: number, velocity: number, pressed: boolean): boolean {
    if (!pressed) return false;

    switch (this.mode) {
      case 'step': {
        // Pads 0-15 toggle notes at stepCursorRow + pad offset in current channel
        const state = useTrackerStore.getState();
        const pat = state.patterns[state.currentPatternIndex];
        if (!pat) return false;
        const ch = this.ctx.stepCursorChannel;
        const row = this.ctx.stepCursorRow + pad;
        if (row >= pat.length) return false;
        const cell = pat.channels[ch]?.rows[row];
        if (cell?.note) {
          // Clear existing note
          state.setCell(ch, row, { note: 0, instrument: 0, volume: -1 });
        } else {
          // Place note C-4 (note 49 in XM) with pad velocity
          const inst = useInstrumentStore.getState().currentInstrument;
          state.setCell(ch, row, {
            note: 49,
            instrument: inst?.id ?? 1,
            volume: velocity,
          });
        }
        this.markDirty();
        return true;
      }
      case 'mixer': {
        // Pads 0-7 select channel, 8-15 toggle mute on channel
        if (pad < 8) {
          this.ctx.selectedChannel = pad;
          this.markDirty();
          return true;
        } else {
          const ch = pad - 8;
          useTrackerStore.getState().toggleChannelMute(ch);
          this.markDirty();
          return true;
        }
      }
      case 'browse': {
        // Pads scroll through instruments (pad 0-15 → item at scrollPos + pad)
        const instruments = useInstrumentStore.getState().instruments;
        const idx = this.ctx.browseScrollPos + pad;
        if (idx < instruments.length) {
          this.ctx.browseScrollPos = idx;
          this.markDirty();
        }
        return true;
      }
      case 'instrument': {
        // Pads trigger notes on current instrument for auditioning
        // Let MIDI routing handle it (return false to pass through)
        return false;
      }
      default:
        return false;
    }
  }

  private handleSoftButton(index: number): void {
    switch (this.mode) {
      case 'mixer':
        // Soft 1-8 select channels 1-8
        this.ctx.selectedChannel = index;
        this.markDirty();
        break;
      case 'step':
        // Soft 1: CH<, 2: CH>, 3: PG<, 4: PG>
        if (index === 0) this.ctx.stepCursorChannel = Math.max(0, this.ctx.stepCursorChannel - 1);
        else if (index === 1) {
          const state = useTrackerStore.getState();
          const pat = state.patterns[state.currentPatternIndex];
          this.ctx.stepCursorChannel = Math.min((pat?.channels.length ?? 1) - 1, this.ctx.stepCursorChannel + 1);
        }
        else if (index === 2) this.ctx.stepCursorRow = Math.max(0, this.ctx.stepCursorRow - 16);
        else if (index === 3) {
          const state = useTrackerStore.getState();
          const pat = state.patterns[state.currentPatternIndex];
          this.ctx.stepCursorRow = Math.min((pat?.length ?? 64) - 1, this.ctx.stepCursorRow + 16);
        }
        this.markDirty();
        break;
      case 'song':
        // Soft 1: <PAT, 2: PAT>
        if (index === 0) {
          const state = useTrackerStore.getState();
          state.setCurrentPattern(Math.max(0, state.currentPatternIndex - 1));
        } else if (index === 1) {
          const state = useTrackerStore.getState();
          state.setCurrentPattern(Math.min(state.patterns.length - 1, state.currentPatternIndex + 1));
        }
        this.markDirty();
        break;
      case 'browse': {
        // Soft 8: LOAD — load selected instrument
        if (index === 7) {
          const instruments = useInstrumentStore.getState().instruments;
          const inst = instruments[this.ctx.browseScrollPos];
          if (inst) {
            useInstrumentStore.getState().setCurrentInstrument(inst.id);
            this.setMode('instrument');
          }
        }
        this.markDirty();
        break;
      }
      case 'instrument': {
        // Soft 1-8 → NKS page 1-8
        this.ctx.nksPage = index;
        this.markDirty();
        break;
      }
    }
  }

  private navigateLeft(): void {
    switch (this.mode) {
      case 'instrument':
        if (this.ctx.nksPage > 0) {
          this.ctx.nksPage--;
          this.markDirty();
        }
        break;
      case 'mixer':
        if (this.ctx.selectedChannel > 0) {
          this.ctx.selectedChannel--;
          this.markDirty();
        }
        break;
      case 'step':
        if (this.ctx.stepCursorChannel > 0) {
          this.ctx.stepCursorChannel--;
          this.markDirty();
        }
        break;
      case 'browse': {
        this.ctx.browseScrollPos = Math.max(0, this.ctx.browseScrollPos - 1);
        this.markDirty();
        break;
      }
      case 'song': {
        const state = useTrackerStore.getState();
        state.setCurrentPattern(Math.max(0, state.currentPatternIndex - 1));
        this.markDirty();
        break;
      }
    }
  }

  private navigateRight(): void {
    switch (this.mode) {
      case 'instrument':
        this.ctx.nksPage++;
        this.markDirty();
        break;
      case 'mixer':
        this.ctx.selectedChannel++;
        this.markDirty();
        break;
      case 'step':
        this.ctx.stepCursorChannel++;
        this.markDirty();
        break;
      case 'browse': {
        const instruments = useInstrumentStore.getState().instruments;
        this.ctx.browseScrollPos = Math.min(instruments.length - 1, this.ctx.browseScrollPos + 1);
        this.markDirty();
        break;
      }
      case 'song': {
        const state = useTrackerStore.getState();
        state.setCurrentPattern(Math.min(state.patterns.length - 1, state.currentPatternIndex + 1));
        this.markDirty();
        break;
      }
    }
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Force an immediate re-render (e.g. after knob turn for low-latency feedback). */
  forceRender(): void {
    this.dirty = true;
    this.render();
  }

  /** Reset display hashes so next render always sends data (call on bridge reconnect). */
  resetDisplayHashes(): void {
    this.lastLeftHash = -1;
    this.lastRightHash = -1;
  }

  private scheduleRender(): void {
    if (!this.started) return;
    this.rafId = requestAnimationFrame(() => {
      this.render();
      // Re-schedule at ~10fps (every 100ms) instead of every rAF frame
      setTimeout(() => this.scheduleRender(), 100);
    });
  }

  private render(): void {
    if (!this.dirty) return;
    this.dirty = false;

    const bridge = getMaschineHIDBridge();
    if (!bridge.isConnected()) return;

    const screen = this.screens.get(this.mode);
    if (!screen) return;

    try {
      const left = new MK2Display();
      const right = new MK2Display();

      // Black backgrounds
      left.clear(MK2Display.BLACK);
      right.clear(MK2Display.BLACK);

      // Render mode-specific content
      screen.render(left, right, this.ctx);

      // Overlay: soft button labels on left screen top
      drawSoftLabels(left, screen.softLabels());
      // Overlay: transport bar on left screen bottom
      drawTransportBar(left);

      // Pack and skip unchanged
      const leftPacked = left.pack();
      const rightPacked = right.pack();

      const leftHash = fastHash(leftPacked);
      const rightHash = fastHash(rightPacked);

      if (leftHash !== this.lastLeftHash) {
        bridge.drawDisplay(0, leftPacked);
        this.lastLeftHash = leftHash;
      }
      if (rightHash !== this.lastRightHash) {
        bridge.drawDisplay(1, rightPacked);
        this.lastRightHash = rightHash;
      }
    } catch (err) {
      console.error('[MK2ScreenManager] Render error in mode', this.mode, err);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Simple FNV-1a hash for change detection (not cryptographic). */
function fastHash(data: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ── Exports ──────────────────────────────────────────────────────────────────

export function getMK2ScreenManager(): MK2ScreenManager {
  return MK2ScreenManager.getInstance();
}

export { BUTTON_TO_MODE };
