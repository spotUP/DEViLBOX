/**
 * SunTronicPlayer.ts — native song-tick driver for SunTronic V1.3 (Gate 2).
 *
 * Byte-exact port of the LOADED replayer's per-vblank tick handler, GETNEXTNOTE
 * row-decode, and EFFECTS period/volume pipeline. Disassembled from the loaded
 * gliders.src binary (NOT the .s, which diverges) — see
 * thoughts/shared/research/2026-07-14_suntronic-gate2-note-timing.md
 * (UPDATE 2026-07-14b/c).
 *
 * The driver reproduces, per replayer tick, each voice's:
 *   - $20 Paula period, $08 pitch accumulator, $0c voice volume, $14 flags
 * which is exactly the state the oracle reads from UADE.
 *
 * ── TWO-CLOCK MODEL (2026-07-14e): one fire clock + inner CIA accumulator ───────
 * Fire-aligned measurement (tools/suntronic-re/probe-fire-aligned vs UADE-WASM)
 * proved the tick handler (0x2660e) fires UNIFORMLY every 1024 output samples — one
 * fire == one golden sample == one `tick()` call. Inside each fire an inner CIA
 * accumulator (ciaTick ≈ 882 samples, i.e. 1024/882 ≈ 1.16 CIA ticks per fire) steps
 * the note engine: each CIA tick advances the $24 vibrato phase (so per fire vibrato
 * advances 1-2× — the measured "double" fires), and every `speed`-th CIA tick wraps
 * $2c → a row boundary → GETNEXTNOTE. This reproduces the measured song-independent
 * 5-mostly-6 fires/row row cadence with NO hardcoded table (see tick()).
 *
 * ── KNOWN GAP: accumulator floor (14/632 cells, 97.8% exact) ──
 * Each 1024-sample fire runs 1 OR 2 CIA sub-ticks. Best fit ciaTick=881.5, offset −1:
 * gliders 3, ballblaser 11. Root cause is now precisely characterized (2026-07-14,
 * probe-fire-order/subtick-timing/schedule-inject/chunk-accum):
 *   • The golden compares the $20 PERIOD register sampled at note-handler-fire detection
 *     under UADE's CH=128 chunked rendering. At CH=1 (cycle-true) the $24 vibrato phase
 *     advances UNIFORMLY, exactly once per 1024 samples, ZERO doubles. The double-fires
 *     are a UADE CH=128 chunk-quantization artifact, baked into the golden.
 *   • The measured $24 sub-tick double schedule (gliders [6,13,19,25,31,38…]) is NOT the
 *     same as the golden's effective $20-period schedule ([6,12,18,24,30,37…] ≈ what
 *     ciaTick=881.5 emits) — there is a sub-fire phase offset between the $24 phase change
 *     and the $20 period write within a chunk. Injecting the true $24 schedule scores 4
 *     (WORSE than 3), and ciaTick=883.875 (which best reproduces the $24 schedule) makes
 *     the golden worse (63). So 881.5 is genuinely the constant-per-fire optimum for the
 *     $20/golden clock — not a tuning miss.
 *   • Schedule injection (opts.subtickSchedule) proves the note/vibrato/period LOGIC is
 *     correct given a schedule; the residual is purely the sub-fire (128-chunk) timing of
 *     WHICH fire the period register lands on. A per-1024-fire model cannot reproduce it.
 * Closing to 0 needs a SUB-FIRE model: run the CIA accumulator at 128-sample granularity
 * and sample the period exactly as the emitter does (or regenerate the golden at a cleaner
 * chunk size). Not a per-fire tick() tweak. Golden test stays skipped meanwhile.
 *
 * Scope: this is the timing/period/volume-envelope machine. Actual waveform
 * synthesis (MEGAEFFECTS / the CALCn timbre generators) is Gate 1, already
 * ported in SunTronicSynthVoice.ts. Master-volume scaling of the final Paula
 * $15 byte (globals $a8d/$a8e) is Phase-4 audio-only and NOT modelled here —
 * the golden captures pre-scale voice volume $0c.
 *
 * Loaded-disasm addresses (gliders): tick handler 0x2660e, GETNEXTNOTE 0x2692a,
 * EFFECTS 0x267f6, per-voice init 0x2650e. Voice stride 0x1ba.
 */

