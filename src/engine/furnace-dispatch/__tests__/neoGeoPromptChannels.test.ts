import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CHIPTYPE_OPNB, OPNB_VOICE_KINDS, opnbKindChannels } from '@engine/furnace-dispatch/opnbVoices';

// The server cannot import from src/, so its Neo Geo channel text is a copy.
// This test keeps the copy in step with the channel layout the editor uses.
const prompt = readFileSync(resolve(__dirname, '../../../../server/src/ai/systemPrompt.ts'), 'utf8');

function span(channels: number[]): string {
  return channels.length === 1 ? `channel ${channels[0]}` : `channels ${channels[0]} to ${channels[channels.length - 1]}`;
}

describe('server systemPrompt Neo Geo channel text', () => {
  const labelOf: Record<string, string> = { fm: 'FM', ssg: 'SSG', adpcma: 'ADPCM-A', adpcmb: 'ADPCM-B' };
  it.each(OPNB_VOICE_KINDS.map((k) => [k.id, k.divInsType] as const))('names the channels and instrument type of %s', (id, divInsType) => {
    const channels = opnbKindChannels(CHIPTYPE_OPNB, divInsType);
    expect(channels.length).toBeGreaterThan(0);
    expect(prompt).toContain(`${labelOf[id]}: ${span(channels)}`);
    expect(prompt).toContain(`${labelOf[id]} ${divInsType}`);
  });
});
