/**
 * SF2Engine.ts
 *
 * Live-editing engine for SID Factory II songs.
 * Wraps C64SIDEngine (via websid backend) and provides:
 *   - Memory-mapped edits: translate sequence/instrument/order changes
 *     to direct C64 RAM writes so the driver plays them immediately
 *   - Flight recorder: capture SID registers ($D400-$D418) each frame
 *   - Sequence packing: convert SF2SeqEvent[] ↔ packed C64 memory format
 *
 * Architecture:
 *   Store edit → SF2Engine.writeXxx() → C64SIDEngine.writeRAM(addr, val)
 *   → websid WASM patches C64 memory → driver reads new data next frame
 *   → SID chip plays the change immediately
 */

import { C64SIDEngine, createC64SIDEngine } from '../C64SIDEngine';
import type {
  SF2MusicData,
  SF2DriverCommon,
  SF2Descriptor,
  SF2TableDef,
  SF2SeqEvent,
  SF2OrderEntry,
} from '@stores/useSF2Store';

// ── SID register snapshot (25 bytes per frame) ─────────────────────────

export interface SIDRegisterFrame {
  tick: number;
  regs: Uint8Array; // 25 bytes: $D400-$D418
}

// ── Flight Recorder ────────────────────────────────────────────────────

const FLIGHT_RECORDER_SIZE = 2048; // frames (~40 seconds at 50Hz PAL)

export class SF2FlightRecorder {
  private frames: SIDRegisterFrame[] = [];
  private tick = 0;

  /** Capture current SID register state */
  capture(engine: C64SIDEngine): void {
    const regs = engine.readRAMBlock(0xD400, 25);
    if (!regs) return;
    this.frames.push({ tick: this.tick++, regs: new Uint8Array(regs) });
    if (this.frames.length > FLIGHT_RECORDER_SIZE) {
      this.frames.shift();
    }
  }

  /** Get last N frames */
  getFrames(count?: number): SIDRegisterFrame[] {
    if (!count) return [...this.frames];
    return this.frames.slice(-count);
  }

  /** Get latest frame */
  getLatest(): SIDRegisterFrame | null {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1] : null;
  }

  /** Clear all captured frames */
  clear(): void {
    this.frames = [];
    this.tick = 0;
  }

  get length(): number { return this.frames.length; }
}

// ── Sequence Packer ────────────────────────────────────────────────────

/**
 * Pack expanded SF2SeqEvent[] back into the compact C64 memory format.
 * Format per event: [command >= 0xC0?] [instrument >= 0xA0?] [duration >= 0x80?] <note 0x00-0x7F>
 * Terminated by 0x7F.
 */
export function packSequence(events: SF2SeqEvent[]): Uint8Array {
  const bytes: number[] = [];
  let i = 0;

  while (i < events.length) {
    const ev = events[i];

    // Count hold/rest rows following this event to determine duration
    let duration = 0;
    let j = i + 1;
    while (j < events.length && events[j].note === 0 && events[j].instrument === 0 && events[j].command === 0) {
      duration++;
      j++;
    }
    duration = Math.min(duration, 15); // 4 bits max

    // Command byte (1-based → 0xC0 + (cmd-1))
    if (ev.command > 0) {
      bytes.push(0xC0 + (ev.command - 1));
    }

    // Instrument byte (1-based → 0xA0 + (inst-1))
    if (ev.instrument > 0) {
      bytes.push(0xA0 + (ev.instrument - 1));
    }

    // Duration byte (if > 0)
    if (duration > 0) {
      bytes.push(0x80 | duration);
    }

    // Note byte (always present)
    bytes.push(ev.note & 0x7F);

    i = i + 1 + duration;
  }

  // End-of-sequence marker
  bytes.push(0x7F);

  return new Uint8Array(bytes);
}

/**
 * Unpack a sequence from C64 memory into SF2SeqEvent[].
 * Mirrors the parser's readSequence but works on live C64 RAM.
 */