import type { SunSynthInstrument, SunV13Score } from '@/lib/import/formats/SunTronicV13';

// PERIODS (`lea $11ae(a6),a2` @0x26838, guardless — index 0 = note 0 = period
// 0x3e) is a byte-identical replayer constant, relocation-safe located in
// parseSunTronicV13Score (signature search); the player consumes score.periodsOff.
// drin (`lea $2828b(pc),a3` @0x2683c) is NOT a file constant — it is a runtime BSS
// table the eagleplayer fills at init from each module's arp/vibrato data (row 0,
// the non-arp row, is all zeros), so it is zero-filled here (see the ctor note).

/** A voice's runtime state — field names mirror the loaded voice-struct offsets. */
interface SunPlayerVoice {
  channel: number;      // 0..3
  cursor: number;       // $0  — hunk#1 index of the note-stream read pointer
  instr: SunSynthInstrument | null; // $4  — current instrument record
  pitch: number;        // $8  — u16 accumulator, hi byte = note index
  pitchSlide: number;   // $a  — s16 slide added to pitch each tick
  volume: number;       // $c  — voice volume 0..0x40
  volumeSlide: number;  // $d  — s8 slide, gated by $33 counter
  arpSel: number;       // $e  — arp/interp selector (drin row *16)
  arpPhase: number;     // $f  — arp phase 0..15
  volEnvIndex: number;  // $10 — volume-envelope index
  flags: number;        // $14 — 0x01 active / 0xff inactive / 0xfe DMA-off
  outVolume: number;    // $15 — final Paula volume (pre master-scale here)
  period: number;       // $20 — Paula period word
  stagedSel: number;    // $22 — staged note/instrument-select byte (GNN scratch)
  transpose: number;    // $23 — per-channel transpose (s8, from seq entry)
  vibPhase: number;     // $24 — s16 vibrato phase accumulator
  vibIndex: number;     // $26 — vibrato-depth table index
  envReload: number;    // $32 — vol-slide counter reload
  envCounter: number;   // $33 — vol-slide countdown
  tie: number;          // $34 — tie/portamento countdown (suppresses re-triggers)
  synthFlag: number;    // $37 — 1 → EFFECTS skips vol+period
  tempoTick: number;    // $2c — ticks-within-note counter (audio ticks; debug only now)
  tempoNote: number;    // $2d — notes-within-position counter
  position: number;     // $2e — sequence position index
  speed: number;        // $30 — ticks per note (module ticks)
  rowsPerPos: number;   // $31 — notes per position
  rowSampleAcc: number; // two-clock reconciler: audio-samples accrued in the current row
}

/** One snapshot row of the tick timeline (what the p9a golden compares). */
export interface SunPlayerTick {
  /** per-voice [period($20), acc($08), volume($0c), flags($14)]. */
  voices: Array<{ period: number; acc: number; volume: number; flags: number }>;
}

const s8 = (b: number): number => (b << 24) >> 24;
const s16 = (w: number): number => (w << 16) >> 16;
const u8 = (b: number): number => b & 0xff;

export interface SunPlayerOptions {
  /** subsong index (default 0). */
  subsong?: number;
  /** audio-buffer tick period in samples (UADE EFFECTS/period fires once per this;
   *  measured 1024, uniform 39/39 both songs — probe-tick-rate). */
  audioTickSamples?: number;
  /** inner CIA tick period in samples. Each fire (audioTickSamples) accrues
   *  audioTickSamples into a CIA accumulator; every ciaTickSamples crossed = one CIA
   *  tick (vibrato advance), and every `speed` CIA ticks = one row (GETNEXTNOTE). PAL
   *  ≈ 882 (best golden fit 881.5). Exposed so the clock ratio is validated against
   *  the UADE golden, not hardcoded as a 5,5,5,6 table. */
  ciaTickSamples?: number;
  /** start-of-song seed of the CIA accumulator, in samples (0..ciaTickSamples). Places
   *  the double-vib / row phase; the golden-optimal value is small (0). Exposed for the
   *  clock-ratio sweep — see tools/suntronic-re/probe-cia-sweep. */
  rowPhaseSamples?: number;
  /** DIAGNOSTIC ONLY (not for production): force the CIA sub-tick count per fire from a
   *  measured schedule (subticks[tickIndex]) instead of the ciaTick accumulator. Used by
   *  tools/suntronic-re/probe-schedule-inject to separate "is the player logic correct
   *  given the exact schedule?" from "can a constant clock generate the schedule?".
   *  When set, ciaTickSamples/rowPhaseSamples are ignored. */
  subtickSchedule?: number[];
}

