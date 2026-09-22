import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Jochen Hippel 7V: native grid, UADE audio — never the TFMX decoder.
 *
 * hip7 was routed to the Hippel WASM engine (libtfmxaudiodecoder), whose
 * "7V" is TFMX's seven-voice mode, a different format; the tune loaded,
 * marched its rows and rendered silence — "7V does not work in DEViLBOX"
 * (2026-09-22). UADE is the fallback behind the native parser, not the
 * format's home: the formatEngine default stays 'native'.
 */
const parser = readFileSync(join(process.cwd(), 'src/lib/import/formats/JochenHippel7VParser.ts'), 'utf-8');
const routes = readFileSync(join(process.cwd(), 'src/lib/import/parsers/AmigaFormatParsers.ts'), 'utf-8');
const settings = readFileSync(join(process.cwd(), 'src/stores/useSettingsStore.ts'), 'utf-8');

describe('Jochen Hippel 7V route', () => {
  it('the parser owns the grid and does not hand audio to the TFMX decoder', () => {
    expect(parser).toContain('uadePatternLayout,');
    expect(parser).not.toMatch(/^\s*hippelFileData:/m);
  });

  it('audio is injected from UADE behind the native parser', () => {
    const i = routes.indexOf("matchesExt(filename, ['hip7', 's7g'])");
    expect(i).toBeGreaterThan(-1);
    const branch = routes.slice(i, i + 700);
    expect(branch).toContain("withNativeThenUADE('jochenHippel7V', ctx,");
    expect(branch).toContain('{ injectUADE: true }');
  });

  it('keeps the native default — UADE is the last resort, not the setting', () => {
    expect(settings).toMatch(/jochenHippel7V:\s*'native'/);
  });
});
