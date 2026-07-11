/**
 * visualizerRafGating.ratchet.test.ts — heat regression guard.
 *
 * These 9 visualizer/scope components used to hand-roll a raw
 * `requestAnimationFrame` loop that self-rescheduled forever, never stopping
 * when playback was stopped or the tab was hidden. The browser batches every
 * rAF callback into one vsync, so all 9 ran in a single frame and pinned the
 * CPU/GPU regardless of playback state — the app got "almost unusable" hot.
 *
 * The fix migrated all 9 onto the shared, gated `useVisualizationAnimation`
 * hook, which fully cancels its rAF (0 CPU) when `enabled` is false or the tab
 * is hidden. This ratchet forbids raw `requestAnimationFrame` from creeping
 * back into any of the 9. Reverting a migration reintroduces the raw call and
 * fails this test.
 *
 * Scope is an explicit allowlist (not a whole directory) on purpose: dozens of
 * other components in these dirs legitimately drive their own rAF (turntables,
 * one-shot cursors, conditionally-mounted views). This guards exactly the
 * always-on offenders that caused the heat.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const MIGRATED_FILES = [
  'src/components/tracker/TrackerVisualBackground.tsx',
  'src/components/visualization/ChannelOscilloscope.tsx',
  'src/components/visualization/ChannelSpectrums.tsx',
  'src/components/visualization/CircularVU.tsx',
  'src/components/dj/MixerVUMeter.tsx',
  'src/components/dj/DeckScopes.tsx',
  'src/components/automation/AutomationLaneStrip.tsx',
  'src/components/musicline/MusicLineWaveformVisualizer.tsx',
  'src/components/dialogs/sid/SIDScopeTab.tsx',
];

describe('visualizer rAF gating ratchet', () => {
  it.each(MIGRATED_FILES)('%s uses no raw requestAnimationFrame', (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    expect(src).not.toMatch(/requestAnimationFrame/);
  });

  it.each(MIGRATED_FILES)('%s drives animation via useVisualizationAnimation', (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    expect(src).toMatch(/useVisualizationAnimation/);
  });
});
