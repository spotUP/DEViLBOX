/**
 * maWalk.ts - the Music Assembler player's own walk of a module, tick by tick.
 *
 * Every tick the player counts its speed down; on the tick it reaches zero (the first tick, then every
 * `speed` ticks: one row) each voice counts its row delay down and, when that runs out, reads its next
 * event from the track the voice's position list names. A tick that read an event does not update the
 * voice (the next one does). This is ma-wasm/src/ma/music_assembler.c (ma_player_tick,
 * ma_get_next_row_in_track, ma_do_voice: the NostalgicPlayer port of the 68k player) as a pure
 * function over the module's tables (maModule.ts), recording the events the readers run and, for the
 * ticks on which a voice is updated, the period and volume it writes to Paula. The test
 * src/engine/__tests__/musicAssemblerWalkMatchesPlayer.test.ts holds this walk to the original 68k
 * player in UADE, tick for tick, voice by voice.
 *
 * Ticks count from 1; a row is `speed` ticks and row r reads on tick 1 + r * speed.
 */
import { MA_CHANNEL_MAP, MA_PERIODS, type MaModuleData, type MaPosition } from './maModule';

export const MA_WALK = {
  /** A note that restarts the voice: its envelope too (plain note events) or only its sample (instrument events with the keep bit). */
  note: 0,
  /** A plain note event with the keep bit: the pitch changes, nothing restarts. */
  legato: 1,
  /** A release event: the envelope's release begins at once. */
  release: 2,
  /** The first event of a track: the position's transpose and the track it plays. */
  trackStart: 3,
} as const;

export interface MaWalkEvent {
  tick: number;
  voice: number;
  kind: number;
  /** Notes and legato: the note index of the event (6 bits), before the position's transpose. Track start: the track number. */
  a: number;
  /** Notes and legato: the note the player plays, the event's plus the position's transpose (a byte, may be past the table). Track start: the transpose. */
  played: number;
  /** The instrument index the event sets (-1: none); the instrument in force after the event is `instr`. */
  setInstrument: number;
  instr: number;
  /** The position's transpose in force at the event. */
  transpose: number;
  /** Notes and legato: the instrument's wave is a synthesis wave (data of 128 words or less): the wave rate is not added to the note. */
  synth: boolean;
  /** The portamento/vibrato byte of the event (0: none: the instrument's vibrato). */
  pv: number;
  /** Row delay byte of the event (signed). */
  delay: number;
  /** Notes: the envelope restarts (false: an instrument event with the keep bit restarts only the sample). */
  envelope: boolean;
  /** Position index and track the voice was on, and the event's byte offset in the track. */
  position: number;
  track: number;
  trackOffset: number;
  /** Release events: the voice's level when the event ran. */
  level: number;
  /** Notes and legato: the table index the first tick plays (the played note + the wave-rate add), 47 at most. */
  tableIndex: number;
}

export interface MaTickWrite {
  tick: number;
  /** The period written (after arpeggio, portamento and vibrato, at least 127). */
  period: number;
  /** The volume written (0..64). */
  volume: number;
}

export interface MaWalk {
  speed: number;
  /** Rows walked. */
  rows: number;
  /** Ticks walked. */
  ticks: number;
  events: MaWalkEvent[];
  /** Per voice: the ticks the voice was updated on, with what it wrote. */
  writes: MaTickWrite[][];
  loopRow: number;
  loopRows: number;
  stop: 'loop' | 'ended' | 'cap';
  /** Why the player ended (an event past the data): the walk stops there. */
  endReason?: string;
}

export const MA_MAX_ROWS = 32768;

const FLAG_SET_LOOP = 0x02;
const FLAG_SYNTHESIS = 0x04;
const FLAG_PORTAMENTO = 0x20;
const FLAG_RELEASE = 0x40;
const FLAG_RETRIG = 0x80;

const i8 = (v: number): number => (v << 24) >> 24;
const i16 = (v: number): number => (v << 16) >> 16;
const u8 = (v: number): number => v & 0xff;
const u16 = (v: number): number => v & 0xffff;

interface Voice {
  list: MaPosition[];
  pos: number;
  trackRow: number;
  repeat: number;
  delay: number;
  flag: number;
  instr: number;
  note: number;
  transpose: number;
  volume: number;
  sustain: number;
  arpCounter: number;
  arpUse: number;
  pv: number;
  vibDelay: number;
  vibDir: number;
  vibSpeedCounter: number;
  portAdd: number;
  vibAdd: number;
  decrease: boolean;
  /** Stopped on a 0xfe position (the voice no longer reads). */
  halted: boolean;
}

