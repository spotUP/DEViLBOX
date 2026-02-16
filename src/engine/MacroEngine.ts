/**
 * MacroEngine - Furnace-style macro interpreter for instruments
 * 
 * Based on Furnace's DivMacroInt (macroInt.cpp/h)
 * Handles sequence, ADSR, and LFO macros for volume, arpeggio, duty, wave, and more.
 * 
 * Reference: Reference Code/furnace-master/src/engine/macroInt.cpp
 */

import type { FurnaceMacro, InstrumentConfig } from '@/types/instrument';
import { FurnaceMacroType } from '@/types/instrument';

/**
 * Macro mode types
 */
export const MacroMode = {
  SEQUENCE: 0,  // Sequence mode (step through values)
  ADSR: 1,      // ADSR envelope mode
  LFO: 2,       // LFO oscillator mode
} as const;

export type MacroMode = typeof MacroMode[keyof typeof MacroMode];

/**
 * State for a single macro
 * Based on Furnace's DivMacroStruct
 */
export class MacroState {
  // Position tracking
  pos = 0;         // Current position in sequence
  lastPos = 0;     // Last position (used for ADSR state)
  lfoPos = 0;      // LFO phase position (0-1023)
  delay = 0;       // Delay counter (ticks)

  // Output
  val = 0;         // Current macro value

  // State flags
  has = false;     // Macro is active
  had = false;     // Macro had a value this tick
  actualHad = false; // Actual had state (for finished detection)
  finished = false; // Macro just finished
  will = false;    // Macro will be active
  linger = false;  // Linger after end (for volume macros)
  began = true;    // Macro just began
  masked = false;  // Macro is masked (disabled)
  activeRelease = false; // Release point is active

  // Type info
  mode: MacroMode = MacroMode.SEQUENCE;
  type = 0;        // Loop type (0=sequence, 1=ADSR, 2=LFO)
  macroType: number; // FurnaceMacroType value

  constructor(macroType: number) {
    this.macroType = macroType;
  }

  /**
   * Initialize/reset macro state
   */
  init(): void {
    this.pos = 0;
    this.lastPos = 0;
    this.lfoPos = 0;
    this.mode = MacroMode.SEQUENCE;
    this.type = 0;
    this.delay = 0;
    this.has = false;
    this.had = false;
    this.actualHad = false;
    this.will = false;
    this.linger = false;
    this.began = true;
    this.val = 0;
  }

  /**
   * Prepare macro from source
   * Based on Furnace's DivMacroStruct::prepare()
   */
  prepare(source: FurnaceMacro, volMacroLinger = false): void {
    this.has = true;
    this.had = true;
    this.actualHad = true;
    this.will = true;
    this.mode = source.mode as MacroMode;
    // Extract type from open bitfield: bits 1-2 = type (0=sequence, 1=ADSR, 2=LFO)
    const openVal = source.open ?? 0;
    this.type = (openVal >> 1) & 3;
    // Bit 3 = activeRelease
    this.activeRelease = (openVal & 8) !== 0;
    this.linger = (this.macroType === FurnaceMacroType.VOL && volMacroLinger);
    
    // Set LFO phase from macro data (phase is at index 13 in ADSR/LFO mode)
    if (this.mode === MacroMode.LFO && source.data.length > 13) {
      this.lfoPos = source.data[13] || 0;
    }
  }

  /**
   * Execute one tick of macro
   */
  doMacro(source: FurnaceMacro, released: boolean, tick: boolean): void {
    if (!tick) {
      this.had = false;
      return;
    }

    if (this.masked) {
      this.had = false;
      this.has = false;
      return;
    }

    // Handle release in ADSR mode
    if (released && this.type === 1 && this.lastPos < 3) {
      this.delay = 0;
    }

    // Jump to release point in sequence mode
    if (released && this.type === 0 && this.pos < source.release && 
        source.release < source.data.length && this.activeRelease) {
      this.delay = 0;
      this.pos = source.release;
    }

    // Handle delay
    if (this.delay > 0) {
      this.delay--;
      if (!this.linger) {
        this.had = false;
      }
      return;
    }

    // Set next delay
    if (this.began && (source.delay ?? 0) > 0) {
      this.delay = source.delay ?? 0;
    } else {
      this.delay = (source.speed ?? 1) - 1;
    }

    if (this.began) {
      this.began = false;
    }

    if (this.finished) {
      this.finished = false;
    }

    if (this.actualHad !== this.has) {
      this.finished = true;
    }

    this.actualHad = this.has;
    this.had = this.actualHad;

    if (!this.has) {
      return;
    }

    // Execute macro based on mode
    if (this.mode === MacroMode.SEQUENCE) {
      this.doSequence(source, released);
    } else if (this.mode === MacroMode.ADSR) {
      this.doADSR(source, released);
    } else if (this.mode === MacroMode.LFO) {
      this.doLFO(source);
    }
  }

