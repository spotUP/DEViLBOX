/**
 * InstrumentScreen — MK2 display for instrument/synth mode.
 *
 * Left screen:  Instrument name (large) + oscilloscope waveform
 * Right screen: NKS parameter page with value bars
 *
 * Activated by the PadMode button (default mode on connect).
 */

import { MK2Display } from '../MK2Display';
import type { MK2Screen, MK2ScreenContext } from './MK2ScreenManager';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { getNKSParametersForSynth, buildNKSPages } from '../synthParameterMaps';
import type { SynthType, InstrumentConfig } from '@/types/instrument';

// ── Synth name abbreviations for header ──────────────────────────────────────

const SYNTH_ABBREV: Record<string, string> = {
  TB303: '303', OBXd: 'OBXd', Dexed: 'DX7', Helm: 'Helm',
  DubSiren: 'Siren', SpaceLaser: 'Laser', Synare: 'Snare',
  MonoSynth: 'Mono', DuoSynth: 'Duo', PolySynth: 'Poly',
  FMSynth: 'FM', ToneAM: 'AM', SuperSaw: 'Saw', Organ: 'Organ',
  DrumMachine: 'Drums', Buzz3o3: 'B3o3', V2Synth: 'V2',
  Sampler: 'Sampler', SAM: 'SAM',
};

function abbrevSynth(synthType: string): string {
  return SYNTH_ABBREV[synthType] ?? synthType.substring(0, 8);
}

// ── Instrument Screen ────────────────────────────────────────────────────────

export class InstrumentScreen implements MK2Screen {

  render(left: MK2Display, right: MK2Display, ctx: MK2ScreenContext): void {
    const inst = useInstrumentStore.getState().currentInstrument;
    if (!inst) {
      this.renderEmpty(left, right);
      return;
    }

    this.renderLeft(left, inst.synthType, inst.name);
    this.renderRight(right, inst.synthType as SynthType, ctx.nksPage, inst);
  }

  softLabels(): string[] {
    const inst = useInstrumentStore.getState().currentInstrument;
    if (!inst) return Array(8).fill('');

    const params = getNKSParametersForSynth(inst.synthType as SynthType);
    const pages = buildNKSPages(params);
    const total = pages.length;

    // Show page numbers as soft button labels, highlight current
    return Array.from({ length: 8 }, (_, i) =>
      i < total ? `P${i + 1}` : '',
    );
  }

  // ── Left screen: instrument name + waveform area ───────────────────────

  private renderLeft(d: MK2Display, synthType: string, name: string): void {
    const { W, WHITE, BLACK, CHAR_H } = MK2Display;

    // Content area: between soft labels (top 9px) and transport bar (bottom 8px)
    const contentY = CHAR_H + 2;    // below soft label bar
    const contentH = 64 - contentY - CHAR_H; // above transport bar

    // Instrument name — large (scale 2)
    const abbr = abbrevSynth(synthType).toUpperCase();
    d.text(4, contentY + 2, abbr, WHITE, BLACK, 2);

    // Instrument user name — small below
    const shortName = (name || 'Untitled').substring(0, 20);
    d.text(4, contentY + 20, shortName, WHITE);

    // Draw a simple waveform icon based on synth type
    const waveY = contentY + 30;
    const waveH = contentH - 32;
    if (waveH > 4) {
      this.drawSynthIcon(d, 4, waveY, W - 8, waveH, synthType);
    }
  }

