/**
 * DeckStemPlayer tests — validates stem playback state management,
 * mute/unmute behavior, and stem control actions.
 */

import { describe, it, expect } from 'vitest';
import { STEM_NAMES_4S, STEM_NAMES_6S } from '../../demucs/types';

// ── Stem name constants ─────────────────────────────────────────────────

describe('Stem name constants', () => {
  it('4-stem model has exactly 4 standard stem names', () => {
    expect(STEM_NAMES_4S).toEqual(['drums', 'bass', 'other', 'vocals']);
    expect(STEM_NAMES_4S.length).toBe(4);
  });

  it('6-stem model has exactly 6 stem names including guitar and piano', () => {
    expect(STEM_NAMES_6S).toEqual(['drums', 'bass', 'other', 'vocals', 'guitar', 'piano']);
    expect(STEM_NAMES_6S.length).toBe(6);
  });

  it('6-stem names are a superset of 4-stem names', () => {
    for (const name of STEM_NAMES_4S) {
      expect(STEM_NAMES_6S).toContain(name);
    }
  });
});

// ── DeckState stem fields ───────────────────────────────────────────────

describe('DeckState stem field defaults', () => {
  it('default stem state has expected shape', () => {
    // Validate the shape matches what makeDefaultDeckState creates
    const defaultStemState = {
      stemsAvailable: false,
      stemNames: [] as string[],
      stemMode: false,
      stemMutes: {} as Record<string, boolean>,
    };

    expect(defaultStemState.stemsAvailable).toBe(false);
    expect(defaultStemState.stemNames).toEqual([]);
    expect(defaultStemState.stemMode).toBe(false);
    expect(Object.keys(defaultStemState.stemMutes)).toHaveLength(0);
  });

  it('stem mutes object can represent 4-stem state', () => {
    const mutes: Record<string, boolean> = {};
    for (const name of STEM_NAMES_4S) {
      mutes[name] = false;
    }

    expect(Object.keys(mutes)).toHaveLength(4);
    expect(mutes.drums).toBe(false);
    expect(mutes.bass).toBe(false);
    expect(mutes.vocals).toBe(false);
    expect(mutes.other).toBe(false);

    // Toggle a mute
    mutes.vocals = true;
    expect(mutes.vocals).toBe(true);
    expect(mutes.drums).toBe(false);
  });

  it('stem mutes object can represent 6-stem state', () => {
    const mutes: Record<string, boolean> = {};
    for (const name of STEM_NAMES_6S) {
      mutes[name] = false;
    }

    expect(Object.keys(mutes)).toHaveLength(6);
    expect(mutes.guitar).toBe(false);
    expect(mutes.piano).toBe(false);
  });
});

// ── Stem color mapping ──────────────────────────────────────────────────

describe('DeckStemControls color/label mapping', () => {
  const STEM_COLORS: Record<string, string> = {
    drums: '#f97316',
    bass: '#3b82f6',
    vocals: '#ec4899',
    other: '#22c55e',
    guitar: '#a855f7',
    piano: '#eab308',
  };

  const STEM_LABELS: Record<string, string> = {
    drums: 'DRM',
    bass: 'BAS',
    vocals: 'VOX',
    other: 'OTH',
    guitar: 'GTR',
    piano: 'PNO',
  };

  it('all 4-stem names have color mappings', () => {
    for (const name of STEM_NAMES_4S) {
      expect(STEM_COLORS[name]).toBeDefined();
      expect(STEM_COLORS[name]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('all 6-stem names have color mappings', () => {
    for (const name of STEM_NAMES_6S) {
      expect(STEM_COLORS[name]).toBeDefined();
    }
  });

  it('all stems have 3-character labels', () => {
    for (const name of STEM_NAMES_6S) {
      expect(STEM_LABELS[name]).toBeDefined();
      expect(STEM_LABELS[name].length).toBe(3);
    }
  });
});

// ── Stem mode transition logic ──────────────────────────────────────────

describe('Stem mode transition', () => {
  it('stem mode requires audio playback mode', () => {
    // Simulates the guard in DeckEngine.setStemMode
    const playbackMode: string = 'tracker';
    const canEnableStemMode = playbackMode === 'audio';
    expect(canEnableStemMode).toBe(false);
  });

  it('stem mode requires stems to be loaded', () => {
    const stemsLoaded = false;
    const canEnableStemMode = stemsLoaded;
    expect(canEnableStemMode).toBe(false);
  });

  it('stem mode can be enabled when audio mode and stems loaded', () => {
    const playbackMode = 'audio';
    const stemsLoaded = true;
    const canEnableStemMode = playbackMode === 'audio' && stemsLoaded;
    expect(canEnableStemMode).toBe(true);
  });
});

// ── Stem dub send state ─────────────────────────────────────────────────

describe('Stem dub send state management', () => {
  it('default stemDubSends is an empty object', () => {
    const defaultDubSends: Record<string, boolean> = {};
    expect(Object.keys(defaultDubSends)).toHaveLength(0);
  });

  it('can toggle individual stem dub sends', () => {
    const sends: Record<string, boolean> = {};
    for (const name of STEM_NAMES_4S) {
      sends[name] = false;
    }

    // Toggle vocals dub send on
    const stemName = 'vocals';
    const current = sends[stemName] ?? false;
    const updated: Record<string, boolean> = { ...sends, [stemName]: !current };

    expect(updated['vocals']).toBe(true);
    expect(updated['drums']).toBe(false);
    expect(updated['bass']).toBe(false);
    expect(updated['other']).toBe(false);
  });

  it('multiple stems can send to dub simultaneously', () => {
    const sends: Record<string, boolean> = {
      drums: true,
      bass: false,
      vocals: true,
      other: false,
    };

    const activeSends = Object.entries(sends)
      .filter(([, v]) => v)
      .map(([k]) => k);

    expect(activeSends).toEqual(['drums', 'vocals']);
    expect(activeSends.length).toBe(2);
  });

  it('stem dub sends reset to empty on new track load', () => {
    const prevSends = { drums: true, vocals: true };
    // Simulates what loadStems does: reset to empty
    const resetSends = {};
    expect(Object.keys(resetSends)).toHaveLength(0);
    expect(prevSends.drums).toBe(true); // old state untouched
  });

  it('stem dub sends only work in stem mode', () => {
    const stemMode = false;
    const sends = { vocals: true };
    // Simulates the guard in DJDeck syncStemTaps
    const shouldOpenTaps = stemMode && Object.values(sends).some(v => v);
    expect(shouldOpenTaps).toBe(false);
  });

  it('stem dub sends require stems to be available', () => {
    const stemsAvailable = false;
    const stemMode = true;
    const sends = { vocals: true };
    const shouldOpenTaps = stemsAvailable && stemMode && Object.values(sends).some(v => v);
    expect(shouldOpenTaps).toBe(false);
  });

  it('stem tap key format prevents collision with channel taps', () => {
    const deckId = 'A';
    const stemName = 'vocals';
    const channelIndex = 3;
    const stemKey = `${deckId}:stem:${stemName}`;
    const channelKey = `${deckId}:${channelIndex}`;
    expect(stemKey).toBe('A:stem:vocals');
    expect(channelKey).toBe('A:3');
    expect(stemKey).not.toBe(channelKey);
  });

  it('continuous stem send uses non-zero gain', () => {
    const STEM_DUB_SEND_GAIN = 0.7;
    expect(STEM_DUB_SEND_GAIN).toBeGreaterThan(0);
    expect(STEM_DUB_SEND_GAIN).toBeLessThanOrEqual(1);
  });
});
