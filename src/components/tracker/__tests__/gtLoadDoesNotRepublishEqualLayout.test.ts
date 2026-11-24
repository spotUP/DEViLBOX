import { describe, it, expect } from 'vitest';
import { publishChannelLayout, subscribeChannelLayout, type ChannelLayout } from '../channelLayout';

// GoatTracker Ultra load: one engine message per pattern gave the editor new,
// value-equal layout arrays. Each republish woke the aligned order matrix,
// which set state per message until React threw "Maximum update depth exceeded".
describe('GT song load does not republish an unchanged channel layout', () => {
  it('skips the notify and keeps array identity when the values are equal', () => {
    const out: ChannelLayout = { offsets: [], widths: [], scrollLeft: 0, numChannels: 0 };
    let notified = 0;
    const unsub = subscribeChannelLayout(() => { notified++; });
    try {
      expect(publishChannelLayout(out, [0, 100, 200], [100, 100, 100], 3)).toBe(true);
      const keptOffsets = out.offsets;
      const keptWidths = out.widths;
      for (let i = 0; i < 200; i++) {
        expect(publishChannelLayout(out, [0, 100, 200], [100, 100, 100], 3)).toBe(false);
      }
      expect(notified).toBe(1);
      expect(out.offsets).toBe(keptOffsets);
      expect(out.widths).toBe(keptWidths);

      // A real change still publishes.
      expect(publishChannelLayout(out, [0, 120, 240], [120, 120, 120], 3)).toBe(true);
      expect(notified).toBe(2);
      expect(out.offsets).toEqual([0, 120, 240]);
      expect(publishChannelLayout(out, [0, 120], [120, 120], 2)).toBe(true);
      expect(notified).toBe(3);
    } finally {
      unsub();
    }
  });
});