  /**
   * Sequence mode: step through values
   */
  private doSequence(source: FurnaceMacro, released: boolean): void {
    this.lastPos = this.pos;
    this.val = source.data[this.pos++] ?? 0;

    // Handle loop point before release
    if (this.pos > source.release && !released) {
      if (source.loop < source.data.length && source.loop < source.release) {
        this.pos = source.loop;
      } else {
        this.pos--;
      }
    }

    // Handle end of sequence
    if (this.pos >= source.data.length) {
      if (source.loop < source.data.length && 
          (source.loop >= source.release || source.release >= source.data.length)) {
        this.pos = source.loop;
      } else if (this.linger) {
        this.pos--;
      } else {
        this.has = false;
      }
    }
  }

  /**
   * ADSR mode: envelope generator
   * 
   * Uses values from macro data:
   * [0] = low value
   * [1] = high value
   * [2] = attack rate
   * [3] = hold time
   * [4] = decay rate
   * [5] = sustain level
   * [6] = sustain time
   * [7] = sustain rate
   * [8] = release rate
   */
  private doADSR(source: FurnaceMacro, released: boolean): void {
    const ADSR_LOW = source.data[0] ?? 0;
    const ADSR_HIGH = source.data[1] ?? 255;
    const ADSR_AR = source.data[2] ?? 15;
    const ADSR_HT = source.data[3] ?? 0;
    const ADSR_DR = source.data[4] ?? 15;
    const ADSR_SL = source.data[5] ?? 127;
    const ADSR_ST = source.data[6] ?? 0;
    const ADSR_SR = source.data[7] ?? 0;
    const ADSR_RR = source.data[8] ?? 15;

    // Jump to release state if released
    if (released && this.lastPos < 3) {
      this.lastPos = 3;
    }

    switch (this.lastPos) {
      case 0: // Attack
        this.pos += ADSR_AR;
        if (this.pos > 255) {
          this.pos = 255;
          this.lastPos = 1;
          this.delay = ADSR_HT;
        }
        break;

      case 1: // Decay
        this.pos -= ADSR_DR;
        if (this.pos <= ADSR_SL) {
          this.pos = ADSR_SL;
          this.lastPos = 2;
          this.delay = ADSR_ST;
        }
        break;

      case 2: // Sustain
        this.pos -= ADSR_SR;
        if (this.pos < 0) {
          this.pos = 0;
          this.lastPos = 4;
        }
        break;

      case 3: // Release
        this.pos -= ADSR_RR;
        if (this.pos < 0) {
          this.pos = 0;
          this.lastPos = 4;
        }
        break;

      case 4: // End
        this.pos = 0;
        if (!this.linger) {
          this.has = false;
        }
        break;
    }

    // Scale position to output range
    if (ADSR_HIGH > ADSR_LOW) {
      this.val = ADSR_LOW + ((this.pos + (ADSR_HIGH - ADSR_LOW) * this.pos) >> 8);
    } else {
      this.val = ADSR_HIGH + (((255 - this.pos) + (ADSR_LOW - ADSR_HIGH) * (255 - this.pos)) >> 8);
    }
  }

  /**
   * LFO mode: oscillator
   * 
   * Uses values from macro data:
   * [0] = low value
   * [1] = high value
   * [11] = speed
   * [12] = waveform (0=tri, 1=saw, 2=pulse)
   * [13] = phase
   * [14] = loop (not used)
   * [15] = global (not used)
   */
  private doLFO(source: FurnaceMacro): void {
    const ADSR_LOW = source.data[0] ?? 0;
    const ADSR_HIGH = source.data[1] ?? 255;
    const LFO_SPEED = source.data[11] ?? 1;
    const LFO_WAVE = source.data[12] ?? 0;

    this.lfoPos += LFO_SPEED;
    this.lfoPos &= 1023; // Wrap to 0-1023

    let lfoOut = 0;
    switch (LFO_WAVE & 3) {
      case 0: // Triangle
        lfoOut = ((this.lfoPos & 512) ? (1023 - this.lfoPos) : this.lfoPos) >> 1;
        break;
      case 1: // Saw
        lfoOut = this.lfoPos >> 2;
        break;
      case 2: // Pulse
        lfoOut = (this.lfoPos & 512) ? 255 : 0;
        break;
    }

    // Scale LFO output to range
    if (ADSR_HIGH > ADSR_LOW) {
      this.val = ADSR_LOW + ((lfoOut + (ADSR_HIGH - ADSR_LOW) * lfoOut) >> 8);
    } else {
      this.val = ADSR_HIGH + (((255 - lfoOut) + (ADSR_LOW - ADSR_HIGH) * (255 - lfoOut)) >> 8);
    }
  }
}

