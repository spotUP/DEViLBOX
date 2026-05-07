/**
 * KKDawSurface — Komplete Kontrol DAW MIDI surface manager
 *
 * Connects to the keyboard's "DAW" MIDI port (auto-detected), subscribes to
 * DEViLBOX stores, and keeps the keyboard display/knobs/transport in sync.
 *
 * Architecture:
 *   KKDawSurface (this file)
 *     ↕ Web MIDI (DAW port)
 *   KKDawProtocol (pure message encoding/decoding)
 *     ↕ Store subscriptions
 *   useTransportStore / useInstrumentStore / useTrackerStore
 */

import {
  CMD, TRTYPE, PROTO_VERSION, PARAM_VIS,
  isKKDawPort,
  buildCc, buildSysex,
  parseMidiMessage,
  encodeTempo, encodeVolume, encodePan, encodeParam,
  decodeSignedMidi, decodeHighResDelta,
  navLightsMask,
  type KKEvent,
} from './KKDawProtocol';

import { useTransportStore }  from '@/stores/useTransportStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useTrackerStore }    from '@/stores/useTrackerStore';
import {
  getNKSParametersForSynth,
  buildNKSPages,
  formatNKSValue,
} from '@/midi/performance/synthParameterMaps';
import { NKSParameterType } from '@/midi/performance/types';
import type { NKSPage } from '@/midi/performance/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const BANK_SIZE        = 8;   // KK shows 8 tracks in a bank
const REFRESH_HZ       = 10;  // Store-polling rate for VU / knob updates
const UPDATE_DEBOUNCE  = 50;  // ms debounce on store-change flushes

// ── Types ─────────────────────────────────────────────────────────────────────

type Unsubscribe = () => void;

export interface KKSurfaceStatus {
  connected: boolean;
  protocolVersion: number;
  portName: string;
  instrumentName: string;
  currentPage: number;
  totalPages: number;
}

// ── KKDawSurface ──────────────────────────────────────────────────────────────

export class KKDawSurface {
  private output: MIDIOutput | null = null;
  private input:  MIDIInput  | null = null;

  private protocolVersion = 0;
  private bankOffset = 0;         // first channel index in current 8-track bank
  private currentPage = 0;        // NKS param page index shown on keyboard

  private nksPages: NKSPage[] = [];
  private lastInstrumentId: number | null = null;

  private unsubscribers: Unsubscribe[] = [];
  private pollTimer: number | null = null;
  private flushTimer: number | null = null;
  private statusListeners: Array<(s: KKSurfaceStatus) => void> = [];

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async connect(access: MIDIAccess): Promise<boolean> {
    this.disconnect();

    for (const output of access.outputs.values()) {
      if (isKKDawPort(output.name ?? '')) {
        this.output = output;
        break;
      }
    }
    for (const input of access.inputs.values()) {
      if (isKKDawPort(input.name ?? '')) {
        this.input = input;
        break;
      }
    }

    if (!this.output || !this.input) return false;

    this.input.onmidimessage = this.onMidiMessage;
    this.send(buildCc(CMD.HELLO, 4)); // request protocol v4

    console.log(`[KKDaw] Connected to "${this.output.name}"`);
    this.subscribeStores();
    this.startPollTimer();
    return true;
  }

  disconnect() {
    this.stopPollTimer();
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
    if (this.output) {
      try { this.send(buildCc(CMD.GOODBYE, 0)); } catch { /* ignore */ }
    }
    if (this.input) {
      this.input.onmidimessage = null;
    }
    this.output = null;
    this.input  = null;
    this.protocolVersion = 0;
    this.notifyStatus();
  }

  getStatus(): KKSurfaceStatus {
    const inst = useInstrumentStore.getState().instruments.find(
      i => i.id === useInstrumentStore.getState().currentInstrumentId,
    );
    return {
      connected:       !!this.output,
      protocolVersion: this.protocolVersion,
      portName:        this.output?.name ?? '',
      instrumentName:  inst?.name ?? '',
      currentPage:     this.currentPage,
      totalPages:      this.nksPages.length,
    };
  }

  onStatusChange(cb: (s: KKSurfaceStatus) => void): Unsubscribe {
    this.statusListeners.push(cb);
    return () => { this.statusListeners = this.statusListeners.filter(l => l !== cb); };
  }

  // ── Send helpers ────────────────────────────────────────────────────────────