export function unpackSequence(mem: Uint8Array | ((addr: number) => number), startAddr: number): SF2SeqEvent[] {
  const read = typeof mem === 'function' ? mem : (addr: number) => mem[addr];
  const events: SF2SeqEvent[] = [];
  let i = startAddr;

  while (i < 0x10000 && events.length < 1024) {
    let value = read(i++);
    if (value === 0x7F) break;

    let eventCmd = 0;
    let eventInst = 0;

    // Command byte (>= 0xC0)
    if (value >= 0xC0) {
      eventCmd = (value & 0x3F) + 1;
      value = read(i++);
      if (value === 0x7F) break;
    }

    // Instrument byte (>= 0xA0, < 0xC0)
    if (value >= 0xA0 && value < 0xC0) {
      eventInst = (value & 0x1F) + 1;
      value = read(i++);
      if (value === 0x7F) break;
    }

    // Duration byte (>= 0x80, < 0xA0)
    let duration = 0;
    if (value >= 0x80 && value < 0xA0) {
      duration = value & 0x0F;
      value = read(i++);
      if (value === 0x7F) break;
    }

    const note = value;
    events.push({
      note: note === 0x7E ? 0 : note,
      instrument: eventInst,
      command: eventCmd,
    });

    // Fill duration extra rows with hold/rest
    for (let d = 0; d < duration; d++) {
      events.push({ note: 0, instrument: 0, command: 0 });
    }
  }

  return events;
}

// ── SF2 Engine ─────────────────────────────────────────────────────────

export class SF2Engine {
  private sidEngine: C64SIDEngine;
  private descriptor: SF2Descriptor | null = null;
  private driverCommonData: SF2DriverCommon | null = null;
  private musicData: SF2MusicData | null = null;
  private tableDefs: SF2TableDef[] = [];
  private loadAddr = 0;
  private initialized = false;
  readonly flightRecorder = new SF2FlightRecorder();

  // rAF-based flight recorder capture
  private captureRAFId = 0;
  private capturing = false;

  constructor(sidData: Uint8Array) {
    this.sidEngine = createC64SIDEngine(sidData);
  }

  /** Configure the driver memory layout (call after parsing) */
  setDriverInfo(opts: {
    descriptor: SF2Descriptor;
    driverCommon: SF2DriverCommon;
    musicData: SF2MusicData;
    tableDefs: SF2TableDef[];
    loadAddress: number;
  }): void {
    this.descriptor = opts.descriptor;
    this.driverCommonData = opts.driverCommon;
    this.musicData = opts.musicData;
    this.tableDefs = opts.tableDefs;
    this.loadAddr = opts.loadAddress;
  }

  /** Initialize the underlying SID engine */
  async init(audioContext: AudioContext, destination?: AudioNode): Promise<void> {
    await this.sidEngine.init(audioContext, destination);
    this.initialized = true;

    // Verify websid memory access
    if (!this.sidEngine.hasWriteAccess()) {
      console.warn('[SF2Engine] Backend does not support memory writes — live editing disabled');
    }
  }

  /** Start playback */
  async play(): Promise<void> {
    if (!this.initialized) throw new Error('SF2Engine not initialized');
    await this.sidEngine.play();
    this.startCapture();
  }

  /** Stop playback */
  stop(): void {
    this.stopCapture();
    this.sidEngine.stop();
  }

  /** Pause */
  pause(): void {
    this.sidEngine.pause();
  }

  /** Resume */
  resume(): void {
    this.sidEngine.resume();
  }

  /** Check if playing */
  isPlaying(): boolean {
    return this.sidEngine.isPlaying();
  }

  // ── C64 Memory Access ──────────────────────────────────────────────────

  /** Read a byte from emulated C64 RAM */
  readRAM(address: number): number | null {
    return this.sidEngine.readRAM(address);
  }

  /** Write a byte to emulated C64 RAM (live patching) */
  writeRAM(address: number, value: number): boolean {
    return this.sidEngine.writeRAM(address, value);
  }

  /** Read a block of bytes */
  readRAMBlock(address: number, length: number): Uint8Array | null {
    return this.sidEngine.readRAMBlock(address, length);
  }

  /** Write a block of bytes */
  writeRAMBlock(address: number, data: Uint8Array): boolean {
    return this.sidEngine.writeRAMBlock(address, data);
  }

