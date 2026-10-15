/**
 * setBfree programme files (`.pgm`): `<number> { name="...", drawbars="888 0000 000", perc=on, ... }`.
 * Grammar and tokenizer: third-party/setBfree/src/pgmParser.c (tokens `{ } = ,`, `#` comments, quoted strings with `\` escapes,
 * bare words of alnum `- . _ +`). Property names and value words: third-party/setBfree/src/program.c propertySymbols[] /
 * bindToProgram(). Sample files: third-party/setBfree/pgm/{default,popular}.pgm.
 *
 * Programme semantics kept: a property that a programme does not mention keeps its value (so config holds only what the
 * file sets), consecutive definitions with the same number merge, a later definition of an earlier number replaces it.
 * Deliberate difference from upstream: an unknown property or bad value is a warning, not an abort of the whole file.
 *
 * Config shape: { setbfree: SetBfreeConfig } (src/engine/setbfree/SetBfreeSynth.ts; value meanings per that interface and
 * the setbfree layout toggles: percVolume 0 normal / 1 soft, percDecay 0 slow / 1 fast, percHarmonic 0 second / 1 third,
 * leslieSpeed 0 stop / 1 slow / 2 fast, vibratoType 0..6 = off, V1, C1, V2, C2, V3, C3). No `native.values` is built: the
 * config indices (SetBfreeParam, 53) and the WASM bridge enum (setbfree-wasm/common/setbfree_bridge.c, 44) differ.
 * `.cfg` engine configuration files are not patches (oscillator tables, MIDI maps) and are not handled.
 */
import { ParseError, bytesToText, clampReported, extensionOf, textToBytes, type ParsedPreset } from '../types';

const FORMAT = 'setBfree programme';
const MAX_PROGRAMS = 128;

const DRAWBAR_KEYS = ['16', '513', '8', '4', '223', '2', '135', '113', '1'] as const;
type Manual = 'upper' | 'lower' | 'pedal';

type Tok = { t: '{' | '}' | '=' | ',' | 'str'; v: string; line: number };

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let line = 1;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '#') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '{' || c === '}' || c === '=' || c === ',') { out.push({ t: c, v: c, line }); i++; continue; }
    if (c === '"') {
      let s = '';
      i++;
      for (;;) {
        if (i >= n) throw new ParseError(FORMAT, `end of file in quoted string (line ${line})`);
        const d = text[i++];
        if (d === '"') break;
        if (d === '\\') { s += text[i++] ?? ''; continue; }
        if (d === '\n') line++;
        s += d;
      }
      out.push({ t: 'str', v: s, line });
      continue;
    }
    if (/[A-Za-z0-9\-._+]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9\-._+]/.test(text[j])) j++;
      out.push({ t: 'str', v: text.slice(i, j), line });
      i = j;
      continue;
    }
    throw new ParseError(FORMAT, `unexpected character "${c}" on line ${line}`);
  }
  return out;
}

const on = (v: string): boolean | null => {
  const s = v.toLowerCase();
  if (['on', 'yes', 'true', 'enabled'].includes(s)) return true;
  if (['off', 'no', 'none', 'false', 'disabled'].includes(s)) return false;
  const k = parseInt(v, 10);
  return Number.isNaN(k) ? null : k !== 0;
};

function registration(v: string): number[] | null {
  const digits: number[] = [];
  for (const ch of v) {
    if (/[\s\-_]/.test(ch)) continue;
    if (ch < '0' || ch > '8') return null;
    digits.push(ch.charCodeAt(0) - 48);
    if (digits.length === 9) break;
  }
  return digits.length === 9 ? digits : null;
}

interface Pending { number: number; name?: string; cfg: Record<string, number>; warnings: string[] }

