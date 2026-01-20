export const MAX_INSTRUMENTS = 256;
export const MAX_INSTRUMENT_ID = 0xFF;

export const AUDIO_CONSTANTS = {
  VOLUME: {
    MAX_VALUE: 0x40,
    MIN_DB: -40,
    MAX_DB: 0,
  },
  PAN: {
    MIN: -1,
    MAX: 1,
    SCALE: 255,
  },
  FILTER: {
    MIN_CUTOFF_HZ: 200,
    MAX_CUTOFF_HZ: 20000,
    EXP_BASE: 100,
  },
  PORTAMENTO: {
    CENTS_PER_OCTAVE: 1200,
  },
  EFFECT: {
    ARPEGGIO_REFRESH_MS: 20,
    ARPEGGIO_REFRESH_HZ: 50,
  },
};