/**
 * The native SunTronic V1.3 song player. Construct from a parsed score, then
 * call `tick()` repeatedly (each call = one PAL vblank) or `renderTimeline(n)`.
 */
export class SunTronicPlayer {
  private readonly h1: Uint8Array;
  private readonly periods: Int16Array; // guardless period LUT (word signed→unsigned read)
  private readonly periodsOff: number;
  private readonly drin: Int8Array;
  private readonly synthTableOff: number;
  private readonly synthRecordSize = 0x24;
  private readonly voices: SunPlayerVoice[] = [];
  private readonly sequence: { trackPtrs: number[]; transposes: number[] }[];
  private readonly seqEndKind: 'restart' | 'stop';
  private readonly audioTick: number;
  private readonly ciaTick: number;
  private readonly rowPhase: number;
  private readonly subtickSchedule: number[] | null;
  private tickIndex = 0;

  constructor(score: SunV13Score, opts: SunPlayerOptions = {}) {
    this.audioTick = opts.audioTickSamples ?? 1024;
    // 881.5 / phase 0 is the measured golden-optimal of the constant-rate model
    // (probe-cia-sweep, offset −1: 14/632 residual). ~882 = PAL 50 Hz.
    this.ciaTick = opts.ciaTickSamples ?? 881.5;
    this.rowPhase = opts.rowPhaseSamples ?? 0;
    this.subtickSchedule = opts.subtickSchedule ?? null;
    this.h1 = score.h1;
    this.synthTableOff = score.synthTableOff;
    const sub = score.subsongs[opts.subsong ?? 0];
    if (!sub) throw new Error('SunTronicPlayer: subsong out of range');
    this.sequence = sub.entries.map((e) => ({
      trackPtrs: [...e.trackPtrs],
      transposes: [...e.transposes],
    }));
    this.seqEndKind = sub.endKind;

    // ── PERIODS: signature-located in the parser (a byte-identical replayer-constant
    //    320-word ramp, reloc-independent — see SunTronicV13). ──
    this.periodsOff = score.periodsOff;
    // drin (note-transpose table, indexed d5=(arpSel<<4)+phase): NOT a file
    // constant. It lives in a runtime BSS hunk the eagleplayer allocates + fills at
    // init from each module's arp/vibrato definitions (gliders' drin sits at abs
    // 0x2828b = file offset 0x8003, ~0x59a7 bytes PAST the 0x265c-byte module image).
    // Row 0 (d5 0..15, no arp) is all zeros, so non-arp voices need no transpose and
    // are byte-exact with a zero table. Per-module arp/vibrato drin generation is the
    // remaining Gate-2 port step (modules like darkness/energy that drive nonzero d5
    // are not yet byte-exact). Zero base = the correct row-0 semantics meanwhile.
    this.drin = new Int8Array(256); // zero-filled; arp rows unported (see above)
    this.periods = new Int16Array(320);
    for (let i = 0; i < 320; i++) {
      const o = this.periodsOff + i * 2;
      this.periods[i] = ((this.h1[o] ?? 0) << 8) | (this.h1[o + 1] ?? 0);
    }

    // ── per-voice init (loaded 0x2650e) ──
    for (let ch = 0; ch < 4; ch++) {
      const entry = this.sequence[0];
      this.voices.push({
        channel: ch,
        cursor: entry ? entry.trackPtrs[ch] : 0,
        instr: null,
        pitch: 0, pitchSlide: 0, volume: 0x40, volumeSlide: 0,
        arpSel: 0, arpPhase: 0, volEnvIndex: 0,
        flags: 0xff, outVolume: 0, period: 0,
        stagedSel: 0, transpose: entry ? s8(entry.transposes[ch]) : 0,
        vibPhase: 0, vibIndex: 0, envReload: 0, envCounter: 0, tie: 0, synthFlag: 0,
        tempoTick: 5, tempoNote: 0, position: 0, speed: 6, rowsPerPos: 0x10,
        rowSampleAcc: this.rowPhase,
      });
    }
  }

