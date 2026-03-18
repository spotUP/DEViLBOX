/**
 * EffectLookupTable.ts — Per-format effect command mapping to ProTracker (MOD) bytes
 *
 * SOURCE: All tables derived exclusively from OpenMPT loader source code:
 *   soundlib/MODTools.cpp    — ConvertModCommand() — authoritative MOD/XM table
 *   soundlib/Load_s3m.cpp    — S3MConvert() — shared by S3M and IT
 *   soundlib/Load_stm.cpp    — ConvertSTMCommand(), ConvertST2Tempo()
 *   soundlib/Load_far.cpp    — farEffects[] LUT
 *   soundlib/Load_669.cpp    — effTrans[] LUT
 *   soundlib/Load_mtm.cpp    — MOD-style pass-through
 *   soundlib/Load_gdm.cpp    — gdmEffTrans[] LUT
 *   soundlib/Load_psm.cpp    — switch(command) handler
 *   soundlib/Load_ult.cpp    — ultEffTrans[] LUT
 *   soundlib/Snd_fx.cpp      — ConvertST2Tempo() implementation
 *
 * IMPORTANT: Only ProTracker effect bytes 0x00–0x0F can be stored in a MOD file
 * and rendered by OpenMPT.  Effects > 0x0F are XM-extensions that are silently
 * dropped when the TrackerSong is exported to .mod by export-songs-openmpt.ts.
 *
 * ProTracker MOD effect byte → meaning:
 *   0x00  Arpeggio             0x01  Portamento Up
 *   0x02  Portamento Down      0x03  Tone Portamento
 *   0x04  Vibrato              0x05  Tone Porta + Volume Slide
 *   0x06  Vibrato + Vol Slide  0x07  Tremolo
 *   0x08  Set Panning (0=L,128=C,255=R)
 *   0x09  Sample Offset        0x0A  Volume Slide  (hi=up, lo=down nibble)
 *   0x0B  Position Jump        0x0C  Set Volume  (0–64)
 *   0x0D  Pattern Break  (decimal param = row: hi*10+lo)
 *   0x0E  Extended  (E0x–EFx sub-commands)
 *   0x0F  Speed/BPM  (1–31 = ticks/row,  32–255 = BPM)
 *
 * XM-only effects (> 0x0F, dropped in MOD export):
 *   0x10 G = Set Global Volume    0x11 H = Global Volume Slide
 *   0x14 K = Key Off              0x15 L = Set Envelope Position
 *   0x19 P = Panning Slide        0x1B R = Retrig (Rxy)
 *   0x1D T = Tremor (Txy)         0x21 X = Extra Fine Porta
 *   0x22 Y = Panbrello            0x23 Z = MIDI
 */

// ── MOD / XM effect mapping (ConvertModCommand, MODTools.cpp) ──────────────────
//
// XM stores the effect as a raw byte (0–35) matching these indices exactly.
// Our parsers store effTyp = XM effect byte directly.
//
// Index → ProTracker byte (for 0–15); indices 16+ are XM extensions.
//
// Source: static constexpr EffectCommand effTrans[] in ConvertModCommand()
//   0x00 CMD_ARPEGGIO       0x01 CMD_PORTAMENTOUP    0x02 CMD_PORTAMENTODOWN
//   0x03 CMD_TONEPORTAMENTO  0x04 CMD_VIBRATO         0x05 CMD_TONEPORTAVOL
//   0x06 CMD_VIBRATOVOL     0x07 CMD_TREMOLO          0x08 CMD_PANNING8
//   0x09 CMD_OFFSET         0x0A CMD_VOLUMESLIDE      0x0B CMD_POSITIONJUMP
//   0x0C CMD_VOLUME         0x0D CMD_PATTERNBREAK     0x0E CMD_MODCMDEX
//   0x0F CMD_TEMPO  [param < 0x20 → CMD_SPEED, else CMD_TEMPO]
//   ... 0x10–0x23: XM-only, dropped in MOD export