  private drawSynthIcon(d: MK2Display, x: number, y: number, w: number, h: number, synthType: string): void {
    const { WHITE } = MK2Display;
    const mid = y + Math.floor(h / 2);

    // Centre line (dotted)
    for (let px = x; px < x + w; px += 4) {
      d.pixel(px, mid, WHITE);
    }

    // Draw a representative waveform shape
    if (synthType === 'TB303' || synthType === 'Buzz3o3') {
      // Sawtooth
      for (let px = 0; px < w; px++) {
        const phase = (px % 32) / 32;
        const amp = (1 - phase * 2); // saw -1 to +1
        const py = mid - Math.round(amp * (h / 2 - 1));
        d.pixel(x + px, py, WHITE);
      }
    } else if (synthType === 'SuperSaw') {
      // Fat saw (multiple)
      for (let px = 0; px < w; px++) {
        const phase = (px % 24) / 24;
        const amp = (1 - phase * 2) * 0.7;
        const py = mid - Math.round(amp * (h / 2 - 1));
        d.pixel(x + px, py, WHITE);
        d.pixel(x + px, py + 1, WHITE);
      }
    } else if (synthType === 'FMSynth' || synthType === 'Dexed') {
      // Complex waveform
      for (let px = 0; px < w; px++) {
        const t = (px / w) * Math.PI * 8;
        const amp = Math.sin(t) * 0.5 + Math.sin(t * 2.3) * 0.3;
        const py = mid - Math.round(amp * (h / 2 - 1));
        d.pixel(x + px, py, WHITE);
      }
    } else {
      // Default: sine wave
      for (let px = 0; px < w; px++) {
        const t = (px / w) * Math.PI * 6;
        const amp = Math.sin(t) * 0.8;
        const py = mid - Math.round(amp * (h / 2 - 1));
        d.pixel(x + px, py, WHITE);
      }
    }
  }

  // ── Right screen: NKS parameter page ───────────────────────────────────

  private renderRight(
    d: MK2Display,
    synthType: SynthType,
    pageIndex: number,
    inst: InstrumentConfig,
  ): void {
    const { W, WHITE, BLACK } = MK2Display;

    const params = getNKSParametersForSynth(synthType);
    const pages = buildNKSPages(params);
    const totalPages = pages.length;

    // Clamp page index
    const safePageIndex = Math.min(pageIndex, totalPages - 1);
    const page = pages[safePageIndex];
    if (!page) {
      d.text(4, 4, 'NO PARAMS', WHITE);
      return;
    }

    const pageParams = page.parameters.slice(0, 7); // 7 params visible (row 0 = header)

    // Header: synth name + page indicator
    const abbr = abbrevSynth(synthType).toUpperCase();
    const pageStr = totalPages > 1 ? ` ${safePageIndex + 1}/${totalPages}` : '';
    const header = (abbr + pageStr).substring(0, 21);

    // Inverted header bar
    d.fillRect(0, 0, W, 10, WHITE);
    d.text(2, 2, header, BLACK, WHITE);

    // Parameter rows
    const rowH = 8; // 7px char + 1px gap
    const barW = 80; // value bar width
    const barX = W - barW - 4;

    for (let i = 0; i < pageParams.length; i++) {
      const param = pageParams[i];
      const rowY = 12 + i * rowH;

      // Get current value from synth config
      const value = this.resolveParamValue(param.id, inst as unknown as Record<string, unknown>);
      const min = (param as { min?: number }).min ?? 0;
      const max = (param as { max?: number }).max ?? 1;
      const normVal = Math.max(0, Math.min(1, (value - min) / Math.max(1e-6, max - min)));

      // Param name (left)
      const name = (param.name ?? param.id).substring(0, 12);
      d.text(2, rowY, name, WHITE);

      // Value bar (right)
      d.rect(barX, rowY, barW, 6, WHITE);
      const filled = Math.round(normVal * (barW - 2));
      if (filled > 0) {
        d.fillRect(barX + 1, rowY + 1, filled, 4, WHITE);
      }
    }
  }

  /** Resolve a dotted param id (e.g. 'filter.cutoff') against synth config. */
  private resolveParamValue(paramId: string, config: Record<string, unknown> | undefined): number {
    if (!config) return 0.5;

    const parts = paramId.split('.');
    let current: unknown = config;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') return 0.5;
      current = (current as Record<string, unknown>)[part];
    }

    return typeof current === 'number' ? current : 0.5;
  }

  // ── Empty state ────────────────────────────────────────────────────────

  private renderEmpty(left: MK2Display, right: MK2Display): void {
    const { WHITE } = MK2Display;
    left.text(4, 20, 'NO INSTRUMENT', WHITE);
    right.text(4, 20, 'SELECT AN', WHITE);
    right.text(4, 30, 'INSTRUMENT', WHITE);
  }
}