  /** Read a period-table word (unsigned) at note index `n`, clamped. */
  private periodAt(n: number): number {
    const i = n < 0 ? 0 : n >= this.periods.length ? this.periods.length - 1 : n;
    return this.periods[i] & 0xffff;
  }

  /** Resolve the instrument record a note-select byte points at (GNN 0x269a8). */
  private selectInstrument(sel: number): SunSynthInstrument | null {
    // bit6 set → type-A synth table (stride 0x24, index = sel & ~0x40).
    // bit6 clear → type-B sampled table (stride 0x1c, index = sel - 1).
    // Only the type-A (synth) path is modelled; a type-B select yields null,
    // which EFFECTS treats as an inert record (period/vol frozen).
    if ((sel & 0x40) !== 0) {
      const idx = sel & 0xbf;
      const rec = this.synthTableOff + idx * this.synthRecordSize;
      return decodeSynthAt(this.h1, rec);
    }
    return null;
  }

  /** GETNEXTNOTE (loaded 0x2692a): decode one note's opcode group from cursor.
   * Returns true if this group retriggered an instrument (noteOn → clr $24/$26).
   * A GNN tick that does NOT retrigger is a *continuation* note-row: EFFECTS then
   * runs the double vibrato advance (see tick()). */
  private getNextNote(v: SunPlayerVoice): boolean {
    const h1 = this.h1;
    let a1 = v.cursor;
    let didReset = false;
    // guard against runaway loops on malformed streams
    for (let guard = 0; guard < 4096; guard++) {
      const d0 = h1[a1++] ?? 0;
      if (d0 === 0x00) { v.cursor = a1; return didReset; } // end of note group — store cursor
      if (d0 < 0x80) { v.stagedSel = d0; continue; } // positive → stage select byte
      if (d0 >= 0xb8) {
        // PITCH (0x2697c): $8 = (~d0 - transpose)<<8, clear finetune + slide
        if (v.tie !== 0) continue;
        const note = u8(~d0 - v.transpose);
        v.pitch = (note << 8) & 0xffff;
        v.pitchSlide = 0;
        // optional trailing instrument-select byte (0x01..0x7f)
        const nxt = h1[a1] ?? 0;
        if (nxt >= 0x01 && nxt <= 0x7f) { v.stagedSel = nxt; a1++; }
        const sel = v.stagedSel;
        if (sel === 0) continue;
        v.synthFlag = 0;
        this.noteOn(v, sel);
        didReset = true;
        continue;
      }
      // control opcode 0x80..0xb7 → dispatch (a1 already past opcode byte)
      a1 = this.controlOpcode(v, d0, a1);
    }
    v.cursor = a1;
    return didReset;
  }

  /** Instrument retrigger (GNN type-A 0x269ae / type-B 0x26a16). */
  private noteOn(v: SunPlayerVoice, sel: number): void {
    const inst = this.selectInstrument(sel);
    v.instr = inst;
    v.arpSel = 0; v.arpPhase = 0; v.volEnvIndex = 0;
    // Type-A note-on clears the vibrato accumulator + depth index (disasm
    // 0x269ae: clr.w $24; clr.w $26). EFFECTS then computes the note-on-tick
    // period with $24=0 and advances afterwards (compute-then-advance).
    v.vibPhase = 0;
    v.vibIndex = 0;
    if ((sel & 0x40) !== 0) {
      v.flags = 0x01;   // type-A: active
    } else {
      v.flags = 0x00;   // type-B: loaded clears $14 (see disasm 0x26a38)
    }
  }