  private send(data: Uint8Array) {
    if (!this.output) return;
    try { this.output.send(data); } catch (e) { console.warn('[KKDaw] send error', e); }
  }

  private sendCc(cmd: number, value: number) {
    this.send(buildCc(cmd, value));
  }

  private sendSx(cmd: number, value: number, slot: number, text = '') {
    this.send(buildSysex(cmd, value, slot, text));
  }

  // ── Store subscriptions ──────────────────────────────────────────────────────

  private subscribeStores() {
    const scheduleFlush = () => {
      if (this.flushTimer !== null) return;
      this.flushTimer = window.setTimeout(() => {
        this.flushTimer = null;
        this.pushFullState();
      }, UPDATE_DEBOUNCE);
    };

    // Transport changes
    this.unsubscribers.push(
      useTransportStore.subscribe((s, prev) => {
        if (s.isPlaying !== prev.isPlaying)
          this.sendCc(CMD.PLAY, s.isPlaying ? 1 : 0);
        if (s.bpm !== prev.bpm)
          this.pushTempo(s.bpm);
      }),
    );

    // Instrument selection / parameters
    this.unsubscribers.push(
      useInstrumentStore.subscribe((s, prev) => {
        if (s.currentInstrumentId !== prev.currentInstrumentId) scheduleFlush();
        const curInst = s.instruments.find(i => i.id === s.currentInstrumentId);
        const prevInst = prev.instruments.find(i => i.id === prev.currentInstrumentId);
        if (curInst !== prevInst) scheduleFlush();
      }),
    );

    // Channel count / names changes
    this.unsubscribers.push(
      useTrackerStore.subscribe((s, prev) => {
        const curChs = s.patterns[s.currentPatternIndex]?.channels;
        const prevChs = prev.patterns[prev.currentPatternIndex]?.channels;
        if (curChs !== prevChs) scheduleFlush();
      }),
    );
  }

  private getChannels() {
    const s = useTrackerStore.getState();
    return s.patterns[s.currentPatternIndex]?.channels ?? [];
  }

  // ── Push state to hardware ───────────────────────────────────────────────────

  pushFullState() {
    if (!this.output) return;
    this.rebuildNKSPages();
    this.pushTransport();
    this.pushChannelBank();
    this.pushInstrumentFocus();
    this.pushKnobPage(this.currentPage);
    this.notifyStatus();
  }

  private pushTransport() {
    const t = useTransportStore.getState();
    this.sendCc(CMD.PLAY,  t.isPlaying ? 1 : 0);
    this.sendCc(CMD.STOP,  t.isPlaying ? 0 : 1);
    this.sendCc(CMD.LOOP,  0);
    this.sendCc(CMD.REC,   0);
    this.pushTempo(t.bpm);
  }

  private pushTempo(bpm: number) {
    const bytes = encodeTempo(bpm);
    // SET_TEMPO uses SysEx variant — send encoded bytes in text field
    const msg = new Uint8Array(buildSysex(CMD.SET_TEMPO, 0, 0).length + bytes.length + 1);
    // Simple approach: send the 5 tempo bytes as CC for SET_TEMPO
    // The canonical flow: send CMD_TEMPO CC(1) to signal tempo changed,
    // then push the 5 bytes. Some firmwares accept raw CC 0x19 with one byte;
    // for full support use SysEx.
    this.sendCc(CMD.TEMPO, 1);
    // Build raw SysEx: F0 HDR SET_TEMPO 0 0 b0 b1 b2 b3 b4 F7
    const hdr = [0xF0, 0x00, 0x21, 0x09, 0x00, 0x00, 0x44, 0x43, 0x01, 0x00];
    const raw = Uint8Array.from([...hdr, CMD.SET_TEMPO, 0, 0, ...Array.from(bytes), 0xF7]);
    this.send(raw);
    void msg; // suppress unused warning
  }