/**
 * FM operator macro state container
 * Based on Furnace's DivMacroInt::IntOp
 * Contains 20 macro states per operator
 */
export class IntOp {
  am: MacroState;
  ar: MacroState;
  dr: MacroState;
  mult: MacroState;
  rr: MacroState;
  sl: MacroState;
  tl: MacroState;
  dt2: MacroState;
  rs: MacroState;
  dt: MacroState;
  d2r: MacroState;
  ssg: MacroState;
  dam: MacroState;
  dvb: MacroState;
  egt: MacroState;
  ksl: MacroState;
  sus: MacroState;
  vib: MacroState;
  ws: MacroState;
  ksr: MacroState;

  constructor(opIndex: number) {
    // Operator macros have base types offset by (opIndex << 5)
    // Furnace: opMacros[i].amMacro.macroType = DIV_MACRO_OP_AM + (i << 5)
    const offset = opIndex << 5;
    this.am = new MacroState(FurnaceMacroType.OP_AM + offset);
    this.ar = new MacroState(FurnaceMacroType.OP_AR + offset);
    this.dr = new MacroState(FurnaceMacroType.OP_DR + offset);
    this.mult = new MacroState(FurnaceMacroType.OP_MULT + offset);
    this.rr = new MacroState(FurnaceMacroType.OP_RR + offset);
    this.sl = new MacroState(FurnaceMacroType.OP_SL + offset);
    this.tl = new MacroState(FurnaceMacroType.OP_TL + offset);
    this.dt2 = new MacroState(FurnaceMacroType.OP_DT2 + offset);
    this.rs = new MacroState(FurnaceMacroType.OP_RS + offset);
    this.dt = new MacroState(FurnaceMacroType.OP_DT + offset);
    this.d2r = new MacroState(FurnaceMacroType.OP_D2R + offset);
    this.ssg = new MacroState(FurnaceMacroType.OP_SSG + offset);
    this.dam = new MacroState(FurnaceMacroType.OP_DAM + offset);
    this.dvb = new MacroState(FurnaceMacroType.OP_DVB + offset);
    this.egt = new MacroState(FurnaceMacroType.OP_EGT + offset);
    this.ksl = new MacroState(FurnaceMacroType.OP_KSL + offset);
    this.sus = new MacroState(FurnaceMacroType.OP_SUS + offset);
    this.vib = new MacroState(FurnaceMacroType.OP_VIB + offset);
    this.ws = new MacroState(FurnaceMacroType.OP_WS + offset);
    this.ksr = new MacroState(FurnaceMacroType.OP_KSR + offset);
  }

  /**
   * Initialize all operator macro states
   */
  init(): void {
    this.am.init();
    this.ar.init();
    this.dr.init();
    this.mult.init();
    this.rr.init();
    this.sl.init();
    this.tl.init();
    this.dt2.init();
    this.rs.init();
    this.dt.init();
    this.d2r.init();
    this.ssg.init();
    this.dam.init();
    this.dvb.init();
    this.egt.init();
    this.ksl.init();
    this.sus.init();
    this.vib.init();
    this.ws.init();
    this.ksr.init();
  }

  /**
   * Get macro state by base type (0-19)
   */
  getByBaseType(baseType: number): MacroState | null {
    switch (baseType) {
      case 0: return this.am;
      case 1: return this.ar;
      case 2: return this.dr;
      case 3: return this.mult;
      case 4: return this.rr;
      case 5: return this.sl;
      case 6: return this.tl;
      case 7: return this.dt2;
      case 8: return this.rs;
      case 9: return this.dt;
      case 10: return this.d2r;
      case 11: return this.ssg;
      case 12: return this.dam;
      case 13: return this.dvb;
      case 14: return this.egt;
      case 15: return this.ksl;
      case 16: return this.sus;
      case 17: return this.vib;
      case 18: return this.ws;
      case 19: return this.ksr;
      default: return null;
    }
  }
}

/**
 * Macro interpreter for an instrument
 * Based on Furnace's DivMacroInt
 */
export class MacroEngine {
  private ins: InstrumentConfig | null = null;
  private macroList: MacroState[] = [];
  private macroSource: FurnaceMacro[] = [];
  private subTick = 1;
  private released = false;

