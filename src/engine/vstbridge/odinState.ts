/**
 * Reader for the Odin2 .odin preset format: a JUCE ValueTree::writeToStream blob (root "Odin").
 * Browser and node safe. The synth restores the file itself (the 'loadPreset' command); this reader
 * only mirrors values into the UI and feeds the preset tools.
 */
export interface OdinTree { type: string; props: Record<string, unknown>; children: OdinTree[] }

export function parseOdinState(buf: Uint8Array): OdinTree {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const dec = new TextDecoder();
  let p = 0;
  const str = (): string => { let e = p; while (buf[e] !== 0) e++; const s = dec.decode(buf.subarray(p, e)); p = e + 1; return s; };
  const cint = (): number => { const b = buf[p++]; const n = b & 0x7f; let v = 0; for (let i = 0; i < n; i++) v |= buf[p++] << (8 * i); return (b & 0x80) ? -v : v; };
  const vr = (): unknown => {
    const size = cint(); if (size === 0) return undefined;
    const t = buf[p++]; const end = p + size - 1; let v: unknown;
    if (t === 1) v = dv.getInt32(p, true);
    else if (t === 4) v = dv.getFloat64(p, true);
    else if (t === 5) v = dec.decode(buf.subarray(p, end - 1));
    else if (t === 2) v = true;
    else if (t === 3) v = false;
    else v = undefined;
    p = end; return v;
  };
  const tree = (): OdinTree => {
    const type = str(); const np = cint(); const props: Record<string, unknown> = {};
    for (let i = 0; i < np; i++) { const k = str(); props[k] = vr(); }
    const nc = cint(); const children: OdinTree[] = [];
    for (let i = 0; i < nc; i++) children.push(tree());
    return { type, props, children };
  };
  return tree();
}

export interface OdinPresetValues {
  /** APVTS parameter values by engine parameter name (raw plugin units). */
  params: Record<string, number>;
  /** ValueTree selectors by "<tree>.<property>" (osc.osc1_type, misc.fil1_type, ...). */
  selectors: Record<string, number>;
  patchName: string | undefined;
}

/** Numeric ValueTree children whose properties are selectors (type and wave pickers). */
const SELECTOR_TREES = ['osc', 'misc'];

export function odinPresetValues(bytes: Uint8Array): OdinPresetValues {
  const root = parseOdinState(bytes);
  const params: Record<string, number> = {};
  const selectors: Record<string, number> = {};
  let patchName: string | undefined;
  for (const c of root.children) {
    if (c.type === 'PARAM') {
      if (typeof c.props.id === 'string' && typeof c.props.value === 'number') params[c.props.id] = c.props.value;
    } else if (SELECTOR_TREES.includes(c.type)) {
      for (const [k, v] of Object.entries(c.props)) {
        if (typeof v === 'number') selectors[`${c.type}.${k}`] = v;
        else if (c.type === 'misc' && k === 'patch_name' && typeof v === 'string') patchName = v;
      }
    }
  }
  return { params, selectors, patchName };
}