  private pushChannelBank() {
    const channels = this.getChannels();
    const total = channels.length;

    for (let slot = 0; slot < BANK_SIZE; slot++) {
      const chIdx = this.bankOffset + slot;
      if (chIdx < total) {
        const ch = channels[chIdx];
        const name = ch.name || `CH${chIdx + 1}`;
        this.sendSx(CMD.TRACK_AVAIL, TRTYPE.MIDI, slot);
        this.sendSx(CMD.TRACK_NAME, 0, slot, name);
        this.sendSx(CMD.TRACK_MUTED,  ch.muted ? 1 : 0, slot);
      } else {
        this.sendSx(CMD.TRACK_AVAIL, TRTYPE.UNAVAILABLE, slot);
        this.sendSx(CMD.TRACK_NAME, 0, slot, '');
      }
    }

    // Nav prev/next LEDs
    const hasPrev = this.bankOffset > 0;
    const hasNext = this.bankOffset + BANK_SIZE < total;
    this.sendCc(CMD.NAV_TRACKS, navLightsMask(hasPrev, hasNext));
  }

  private pushInstrumentFocus() {
    const { instruments, currentInstrumentId } = useInstrumentStore.getState();
    const inst = instruments.find(i => i.id === currentInstrumentId);
    if (!inst) return;

    // Tell keyboard which slot is selected (map instrument id → channel slot 0 for now)
    const channels = this.getChannels();
    const slot = Math.max(0, channels.findIndex(c => c.instrumentId === inst.id) - this.bankOffset);

    this.sendSx(CMD.TRACK_SELECTED, 1, Math.min(7, Math.max(0, slot)));
    // Instance name so keyboard knows which NKS plugin is focused
    this.sendSx(CMD.SEL_TRACK_PARAMS_CHANGED, 0, 0, 'DEViLBOX');
    // Preset / instrument name
    this.sendSx(CMD.PRESET_NAME, 0, 0, inst.name.slice(0, 52));
  }

  private pushKnobPage(pageIndex: number) {
    if (this.nksPages.length === 0) return;
    const idx = Math.max(0, Math.min(pageIndex, this.nksPages.length - 1));
    this.currentPage = idx;
    const page = this.nksPages[idx];
    const { instruments, currentInstrumentId } = useInstrumentStore.getState();
    const inst = instruments.find(i => i.id === currentInstrumentId);

    // Page info: section name + page index
    this.sendSx(CMD.PARAM_PAGE, idx, 0, page.name);
    this.sendSx(CMD.PARAM_SECTION, 0, 0, page.name);

    for (let k = 0; k < BANK_SIZE; k++) {
      const param = page.parameters[k];
      if (param) {
        const visType = param.type === NKSParameterType.FLOAT
          ? (param.min < 0 ? PARAM_VIS.BIPOLAR : PARAM_VIS.UNIPOLAR)
          : PARAM_VIS.DISCRETE;
        this.sendSx(CMD.PARAM_NAME, visType, k, param.name.slice(0, 16));

        // Get current value from instrument config (params stored flat on InstrumentConfig)
        const rawValue = inst
          ? resolveParamValue(inst as unknown as Record<string, unknown>, param.id)
          : undefined;
        const displayText = formatNKSValue(param, rawValue ?? param.defaultValue);
        this.sendSx(CMD.PARAM_VALUE_TEXT, 0, k, displayText.slice(0, 16));
        this.sendCc(CMD.KNOB_PARAM0 + k, encodeParam(rawValue ?? param.defaultValue));
      } else {
        this.sendSx(CMD.PARAM_NAME, PARAM_VIS.UNIPOLAR, k, '');
        this.sendSx(CMD.PARAM_VALUE_TEXT, 0, k, '');
        this.sendCc(CMD.KNOB_PARAM0 + k, 0);
      }
    }
  }

  private rebuildNKSPages() {
    const { instruments, currentInstrumentId } = useInstrumentStore.getState();
    const inst = instruments.find(i => i.id === currentInstrumentId);
    if (!inst) { this.nksPages = []; return; }

    if (inst.id !== this.lastInstrumentId) {
      this.lastInstrumentId = inst.id;
      this.currentPage = 0;
      const params = getNKSParametersForSynth(inst.synthType);
      this.nksPages = buildNKSPages(params);
    }
  }

  // ── VU / knob volume poll ────────────────────────────────────────────────────

  private startPollTimer() {
    this.pollTimer = window.setInterval(() => this.pollVu(), 1000 / REFRESH_HZ);
  }