  // Common macros
  vol: MacroState;
  arp: MacroState;
  duty: MacroState;
  wave: MacroState;
  pitch: MacroState;
  ex1: MacroState;
  ex2: MacroState;
  ex3: MacroState;
  alg: MacroState;
  fb: MacroState;
  fms: MacroState;
  ams: MacroState;
  panL: MacroState;
  panR: MacroState;
  phaseReset: MacroState;
  ex4: MacroState;
  ex5: MacroState;
  ex6: MacroState;
  ex7: MacroState;
  ex8: MacroState;
  ex9: MacroState;
  ex10: MacroState;

  // FM operator macros (4 operators, each with 20 macro types)
  op: [IntOp, IntOp, IntOp, IntOp];

  // State
  hasRelease = false;
  tickMult = 1; // Sub-tick multiplier (for groove/swing)

  constructor() {
    this.vol = new MacroState(FurnaceMacroType.VOL);
    this.arp = new MacroState(FurnaceMacroType.ARP);
    this.duty = new MacroState(FurnaceMacroType.DUTY);
    this.wave = new MacroState(FurnaceMacroType.WAVE);
    this.pitch = new MacroState(FurnaceMacroType.PITCH);
    this.ex1 = new MacroState(FurnaceMacroType.EX1);
    this.ex2 = new MacroState(FurnaceMacroType.EX2);
    this.ex3 = new MacroState(FurnaceMacroType.EX3);
    this.alg = new MacroState(FurnaceMacroType.ALG);
    this.fb = new MacroState(FurnaceMacroType.FB);
    this.fms = new MacroState(FurnaceMacroType.FMS);
    this.ams = new MacroState(FurnaceMacroType.AMS);
    this.panL = new MacroState(FurnaceMacroType.PAN_L);
    this.panR = new MacroState(FurnaceMacroType.PAN_R);
    this.phaseReset = new MacroState(FurnaceMacroType.PHASE_RESET);
    this.ex4 = new MacroState(FurnaceMacroType.EX4);
    this.ex5 = new MacroState(FurnaceMacroType.EX5);
    this.ex6 = new MacroState(FurnaceMacroType.EX6);
    this.ex7 = new MacroState(FurnaceMacroType.EX7);
    this.ex8 = new MacroState(FurnaceMacroType.EX8);
    this.ex9 = new MacroState(FurnaceMacroType.EX9);
    this.ex10 = new MacroState(FurnaceMacroType.EX10);
    
    // Initialize 4 FM operator macro containers
    this.op = [
      new IntOp(0),
      new IntOp(1),
      new IntOp(2),
      new IntOp(3),
    ];
  }

  /**
   * Initialize macro engine with instrument
   */
  init(instrument: InstrumentConfig | null, volMacroLinger = false): void {
    this.ins = instrument;
    
    // Reset all common macros
    this.vol.init();
    this.arp.init();
    this.duty.init();
    this.wave.init();
    this.pitch.init();
    this.ex1.init();
    this.ex2.init();
    this.ex3.init();
    this.alg.init();
    this.fb.init();
    this.fms.init();
    this.ams.init();
    this.panL.init();
    this.panR.init();
    this.phaseReset.init();
    this.ex4.init();
    this.ex5.init();
    this.ex6.init();
    this.ex7.init();
    this.ex8.init();
    this.ex9.init();
    this.ex10.init();

    // Reset all operator macros
    for (let i = 0; i < 4; i++) {
      this.op[i].init();
    }

    this.macroList = [];
    this.macroSource = [];
    this.subTick = 1;
    this.hasRelease = false;
    this.released = false;

    if (!instrument || !instrument.furnace?.macros) {
      return;
    }

    const macros = instrument.furnace.macros;

    // Register all active macros from array (macros are indexed by type code)
    // NOTE: macro.code contains the macro type (VOL=0, ARP=1, etc.)
    // macro.type may contain word size flags, so we prefer .code
    for (const macro of macros) {
      if (!macro || !macro.data || macro.data.length === 0) continue;
      
      const macroType = macro.code ?? macro.type;
      const state = this.structByType(macroType);
      if (state) {
        this.addMacro(state, macro, volMacroLinger);
      }
    }

    // Check if any macro has a release point
    for (const macro of this.macroSource) {
      const openVal = macro.open ?? 0;
      // ADSR mode with release rate > 0
      if ((openVal & 6) === 2) {
        if ((macro.data[8] ?? 0) > 0) {
          this.hasRelease = true;
        }
      }
      // Sequence mode with release point
      else if (macro.release < macro.data.length) {
        this.hasRelease = true;
      }
    }
  }

