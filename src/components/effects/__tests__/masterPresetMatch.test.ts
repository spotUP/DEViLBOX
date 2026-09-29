/**
 * Master FX preset picker (owner ask 2026-09-29): the Presets button and the
 * highlighted row are driven by fingerprint-matching the current chain
 * against the factory and user preset lists — not by which preset was most
 * recently clicked — so the label is correct after a reload or a manual
 * parameter edit too.
 */
import { describe, it, expect } from 'vitest';
import { fingerprintMasterEffects, matchMasterPresetName, masterPresetButtonLabel } from '../masterPresetSearch';

const preset = (name: string, effects: Array<{ type: string; enabled?: boolean; parameters?: Record<string, number | string> }>) =>
  ({ name, effects });

describe('master preset fingerprint matching', () => {
  it('matches a chain equal to a factory preset by name', () => {
    const factory = [preset('Modern Precision', [{ type: 'Compressor', enabled: true, parameters: { threshold: 50 } }])];
    const current = [{ type: 'Compressor', enabled: true, parameters: { threshold: 50 } }];
    expect(matchMasterPresetName(current, factory, [])).toBe('Modern Precision');
  });

  it('does not match once a parameter has been edited, and the button reads "Custom"', () => {
    const factory = [preset('Modern Precision', [{ type: 'Compressor', enabled: true, parameters: { threshold: 50 } }])];
    const edited = [{ type: 'Compressor', enabled: true, parameters: { threshold: 51 } }];
    const matched = matchMasterPresetName(edited, factory, []);
    expect(matched).toBeNull();
    expect(masterPresetButtonLabel(true, matched)).toBe('Custom');
  });

  it('reports an empty chain as no match, and the button label as "No FX"', () => {
    expect(matchMasterPresetName([], [preset('Anything', [])], [])).toBeNull();
    expect(masterPresetButtonLabel(false, null)).toBe('No FX');
  });

  it('matches a user preset too, and parameter key order does not matter', () => {
    const users = [preset('My Gig', [{ type: 'Reverb', enabled: true, parameters: { decay: 2, wet: 40 } }])];
    const current = [{ type: 'Reverb', enabled: true, parameters: { wet: 40, decay: 2 } }];
    expect(matchMasterPresetName(current, [], users)).toBe('My Gig');
  });

  it('fingerprints a disabled effect differently from an enabled one', () => {
    const enabled = fingerprintMasterEffects([{ type: 'Chorus', enabled: true }]);
    const disabled = fingerprintMasterEffects([{ type: 'Chorus', enabled: false }]);
    expect(enabled).not.toBe(disabled);
  });
});