  private stopPollTimer() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private pollVu() {
    if (!this.output) return;
    const channels = this.getChannels();
    for (let slot = 0; slot < BANK_SIZE; slot++) {
      const ch = channels[this.bankOffset + slot];
      if (!ch) continue;
      // Channel volume is 0-100, map to 0-1 for encoding
      const vol = typeof ch.volume === 'number' ? ch.volume / 100 : 1.0;
      this.sendCc(CMD.KNOB_VOLUME0 + slot, encodeVolume(vol));
      // Channel pan is -100 to +100, map to -1..+1
      const pan = typeof ch.pan === 'number' ? ch.pan / 100 : 0;
      this.sendCc(CMD.KNOB_PAN0 + slot, encodePan(pan));
    }
  }

  // ── Inbound MIDI routing ────────────────────────────────────────────────────

  private onMidiMessage = (e: MIDIMessageEvent) => {
    if (!e.data) return;
    const raw = e.data as Uint8Array;
    const data = raw instanceof Uint8Array ? raw : new Uint8Array((raw as unknown as ArrayBuffer));
    const event = parseMidiMessage(data);
    if (!event) return;
    this.routeEvent(event);
  };

  private routeEvent(ev: KKEvent) {
    if (ev.type === 'cc') {
      this.routeCc(ev.cmd, ev.value);
    } else {
      this.routeSysex(ev.cmd, ev.value, ev.slot, ev.text);
    }
  }

  private routeCc(cmd: number, value: number) {
    const transport = useTransportStore.getState();

    switch (cmd) {
      case CMD.HELLO:
        this.protocolVersion = value;
        console.log(`[KKDaw] Protocol v${value} (${this.protoName(value)})`);
        this.sendInitCapabilities();
        this.pushFullState();
        break;

      case CMD.PLAY:
        if (value) transport.play(); else transport.stop();
        break;

      case CMD.STOP:
        if (value) transport.stop();
        break;

      case CMD.RESTART:
        if (value) { transport.stop(); transport.play(); }
        break;

      case CMD.REC:
        // DEViLBOX record toggle — no-op for now
        break;

      case CMD.LOOP:
        // Loop toggle — no-op for now
        break;

      case CMD.UNDO:
        if (value) this.triggerUndo();
        break;

      case CMD.NAV_TRACKS: {
        const delta = decodeSignedMidi(value);
        const channels = this.getChannels();
        this.bankOffset = Math.max(
          0,
          Math.min(Math.max(0, channels.length - BANK_SIZE), this.bankOffset + delta),
        );
        this.pushChannelBank();
        break;
      }

      case CMD.NAV_PRESET: {
        const delta = decodeSignedMidi(value);
        this.currentPage = Math.max(
          0,
          Math.min(this.nksPages.length - 1, this.currentPage + delta),
        );
        this.pushKnobPage(this.currentPage);
        this.notifyStatus();
        break;
      }

      // Knob param turns (0x70–0x77) — these are ABSOLUTE 0-127 values
      default:
        if (cmd >= CMD.KNOB_PARAM0 && cmd <= CMD.KNOB_PARAM0 + 7) {
          const slot = cmd - CMD.KNOB_PARAM0;
          this.handleParamKnob(slot, value);
        } else if (cmd >= CMD.KNOB_VOLUME0 && cmd <= CMD.KNOB_VOLUME0 + 7) {
          const slot = cmd - CMD.KNOB_VOLUME0;
          this.handleVolumeKnob(slot, value);
        } else if (cmd >= CMD.KNOB_PAN0 && cmd <= CMD.KNOB_PAN0 + 7) {
          const slot = cmd - CMD.KNOB_PAN0;
          this.handlePanKnob(slot, value);
        }
    }
  }

  private routeSysex(cmd: number, _value: number, slot: number, _text: string) {
    switch (cmd) {
      case CMD.PARAM_HIGH_RES: {
        // MK3 14-bit high-res knob: slot=param, text has 2 bytes
        // Decode from raw message
        const delta = decodeHighResDelta(slot, 0);
        this.handleParamKnobDelta(slot, delta);
        break;
      }
      default:
        break;
    }
  }

  // ── Knob handlers ───────────────────────────────────────────────────────────

