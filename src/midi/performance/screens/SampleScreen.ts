/**
 * SampleScreen — MK2 display for sample editor mode.
 *
 * Left screen:  Waveform with loop markers and playhead
 * Right screen: Sample parameters (tune, volume, loop mode, start/end)
 *
 * Activated by the Sampling button.
 */

import { MK2Display } from '../MK2Display';
import type { MK2Screen, MK2ScreenContext } from './MK2ScreenManager';
import { useInstrumentStore } from '@/stores/useInstrumentStore';

export class SampleScreen implements MK2Screen {

  render(left: MK2Display, right: MK2Display, _ctx: MK2ScreenContext): void {
    const inst = useInstrumentStore.getState().currentInstrument;
    if (!inst?.sample?.audioBuffer) {
      this.renderNoSample(left, right, inst?.name);
      return;
    }

    this.renderWaveform(left, inst.sample.audioBuffer, inst.sample);
    this.renderParams(right, inst.sample, inst.name);
  }

  softLabels(): string[] {
    return ['ZOOM-', 'ZOOM+', 'LOOP', 'REV', '', '', 'NORM', 'TRIM'];
  }

  private renderWaveform(
    d: MK2Display,
    buffer: ArrayBuffer,
    sample: { loopStart: number; loopEnd: number; loop: boolean },
  ): void {
    const { W, WHITE } = MK2Display;
    const contentY = 10;
    const contentH = 64 - 10 - 8; // 46px for waveform

    // Convert ArrayBuffer to Float32Array for rendering
    // Assume 16-bit signed PCM if not an AudioBuffer
    const pcm = this.bufferToFloat32(buffer);
    if (pcm.length === 0) return;

    // Draw waveform
    d.waveform(pcm, 0, contentY, W, contentH, WHITE);

    // Loop markers
    if (sample.loop && pcm.length > 0) {
      const loopStartX = Math.round((sample.loopStart / pcm.length) * (W - 1));
      const loopEndX = Math.round((sample.loopEnd / pcm.length) * (W - 1));

      // Loop start: solid vertical line
      d.vline(loopStartX, contentY, contentH, WHITE);
      // Small 'L' marker at top
      d.text(loopStartX + 1, contentY, 'L', WHITE);

      // Loop end: dashed vertical line
      for (let y = contentY; y < contentY + contentH; y += 3) {
        d.pixel(loopEndX, y, WHITE);
      }
    }
  }

  private renderParams(
    d: MK2Display,
    sample: {
      baseNote: string; detune: number; loop: boolean;
      loopType?: string; loopStart: number; loopEnd: number;
      playbackRate: number; reverse: boolean; sampleRate?: number;
    },
    instName: string,
  ): void {
    const { W, WHITE, BLACK } = MK2Display;

    // Header
    d.fillRect(0, 0, W, 10, WHITE);
    d.text(2, 2, 'SAMPLE EDIT', BLACK, WHITE);

    const rows = [
      ['Name', instName.substring(0, 14)],
      ['Note', sample.baseNote],
      ['Tune', `${sample.detune > 0 ? '+' : ''}${sample.detune}ct`],
      ['Loop', sample.loop ? (sample.loopType || 'fwd') : 'off'],
      ['Start', `${sample.loopStart}`],
      ['End', `${sample.loopEnd}`],
      ['Rate', `${sample.playbackRate.toFixed(2)}x`],
    ];

    for (let i = 0; i < rows.length; i++) {
      const y = 12 + i * 8;
      d.text(4, y, rows[i][0], WHITE);
      d.textRight(0, y, W - 4, rows[i][1], WHITE);
    }
  }

  private renderNoSample(left: MK2Display, right: MK2Display, instName?: string): void {
    const { WHITE } = MK2Display;
    left.text(4, 24, 'NO SAMPLE', WHITE);
    left.text(4, 36, 'LOADED', WHITE);
    right.text(4, 20, instName?.substring(0, 20) || '', WHITE);
    right.text(4, 34, 'Load a sample to', WHITE);
    right.text(4, 44, 'edit waveform', WHITE);
  }

  /** Convert an ArrayBuffer (assumed 16-bit signed PCM mono) to Float32Array. */
  private bufferToFloat32(buffer: ArrayBuffer): Float32Array {
    const bytes = new Int16Array(buffer);
    const out = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[i] = bytes[i] / 32768;
    }
    return out;
  }
}