function newVoice(list: MaPosition[], hasInstruments: boolean): Voice {
  return {
    list, pos: 0, trackRow: 0, repeat: list.length > 0 ? list[0].repeatCounter : 0, delay: 0, flag: 0,
    instr: hasInstruments ? 0 : -1, note: 0, transpose: list.length > 0 ? list[0].transpose : 0, volume: 0, sustain: 0,
    arpCounter: 0, arpUse: 0, pv: 0, vibDelay: 0, vibDir: 0, vibSpeedCounter: 0, portAdd: 0, vibAdd: 0, decrease: false, halted: false,
  };
}

export interface MaWalkOptions {
  maxRows?: number;
}

/** The voices' reading state at a row boundary: the walk of the events depends on nothing else. */
function stateKey(vs: Voice[]): string {
  return vs.map((v) => [v.pos, v.trackRow, v.repeat, v.delay, v.transpose, v.instr, v.halted ? 1 : 0].join(',')).join('|');
}

/** Walk sub-song `subsong` (index into the module's usable sub-songs). Null when the module has no such sub-song. */
export function walkMusicAssembler(m: MaModuleData, subsong = 0, opts: MaWalkOptions = {}): MaWalk | null {
  const song = m.subSongs[subsong];
  if (!song) return null;
  const maxRows = opts.maxRows ?? MA_MAX_ROWS;
  const speed = Math.max(1, song.startSpeed);
  const hasInstruments = m.instruments.length > 0;
  const vs: Voice[] = [0, 1, 2, 3].map((i) => newVoice(m.positionLists.get(song.positionListOffsets[MA_CHANNEL_MAP[i]]) ?? [], hasInstruments));
  const events: MaWalkEvent[] = [];
  const writes: MaTickWrite[][] = [[], [], [], []];
  const seen = new Map<string, number>();
  let loopRow = -1;
  let stop: MaWalk['stop'] = 'cap';
  let endReason: string | undefined;
  let rows = 0;
  const masterVolume = 64;
  let speedCounter = 1;
  let ended = false;
  let tick = 0;

  const initializeVoice = (v: Voice): void => {
    v.decrease = false;
    v.arpUse = 0;
    v.volume = 0;
    v.vibDir = 0;
    v.vibSpeedCounter = 0;
    v.vibAdd = 0;
    v.flag = 0;
    const ins = m.instruments[v.instr];
    v.vibDelay = ins.vibratoDelay;
    v.arpCounter = ins.fxArpSpdLp;
    v.sustain = ins.hold;
  };
  const forceRetrigger = (v: Voice): void => { v.flag &= FLAG_RELEASE; v.flag |= FLAG_RETRIG; };

  /** The wave a note plays: whether setup_sample turns on the synthesis flag (a wave of 128 words or less that has data). */
  const setupSample = (v: Voice): void => {
    const ins = m.instruments[v.instr];
    if (ins.sampleNumber >= m.samples.length) return;
    const sample = m.samples[ins.sampleNumber];
    const hasData = sample.dataOffset >= 0;
    const length = hasData ? sample.lengthWords : 1;
    if (v.flag & FLAG_SET_LOOP) {
      v.flag &= ~FLAG_SET_LOOP;
      if (sample.loopLengthWords !== 0) return;
      v.flag &= ~FLAG_SYNTHESIS;
      return;
    }
    if (v.flag & FLAG_RETRIG) {
      v.flag &= FLAG_RELEASE;
      v.flag |= FLAG_SET_LOOP;
      if (length <= 128 && hasData) v.flag |= FLAG_SYNTHESIS;
    }
  };

  const doArpeggio = (v: Voice): number => {
    const ins = m.instruments[v.instr];
    let arp = ins.arpeggio;
    let arpToUse = i8(v.arpUse - 2);
    if (arp !== 0) {
      if (arpToUse === 0) arp >>= 4;
      else if (arpToUse < 0) arp = 0;
      else arp &= 0x0f;
    }
    if (ins.fxArpSpdLp !== 0) {
      v.arpCounter = u8(v.arpCounter + 0x10);
      if (v.arpCounter > ins.fxArpSpdLp) {
        v.arpCounter = 0;
        let spd = ins.fxArpSpdLp & 0x03;
        if (spd === 0) { v.decrease = !v.decrease; spd = 1; }
        arpToUse = i8(arpToUse + 3);
        if (arpToUse >= 4) arpToUse = spd;
        v.arpUse = u8(arpToUse);
      }
    }
    let note = u8(v.note + arp);
    if ((v.flag & FLAG_SYNTHESIS) === 0) note = u8(note + ins.keyWaveRate);
    if (note >= 48) note = 47;
    return MA_PERIODS[note];
  };

  const doPortamento = (period: number, v: Voice): number => {
    if (v.pv !== 0) {
      const flagSet = (v.flag & FLAG_PORTAMENTO) !== 0;
      v.flag ^= FLAG_PORTAMENTO;
      if (!flagSet || (v.pv & 0x01) === 0) {
        period = u16(u16(period << 1) + v.portAdd);
        period >>= 1;
        if (v.pv & 0x80) v.portAdd = i16(v.portAdd + ((-i8(v.pv) + 1) >> 1));
        else v.portAdd = i16(v.portAdd - ((v.pv + 1) >> 1));
      }
    }
    return period;
  };

  const doVibrato = (period: number, v: Voice): number => {
    const ins = m.instruments[v.instr];
    if (v.vibDelay === 0) {
      if (v.pv === 0 && ins.vibratoLevel !== 0) {
        let level = i8(ins.vibratoLevel);
        const direction = v.vibDir & 0x03;
        if (direction !== 0 && direction !== 3) level = -level;
        v.vibAdd = i16(v.vibAdd + level);
        v.vibSpeedCounter = u8(v.vibSpeedCounter + 1);
        if (v.vibSpeedCounter === ins.vibratoSpeed) {
          v.vibSpeedCounter = 0;
          v.vibDir = u8(v.vibDir + 1);
        }
      }
      // the vibrato's accumulated offset is part of the period whether or not it moves this tick (the player keeps it
      // through a legato note and a portamento: ma-wasm added it only while the vibrato ran; UADE's 68k player always)
      period = u16(u16(period << 1) + v.vibAdd);
      period >>= 1;
    } else v.vibDelay = u8(v.vibDelay - 1);
    return period;
  };

  const doAdsr = (v: Voice): void => {
    const ins = m.instruments[v.instr];
    if (v.flag & FLAG_RELEASE) {
      if (v.sustain === 0) v.volume = Math.max(0, v.volume - ins.release);
      else v.sustain = u8(v.sustain - 1);
    } else {
      let newVolume = v.volume + ins.attack;
      const decaySustain = (ins.decaySustain & 0xf0) | 0x0f;
      if (newVolume > decaySustain) {
        v.flag |= FLAG_RELEASE;
        newVolume = ins.decaySustain << 4;
      }
      v.volume = u8(newVolume);
    }
  };

  const doVoice = (ch: number): void => {
    const v = vs[ch];
    if (v.instr < 0) return;
    setupSample(v);
    let period = doArpeggio(v);
    period = doPortamento(period, v);
    period = doVibrato(period, v);
    doAdsr(v);
    let volume = Math.floor((v.volume * masterVolume) / 256);
    if (v.vibDelay === 0 && v.decrease) volume = Math.floor(volume / 4);
    if (period < 127) period = 127;
    writes[ch].push({ tick, period, volume });
  };

  /** ma_get_next_row_in_track: true when no event was read on this tick (the voice is then updated). */
  const nextRow = (ch: number): boolean => {
    const v = vs[ch];
    v.delay = i8(v.delay - 1);
    if (v.delay >= 0) return true;
    if (v.halted) return true;

    if (v.pos >= v.list.length) { ended = true; endReason = `voice ${ch}: position ${v.pos} is past its list`; return true; }
    let info = v.list[v.pos];
    if (info.trackNumber === 0xfe) { v.halted = true; return true; }
    if (info.trackNumber >= m.numberOfTracks) { ended = true; endReason = `voice ${ch}: track ${info.trackNumber} does not exist`; return true; }
    const track = m.tracks[info.trackNumber];
    if (!track) { ended = true; endReason = `voice ${ch}: track ${info.trackNumber} has no data`; return true; }
    const start = v.trackRow;
    let row = start;
    if (row >= track.length) { ended = true; endReason = `voice ${ch}: track ${info.trackNumber} ends without its terminator`; return true; }

    const ev: MaWalkEvent = {
      tick, voice: ch, kind: MA_WALK.note, a: 0, played: 0, setInstrument: -1, instr: v.instr, pv: 0, delay: 0, envelope: true,
      position: v.pos, track: info.trackNumber, trackOffset: start, level: v.volume, tableIndex: 0, transpose: v.transpose, synth: false,
    };
    if (start === 0) {
      events.push({ ...ev, kind: MA_WALK.trackStart, a: info.trackNumber, played: v.transpose });
    }
    let b = track[row++];
    const take = (): number | null => (row < track.length ? track[row++] : null);
    const bail = (): boolean => { ended = true; endReason = `voice ${ch}: an event runs past the end of track ${info.trackNumber}`; return true; };

    const readPv = (byt: number): number | null => {
      if ((byt & 0x80) === 0) { v.pv = 0; return byt; }
      const x = take();
      if (x === null) return null;
      v.pv = x;
      return byt & 0x7f;
    };

    if ((b & 0x80) === 0) {
      // a note event
      const legato = (b & 0x40) !== 0;
      if (!legato) { initializeVoice(v); forceRetrigger(v); }
      v.portAdd = 0;
      v.note = u8((b & 0x3f) + v.transpose);
      ev.kind = legato ? MA_WALK.legato : MA_WALK.note;
      ev.a = b & 0x3f;
      ev.played = v.note;
      const nb = take();
      if (nb === null) return bail();
      const last = readPv(nb);
      if (last === null) return bail();
      b = last;
    } else if ((b & 0x40) === 0) {
      // a release event
      b &= 0x3f;
      v.flag |= FLAG_RELEASE;
      v.sustain = 0;
      ev.kind = MA_WALK.release;
    } else {
      // an instrument and a note
      const index = b & 0x3f;
      if (index < m.instruments.length) { v.instr = index; ev.setInstrument = index; }
      ev.instr = v.instr;
      const nb = take();
      if (nb === null) return bail();
      b = nb;
      if ((b & 0x40) === 0) initializeVoice(v);
      else ev.envelope = false;
      forceRetrigger(v);
      v.portAdd = 0;
      v.note = u8((b & 0x3f) + v.transpose);
      ev.kind = MA_WALK.note;
      ev.a = b & 0x3f;
      ev.played = v.note;
      const nb2 = take();
      if (nb2 === null) return bail();
      const last = readPv(nb2);
      if (last === null) return bail();
      b = last;
    }

    v.delay = i8(b);
    ev.delay = v.delay;
    ev.pv = v.pv;
    ev.level = ev.kind === MA_WALK.release ? ev.level : 0;
    if (ev.kind === MA_WALK.note || ev.kind === MA_WALK.legato) {
      // the table index the first update plays: note + 0 (arpeggio at its start), + the wave rate unless the wave is a synthesis wave
      const ins = m.instruments[v.instr];
      const sample = ins && ins.sampleNumber < m.samples.length ? m.samples[ins.sampleNumber] : null;
      // a retriggered note's first update turns the flag on from its instrument's wave; a legato note keeps the voice's flag
      const synth = ev.kind === MA_WALK.legato ? (v.flag & FLAG_SYNTHESIS) !== 0 : sample !== null && sample.dataOffset >= 0 && sample.lengthWords <= 128;
      ev.synth = synth;
      let idx = v.note;
      if (!synth && ins) idx = u8(idx + ins.keyWaveRate);
      ev.tableIndex = idx >= 48 ? 47 : idx;
    }
    events.push(ev);

    if (row < track.length && track[row] === 0xff) {
      v.repeat = i8(v.repeat - 8);
      if (v.repeat < 0) {
        v.pos++;
        if (v.pos >= v.list.length) v.pos = 0;
        info = v.list[v.pos];
        if (info.trackNumber === 0xff) { v.pos = 0; info = v.list[0]; }
        v.transpose = info.transpose;
        v.repeat = info.repeatCounter;
      }
      row = 0;
    }
    v.trackRow = row;
    return false;
  };

  for (let r = 0; r < maxRows; r++) {
    if (ended) { stop = 'ended'; break; }
    const key = stateKey(vs);
    const was = seen.get(key);
    if (was !== undefined) { loopRow = was; stop = 'loop'; break; }
    seen.set(key, r);
    rows = r + 1;
    for (let t = 0; t < speed; t++) {
      tick++;
      if (t === 0) {
        // speed counter reached zero: every voice reads (or updates)
        speedCounter = speed;
        for (let ch = 0; ch < 4; ch++) if (nextRow(ch)) doVoice(ch);
      } else {
        speedCounter--;
        for (let ch = 0; ch < 4; ch++) doVoice(ch);
      }
      if (ended) break;
    }
  }
  void speedCounter;
  if (ended) stop = 'ended';

  return { speed, rows, ticks: rows * speed, events, writes, loopRow, loopRows: loopRow >= 0 ? rows - loopRow : 0, stop, endReason };
}