  /** Check if live editing is available */
  get canEdit(): boolean {
    return this.initialized && this.sidEngine.hasWriteAccess();
  }

  // ── High-Level Edit Operations ─────────────────────────────────────────

  /**
   * Write an instrument byte to C64 RAM.
   * Looks up the instrument table address from tableDefs.
   */
  writeInstrumentByte(instIdx: number, byteOffset: number, value: number): boolean {
    const instTable = this.tableDefs.find(t => t.type === 0x80);
    if (!instTable || !this.canEdit) return false;

    // Instrument table is column-major: each column is contiguous in memory
    // addr + (column * rowCount) + instIdx
    const addr = instTable.address + (byteOffset * instTable.rowCount) + instIdx;
    return this.writeRAM(addr, value);
  }

  /**
   * Write a command table byte to C64 RAM.
   */
  writeCommandByte(cmdIdx: number, byteOffset: number, value: number): boolean {
    const cmdTable = this.tableDefs.find(t => t.type === 0x81);
    if (!cmdTable || !this.canEdit) return false;

    const addr = cmdTable.address + (byteOffset * cmdTable.rowCount) + cmdIdx;
    return this.writeRAM(addr, value);
  }

  /**
   * Write to a generic driver table.
   */
  writeTableByte(tableId: number, row: number, col: number, value: number): boolean {
    const table = this.tableDefs.find(t => t.id === tableId);
    if (!table || !this.canEdit) return false;

    // Column-major layout (default for SF2 driver tables)
    const addr = table.address + (col * table.rowCount) + row;
    return this.writeRAM(addr, value);
  }

  /**
   * Write a packed sequence to C64 RAM.
   * The sequence is packed from events and written starting at the sequence's
   * memory address (looked up from sequence pointer tables).
   *
   * IMPORTANT: The packed size must not exceed the original allocation.
   * If it does, this returns false (no write).
   */
  writeSequence(seqIdx: number, events: SF2SeqEvent[]): boolean {
    if (!this.musicData || !this.canEdit) return false;

    // Get sequence address from pointer tables
    const loAddr = this.musicData.sequencePtrsLo + seqIdx;
    const hiAddr = this.musicData.sequencePtrsHi + seqIdx;
    const lo = this.readRAM(loAddr);
    const hi = this.readRAM(hiAddr);
    if (lo === null || hi === null) return false;
    const seqAddr = lo | (hi << 8);
    if (seqAddr === 0) return false;

    // Calculate max available space (distance to next sequence or end)
    const maxSize = this.getSequenceMaxSize(seqIdx);
    const packed = packSequence(events);
    if (packed.length > maxSize) {
      console.warn(`[SF2Engine] Packed sequence ${seqIdx} (${packed.length}B) exceeds available space (${maxSize}B)`);
      return false;
    }

    return this.writeRAMBlock(seqAddr, packed);
  }

  /**
   * Write an order list entry (sequence index + transposition).
   */
  writeOrderEntry(track: number, pos: number, entry: SF2OrderEntry): boolean {
    if (!this.musicData || !this.canEdit) return false;

    // Order list base addresses per track
    const olPtrLo = this.readRAM(this.musicData.orderListPtrsLo + track);
    const olPtrHi = this.readRAM(this.musicData.orderListPtrsHi + track);
    if (olPtrLo === null || olPtrHi === null) return false;
    const olAddr = olPtrLo | (olPtrHi << 8);

    // Each entry in the order list: [transpose_byte] [sequence_index]
    // But in SF2 format, transposition bytes are >= 0x80 and precede the seqIdx
    // This is a simplified write — for full implementation, we need to handle
    // the variable-length order list encoding properly
    // For now, write the raw bytes at the computed position
    let writePos = olAddr;
    for (let i = 0; i < pos; i++) {
      const b = this.readRAM(writePos);
      if (b === null) return false;
      if (b >= 0x80 && b < 0xFE) {
        writePos++; // skip transposition byte
      }
      writePos++; // skip sequence index byte
    }

    // Write transposition if non-zero
    if (entry.transpose >= 0x80) {
      this.writeRAM(writePos++, entry.transpose);
    }
    return this.writeRAM(writePos, entry.seqIdx);
  }