// ── S3M / IT effect mapping (S3MConvert, Load_s3m.cpp) ────────────────────────
//
// S3M/IT store effect as ASCII letter (A=1…Z=26).
// Both formats share the same S3MConvert() function.
//
// Letter → ProTracker byte mapping (effects above 0x0F are XM-only, dropped):
//
//   A(1)  → 0x0F  CMD_SPEED        (param = ticks/row,  must be 1–31)
//   B(2)  → 0x0B  CMD_POSITIONJUMP
//   C(3)  → 0x0D  CMD_PATTERNBREAK  NOTE: S3M uses BCD param, IT uses decimal
//   D(4)  → 0x0A  CMD_VOLUMESLIDE
//   E(5)  → 0x02  CMD_PORTAMENTODOWN  (EFx→E2x fine, EEx→extra fine)
//   F(6)  → 0x01  CMD_PORTAMENTOUP   (FFx→E1x fine, FEx→extra fine)
//   G(7)  → 0x03  CMD_TONEPORTAMENTO
//   H(8)  → 0x04  CMD_VIBRATO
//   I(9)  → (dropped — CMD_TREMOR is XM 0x1D, > 0x0F)
//   J(10) → 0x00  CMD_ARPEGGIO
//   K(11) → 0x06  CMD_VIBRATOVOL
//   L(12) → 0x05  CMD_TONEPORTAVOL
//   M(13) → (dropped — CMD_CHANNELVOLUME, no MOD equivalent)
//   N(14) → (dropped — CMD_CHANNELVOLSLIDE, no MOD equivalent)
//   O(15) → 0x09  CMD_OFFSET
//   P(16) → (dropped — CMD_PANNINGSLIDE, no MOD equivalent)
//   Q(17) → 0x0E  CMD_MODCMDEX, param = 0x90|(p & 0x0F)  [E9x retrig]
//   R(18) → 0x07  CMD_TREMOLO
//   S(19) → 0x0E  CMD_MODCMDEX  (S3x→E3x, S4x→E4x, S6x→E6x, S8x→E8x, SCx→ECx, SDx→EDx, SEx→EEx)
//   T(20) → 0x0F  CMD_TEMPO  (param must be ≥ 0x20 = BPM; param < 0x20 is invalid)
//   U(21) → 0x04  CMD_VIBRATO  (fine vibrato ≈ vibrato in MOD)
//   V(22) → (dropped — CMD_GLOBALVOLUME)
//   W(23) → (dropped — CMD_GLOBALVOLSLIDE)
//   X(24) → 0x08  CMD_PANNING8  (param 0–127 scaled → 0–255)
//   Y(25) → (dropped — CMD_PANBRELLO)
//   Z(26) → (dropped — CMD_MIDI)

// ── GDM effect mapping (gdmEffTrans[], Load_gdm.cpp) ──────────────────────────
//
// GDM stores effect as index 0x00–0x1F.
// Source: static constexpr EffectCommand gdmEffTrans[] in Load_gdm.cpp:385
//
//   0x00  none               0x01  porta up (clamp to 0xDF)
//   0x02  porta down         0x03  tone porta
//   0x04  vibrato            0x05  tone porta+vol  (keep non-zero nibble)
//   0x06  vibrato+vol        0x07  tremolo
//   0x08  CMD_TREMOR  → dropped (0x1D > 0x0F)
//   0x09  offset             0x0A  vol slide
//   0x0B  pos jump           0x0C  volume  → moved to volume column
//   0x0D  pattern break      0x0E  CMD_MODCMDEX  (E8x↔portamento in E8/E9)
//   0x0F  CMD_SPEED → 0x0F   0x10  CMD_ARPEGGIO → 0x00
//   0x11  none (internal)    0x12  CMD_RETRIG → E9x  (special case in translateGDMEffect)
//   0x13  CMD_GLOBALVOLUME → dropped
//   0x14  CMD_FINEVIBRATO → 0x04  (approximate as vibrato)
//   0x15–0x1D  none
//   0x1E  CMD_S3MCMDEX  (surround 0x91, panning 0x8x survive)
//   0x1F  CMD_TEMPO → 0x0F BPM  (param = BPM, must be ≥ 0x20)