  private handleParamKnob(slot: number, absoluteValue: number) {
    const page = this.nksPages[this.currentPage];
    if (!page) return;
    const param = page.parameters[slot];
    if (!param) return;

    const { instruments, currentInstrumentId, updateInstrument } = useInstrumentStore.getState();
    const inst = instruments.find(i => i.id === currentInstrumentId);
    if (!inst) return;

    // Normalize 0-127 → 0-1, then scale to param range
    const normalized = absoluteValue / 127;
    const scaled = param.min + normalized * (param.max - param.min);
    const paramPath = param.id.split('.').slice(1); // strip "synthType." prefix

    // Build config patch using dot-path on the flat InstrumentConfig
    const patch = buildDotPatch(inst as unknown as Record<string, unknown>, paramPath, scaled);
    updateInstrument(inst.id, patch as Parameters<typeof updateInstrument>[1]);
  }

  private handleParamKnobDelta(slot: number, delta: number) {
    const page = this.nksPages[this.currentPage];
    if (!page) return;
    const param = page.parameters[slot];
    if (!param) return;

    const { instruments, currentInstrumentId, updateInstrument } = useInstrumentStore.getState();
    const inst = instruments.find(i => i.id === currentInstrumentId);
    if (!inst) return;

    const paramPath = param.id.split('.').slice(1);
    const current = resolveParamValue(inst as unknown as Record<string, unknown>, param.id) ?? param.defaultValue;
    const step = (param.max - param.min) * delta * 0.01;
    const newVal = Math.max(param.min, Math.min(param.max, current + step));
    const patch = buildDotPatch(inst as unknown as Record<string, unknown>, paramPath, newVal);
    updateInstrument(inst.id, patch as Parameters<typeof updateInstrument>[1]);
  }

  private handleVolumeKnob(slot: number, value: number) {
    const channels = this.getChannels();
    const chIdx = this.bankOffset + slot;
    if (chIdx >= channels.length) return;
    // Volume 0-127 → 0-100 (tracker volume scale)
    useTrackerStore.getState().setChannelVolume(chIdx, Math.round(value / 127 * 100));
  }

  private handlePanKnob(slot: number, value: number) {
    const channels = this.getChannels();
    const chIdx = this.bankOffset + slot;
    if (chIdx >= channels.length) return;
    // Pan 0-127 → -100 to +100
    useTrackerStore.getState().setChannelPan(chIdx, Math.round((value - 63.5) / 63.5 * 100));
  }

  // ── Initialization ───────────────────────────────────────────────────────────

  private sendInitCapabilities() {
    this.sendCc(CMD.QUANTIZE, 1);
    this.sendCc(CMD.TEMPO, 1);
    this.sendCc(CMD.NAV_CLIPS, 3);
    this.sendSx(CMD.SURFACE_CONFIG, 0, 0, 'track_orientation');
    if (this.protocolVersion >= PROTO_VERSION.S_MK3) {
      this.sendCc(CMD.USE_SYSEX_PARAM, 1);
    }
  }

  private triggerUndo() {
    // Dispatch a keyboard undo event — works with any browser undo handler
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true,
    }));
  }

  private protoName(v: number): string {
    switch (v) {
      case 1: return 'A/M-series';
      case 2: return 'S MK2 (old)';
      case 3: return 'S MK2';
      case 4: return 'S MK3';
      default: return `unknown v${v}`;
    }
  }

  private notifyStatus() {
    const s = this.getStatus();
    this.statusListeners.forEach(l => l(s));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve a parameter value from an instrument's synthConfig using the full
 * NKS param id (e.g. "tb303.cutoff" → config.cutoff).
 */
function resolveParamValue(config: Record<string, unknown>, paramId: string): number | undefined {
  // paramId looks like "tb303.cutoff" or "tb303.delay.time"
  const parts = paramId.split('.').slice(1); // strip first segment (synth prefix)
  let cur: unknown = config;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'number' ? cur : undefined;
}

/**
 * Build a shallow/nested config patch from a dot-path array.
 * e.g. ['delay', 'time'] → merges { delay: { ...existing, time: value } }
 */
function buildDotPatch(
  config: Record<string, unknown>,
  path: string[],
  value: number,
): Record<string, unknown> {
  if (path.length === 0) return config;
  if (path.length === 1) {
    return { ...config, [path[0]]: value };
  }
  const [head, ...tail] = path;
  const nested = (config[head] && typeof config[head] === 'object')
    ? (config[head] as Record<string, unknown>)
    : {};
  return { ...config, [head]: buildDotPatch(nested, tail, value) };
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _surface: KKDawSurface | null = null;

export function getKKDawSurface(): KKDawSurface {
  if (!_surface) _surface = new KKDawSurface();
  return _surface;
}
