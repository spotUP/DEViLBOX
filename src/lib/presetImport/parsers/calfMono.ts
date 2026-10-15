/**
 * Calf Monosynth presets from a Calf `presets.xml` (or a user preset file of the same shape):
 *   <presets><preset plugin="monosynth" name="..."><param name="o1_wave" value="0"/> ... </preset> ...</presets>
 * Format and the 77 shipped entries: third-party/calf-studio-gear/presets.xml. Only plugin="monosynth" entries are taken
 * (the others belong to other Calf plugins and are counted in a warning). Parameter names, order and ranges:
 * metadata.cpp CALF_PORT_PROPS(monosynth) (tables/calfMonoParams.ts, generated). Names are matched case-insensitively
 * because the shipped file writes `Filter` for the `filter` port.
 *
 * Config shape: { calfMono: CalfMonoConfig } (every parameter the file sets), plus `native.values` = all 52 parameters in
 * engine index order with upstream defaults for the ones the file leaves out, for the NativePatch route.
 */
import { CALF_MONO_PARAMS } from '../tables/calfMonoParams';
import { childrenNamed, escapeXml, parseXml } from '../xml';
import { ParseError, bytesToText, clampReported, textToBytes, type ParsedPreset } from '../types';

const FORMAT = 'Calf presets';
const BY_NAME = new Map(CALF_MONO_PARAMS.map((p, i) => [p[0].toLowerCase(), i]));

export function sniff(bytes: Uint8Array, _fileName: string): boolean {
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 2048));
  return /<presets\b/.test(head) && /<preset\b[^>]*\bplugin\s*=/.test(head);
}

export function parse(bytes: Uint8Array, _fileName: string): ParsedPreset[] {
  const root = parseXml(bytesToText(bytes, FORMAT), FORMAT);
  if (root.name !== 'presets') throw new ParseError(FORMAT, `root element is <${root.name}>, expected <presets>`);

  const out: ParsedPreset[] = [];
  let otherPlugins = 0;
  for (const el of childrenNamed(root, 'preset')) {
    if (el.attrs.plugin !== 'monosynth') {
      otherPlugins++;
      continue;
    }
    const warnings: string[] = [];
    const calfMono: Record<string, number> = {};
    const values = CALF_MONO_PARAMS.map((p) => p[4]);
    let set = 0;
    for (const prm of childrenNamed(el, 'param')) {
      const pname = prm.attrs.name ?? '';
      const idx = BY_NAME.get(pname.toLowerCase());
      if (idx === undefined) {
        warnings.push(`${pname}: unknown Calf Monosynth parameter ignored`);
        continue;
      }
      const [upstream, type, min, max, , key] = CALF_MONO_PARAMS[idx];
      const raw = Number(prm.attrs.value);
      if (prm.attrs.value === undefined || prm.attrs.value.trim() === '' || Number.isNaN(raw)) {
        warnings.push(`${upstream}: "${prm.attrs.value ?? ''}" is not a number, ignored`);
        continue;
      }
      let v = clampReported(upstream, raw, min, max, warnings);
      if (v === null) continue;
      if (type !== 'float') v = Math.round(v);
      calfMono[key] = v;
      values[idx] = v;
      set++;
    }
    for (const other of el.children) {
      if (other.name !== 'param') warnings.push(`<${other.name}> element not imported`);
    }
    if (set === 0) {
      warnings.push('preset has no usable parameters, skipped');
      continue;
    }
    out.push({
      name: el.attrs.name || `Monosynth ${out.length + 1}`,
      synthType: 'CalfMono',
      config: { calfMono },
      native: { values },
      warnings,
    });
  }
  if (out.length === 0) throw new ParseError(FORMAT, 'no plugin="monosynth" presets in file');
  if (otherPlugins > 0) out[0].warnings.push(`${otherPlugins} preset(s) for other Calf plugins skipped`);
  return out;
}

export function serialize(config: Record<string, unknown>, name = 'Init'): Uint8Array {
  return serializeBank([{ name, config }]);
}

export function serializeBank(presets: ReadonlyArray<{ name: string; config: Record<string, unknown> }>): Uint8Array {
  const lines = ['<presets>'];
  for (const p of presets) {
    const cfg = (p.config.calfMono ?? {}) as Record<string, number>;
    lines.push(`<preset plugin="monosynth" name="${escapeXml(p.name)}">`);
    for (const [upstream, , , , , key] of CALF_MONO_PARAMS) {
      const v = cfg[key];
      if (typeof v === 'number' && Number.isFinite(v)) lines.push(`  <param name="${upstream}" value="${v}" />`);
    }
    lines.push('</preset>');
  }
  lines.push('</presets>');
  return textToBytes(lines.join('\n') + '\n');
}