  // ── Note Trigger (live preview) ────────────────────────────────────────

  /**
   * Play a test note by poking the driver's note trigger addresses.
   * Mirrors SF2 native editor's screen_edit.cpp note input mechanism.
   *
   * @param track Which track/channel (0-based)
   * @param note Note value (SF2 note encoding, e.g., 0x30 = C-4)
   * @param instrument Instrument index (0-based)
   * @param command Optional command index (0-based, -1 for no command)
   */
  playTestNote(track: number, note: number, instrument: number, command = -1): boolean {
    const dc = this.driverCommonData;
    if (!dc || !this.musicData || !this.canEdit) return false;

    const trackCount = this.musicData.trackCount;
    const syncValue = dc.noteEventTriggerSyncValue;

    // Hold tempo counter away from updating sequences
    this.writeRAM(dc.tempoCounterAddress, 0x0F);

    for (let i = 0; i < trackCount; i++) {
      if (i === track) {
        // Target track: set note + instrument + optional command
        this.writeRAM(dc.nextNoteAddress + i, note & 0xFF);
        this.writeRAM(dc.nextInstrumentAddress + i, (instrument & 0x7F) | 0x80);
        if (command >= 0) {
          this.writeRAM(dc.nextCommandAddress + i, (command & 0x7F) | 0x80);
        }
        this.writeRAM(dc.nextNoteIsTiedAddress + i, 0); // not tied
        this.writeRAM(dc.triggerSyncAddress + i, syncValue);
      } else {
        // Other tracks: silence (tied rest)
        this.writeRAM(dc.nextNoteAddress + i, 0);
        this.writeRAM(dc.nextNoteIsTiedAddress + i, 1);
        this.writeRAM(dc.triggerSyncAddress + i, syncValue);
      }
    }

    return true;
  }

