import { describe, it, expect } from 'vitest';
import { fitAndStretchChannelWidths, channelAreaWidth, ADD_CHANNEL_BUTTON_PX } from '../channelLayout';

const LEFT = 40;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe('Add Channel button stays on screen', () => {
  it('stretched channels leave the button its column at the right edge', () => {
    const canvas = 1200;
    const { leftEdge, widths } = fitAndStretchChannelWidths([200, 200, 200, 200], LEFT, channelAreaWidth(canvas, true), true);
    expect(leftEdge + sum(widths) + ADD_CHANNEL_BUTTON_PX).toBe(canvas);
  });

  it('fitted channels leave room for the button too', () => {
    const canvas = 1000;
    const { leftEdge, widths } = fitAndStretchChannelWidths(Array(12).fill(200), LEFT, channelAreaWidth(canvas, true), true);
    expect(leftEdge + sum(widths) + ADD_CHANNEL_BUTTON_PX).toBeLessThanOrEqual(canvas);
  });

  it('without the button the channels fill the whole canvas', () => {
    expect(channelAreaWidth(1200, false)).toBe(1200);
    expect(channelAreaWidth(10, true)).toBe(0);
  });
});
