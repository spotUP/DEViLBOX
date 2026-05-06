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

// ── Types ────────────────────────────────────────────────────────────────────

export type MK2Mode =
  | 'instrument'  // PadMode button — default
  | 'step'        // Step button
  | 'mixer'       // Control button
  | 'sample'      // Sampling button
  | 'browse'      // Browse button
  | 'song';       // Navigate button

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
  private started = false;

  private constructor() {}

  static getInstance(): MK2ScreenManager {
    if (!MK2ScreenManager.instance) {
      MK2ScreenManager.instance = new MK2ScreenManager();
    }
    return MK2ScreenManager.instance;
  }

  registerScreen(mode: MK2Mode, screen: MK2Screen): void {
    this.screens.set(mode, screen);
  }

  /** Start reactive rendering. Call once after bridge connects. */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Subscribe to transport changes (isPlaying, bpm, currentRow)
    this.unsubscribers.push(
      useTransportStore.subscribe(() => this.markDirty()),
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

  /** Called by MaschineHIDBridge when a mode button is pressed. */
  handleButton(buttonName: string): boolean {
    const mode = BUTTON_TO_MODE[buttonName];
    if (mode) {
      this.setMode(mode);
      return true;
    }

    // Nav buttons affect context within current mode
    switch (buttonName) {
      case 'navLeft':
        this.navigateLeft();
        return true;
      case 'navRight':
        this.navigateRight();
        return true;
      case 'groupA': case 'groupB': case 'groupC': case 'groupD':
      case 'groupE': case 'groupF': case 'groupG': case 'groupH': {
        const pageIndex = buttonName.charCodeAt(5) - 65; // 'A'=0..'H'=7
        this.ctx.nksPage = pageIndex;
        this.markDirty();
        return true;
      }
      default:
        return false;
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