  /**
   * Release a test note (set note to 0 = rest).
   */
  releaseTestNote(_track: number): boolean {
    const dc = this.driverCommonData;
    if (!dc || !this.musicData || !this.canEdit) return false;

    const trackCount = this.musicData.trackCount;
    const syncValue = dc.noteEventTriggerSyncValue;

    for (let i = 0; i < trackCount; i++) {
      this.writeRAM(dc.nextNoteAddress + i, 0);
      this.writeRAM(dc.nextNoteIsTiedAddress + i, 1);
      this.writeRAM(dc.triggerSyncAddress + i, syncValue);
    }

    return true;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Get max bytes available for a sequence (distance to next sequence) */
  private getSequenceMaxSize(seqIdx: number): number {
    if (!this.musicData) return 256;

    const getSeqAddr = (idx: number): number => {
      const lo = this.readRAM(this.musicData!.sequencePtrsLo + idx);
      const hi = this.readRAM(this.musicData!.sequencePtrsHi + idx);
      if (lo === null || hi === null) return 0;
      return lo | (hi << 8);
    };

    const thisAddr = getSeqAddr(seqIdx);
    if (thisAddr === 0) return 256;

    // Find next higher sequence address
    let nextAddr = 0xFFFF;
    for (let i = 0; i < this.musicData.sequenceCount; i++) {
      if (i === seqIdx) continue;
      const addr = getSeqAddr(i);
      if (addr > thisAddr && addr < nextAddr) {
        nextAddr = addr;
      }
    }

    return nextAddr === 0xFFFF ? 256 : nextAddr - thisAddr;
  }

  // ── SID Register Reading ──────────────────────────────────────────────

  /** Read all 25 SID registers ($D400-$D418) */
  readSIDRegisters(): Uint8Array | null {
    return this.readRAMBlock(0xD400, 25);
  }

  /** Read SID voice registers for a specific voice (0-2) */
  readSIDVoice(voice: number): {
    freqLo: number; freqHi: number;
    pwLo: number; pwHi: number;
    control: number;
    ad: number; sr: number;
  } | null {
    const base = 0xD400 + voice * 7;
    const regs = this.readRAMBlock(base, 7);
    if (!regs) return null;
    return {
      freqLo: regs[0], freqHi: regs[1],
      pwLo: regs[2], pwHi: regs[3],
      control: regs[4],
      ad: regs[5], sr: regs[6],
    };
  }

  // ── Flight Recorder Capture ───────────────────────────────────────────

  /** Start capturing SID registers each animation frame */
  private startCapture(): void {
    if (this.capturing) return;
    this.capturing = true;

    // Import FormatPlaybackState for pattern follow
    let setRow: ((row: number) => void) | null = null;
    let setPlaying: ((playing: boolean) => void) | null = null;
    let sf2StoreReady = false;
    let sf2SetPlaying: ((p: boolean) => void) | null = null;
    let sf2UpdatePos: ((pos: { row: number; songPos: number }) => void) | null = null;

    import('@/engine/FormatPlaybackState').then(mod => {
      setRow = mod.setFormatPlaybackRow;
      setPlaying = mod.setFormatPlaybackPlaying;
      setPlaying!(true);
    });
    import('@stores/useSF2Store').then(mod => {
      const store = mod.useSF2Store.getState();
      sf2SetPlaying = store.setPlaying;
      sf2UpdatePos = store.updatePlaybackPos;
      sf2StoreReady = true;
      sf2SetPlaying!(true);
    });

    let lastSeqRow = -1;
    let lastOrderIdx = -1;

    const tick = () => {
      if (!this.capturing) return;
      this.flightRecorder.capture(this.sidEngine);

      // Read playback position from C64 driver memory
      if (setRow && this.driverCommonData) {
        const seqRow = this.readRAM(this.driverCommonData.sequenceIndexAddress) ?? 0;
        const orderIdx = this.readRAM(this.driverCommonData.orderListIndexAddress) ?? 0;
        const rowChanged = seqRow !== lastSeqRow;
        const orderChanged = orderIdx !== lastOrderIdx;

        if (rowChanged) {
          lastSeqRow = seqRow;
          setRow(seqRow);
        }
        if (sf2StoreReady && (rowChanged || orderChanged)) {
          lastOrderIdx = orderIdx;
          sf2UpdatePos!({ row: seqRow, songPos: orderIdx });
        }
      }

      this.captureRAFId = requestAnimationFrame(tick);
    };
    this.captureRAFId = requestAnimationFrame(tick);
  }

  /** Stop capturing */
  private stopCapture(): void {
    this.capturing = false;
    if (this.captureRAFId) {
      cancelAnimationFrame(this.captureRAFId);
      this.captureRAFId = 0;
    }
    // Clear playback state
    import('@/engine/FormatPlaybackState').then(mod => {
      mod.setFormatPlaybackPlaying(false);
    });
    import('@stores/useSF2Store').then(mod => {
      mod.useSF2Store.getState().setPlaying(false);
    });
  }

  // ── Accessors ─────────────────────────────────────────────────────────

  get engine(): C64SIDEngine { return this.sidEngine; }
  get driverName(): string { return this.descriptor?.driverName ?? 'Unknown'; }
  get driverVersion(): string {
    if (!this.descriptor) return '?';
    return `v${this.descriptor.versionMajor}.${String(this.descriptor.versionMinor).padStart(2, '0')}`;
  }
  get trackCount(): number { return this.musicData?.trackCount ?? 3; }
  get tables(): SF2TableDef[] { return this.tableDefs; }
  get driverCommon(): SF2DriverCommon | null { return this.driverCommonData; }
  get loadAddress(): number { return this.loadAddr; }

  /** Connect audio output to a new destination */
  connectTo(destination: AudioNode): void {
    this.sidEngine.connectTo(destination);
  }

  /** Get the output gain node for mixer routing */
  getOutputNode(): GainNode | null {
    return this.sidEngine.getOutputNode();
  }

  /** Set master volume */
  setMasterVolume(volume: number): void {
    this.sidEngine.setMasterVolume(volume);
  }

  /** Set voice mute mask */
  setMuteMask(mask: number): void {
    this.sidEngine.setMuteMask(mask);
  }

  /** Dispose and cleanup */
  dispose(): void {
    this.stopCapture();
    this.flightRecorder.clear();
    this.sidEngine.dispose();
    this.initialized = false;
  }
}

/** Factory function */
export function createSF2Engine(sidData: Uint8Array): SF2Engine {
  return new SF2Engine(sidData);
}
