/**
 * GmParameterMap — Loads gearmulator parameterDescriptions JSON and provides
 * lookup from param name → page:index for sysex construction.
 */

export interface GmParamDescriptor {
  page: number;
  index: number;
  name: string;
  min: number;
  max: number;
  isPublic: boolean;
  isDiscrete: boolean;
  isBool: boolean;
  isBipolar?: boolean;
  toText?: string;
  class?: string;
}

export interface GmMidiPacketDef {
  name: string;
  bytes: GmMidiPacketByte[];
}

export interface GmMidiPacketByte {
  type: 'byte' | 'param' | 'checksum' | 'nibbleLo' | 'nibbleHi' | 'part' | 'bank' | 'program';
  value?: number;
  name?: string;
  mask?: number;
  shift?: number;
  shiftL?: number;
  part?: string;
}

export interface GmValueList {
  [key: string]: string[];
}

let cachedMap: GmParameterMap | null = null;

export class GmParameterMap {
  readonly params: GmParamDescriptor[];
  readonly byName: Map<string, GmParamDescriptor>;
  readonly byPageIndex: Map<string, GmParamDescriptor>;
  readonly midiPackets: Record<string, GmMidiPacketByte[]>;
  readonly valueLists: GmValueList;

  private constructor(
    params: GmParamDescriptor[],
    midiPackets: Record<string, GmMidiPacketByte[]>,
    valueLists: GmValueList
  ) {
    this.params = params;
    this.midiPackets = midiPackets;
    this.valueLists = valueLists;
    this.byName = new Map();
    this.byPageIndex = new Map();
    for (const p of params) {
      this.byName.set(p.name, p);
      this.byPageIndex.set(`${p.page}:${p.index}`, p);
    }
  }

  /** Get param descriptor by name (as used in RML `param="..."` attributes) */
  get(name: string): GmParamDescriptor | undefined {
    return this.byName.get(name);
  }

  /** Build a sysex parameter change message */
  buildParamChange(paramName: string, value: number, part: number = 0): Uint8Array | null {
    const param = this.byName.get(paramName);
    if (!param) return null;

    const packet = this.midiPackets['parameterchange'];
    if (!packet) return null;

    const bytes: number[] = [];
    for (const def of packet) {
      switch (def.type) {
        case 'byte':
          bytes.push(def.value ?? 0);
          break;
        case 'param':
          if (def.name === 'Page') bytes.push(param.page & 0x7f);
          else if (def.name === 'ParameterIndex') bytes.push(param.index & 0x7f);
          else if (def.name === 'ParameterValue') bytes.push(value & 0x7f);
          else bytes.push(0);
          break;
        case 'part':
          bytes.push(part & 0x0f);
          break;
        case 'checksum':
          // Virus sysex checksum: sum of all data bytes mod 128
          bytes.push(bytes.reduce((a, b) => a + b, 0) & 0x7f);
          break;
        default:
          bytes.push(0);
      }
    }
    return new Uint8Array(bytes);
  }

  /** Normalize a raw param value (min..max) to 0..1 */
  normalize(paramName: string, value: number): number {
    const p = this.byName.get(paramName);
    if (!p) return 0;
    return (value - p.min) / (p.max - p.min);
  }

  /** Denormalize 0..1 to raw param value (min..max) */
  denormalize(paramName: string, normalized: number): number {
    const p = this.byName.get(paramName);
    if (!p) return 0;
    return Math.round(p.min + normalized * (p.max - p.min));
  }

  static async load(url = '/gearmulator/skins/parameterDescriptions_C.json'): Promise<GmParameterMap> {
    if (cachedMap) return cachedMap;

    const resp = await fetch(url);
    let text = await resp.text();
    // Strip single-line comments and trailing commas (JSON with comments)
    text = text.replace(/\/\/.*$/gm, '');
    text = text.replace(/,\s*([}\]])/g, '$1');
    const data = JSON.parse(text);

    const defaults = data.parameterdescriptiondefaults ?? {};
    const params: GmParamDescriptor[] = (data.parameterdescriptions ?? []).map(
      (p: Record<string, unknown>) => ({ ...defaults, ...p })
    );

    const midiPackets: Record<string, GmMidiPacketByte[]> = {};
    if (data.midipackets) {
      for (const [name, def] of Object.entries(data.midipackets)) {
        midiPackets[name] = def as GmMidiPacketByte[];
      }
    }

    const valueLists: GmValueList = data.valuelists ?? {};

    cachedMap = new GmParameterMap(params, midiPackets, valueLists);
    return cachedMap;
  }
}