// ── STM effect mapping (ConvertSTMCommand, Load_stm.cpp) ──────────────────────
//
// STM stores effect as 4-bit index 0–9 (indices A–F are no-ops).
// Source: static constexpr EffectCommand stmEffects[] in Load_stm.cpp:128
//
//   0x0  none
//   0x1  CMD_SPEED (high nibble of param = ticks/row; also emits ConvertST2Tempo BPM)
//   0x2  CMD_POSITIONJUMP
//   0x3  CMD_PATTERNBREAK  (BCD param: hi*10+lo)
//   0x4  CMD_VOLUMESLIDE  (lower nibble takes precedence)
//   0x5  CMD_PORTAMENTODOWN  (no-op if param=0)
//   0x6  CMD_PORTAMENTOUP
//   0x7  CMD_TONEPORTAMENTO
//   0x8  CMD_VIBRATO
//   0x9  CMD_TREMOR → dropped
//   0xA–0xF  none
//
// STM TEMPO NOTE: OpenMPT also writes a CMD_TEMPO command (via ConvertST2Tempo)
// alongside every CMD_SPEED.  Formula (from Snd_fx.cpp:6217):
//   ST2TempoFactor = [140, 50, 25, 15, 10, 7, 6, 4, 3, 3, 2, 2, 2, 2, 1, 1]
//   samplesPerTick = 23863 / (50 - ((ST2TempoFactor[tempo>>4] * (tempo&0xF)) >> 4))
//   BPM = round((23863 * 5) / (samplesPerTick * 2))

/** Convert an STM packed tempo byte to a ProTracker BPM value.
 *  Matches OpenMPT CSoundFile::ConvertST2Tempo() exactly. */
export function convertST2TempoToBPM(tempo: number): number {
  const ST2TempoFactor = [140, 50, 25, 15, 10, 7, 6, 4, 3, 3, 2, 2, 2, 2, 1, 1];
  const st2MixingRate  = 23863;
  const hiNibble       = (tempo >> 4) & 0x0F;
  const loNibble       =  tempo       & 0x0F;
  let   divisor        = 50 - ((ST2TempoFactor[hiNibble] * loNibble) >> 4);
  let   samplesPerTick = divisor > 0 ? st2MixingRate / divisor : (st2MixingRate / divisor) + 65536;
  const bpm            = Math.round((st2MixingRate * 5) / (samplesPerTick * 2));
  // Clamp to valid MOD BPM range 32–255
  return Math.max(32, Math.min(255, bpm));
}

// ── FAR effect mapping (farEffects[], Load_far.cpp) ───────────────────────────
//
// FAR stores effect as high nibble (0–F); low nibble is the 4-bit param.
// Source: static constexpr EffectCommand farEffects[] in Load_far.cpp:206
//
//   0x0  CMD_NONE              0x1  CMD_PORTAMENTOUP
//   0x2  CMD_PORTAMENTODOWN    0x3  CMD_TONEPORTAMENTO
//   0x4  CMD_RETRIG  → 0x0E, eff = 0x90|(param & 0x0F)  [E9x]
//   0x5  CMD_VIBRATO (depth)   0x6  CMD_VIBRATO (speed)
//   0x7  CMD_VOLUMESLIDE (up)  0x8  CMD_VOLUMESLIDE (down)
//   0x9  CMD_VIBRATO (sustained)
//   0xA  (vol+porta) → volume column only, no effTyp/eff
//   0xB  CMD_S3MCMDEX → 0x0E, eff = 0x80|(param & 0x0F)  [E8x panning]
//   0xC  CMD_S3MCMDEX → 0x0E, eff = 0xD0|(param & 0x0F)  [EDx note delay]
//   0xD  CMD_NONE (fine tempo down — ignored)
//   0xE  CMD_NONE (fine tempo up  — ignored)
//   0xF  CMD_SPEED → 0x0F