  /** Control-opcode handlers (loaded 0x26a62..0x26bdc). Returns advanced cursor. */
  private controlOpcode(v: SunPlayerVoice, op: number, a1: number): number {
    const h1 = this.h1;
    const rd = (): number => h1[a1++] ?? 0;
    switch (op) {
      case 0x9c: // -0x64: arp selector $e, clr $f
        if (v.tie !== 0) { a1 += 1; break; }
        v.arpSel = rd(); v.arpPhase = 0; break;
      case 0x9b: // -0x65: pitch slide $a (word)
        if (v.tie !== 0) { a1 += 2; break; }
        v.pitchSlide = s16((rd() << 8) | rd()); break;
      case 0x9a: // -0x66: vol slide $d + reload $32
        v.volumeSlide = s8(rd()); v.envReload = rd(); break;
      case 0x99: // -0x67: volume $c, clr $d
        v.volume = rd(); v.volumeSlide = 0; break;
      case 0x98: // -0x68: global speed $30 (all voices)
        { const s = rd(); for (const w of this.voices) w.speed = s; } break;
      case 0x97: // -0x69: PRNG seed word (no golden effect)
        a1 += 2; break;
      case 0x96: // -0x6a: restart vol env → clr $10
        if (v.tie !== 0) break; v.volEnvIndex = 0; break;
      case 0x95: // -0x6b: restart freq env → clr $12 (unused in golden)
        break;
      case 0x94: // -0x6c: set pitch, no retrigger
        if (v.tie !== 0) { a1 += 1; break; }
        { const note = u8(~rd() - v.transpose); v.pitch = (note << 8) & 0xffff; v.pitchSlide = 0; } break;
      case 0x93: // -0x6d: global fade speed+reload (master vol, no golden effect)
        a1 += 2; break;
      case 0x92: // -0x6e: master vol (no golden effect)
        a1 += 1; break;
      case 0x91: // -0x6f: per-voice DMA/mute flags (no golden effect on $20/$c)
        a1 += 1; break;
      case 0x90: // -0x70: finetune → $9 (low byte of pitch acc)
        if (v.tie !== 0) { a1 += 1; break; }
        v.pitch = (v.pitch & 0xff00) | rd(); break;
      case 0x8f: // -0x71: speed $30 this voice
        v.speed = rd(); break;
      case 0x8e: // -0x72: CIA tempo word (no per-tick golden effect)
        a1 += 2; break;
      case 0x8d: // -0x73: tempo slide word (no per-tick golden effect)
        a1 += 2; break;
      case 0x8c: // -0x74: global rows/position $31 (all voices)
        { const r = rd(); for (const w of this.voices) w.rowsPerPos = r; } break;
      case 0x8b: // -0x75: rows/position $31 this voice
        v.rowsPerPos = rd(); break;
      default:
        break;
    }
    return a1;
  }

  /** Advance the vibrato accumulator + depth index one step (0x2690c-0x26910:
   * `move.w $10(a1),d0; add.w d0,$24(a0)` + depth index wrap len→loop). */
  private advanceVib(v: SunPlayerVoice, inst: SunSynthInstrument): void {
    v.vibPhase = s16((v.vibPhase + inst.freqEnvSpeed) & 0xffff);
    v.vibIndex = (v.vibIndex + 1) & 0xffff;
    if (v.vibIndex === inst.freqEnvLen) v.vibIndex = inst.freqEnvLoop;
  }

