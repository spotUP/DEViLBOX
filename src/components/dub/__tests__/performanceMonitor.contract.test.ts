/**
 * Gate O1 — contract tests for the performance monitor.
 *
 * Source-level rather than rendered: the monitor's value is in WHAT it reads
 * and what it refuses to do, and both are visible in the source without an
 * AudioContext or a DOM.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const monitor = readFileSync(resolve(here, '../PerformanceMonitor.tsx'), 'utf8');
const panel = readFileSync(resolve(here, '../AutoDubPanel.tsx'), 'utf8');
const autoDub = readFileSync(resolve(here, '../../../engine/dub/AutoDub.ts'), 'utf8');

describe('PerformanceMonitor', () => {
  it('reads ONE snapshot rather than polling several getters', () => {
    // Five reads of a moving performer can show five different instants, which
    // makes the monitor lie in exactly the situations it is needed for.
    expect(monitor).toContain('getPerformanceSnapshot()');
    expect(monitor).not.toContain('getAutoDubIntention');
    expect(monitor).not.toContain('getAutoDubEnergy');
  });

  it('is read-only — a monitor with controls is a second control surface', () => {
    expect(monitor).not.toMatch(/onClick=/);
    expect(monitor).not.toContain('fireDub');
    expect(monitor).not.toContain('setChannel');
  });

  it('shows the things the gate asks for', () => {
    for (const field of ['Persona', 'State', 'Intention', 'Target', 'Phrase', 'Last move', 'Next event', 'WHY?']) {
      expect(monitor, field).toContain(field);
    }
  });

  it('cleans up its polling', () => {
    expect(monitor).toContain('clearInterval');
  });

  it('uses design tokens rather than raw colours', () => {
    // The project's Tailwind allowlist: no `text-red-400`-style literals.
    expect(monitor).not.toMatch(/(bg|text|border)-(red|green|blue|yellow|gray|slate|zinc)-\d{3}/);
    expect(monitor).toContain('text-text-muted');
    expect(monitor).toContain('bg-dark-bgSecondary');
  });

  it('is mounted where the performer is configured', () => {
    expect(panel).toContain('<PerformanceMonitor />');
  });
});

describe('getPerformanceSnapshot', () => {
  it('is assembled in the engine, not in the component', () => {
    expect(autoDub).toContain('export function getPerformanceSnapshot()');
    expect(autoDub).toContain('why: string[]');
  });

  it('explains itself — the WHY factors come from the planner\'s own reason', () => {
    expect(autoDub).toContain('why.push(_lastIntention.reason)');
  });
});
