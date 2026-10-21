/**
 * Keys the dub bus's sidechain detector from the DubBusSettings source.
 *
 * Owned by DubBus, so the setting takes effect whenever it is written, not
 * only while the deck strip happens to be mounted (the 2026-10-02 audit found
 * `sidechainSource` / `sidechainChannelIndex` read nowhere inside the engine).
 *
 *  - 'bus'     no tap: the compressor detects its own input.
 *  - 'channel' the isolated audio of tracker channel `channelIndex` is tapped
 *              into the detector (ChannelRoutedEffects.addSidechainTap).
 *  - 'drums'   the classifier's drum channel (resolveDrumKeyChannel), asked
 *              again whenever the song changes. Unresolved (-1) leaves the key
 *              SILENT on purpose: self-keying a kick ducker turns it into a
 *              permanent bass compressor (-11.4 dB at 100 Hz, 2026-09-29).
 */
import type { DubBusSettings } from '../../types/dub';

export class SidechainSourceRouter {
  private release: (() => void) | null = null;
  private unsubscribeSong: (() => void) | null = null;
  /** Bumped on every apply/dispose so a tap that resolves late is taken back out. */
  private generation = 0;

  private readonly detectorInput: () => AudioNode;

  constructor(detectorInput: () => AudioNode) {
    this.detectorInput = detectorInput;
  }

  apply(source: DubBusSettings['sidechainSource'], channelIndex: number): void {
    this.teardown();
    if (source === 'bus') return;
    const gen = ++this.generation;
    void this.tap(source, channelIndex, gen);
  }

  dispose(): void {
    this.teardown();
  }

  private teardown(): void {
    this.generation++;
    this.unsubscribeSong?.();
    this.unsubscribeSong = null;
    this.release?.();
    this.release = null;
  }

  private async tap(source: 'channel' | 'drums', channelIndex: number, gen: number): Promise<void> {
    try {
      const input = this.detectorInput();
      const { getChannelRoutedEffectsManager } = await import('../tone/ChannelRoutedEffects');
      const mgr = getChannelRoutedEffectsManager();
      let channel = channelIndex;
      if (source === 'drums') {
        const key = await import('../tone/sidechainKey');
        if (gen !== this.generation) return;
        this.unsubscribeSong = key.onSongChange(() => this.apply('drums', channelIndex));
        channel = await key.resolveDrumKeyChannel();
        if (gen !== this.generation) return;
        if (channel < 0) return;
      }
      const ok = await mgr.addSidechainTap(channel, input);
      if (!ok) return;
      const remove = () => mgr.removeSidechainTap(channel, input);
      if (gen !== this.generation) remove();
      else this.release = remove;
    } catch (e) {
      console.warn('[DubBus] sidechain tap failed:', e);
    }
  }
}