function bind(p: Pending, sym: string, val: string): void {
  const s = sym.toLowerCase();
  const v = val.toLowerCase();
  const bad = () => p.warnings.push(`${sym}=${val}: unrecognized value ignored`);
  const drawbars = (manual: Manual): void => {
    if (v === 'random') { p.warnings.push(`${sym}=random: not representable, ignored`); return; }
    const d = registration(val);
    if (!d) { bad(); return; }
    DRAWBAR_KEYS.forEach((k, i) => { p.cfg[`${manual}${k}`] = d[i]; });
  };
  switch (s) {
    case 'name': p.name = val; break;
    case 'drawbars': case 'drawbarsupper': drawbars('upper'); break;
    case 'drawbarslower': drawbars('lower'); break;
    case 'drawbarspedals': drawbars('pedal'); break;
    case 'vibrato': case 'vibratoknob': {
      const idx = ['v1', 'c1', 'v2', 'c2', 'v3', 'c3'].indexOf(v);
      if (idx < 0) bad(); else p.cfg.vibratoType = idx + 1;
      break;
    }
    case 'vibratoupper': case 'vibratolower': {
      const b = on(val);
      if (b === null) bad(); else p.cfg[s === 'vibratoupper' ? 'vibratoUpper' : 'vibratoLower'] = b ? 1 : 0;
      break;
    }
    case 'perc': { const b = on(val); if (b === null) bad(); else p.cfg.percEnable = b ? 1 : 0; break; }
    case 'percvol':
      if (['normal', 'high', 'hi'].includes(v)) p.cfg.percVolume = 0;
      else if (['soft', 'low', 'lo'].includes(v)) p.cfg.percVolume = 1;
      else bad();
      break;
    case 'percspeed':
      if (['fast', 'high', 'hi'].includes(v)) p.cfg.percDecay = 1;
      else if (['slow', 'low', 'lo'].includes(v)) p.cfg.percDecay = 0;
      else bad();
      break;
    case 'percharm':
      if (['second', '2nd', 'low', 'lo'].includes(v)) p.cfg.percHarmonic = 0;
      else if (['third', '3rd', 'high', 'hi'].includes(v)) p.cfg.percHarmonic = 1;
      else bad();
      break;
    case 'overdrive': { const b = on(val); if (b === null) bad(); else p.cfg.overdriveEnable = b ? 1 : 0; break; }
    case 'rotaryspeed':
      if (['tremolo', 'fast', 'high', 'hi'].includes(v)) p.cfg.leslieSpeed = 2;
      else if (['chorale', 'slow', 'low', 'lo'].includes(v)) p.cfg.leslieSpeed = 1;
      else if (['stop', 'zero', 'break', 'stopped'].includes(v)) p.cfg.leslieSpeed = 0;
      else bad();
      break;
    case 'reverbmix': {
      const f = parseFloat(val);
      if (Number.isNaN(f)) bad();
      else {
        const c = clampReported('reverbmix', f, 0, 1, p.warnings);
        if (c !== null) p.cfg.reverbMix = c;
      }
      break;
    }
    case 'attackenv': case 'attacklvl': case 'attackdur': case 'rotary': case 'keysplitlower': case 'keysplitpedals':
    case 'trssplitpedals': case 'trssplitlower': case 'trssplitupper': case 'transpose': case 'transposeupper':
    case 'transposelower': case 'transposepedals':
      p.warnings.push(`${sym}: valid setBfree property with no counterpart in the app config, not imported`);
      break;
    default:
      p.warnings.push(`${sym}: unknown setBfree property ignored`);
  }
}

export function sniff(bytes: Uint8Array, fileName: string): boolean {
  if (extensionOf(fileName) === '.pgm') return true;
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 8192));
  const code = head.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  return /^\s*\d+\s*\{[^}]*\b(name|drawbars\w*)\s*=/m.test(code);
}

