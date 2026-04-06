/**
 * GTUltraEngine — TypeScript wrapper for GoatTracker Ultra WASM engine.
 *
 * Manages AudioWorklet lifecycle, WASM loading, and provides the
 * main-thread API for the tracker UI to interact with the engine.
 */

import { preprocessEmscriptenJS } from '../mame/mame-wasm-loader';

// Cache fetched WASM+JS across instances
let modulePromise: Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> | null = null;
const workletLoaded = new WeakSet<AudioContext>();
const CACHE_BUST = `?t=${Date.now()}`;

export interface GTUltraPosition {
  row: number;
  pos: number;
}

export interface GTUltraSongInfo {
  name: string;
  author: string;
  copyright: string;
  numPatterns: number;
  numInstruments: number;
  numSongs: number;
  channelCount: number;
}

export interface GTUltraCallbacks {
  onReady?: () => void;
  onError?: (error: string) => void;
  onSongLoaded?: (ok: boolean, channelCount?: number) => void;
  onPosition?: (pos: GTUltraPosition) => void;
  onAsidWrite?: (chip: number, reg: number, value: number, tick: number, tableType?: 'wave' | 'pulse' | 'filter', tableIndex?: number) => void;
  onPatternData?: (pattern: number, length: number, data: Uint8Array) => void;
  onOrderData?: (channel: number, data: Uint8Array) => void;
  onInstrumentData?: (instrument: number, data: Uint8Array) => void;
  onTableData?: (tableType: number, left: Uint8Array, right: Uint8Array) => void;
  onSidRegisters?: (sidIdx: number, data: Uint8Array) => void;
  onSongInfo?: (info: GTUltraSongInfo) => void;
  onSngData?: (data: ArrayBuffer | null) => void;
  onPrgData?: (data: ArrayBuffer | null) => void;
  onSidData?: (data: ArrayBuffer | null) => void;
}

export class GTUltraEngine {
  private context: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private outputNode: GainNode;
  /** Public so views can wire additional callbacks after init */
  callbacks: GTUltraCallbacks;
  private readyResolve: (() => void) | null = null;
  private readyPromise: Promise<void>;
  private disposed = false;

  constructor(context: AudioContext, callbacks: GTUltraCallbacks = {}) {
    this.context = context;
    this.callbacks = callbacks;
    this.outputNode = context.createGain();
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  get output(): GainNode {
    return this.outputNode;
  }

  get ready(): Promise<void> {
    return this.readyPromise;
  }

  async init(sidModel: number = 0): Promise<void> {
    const baseUrl = import.meta.env.BASE_URL || '/';

    // Load worklet module (once per context)
    if (!workletLoaded.has(this.context)) {
      await this.context.audioWorklet.addModule(
        `${baseUrl}gtultra/GTUltra.worklet.js${CACHE_BUST}`
      );
      workletLoaded.add(this.context);
    }

    // Fetch WASM + JS (cached)
    if (!modulePromise) {
      modulePromise = (async () => {
        const [wasmResp, jsResp] = await Promise.all([
          fetch(`${baseUrl}gtultra/GTUltra.wasm${CACHE_BUST}`),
          fetch(`${baseUrl}gtultra/GTUltra.js${CACHE_BUST}`),
        ]);
        if (!wasmResp.ok) throw new Error(`Failed to load GTUltra.wasm: ${wasmResp.status}`);
        if (!jsResp.ok) throw new Error(`Failed to load GTUltra.js: ${jsResp.status}`);

        const [wasmBinary, jsCodeRaw] = await Promise.all([
          wasmResp.arrayBuffer(),
          jsResp.text(),
        ]);
        const jsCode = preprocessEmscriptenJS(jsCodeRaw, `${baseUrl}gtultra/`);
        return { wasmBinary, jsCode };
      })();
    }

    const { wasmBinary, jsCode } = await modulePromise;

    // Create worklet node
    this.workletNode = new AudioWorkletNode(this.context, 'gtultra-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (e) => this.handleMessage(e.data);
    this.workletNode.connect(this.outputNode);

    // Keepalive — ensures process() runs even when idle
    const keepalive = this.context.createGain();
    keepalive.gain.value = 0;
    this.workletNode.connect(keepalive);
    keepalive.connect(this.context.destination);

    // Copy the WASM binary so the cached modulePromise stays valid for re-init
    const wasmCopy = wasmBinary.slice(0);
    this.workletNode.port.postMessage(
      { type: 'init', wasmBinary: wasmCopy, jsCode, sidModel },
      [wasmCopy]
    );
  }

  private handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'ready':
        this.readyResolve?.();
        this.callbacks.onReady?.();
        break;
      case 'error':
        this.callbacks.onError?.(msg.error as string);
        break;
      case 'songLoaded':
        this.callbacks.onSongLoaded?.(msg.ok as boolean, msg.channelCount as number | undefined);
        break;
      case 'position':
        this.callbacks.onPosition?.(msg as unknown as GTUltraPosition);
        break;
      case 'asid':
        this.callbacks.onAsidWrite?.(
          msg.chip as number,
          msg.reg as number,
          msg.value as number,
          (msg.tick as number) ?? 0,
          msg.tableType as 'wave' | 'pulse' | 'filter' | undefined,
          msg.tableIndex as number | undefined,
        );
        break;
      case 'songCleared':
        break;
      case 'patternData':
        this.callbacks.onPatternData?.(
          msg.pattern as number,
          msg.length as number,
          new Uint8Array(msg.data as ArrayBuffer)
        );
        break;
      case 'orderData':
        this.callbacks.onOrderData?.(
          msg.channel as number,
          new Uint8Array(msg.data as ArrayBuffer)
        );
        break;
      case 'instrumentData':
        this.callbacks.onInstrumentData?.(
          msg.instrument as number,
          new Uint8Array(msg.data as ArrayBuffer)
        );
        break;
      case 'tableData':
        this.callbacks.onTableData?.(
          msg.tableType as number,
          new Uint8Array(msg.left as ArrayBuffer),
          new Uint8Array(msg.right as ArrayBuffer)
        );
        break;
      case 'sidRegisters':
        this.callbacks.onSidRegisters?.(
          msg.sidIdx as number,
          new Uint8Array(msg.data as ArrayBuffer)
        );
        break;
      case 'songInfo':
        this.callbacks.onSongInfo?.(msg as unknown as GTUltraSongInfo);
        break;
      case 'sngData':
        this.callbacks.onSngData?.(msg.data as ArrayBuffer | null);
        break;
      case 'prgData':
        this.callbacks.onPrgData?.(msg.data as ArrayBuffer | null);
        break;
      case 'sidData':
        this.callbacks.onSidData?.(msg.data as ArrayBuffer | null);
        break;
    }
  }