  /**
   * Add a macro to the active list
   */
  private addMacro(state: MacroState, macro: FurnaceMacro | undefined, volMacroLinger: boolean): void {
    if (!macro || !macro.data || macro.data.length === 0) {
      return;
    }

    if (state.masked) {
      return;
    }

    state.prepare(macro, volMacroLinger);
    this.macroList.push(state);
    this.macroSource.push(macro);
  }

  /**
   * Trigger macro release
   */
  release(): void {
    this.released = true;
  }

  /**
   * Mask/unmask a macro by type
   */
  mask(macroType: number, enabled: boolean): void {
    const state = this.structByType(macroType);
    if (state) {
      state.masked = enabled;
    }
  }

  /**
   * Restart a macro by type
   */
  restart(macroType: number): void {
    const state = this.structByType(macroType);
    if (!state || !this.ins) {
      return;
    }

    const macro = this.getMacroByType(macroType);
    if (!macro || macro.data.length === 0 || state.masked) {
      return;
    }

    state.init();
    state.prepare(macro, false);
  }

  /**
   * Get macro state by type
   * Based on Furnace's DivMacroInt::structByType()
   */
  private structByType(type: number): MacroState | null {
    // Check for operator macros (type >= 0x20)
    // Furnace: type >= 0x20 means operator macro
    // Operator index: ((type >> 5) - 1) & 3
    // Base macro type: type & 0x1f
    if (type >= 0x20) {
      const opIndex = ((type >> 5) - 1) & 3;
      const baseType = type & 0x1f;
      return this.op[opIndex].getByBaseType(baseType);
    }

    // Common macros (type 0-21)
    switch (type) {
      case FurnaceMacroType.VOL: return this.vol;
      case FurnaceMacroType.ARP: return this.arp;
      case FurnaceMacroType.DUTY: return this.duty;
      case FurnaceMacroType.WAVE: return this.wave;
      case FurnaceMacroType.PITCH: return this.pitch;
      case FurnaceMacroType.EX1: return this.ex1;
      case FurnaceMacroType.EX2: return this.ex2;
      case FurnaceMacroType.EX3: return this.ex3;
      case FurnaceMacroType.ALG: return this.alg;
      case FurnaceMacroType.FB: return this.fb;
      case FurnaceMacroType.FMS: return this.fms;
      case FurnaceMacroType.AMS: return this.ams;
      case FurnaceMacroType.PAN_L: return this.panL;
      case FurnaceMacroType.PAN_R: return this.panR;
      case FurnaceMacroType.PHASE_RESET: return this.phaseReset;
      case FurnaceMacroType.EX4: return this.ex4;
      case FurnaceMacroType.EX5: return this.ex5;
      case FurnaceMacroType.EX6: return this.ex6;
      case FurnaceMacroType.EX7: return this.ex7;
      case FurnaceMacroType.EX8: return this.ex8;
      case FurnaceMacroType.EX9: return this.ex9;
      case FurnaceMacroType.EX10: return this.ex10;
      default: return null;
    }
  }

  /**
   * Get macro source by type
   */
  private getMacroByType(type: number): FurnaceMacro | null {
    if (!this.ins?.furnace?.macros) {
      return null;
    }

    const macros = this.ins.furnace.macros;
    
    // Find macro by type code in array
    // NOTE: macro.code contains the macro type, macro.type may contain word size flags
    return macros.find(m => (m.code ?? m.type) === type) ?? null;
  }

  /**
   * Tick all macros
   */
  next(): void {
    if (!this.ins) {
      return;
    }

    this.subTick--;

    // Execute all macros when subtick reaches 0
    for (let i = 0; i < this.macroList.length; i++) {
      this.macroList[i].doMacro(this.macroSource[i], this.released, this.subTick === 0);
    }

    // Reset subtick counter
    if (this.subTick <= 0) {
      this.subTick = this.tickMult;
    }
  }

  /**
   * Check if any macro is active
   */
  hasActiveMacros(): boolean {
    return this.macroList.some(m => m.has);
  }

  /**
   * Set macro speed multiplier (0xF7 effect)
   */
  setSpeed(speed: number): void {
    this.tickMult = Math.max(1, speed);
    this.subTick = this.tickMult;
  }

  /**
   * Set macro delay (0xF7 effect)
   */
  setDelay(delay: number): void {
    // Apply delay to all active macros
    for (const macro of this.macroList) {
      macro.delay = delay;
    }
  }
}