  /** EFFECTS (loaded 0x267f6): compute period+volume, advance envelope state.
   * vibAdvances: the number of CIA note-ticks that elapsed during this audio
   * buffer — vibrato ($24) is stepped on the CIA clock (once per module tick),
   * NOT the audio clock, so per audio buffer it advances 1-2× (1024/882 ≈ 1.16).
   * The period is computed BEFORE the advances (compute-then-advance: at a note-on
   * tick $24 was just cleared, so the note's period is the un-vibratoed value and
   * the trailing advances carry $24 forward for the next buffer). */
  private stepEffects(v: SunPlayerVoice, vibAdvances = 1): void {
    if ((v.flags & 0x80) !== 0) return;       // $14 < 0 (0xff/0xfe) → inert
    const inst = v.instr;
    if (v.synthFlag === 1 || !inst) {
      // $37==1 → skip vol+period; still nothing to advance without an instrument
      if (!inst) return;
    }

    // ── volume $15 (pre master-scale; golden reads $0c not $15) ──
    const env = u8(inst.volEnv[v.volEnvIndex] ?? 0);
    v.outVolume = u8((env * (v.volume & 0xff)) >> 6);

    // ── period $20 ──
    const d5 = ((v.arpSel & 0xff) << 4) + (v.arpPhase & 0x0f);
    let d0 = v.pitch & 0xffff;
    const vibDepth = s8(inst.vibDepth[v.vibIndex] ?? 0);
    let d3 = v.vibPhase < 0 ? -s16(v.vibPhase) : s16(v.vibPhase);
    d3 = s16((d3 - 0x4000) & 0xffff);
    d3 = (Math.imul(d3, vibDepth) << 4) >> 16; // muls.w; lsl.l#4; swap (>>16)
    d0 = (d0 + d3) & 0xffff;
    let note = u8((d0 >> 8) - s8(this.drin[d5] ?? 0));
    let period = this.periodAt(note);
    const frac = d0 & 0xff;
    if (frac !== 0) {
      const next = this.periodAt(note + 1);
      period = (period + ((((next - period) & 0xffff) * frac) >> 8)) & 0xffff;
    }
    v.period = period;

    // ── advance pitch (freq slide, wrap [0,0x4800)) ──
    let np = s16((v.pitch + v.pitchSlide) & 0xffff);
    if (np < 0) np = (np + 0x4800) & 0xffff;
    else if (np >= 0x4800) np -= 0x4800;
    v.pitch = np & 0xffff;

    // ── advance volume (gated by $33 counter, clamp [0,0x40]) ──
    if (v.volumeSlide !== 0) {
      v.envCounter = (v.envCounter - 1) & 0xff;
      if (s8(v.envCounter) < 0) {
        v.envCounter = v.envReload & 0xff;
        let c = u8(v.volume + v.volumeSlide);
        if (s8(c) < 0) { v.volumeSlide = 0; c = 0; }
        if (c >= 0x41) { v.volumeSlide = 0; c = 0x40; }
        v.volume = c;
      }
    }

    // ── advance arp phase / vol-env index (wrap len→loop) ──
    v.arpPhase = (v.arpPhase + 1) & 0x0f;
    v.volEnvIndex = (v.volEnvIndex + 1) & 0xffff;
    if (v.volEnvIndex === inst.volEnvLen) v.volEnvIndex = inst.volEnvLoop;

    // ── advance vibrato phase / depth index on the CIA clock (1-2× per audio
    //    buffer; see vibAdvances) ──
    for (let k = 0; k < vibAdvances; k++) this.advanceVib(v, inst);
  }

  /** Advance the sequence position for one voice (tick handler row branch). */
  private loadPosition(v: SunPlayerVoice): void {
    const entry = this.sequence[v.position];
    if (!entry) { // past end
      if (this.seqEndKind === 'restart') { v.position = 0; }
      return;
    }
    const first = entry.trackPtrs[0] >>> 0;
    if (first === 0) { v.position = 0; return; }            // entry[0]==0 → restart
    if ((first & 0x80000000) !== 0) { v.flags = 0xfe; return; } // <0 → note-off
    v.transpose = s8(entry.transposes[v.channel]);
    v.cursor = entry.trackPtrs[v.channel];
  }

  /** One PAL-vblank replayer tick: advance tempo/GNN/EFFECTS for all 4 voices. */
  tick(): SunPlayerTick {
    for (const v of this.voices) {
      if (v.flags === 0xfe) continue; // DMA-off/idle
      if (v.tie !== 0) v.tie -= 1;
      // ── two-clock model ──────────────────────────────────────────────────────
      // UADE runs SunTronic on two independent interrupt clocks: EFFECTS/period is
      // recomputed once per audio buffer (audioTick samples), while the note engine —
      // the $2c tempo counter, GETNEXTNOTE, and the $24 vibrato phase — runs on the
      // CIA timer (ciaTick samples, PAL ≈ 882). Per audio buffer, floor((phase+1024)/
      // ciaTick) = 1-2 CIA ticks elapse (1024/882 ≈ 1.16); each is a vibrato advance,
      // and every `speed`-th one wraps $2c → a row boundary → GETNEXTNOTE. This
      // reproduces the measured 5-mostly-6 audio-ticks/row cadence with NO hardcoded
      // table — the ratio is the ciaTick:audioTick clock ratio, validated vs golden.
      let runGNN = false;
      let moduleTicks = 0;
      // DIAGNOSTIC: force the sub-tick count from a measured schedule if injected;
      // otherwise the ciaTick accumulator generates it.
      const forced = this.subtickSchedule ? (this.subtickSchedule[this.tickIndex] ?? 0) : -1;
      v.rowSampleAcc += this.audioTick;
      while (forced >= 0 ? moduleTicks < forced : v.rowSampleAcc >= this.ciaTick) {
        if (forced < 0) v.rowSampleAcc -= this.ciaTick;
        moduleTicks++;
        v.tempoTick = u8(v.tempoTick + 1);
        if (v.tempoTick >= (v.speed & 0xff)) {
          v.tempoTick = 0;
          v.tempoNote = u8(v.tempoNote + 1);
          if (v.tempoNote >= (v.rowsPerPos & 0xff)) {
            v.tempoNote = 0;
            v.position += 1;
            this.loadPosition(v);
            if (v.flags === 0xfe) break;
          }
          runGNN = true;
        }
      }
      if (v.flags === 0xfe) continue;
      if (runGNN) this.getNextNote(v);
      // vibrato steps once per CIA tick that elapsed this buffer (compute-then-advance).
      this.stepEffects(v, moduleTicks);
    }
    this.tickIndex++;
    return {
      voices: this.voices.map((v) => ({
        period: v.period, acc: v.pitch & 0xffff, volume: v.volume & 0xff, flags: v.flags & 0xff,
      })),
    };
  }

