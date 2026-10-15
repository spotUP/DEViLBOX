/**
 * ZynAddSubFX instrument (`.xiz`) and master (`.xmz`) files: gzip-compressed XML (plain `.xml` also accepted).
 * The upstream Zyn sources are NOT vendored under third-party/; the structure used here was read from the 20 shipped
 * public/zynaddsubfx/presets/*.xml (root `<ZynAddSubFX-data version-major version-minor>`, `<BASE_PARAMETERS>`, then
 * `<INSTRUMENT>` with `<INFO><string name="name">`). The `.xmz` master layout (parts holding `<INSTRUMENT>` elements) could not be
 * checked against a real file or the Zyn source: instruments are found by searching the tree for `<INSTRUMENT>`, and each
 * becomes one preset. Treat `.xmz` support as UNVERIFIED.
 *
 * Config shape: the WASM engine takes the native XML (ZynAddSubFXSynth loadPresetXML posts the XML text as UTF-8 bytes), and the
 * app's flat ZynAddSubFXConfig (about 70 simplified parameters) does not correspond to Zyn's own parameter set, so nothing is
 * translated: config = { zynaddsubfxXml: <complete .xiz-style XML document> }. The engine side must accept that string
 * (today it accepts only a bundled preset name via `zynaddsubfxXmlPreset`).
 */
import { gunzip, gzipStored, isGzip } from '../gzip';
import { firstChild, parseXml, xmlToString, type XmlElement } from '../xml';
import { ParseError, baseNameOf, bytesToText, extensionOf, textToBytes, type ParsedPreset } from '../types';

const FORMAT = 'ZynAddSubFX file';

export function sniff(bytes: Uint8Array, fileName: string): boolean {
  const ext = extensionOf(fileName);
  if (isGzip(bytes)) return ext === '.xiz' || ext === '.xmz' || ext === '.xsz' || ext === '.xlz' || ext === '.gz';
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 600));
  return head.includes('ZynAddSubFX-data');
}

function findInstruments(el: XmlElement, out: XmlElement[]): void {
  if (el.name === 'INSTRUMENT') {
    out.push(el);
    return;
  }
  for (const c of el.children) findInstruments(c, out);
}

function instrumentName(inst: XmlElement): string {
  const info = firstChild(inst, 'INFO');
  const s = info?.children.find((c) => c.name === 'string' && c.attrs.name === 'name');
  return s?.text.trim() ?? '';
}

export function parse(bytes: Uint8Array, fileName: string): ParsedPreset[] {
  const raw = isGzip(bytes) ? gunzip(bytes, FORMAT) : bytes;
  const root = parseXml(bytesToText(raw, FORMAT), FORMAT);
  if (root.name !== 'ZynAddSubFX-data') throw new ParseError(FORMAT, `root element is <${root.name}>, expected <ZynAddSubFX-data>`);

  const found: XmlElement[] = [];
  findInstruments(root, found);
  if (found.length === 0) throw new ParseError(FORMAT, 'no <INSTRUMENT> element (scale, layer and effect files are not instruments)');

  const base = firstChild(root, 'BASE_PARAMETERS');
  const out: ParsedPreset[] = [];
  found.forEach((inst, i) => {
    const warnings: string[] = ['values are passed to the engine as native XML; not range-checked or mapped to the app config'];
    if (found.length > 1) warnings.push(`instrument ${i + 1} of ${found.length} in a master file`);
    const doc: XmlElement = {
      name: 'ZynAddSubFX-data',
      attrs: { ...root.attrs },
      children: base ? [base, inst] : [inst],
      text: '',
    };
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE ZynAddSubFX-data>\n${xmlToString(doc)}\n`;
    out.push({
      name: instrumentName(inst) || (found.length > 1 ? `${baseNameOf(fileName)} part ${i + 1}` : baseNameOf(fileName)),
      synthType: 'ZynAddSubFX',
      config: { zynaddsubfxXml: xml },
      warnings,
    });
  });
  return out;
}

/** gzip (stored blocks) of the preset's XML: a valid `.xiz`. */
export function serialize(config: Record<string, unknown>): Uint8Array {
  const xml = config.zynaddsubfxXml;
  if (typeof xml !== 'string') throw new ParseError(FORMAT, 'config has no zynaddsubfxXml');
  return gzipStored(textToBytes(xml));
}
