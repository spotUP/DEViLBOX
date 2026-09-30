/**
 * The Oomek Aggressor 3o3 always has its editor.
 *
 * Owner, 2026-09-30: "Oomek Aggressor 3o3 synth shows no ui". Buzz3o3 uses
 * the 303 panel, which renders only with a tb303 config; switching an
 * instrument to Buzz3o3 in the editor header cleared tb303 and set none.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

describe('Buzz3o3 editor', () => {
  it('switching to Buzz3o3 sets a tb303 config', () => {
    expect(src('components/instruments/shared/EditorHeader.tsx')).toMatch(/case 'Buzz3o3': updates\.tb303 = \{ \.\.\.DEFAULT_TB303 \}/);
  });
  it('a 303-panel synth without tb303 gets the default when its editor opens', () => {
    expect(src('components/instruments/editors/SynthTypeDispatcher.tsx')).toMatch(/editorMode === 'tb303' && instrument && !instrument\.tb303\) onChange\(\{ tb303: \{ \.\.\.DEFAULT_TB303 \} \}\)/);
  });
});
