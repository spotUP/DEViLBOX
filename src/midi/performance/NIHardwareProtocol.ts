/**
 * NIHardwareProtocol — Maschine MK2 display and LED feedback.
 *
 * Screen 0 (left):  context — waveform when sample editor is active, BPM/status otherwise.
 * Screen 1 (right): NKS synth params — name, page, and 7 parameter rows with value bars.
 *
 * Routed via MaschineHIDBridge → maschine-bridge.ts → maschine-nihia.c (MSG_DISPLAY /
 * MSG_PROJECTNAME / MSG_LED via NIHIA instance port).
 */

import { getMaschineHIDBridge } from '@/midi/MaschineHIDBridge';
import { MK2Display } from './MK2Display';
import type { NKSParameter } from './types';

// ── NI 17-color palette (for pad LEDs) ────────────────────────────────────

const NI_COLORS = {
  OFF:         { r: 0,   g: 0,   b: 0   },
  GREEN:       { r: 0,   g: 255, b: 0   },
  CYAN:        { r: 0,   g: 255, b: 255 },
  BLUE:        { r: 0,   g: 0,   b: 255 },
  VIOLET:      { r: 127, g: 0,   b: 255 },
  MAGENTA:     { r: 255, g: 0,   b: 255 },
  RED:         { r: 255, g: 0,   b: 0   },
  ORANGE:      { r: 255, g: 127, b: 0   },
  YELLOW:      { r: 255, g: 255, b: 0   },
  WHITE:       { r: 255, g: 255, b: 255 },
} as const;

// ── Screen 1 (right) — synth parameters ───────────────────────────────────


function abbreviateSynth(synthType: string): string {
  const map: Record<string, string> = {
    TB303: '303', OBXd: 'OBXd', Dexed: 'DX7', Helm: 'Helm',
    DubSiren: 'Siren', SpaceLaser: 'Laser', Synare: 'Snare',
    MonoSynth: 'Mono', DuoSynth: 'Duo', PolySynth: 'Poly',
    FMSynth: 'FM', ToneAM: 'AM', SuperSaw: 'Saw', Organ: 'Organ',
    DrumMachine: 'Drums',
  };
  return map[synthType] ?? synthType.substring(0, 6);
}

/**
 * Render the NKS synth param page to screen 1 (right OLED).
 *
 * Layout — 8 rows of 8px each (5×7 font + 1px gap):
 *   Row 0:   synth name (inverted header) + page indicator right-aligned
 *   Rows 1–7: param name (left) + value bar (right, 40px wide)
 *
 * currentValues: normalised 0–1 per param id. If absent, bar is shown at 50%.
 */
