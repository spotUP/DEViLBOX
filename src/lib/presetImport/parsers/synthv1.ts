/**
 * synthv1 `.synthv1` preset (XML): <preset name version><params><param index name>value</param>...</params><tuning/></preset>.
 * Format: third-party/synthv1/src/synthv1_param.cpp loadPreset / savePreset (a param is found by `name` when present,
 * else by `index`; values go through paramSafeValue: bool -> 0/1, clamp to [min,max], int -> rounded).
 * Parameter table: synthv1_params[] (tables/synthv1Params.ts, generated).
 *
 * Config shape: { synthv1: Partial<SynthV1Config> } for the parameters the app config exposes (the app config is a subset:
 * it has no bandlimit/enabled/rate/sweep/out/def/dyn/key parameters), plus `native.values` = all 145 upstream parameters in
 * ParamIndex order (defaults for the ones the file omits), which the NativePatch route (`loadPatch`) takes whole.
 * The <tuning> block (scale/keymap files) has no representation and is reported.
 */
import { SYNTHV1_PARAMS } from '../tables/synthv1Params';
import { escapeXml, firstChild, parseXml, childrenNamed } from '../xml';
import { ParseError, baseNameOf, bytesToText, clampReported, textToBytes, type ParsedPreset } from '../types';

const FORMAT = 'synthv1 preset';
const BY_NAME = new Map(SYNTHV1_PARAMS.map((p, i) => [p[0], i]));

export function sniff(bytes: Uint8Array, _fileName: string): boolean {
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 512));
  return /<preset\b/.test(head) && /<params\b|<!DOCTYPE\s+synthv1/i.test(new TextDecoder('utf-8').decode(bytes.subarray(0, 4096)));
}

export function parse(bytes: Uint8Array, fileName: string): ParsedPreset[] {
  const root = parseXml(bytesToText(bytes, FORMAT), FORMAT);
  if (root.name !== 'preset') throw new ParseError(FORMAT, `root element is <${root.name}>, expected <preset>`);
  const params = firstChild(root, 'params');
  if (!params) throw new ParseError(FORMAT, 'no <params> element');

  const warnings: string[] = [];
  const values = SYNTHV1_PARAMS.map((p) => p[2]);
  const seen = new Set<number>();
  for (const el of childrenNamed(params, 'param')) {
    const name = el.attrs.name ?? '';
    let idx: number;
    if (name) {
      const found = BY_NAME.get(name);
      if (found === undefined) {
        warnings.push(`${name}: unknown synthv1 parameter ignored`);
        continue;
      }
      idx = found;
    } else {
      idx = Number(el.attrs.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= SYNTHV1_PARAMS.length) {
        warnings.push(`param index "${el.attrs.index}" out of range, ignored`);
        continue;
      }
    }
    const [pname, type, , min, max] = SYNTHV1_PARAMS[idx];
    const raw = Number(el.text.trim());
    if (el.text.trim() === '' || Number.isNaN(raw)) {
      warnings.push(`${pname}: "${el.text.trim()}" is not a number, ignored`);
      continue;
    }
    let v: number | null;
    if (type === 'bool') v = raw > 0.5 ? 1 : 0; // paramSafeValue
    else {
      v = clampReported(pname, raw, min, max, warnings);
      if (v !== null && type === 'int') v = Math.round(v);
    }
    if (v === null) continue;
    values[idx] = v;
    seen.add(idx);
  }
  if (seen.size === 0) throw new ParseError(FORMAT, 'no usable <param> entries');
  if (firstChild(root, 'tuning')) warnings.push('<tuning> block (scale/keymap) not imported');

  const synthv1: Record<string, number> = {};
  SYNTHV1_PARAMS.forEach((p, i) => {
    if (p[5] && seen.has(i)) synthv1[p[5]] = values[i];
  });
  const unexposed = [...seen].filter((i) => !SYNTHV1_PARAMS[i][5]).length;
  if (unexposed) warnings.push(`${unexposed} parameter(s) have no app config key; they are only in native.values`);

  const name = root.attrs.name || baseNameOf(fileName);
  return [{ name, synthType: 'SynthV1', config: { synthv1 }, native: { values }, warnings }];
}

/** Writes the full upstream parameter list; from `native.values` when given, else config.synthv1 over defaults. */
export function serialize(config: Record<string, unknown>, name = 'Init', native?: { values: number[] }): Uint8Array {
  const cfg = (config.synthv1 ?? {}) as Record<string, number>;
  const rows = SYNTHV1_PARAMS.map((p, i) => {
    const v = native?.values[i] ?? (p[5] && typeof cfg[p[5]] === 'number' ? cfg[p[5]] : p[2]);
    return `    <param index="${i}" name="${p[0]}">${v}</param>`;
  });
  return textToBytes(`<!DOCTYPE synthv1>\n<preset name="${escapeXml(name)}" version="0.9.0">\n  <params>\n${rows.join('\n')}\n  </params>\n</preset>\n`);
}
