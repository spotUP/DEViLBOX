/**
 * The Auto EQ line says what the analysis store is in, never "no analysis"
 * for an analysis that is ready (ledger L25).
 */
import { describe, it, expect } from 'vitest';
import { autoEqStatus } from '../autoEqStatus';

const base = { genre: '', strength: 0.85, error: null, busEnabled: true } as const;

describe('autoEqStatus', () => {
  it('names the applied genre and strength first', () => {
    expect(autoEqStatus({ ...base, genre: 'Reggae', analysisState: 'ready' }).text).toBe('Reggae · 85%');
  });
  it('says ready when the analysis is in but not yet applied, and why when the bus is off', () => {
    expect(autoEqStatus({ ...base, analysisState: 'ready' }).text).toBe('ready, applying…');
    expect(autoEqStatus({ ...base, analysisState: 'ready', busEnabled: false }).text).toBe('ready — bus off');
  });
  it('reports the running states and a failure', () => {
    expect(autoEqStatus({ ...base, analysisState: 'capturing' }).text).toBe('capturing…');
    expect(autoEqStatus({ ...base, analysisState: 'analyzing' }).text).toBe('analyzing…');
    expect(autoEqStatus({ ...base, analysisState: 'error', error: 'worker died' }).title).toBe('worker died');
  });
  it('says no analysis only when there is none, and says how to get one', () => {
    const s = autoEqStatus({ ...base, analysisState: 'idle' });
    expect(s.text).toBe('no analysis');
    expect(s.title).toMatch(/tracker view/);
  });
});