// ── 669 effect mapping (effTrans[], Load_669.cpp) ─────────────────────────────
//
// 669 stores effect as high nibble (0–8); low nibble is the 4-bit param.
// Source: static constexpr EffectCommand effTrans[] in Load_669.cpp:197
//
//   0x0  CMD_AUTO_PORTAUP  → fine porta up → 0x0E, eff = 0x10|(param & 0x0F)  [E1x]
//          (adjusted: porta up by param*80Hz; approximated as fine porta in MOD)
//   0x1  CMD_AUTO_PORTADOWN → fine porta down → 0x0E, eff = 0x20|(param & 0x0F) [E2x]
//   0x2  CMD_TONEPORTAMENTO → 0x03
//   0x3  CMD_S3MCMDEX (fine freq add) → fine porta up 0x01, eff = 0xE0|(param & 0x0F)
//   0x4  CMD_VIBRATO in table, but OpenMPT (MODPLUG_TRACKER) overrides to CMD_ARPEGGIO
//          → 0x00 (arpeggio), eff = param | (param << 4)  [repeats nibble in both halves]
//   0x5  CMD_SPEED → 0x0F
//   0x6  CMD_PANNINGSLIDE → dropped (XM-only; no MOD equivalent)
//          [OpenMPT: case 0 → param=0x4F, case 1 → param=0xF4, default → CMD_NONE]
//   0x7  CMD_RETRIG → 0x0E, eff = 0x90|(param & 0x0F)  [E9x]
//   0x8+ → none

// ── MTM effect mapping (Load_mtm.cpp) ─────────────────────────────────────────
//
// MTM uses MOD-compatible effects 0–F directly.  Pass-through with restrictions:
//   - Panning (0x08) not supported in MTM → drop
//   - Extended sub-commands 0x00, 0x30, 0x40, 0x60, 0x70, 0xF0 not supported → drop
// Source: Load_mtm.cpp lines 212–282
//
// When CMD_SPEED is found, OpenMPT also writes CMD_TEMPO (125) on the same row.
// When CMD_TEMPO is found, OpenMPT also writes CMD_SPEED (6) on the same row.

// ── PSM effect mapping (Load_psm.cpp) ─────────────────────────────────────────
//
// PSM uses a large opcode table.  Key speed/tempo commands:
//   0x3D  CMD_SPEED → 0x0F  (param = ticks/row, 1–31)
//   0x3E  CMD_TEMPO → 0x0F  (param = BPM, 32–255)
// Both map to 0x0F (MOD Fxx) — param value distinguishes speed vs BPM.
// Source: Load_psm.cpp lines 797–801

// ── ULT effect mapping (ultEffTrans[], Load_ult.cpp) ──────────────────────────
//
// ULT stores two 4-bit effect nibbles per cell.
// Source: static constexpr EffectCommand ultEffTrans[] in Load_ult.cpp:103
//
//   0x0  CMD_ARPEGGIO  (only in v≥3 and param≠0)
//   0x1  CMD_PORTAMENTOUP
//   0x2  CMD_PORTAMENTODOWN
//   0x3  CMD_TONEPORTAMENTO
//   0x4  CMD_VIBRATO
//   0x5  CMD_NONE (play backwards / key-off — no direct MOD equivalent)
//   0x6  CMD_NONE (undefined)
//   0x7  CMD_TREMOLO  (only in v≥4)
//   0x8  CMD_NONE (undefined)
//   0x9  CMD_OFFSET
//   0xA  CMD_VOLUMESLIDE
//   0xB  CMD_PANNING8 → 0x08, eff = (param & 0x0F) * 0x11
//   0xC  CMD_VOLUME8 → 0x0C, clamp to 64
//   0xD  CMD_PATTERNBREAK  (BCD encoded: hi*10+lo)
//   0xE  Extended sub-commands:
//          E1x = fine porta up    E2x = fine porta down
//          E8x = panning (v≥4)   E9x = retrig
//          EAx = fine vol up      EBx = fine vol down
//          ECx = note cut         EDx = note delay
//   0xF  Speed/BPM — ProTracker threshold: 0x01–0x1F = speed, 0x20–0xFF = BPM
