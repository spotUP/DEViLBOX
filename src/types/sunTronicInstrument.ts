/**
 * SunTronicConfig — plain, JSON-serializable mirror of a decoded SunTronic V1.3
 * synth record, carried on `InstrumentConfig.sunTronic`.
 *
 * The parser decodes each 0x24-byte synth record into a `SunSynthInstrument`
 * (SunTronicV13.ts) whose waveform/envelope/arp tables are `Int8Array`s. Those
 * do NOT survive JSON persistence (localStorage/IDB) — they round-trip to
 * index-keyed objects and corrupt on reload. So the config the editor persists
 * mirrors them as plain `number[]` (signed byte values); the native synth
 * reconstructs typed arrays at construction time.
 *
 * This is the single serializable representation — converters between it and the
 * runtime `SunSynthInstrument` live in SunTronicVoiceRenderer.ts.
 */
export interface SunTronicConfig {
  /** marker so routing/serialization can detect a SunTronic synth instrument. */
  sunTronic: 1;
  /** synthesis type (record+0x23): 0 morph, 1 pulse/noise, 2 splice, 3 resample, else smooth. */
  synthType: number;
  /** play-buffer length in words (record+0x22); buffer is waveWordLen*2 bytes. */
  waveWordLen: number;
  /** arp/interp table length + loop point (record+0x16/+0x18). */
  arpLen: number;
  arpLoop: number;
  /** volume-envelope length + loop point (record+0x04/+0x06). */
  volEnvLen: number;
  volEnvLoop: number;
  /** freq-envelope length + loop point + speed (record+0x0c/+0x0e/+0x10). */
  freqEnvLen: number;
  freqEnvLoop: number;
  freqEnvSpeed: number;
  /** signed-byte tables (Int8Array values as plain numbers). */
  wave1: number[];
  wave2: number[];
  arpTable: number[];
  volEnv: number[];
  vibDepth: number[];
}