function renderParamScreen(
  synthType: string,
  currentPage: number,
  totalPages: number,
  pageParams: NKSParameter[],
  currentValues?: Record<string, number>,
): MK2Display {
  const d = new MK2Display();
  const W = MK2Display.W;  // 256
  const { WHITE, BLACK } = MK2Display;

  // Screen 1: white text on black background — OLEDs look great this way
  d.clear(BLACK);

  const abbr = abbreviateSynth(synthType).toUpperCase();
  const pageStr = totalPages > 1 ? ` ${currentPage + 1}/${totalPages}` : '';
  d.text(2, 2, (abbr + pageStr).substring(0, 21), WHITE, BLACK, 2);
  d.hline(0, 18, W, WHITE);

  for (let i = 0; i < 3 && i < pageParams.length; i++) {
    const param = pageParams[i];
    const rowY = 20 + i * 15;
    const value = currentValues?.[param.id] ?? 0.5;
    const min = (param as { min?: number }).min ?? 0;
    const max = (param as { max?: number }).max ?? 1;
    const normVal = Math.max(0, Math.min(1, (value - min) / Math.max(1e-6, max - min)));

    d.text(2, rowY, (param.name ?? param.id).substring(0, 12), WHITE, BLACK);
    const barX = 80;
    const barW = W - barX - 4;
    d.rect(barX, rowY, barW, 7, WHITE);
    const filled = Math.round(normVal * (barW - 2));
    if (filled > 0) d.fillRect(barX + 1, rowY + 1, filled, 5, WHITE);
  }

  return d;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Update both MK2 displays on synth/page change.
 *   Screen 0 (left):  status text (synth + BPM placeholder).
 *   Screen 1 (right): parameter page with value bars.
 */
export function updateMaschineDisplay(
  synthType: string,
  currentPage: number,
  totalPages: number,
  pageParams: NKSParameter[],
  currentValues?: Record<string, number>,
): void {
  const bridge = getMaschineHIDBridge();
  if (!bridge.isConnected()) {
    console.debug('[NIHardwareProtocol] Maschine bridge not connected, skipping display update');
    return;
  }

  // Project name fallback (shown if display protocol unsupported by firmware)
  const abbr = abbreviateSynth(synthType);
  const pageStr = totalPages > 1 ? ` ${currentPage + 1}/${totalPages}` : '';
  const displayName = (abbr + pageStr).substring(0, 12);
  console.log(`[NIHardwareProtocol] updateMaschineDisplay synthType=${synthType} page=${currentPage}/${totalPages} name="${displayName}" params=${pageParams.length}`);
  bridge.setProjectName(displayName);

  // Screen 0 (left): white text on black
  {
    const d = new MK2Display();
    d.clear(MK2Display.BLACK);
    d.text(2, 4, 'DEViLBOX', MK2Display.WHITE, MK2Display.BLACK, 2);
    d.hline(0, 20, MK2Display.W, MK2Display.WHITE);
    d.text(2, 24, abbreviateSynth(synthType).toUpperCase(), MK2Display.WHITE, MK2Display.BLACK, 2);
    if (totalPages > 1) {
      d.text(2, 48, `Page ${currentPage + 1} of ${totalPages}`, MK2Display.WHITE);
    }
    d.flush(0);
  }

  // Screen 1: parameter page
  console.log('[NIHardwareProtocol] Rendering param screen → screen 1');
  renderParamScreen(synthType, currentPage, totalPages, pageParams, currentValues)
    .flush(1);

  // Pad LEDs: reflect drum pad bank colors (each pad's assigned action has its own color)
  syncMaschinePadColors();
}

/**
 * Draw a PCM waveform to screen 0 (left OLED).
 * Call this from the sample editor when a sample is loaded or the view opens.
 *
 * @param samples   Float32Array of PCM data, values nominally in [-1, 1].
 * @param label     Optional label shown in the 8px header row.
 * @param startFrac Optional playhead start position (0–1), draws a marker line.
 * @param endFrac   Optional selection end (0–1).
 */
export function drawMaschineWaveform(
  samples: Float32Array,
  label = '',
  startFrac?: number,
  endFrac?: number,
): void {
  const bridge = getMaschineHIDBridge();
  if (!bridge.isConnected()) return;

  const d = new MK2Display();
  const { W, H, WHITE, BLACK, CYAN, ORANGE } = MK2Display;

  // Header bar
  if (label) {
    d.fillRect(0, 0, W, MK2Display.CHAR_H, WHITE);
    d.text(2, 1, label.toUpperCase().substring(0, 20), BLACK, WHITE);
  }

  const waveTop = label ? MK2Display.CHAR_H : 0;
  const waveH   = H - waveTop;

  // Waveform in cyan
  d.waveform(samples, 0, waveTop, W, waveH, CYAN, BLACK);

  // Selection markers
  if (startFrac !== undefined) {
    const mx = Math.round(startFrac * (W - 1));
    d.vline(mx, waveTop, waveH, WHITE);
  }
  if (endFrac !== undefined) {
    const mx = Math.round(endFrac * (W - 1));
    d.vline(mx, waveTop, waveH, ORANGE);
  }

  d.flush(0);
}

/**
 * Draw a simple status screen on screen 0 (left OLED).
 * Useful when no waveform is available.
 */
export function drawMaschineStatus(line1: string, line2 = '', line3 = ''): void {
  const bridge = getMaschineHIDBridge();
  if (!bridge.isConnected()) return;

  const d = new MK2Display();
  const { WHITE, BLACK, CHAR_H } = MK2Display;

  d.clear(BLACK);
  // Large text for line1 (scale 2)
  d.text(2, 4, line1.toUpperCase().substring(0, 10), WHITE, BLACK, 2);
  if (line2) d.text(2, 4 + CHAR_H * 2 + 2, line2.substring(0, 21), WHITE, BLACK);
  if (line3) d.text(2, 4 + CHAR_H * 3 + 2, line3.substring(0, 21), MK2Display.GRAY, BLACK);

  d.flush(0);
}

/**
 * Set all pad LEDs to green (playing) or off (stopped).
 */
export function setMaschinePadPlayState(isPlaying: boolean): void {
  const bridge = getMaschineHIDBridge();
  if (!bridge.isConnected()) return;
  const color = isPlaying ? NI_COLORS.GREEN : NI_COLORS.OFF;
  bridge.setAllPadColors(Array(16).fill(color));
}

/**
 * Sync MK2 pad LEDs with the current drum pad bank colors.
 * Reads each pad's `.color` (CSS hex) from useDrumPadStore and sends RGB to hardware.
 */
export async function syncMaschinePadColors(): Promise<void> {
  const bridge = getMaschineHIDBridge();
  if (!bridge.isConnected()) return;

  const { useDrumPadStore } = await import('@/stores/useDrumPadStore');
  const state = useDrumPadStore.getState();
  const pads = state.getCurrentBankPads();

  const colors = Array.from({ length: 16 }, (_, i) => {
    const pad = pads[i];
    const hex = pad?.color;
    if (!hex) return { r: 40, g: 40, b: 40 }; // dim white for unassigned
    return hexToRgb(hex);
  });
  bridge.setAllPadColors(colors);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
}

/** Turn all pad LEDs off. */
export function clearMaschinePads(): void {
  getMaschineHIDBridge().setAllPadColors?.(Array(16).fill(NI_COLORS.OFF));
}

/** Send a solid colour to both MK2 OLEDs for format testing.
 *  color=1 → all white, color=0 → all black */
export function testMaschineDisplaySolid(color: 0 | 1): void {
  const bridge = getMaschineHIDBridge();
  if (!bridge.isConnected()) return;
  const left  = new MK2Display();
  const right = new MK2Display();
  left.clear(color);
  right.clear(color);
  left.flush(0);
  right.flush(1);
}