export function parse(bytes: Uint8Array, fileName: string): ParsedPreset[] {
  void fileName;
  const toks = tokenize(bytesToText(bytes, FORMAT));
  let i = 0;
  const defs: Pending[] = [];
  let previous = -1;

  while (i < toks.length) {
    const num = toks[i];
    if (num.t !== 'str' || !/^[-+]?\d+$/.test(num.v)) throw new ParseError(FORMAT, `program number expected on line ${num.line}`);
    const number = parseInt(num.v, 10);
    if (number < 0 || number >= MAX_PROGRAMS) throw new ParseError(FORMAT, `program number ${number} out of range 0..${MAX_PROGRAMS - 1} (line ${num.line})`);
    if (toks[++i]?.t !== '{') throw new ParseError(FORMAT, `"{" expected after program ${number} (line ${num.line})`);
    i++;
    let target: Pending;
    if (number === previous && defs.length > 0) target = defs[defs.length - 1]; // consecutive same number merges
    else {
      const existing = defs.findIndex((d) => d.number === number);
      if (existing >= 0) defs.splice(existing, 1); // a later definition replaces an earlier one
      target = { number, cfg: {}, warnings: [] };
      defs.push(target);
    }
    previous = number;
    while (toks[i]?.t !== '}') {
      const sym = toks[i];
      if (!sym) throw new ParseError(FORMAT, `"}" missing at end of file (program ${number})`);
      if (sym.t !== 'str') throw new ParseError(FORMAT, `identifier expected on line ${sym.line}`);
      if (toks[i + 1]?.t !== '=') throw new ParseError(FORMAT, `"=" expected after "${sym.v}" on line ${sym.line}`);
      const val = toks[i + 2];
      if (!val || val.t !== 'str') throw new ParseError(FORMAT, `value expected after "${sym.v}=" on line ${sym.line}`);
      bind(target, sym.v, val.v);
      i += 3;
      if (toks[i]?.t === ',') i++;
    }
    i++; // '}'
  }
  if (defs.length === 0) throw new ParseError(FORMAT, 'no programs in file');
  return defs.map((d) => ({
    name: d.name || `Program ${d.number}`,
    synthType: 'SetBfree',
    config: { setbfree: d.cfg },
    warnings: d.warnings,
  }));
}

const VIBRATO_WORDS = ['', 'v1', 'c1', 'v2', 'c2', 'v3', 'c3'];

/** One programme (numbered 1) from a config; use serializeBank for several. */
export function serialize(config: Record<string, unknown>, name = 'Init'): Uint8Array {
  return serializeBank([{ name, config }]);
}

export function serializeBank(presets: ReadonlyArray<{ name: string; config: Record<string, unknown> }>): Uint8Array {
  const lines: string[] = [];
  presets.forEach((p, idx) => {
    const c = (p.config.setbfree ?? {}) as Record<string, number>;
    const props: string[] = [`name="${p.name.replace(/(["\\])/g, '\\$1')}"`];
    for (const [word, manual] of [['drawbarsupper', 'upper'], ['drawbarslower', 'lower'], ['drawbarspedals', 'pedal']] as const) {
      const d = DRAWBAR_KEYS.map((k) => c[`${manual}${k}`]);
      if (d.every((x) => typeof x === 'number')) props.push(`${word}=${d.join('')}`);
    }
    if (typeof c.vibratoType === 'number' && c.vibratoType >= 1 && c.vibratoType <= 6) props.push(`vibrato=${VIBRATO_WORDS[c.vibratoType]}`);
    if (typeof c.vibratoUpper === 'number') props.push(`vibratoupper=${c.vibratoUpper ? 'on' : 'off'}`);
    if (typeof c.vibratoLower === 'number') props.push(`vibratolower=${c.vibratoLower ? 'on' : 'off'}`);
    if (typeof c.percEnable === 'number') props.push(`perc=${c.percEnable ? 'on' : 'off'}`);
    if (typeof c.percVolume === 'number') props.push(`percvol=${c.percVolume ? 'soft' : 'normal'}`);
    if (typeof c.percDecay === 'number') props.push(`percspeed=${c.percDecay ? 'fast' : 'slow'}`);
    if (typeof c.percHarmonic === 'number') props.push(`percharm=${c.percHarmonic ? '3rd' : '2nd'}`);
    if (typeof c.overdriveEnable === 'number') props.push(`overdrive=${c.overdriveEnable ? 'on' : 'off'}`);
    if (typeof c.leslieSpeed === 'number') props.push(`rotaryspeed=${['stopped', 'chorale', 'tremolo'][Math.max(0, Math.min(2, c.leslieSpeed))]}`);
    if (typeof c.reverbMix === 'number') props.push(`reverbmix=${c.reverbMix}`);
    lines.push(`${idx + 1} { ${props.join(', ')} }`);
  });
  return textToBytes(lines.join('\n') + '\n');
}