  /** Debug: internal envelope + tempo state of one voice. */
  debugVoice(i: number): { vibPhase: number; vibIndex: number; tempoTick: number; tempoNote: number; speed: number; rowsPerPos: number; position: number } {
    const v = this.voices[i];
    return {
      vibPhase: v.vibPhase & 0xffff, vibIndex: v.vibIndex & 0xffff,
      tempoTick: v.tempoTick, tempoNote: v.tempoNote,
      speed: v.speed & 0xff, rowsPerPos: v.rowsPerPos & 0xff, position: v.position,
    };
  }

  /** Render `n` ticks into a timeline array (what the golden JSON stores). */
  renderTimeline(n: number): SunPlayerTick[] {
    const out: SunPlayerTick[] = [];
    for (let i = 0; i < n; i++) out.push(this.tick());
    return out;
  }
}

/**
 * Decode a 0x24-byte synth record at `rec` into the EFFECTS-relevant fields.
 * Kept local (mirrors decodeSunSynthInstrument in the parser) so the player has
 * no lib→engine coupling beyond the type import.
 */
function decodeSynthAt(h1: Uint8Array, rec: number): SunSynthInstrument | null {
  if (rec < 0 || rec + 0x24 > h1.length) return null;
  const u16 = (o: number): number => ((h1[o] ?? 0) << 8) | (h1[o + 1] ?? 0);
  const u32 = (o: number): number => (((h1[o] ?? 0) << 24) | ((h1[o + 1] ?? 0) << 16) | ((h1[o + 2] ?? 0) << 8) | (h1[o + 3] ?? 0)) >>> 0;
  const sliceI8 = (off: number, len: number): Int8Array => {
    if (off <= 0 || len <= 0 || off >= h1.length) return new Int8Array(0);
    const end = Math.min(off + len, h1.length);
    return new Int8Array(h1.buffer.slice(h1.byteOffset + off, h1.byteOffset + end));
  };
  const volEnvLen = u16(rec + 0x04);
  const freqEnvLen = u16(rec + 0x0c);
  return {
    recordOff: rec,
    volEnvOff: u32(rec + 0x00), volEnvLen, volEnvLoop: u16(rec + 0x06),
    freqEnvOff: u32(rec + 0x08), freqEnvLen, freqEnvLoop: u16(rec + 0x0e),
    freqEnvSpeed: u16(rec + 0x10),
    arpTableOff: u32(rec + 0x12), arpLen: u16(rec + 0x16), arpLoop: u16(rec + 0x18),
    wave1Off: u32(rec + 0x1a), wave2Off: u32(rec + 0x1e),
    waveWordLen: h1[rec + 0x22] ?? 0, synthType: h1[rec + 0x23] ?? 0,
    wave1: new Int8Array(0), wave2: new Int8Array(0), arpTable: new Int8Array(0),
    volEnv: sliceI8(u32(rec + 0x00), volEnvLen + 1),
    vibDepth: sliceI8(u32(rec + 0x08), freqEnvLen + 1),
  };
}