  private post(msg: Record<string, unknown>): void {
    this.workletNode?.port.postMessage(msg);
  }

  // --- Song I/O ---

  loadSong(data: ArrayBuffer): void {
    this.post({ type: 'loadSng', data });
  }

  newSong(): void {
    this.post({ type: 'newSong' });
  }

  // --- Playback ---

  play(songNum = 0, fromPos = 0, fromRow = 0): void {
    this.post({ type: 'play', songNum, fromPos, fromRow });
  }

  stop(): void {
    this.post({ type: 'stop' });
  }

  // --- Jam mode ---

  jamNoteOn(channel: number, note: number, instrument: number): void {
    this.post({ type: 'jamNoteOn', channel, note, instrument });
  }

  jamNoteOff(channel: number): void {
    this.post({ type: 'jamNoteOff', channel });
  }

  /** Play a test note with proper instrument init (works even when stopped) */
  playTestNote(channel: number, note: number, instrument: number): void {
    this.post({ type: 'playTestNote', channel, note, instrument });
  }

  /** Release a test note */
  releaseTestNote(channel: number): void {
    this.post({ type: 'releaseNote', channel });
  }

  // --- Configuration ---

  setSidModel(model: number): void {
    this.post({ type: 'setSidModel', model });
  }

  setSidCount(count: number): void {
    this.post({ type: 'setSidCount', count });
  }

  enableAsid(enabled: boolean): void {
    this.post({ type: 'enableAsid', enabled });
  }

  // --- Data queries (async, responses come via callbacks) ---

  requestPatternData(pattern: number): void {
    this.post({ type: 'getPatternData', pattern });
  }

  requestOrderData(channel: number, song = 0): void {
    this.post({ type: 'getOrderData', channel, song });
  }

  requestInstrumentData(instrument: number): void {
    this.post({ type: 'getInstrumentData', instrument });
  }

  requestTableData(tableType: number): void {
    this.post({ type: 'getTableData', tableType });
  }

  requestSidRegisters(sidIdx: number = 0): void {
    this.post({ type: 'getSidRegisters', sidIdx });
  }

  requestSongInfo(): void {
    this.post({ type: 'getSongInfo' });
  }

  // --- Editing ---

  setPatternCell(pattern: number, row: number, col: number, value: number): void {
    this.post({ type: 'setPatternCell', pattern, row, col, value });
  }

  setOrderEntry(channel: number, position: number, value: number): void {
    this.post({ type: 'setOrderEntry', channel, position, value });
  }

  setTableEntry(tableType: number, side: number, index: number, value: number): void {
    this.post({ type: 'setTableEntry', tableType, side, index, value });
  }

  undo(): void {
    this.post({ type: 'undo' });
  }

  redo(): void {
    this.post({ type: 'redo' });
  }

  // --- Save/Export ---

  saveSng(): void {
    this.post({ type: 'saveSng' });
  }

  exportPrg(): void {
    this.post({ type: 'exportPrg' });
  }

  exportSid(): void {
    this.post({ type: 'exportSid' });
  }

  // --- Instrument editing ---

  setInstrumentAD(instrument: number, value: number): void {
    this.post({ type: 'setInstrumentAD', instrument, value });
  }

  setInstrumentSR(instrument: number, value: number): void {
    this.post({ type: 'setInstrumentSR', instrument, value });
  }

  setInstrumentFirstwave(instrument: number, value: number): void {
    this.post({ type: 'setInstrumentFirstwave', instrument, value });
  }

  setInstrumentTablePtr(instrument: number, tableType: number, value: number): void {
    this.post({ type: 'setInstrumentTablePtr', instrument, tableType, value });
  }

  setInstrumentVibdelay(instrument: number, value: number): void {
    this.post({ type: 'setInstrumentVibdelay', instrument, value });
  }

  setInstrumentGatetimer(instrument: number, value: number): void {
    this.post({ type: 'setInstrumentGatetimer', instrument, value });
  }

  // --- Song metadata ---

  setSongName(name: string): void {
    this.post({ type: 'setSongName', name });
  }

  setAuthorName(name: string): void {
    this.post({ type: 'setAuthorName', name });
  }

  setCopyright(name: string): void {
    this.post({ type: 'setCopyright', name });
  }

  // --- Lifecycle ---

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.outputNode.disconnect();
  }
}
