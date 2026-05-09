/**
 * Contract test: loadInstruments must use skipPreload when followed by explicit preloadInstruments.
 *
 * BUG: loadInstruments() internally fires a queueMicrotask → preloadInstruments() (fire-and-forget).
 * If the caller ALSO awaits preloadInstruments(), the microtask's preload supersedes the caller's
 * preload (via preloadGeneration bump), causing the caller's preload to abort early.
 * Result: instruments never finish initializing → triggerAttack blocked → silence.
 *
 * FIX: Every loadInstruments call that is followed by an explicit preloadInstruments must pass
 * { skipPreload: true } to suppress the internal fire-and-forget preload.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('preload race prevention (contract)', () => {
  const filePath = path.resolve(__dirname, '../../file/UnifiedFileLoader.ts');
  const source = fs.readFileSync(filePath, 'utf-8');
  const lines = source.split('\n');

  it('every loadInstruments + preloadInstruments pair uses skipPreload', () => {
    // Find all loadInstruments calls and check if they're followed by preloadInstruments
    const loadCalls: { line: number; hasSkipPreload: boolean; text: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('loadInstruments(') && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        const hasSkipPreload = line.includes('skipPreload: true');

        // Look ahead up to 30 lines for an explicit preloadInstruments call
        let hasExplicitPreload = false;
        for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
          const ahead = lines[j];
          if (ahead.includes('preloadInstruments(')) {
            hasExplicitPreload = true;
            break;
          }
          // Stop looking if we hit a return or a completely different block
          if (ahead.trim() === 'return;' || ahead.trim() === 'return {') break;
        }

        if (hasExplicitPreload) {
          loadCalls.push({
            line: i + 1,
            hasSkipPreload,
            text: line.trim(),
          });
        }
      }
    }

    // Every loadInstruments that precedes preloadInstruments must use skipPreload
    const violations = loadCalls.filter(c => !c.hasSkipPreload);
    if (violations.length > 0) {
      const msg = violations.map(v =>
        `Line ${v.line}: ${v.text}\n  → Must add { skipPreload: true } to prevent preload race`
      ).join('\n');
      expect.fail(`loadInstruments calls without skipPreload followed by preloadInstruments:\n${msg}`);
    }

    // Sanity: we should find at least 4 pairs (the known import paths)
    expect(loadCalls.length).toBeGreaterThanOrEqual(4);
  });

  it('preload conditions cover all WASM synth types, not just Samplers', () => {
    // Every preloadInstruments call must be guarded by a condition that includes
    // ALL synth types (Furnace, OPL3, etc.), not just Sampler/WaveSabre/Oidos.
    // The correct pattern: `instruments.some(i => i.synthType && i.synthType !== 'Synth')`
    // Wrong patterns: `samplerCount > 0` alone, or listing only specific WASM synth types.
    const preloadLines: { line: number; text: string; contextBefore: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('preloadInstruments(') && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        // Get the condition that guards this preload (look back up to 5 lines)
        let contextBefore = '';
        for (let j = Math.max(0, i - 5); j < i; j++) {
          contextBefore += lines[j] + '\n';
        }
        preloadLines.push({ line: i + 1, text: line.trim(), contextBefore });
      }
    }

    // Check for narrow preload conditions that miss Furnace/OPL3/etc synth types
    const narrowConditions = preloadLines.filter(p => {
      const ctx = p.contextBefore + p.text;
      // OK patterns: unconditional preload, or checks for any non-Synth synthType
      if (ctx.includes("synthType !== 'Synth'")) return false;
      // OK: no condition at all (always preloads)
      if (!ctx.includes('if (') && !ctx.includes('if(')) return false;
      // BAD: only checks for samplerCount or specific WASM types
      if (ctx.includes('samplerCount') && !ctx.includes("synthType !== 'Synth'")) return true;
      if (ctx.includes('WaveSabreSynth') && !ctx.includes("synthType !== 'Synth'")) return true;
      return false;
    });

    if (narrowConditions.length > 0) {
      const msg = narrowConditions.map(v =>
        `Line ${v.line}: ${v.text}\n  → Preload condition too narrow — must cover ALL WASM synth types (Furnace, OPL3, etc.)`
      ).join('\n');
      expect.fail(`Preload conditions that miss WASM synth types:\n${msg}`);
    }

    // Sanity: we should find preload calls
    expect(preloadLines.length).toBeGreaterThanOrEqual(4);
  });
});
