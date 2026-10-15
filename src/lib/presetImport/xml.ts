/**
 * Minimal dependency-free XML reader for the preset dialects (synthv1, Calf, ZynAddSubFX, Monique).
 * Elements, attributes, text, comments, CDATA, the five predefined entities and numeric character references.
 * No DTD/namespace support: a DOCTYPE is skipped, never expanded (no entity bombs). Depth and node count are capped.
 */
import { ParseError } from './types';

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

const MAX_DEPTH = 64;
const MAX_NODES = 2_000_000;

function decode(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (m, e: string) => {
    switch (e) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      default: {
        const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
    }
  });
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function parseXml(text: string, format: string): XmlElement {
  let i = 0;
  const n = text.length;
  let nodes = 0;
  const fail = (msg: string): never => { throw new ParseError(format, `invalid XML (${msg} at offset ${i})`); };
  const root: XmlElement = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];

  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) {
      stack[stack.length - 1].text += decode(text.slice(i));
      i = n;
      break;
    }
    if (lt > i) stack[stack.length - 1].text += decode(text.slice(i, lt));
    i = lt;
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end < 0) fail('unterminated comment');
      i = end + 3;
    } else if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      if (end < 0) fail('unterminated CDATA');
      stack[stack.length - 1].text += text.slice(i + 9, end);
      i = end + 3;
    } else if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end < 0) fail('unterminated processing instruction');
      i = end + 2;
    } else if (text.startsWith('<!', i)) {
      // DOCTYPE: skip, honouring one level of [ ... ] internal subset.
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const c = text[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      if (j >= n) fail('unterminated declaration');
      i = j + 1;
    } else if (text[i + 1] === '/') {
      const end = text.indexOf('>', i);
      if (end < 0) fail('unterminated end tag');
      const name = text.slice(i + 2, end).trim();
      const top = stack.pop();
      if (!top || stack.length === 0 || top.name !== name) fail(`mismatched </${name}>`);
      i = end + 1;
    } else {
      // start tag
      let j = i + 1;
      while (j < n && !/[\s/>]/.test(text[j])) j++;
      const name = text.slice(i + 1, j);
      if (!name) fail('empty tag name');
      const el: XmlElement = { name, attrs: {}, children: [], text: '' };
      let selfClose = false;
      for (;;) {
        while (j < n && /\s/.test(text[j])) j++;
        if (j >= n) fail('unterminated start tag');
        if (text[j] === '>') { j++; break; }
        if (text[j] === '/' && text[j + 1] === '>') { selfClose = true; j += 2; break; }
        let k = j;
        while (k < n && !/[\s=/>]/.test(text[k])) k++;
        const an = text.slice(j, k);
        if (!an) fail('bad attribute');
        while (k < n && /\s/.test(text[k])) k++;
        if (text[k] !== '=') fail(`attribute "${an}" has no value`);
        k++;
        while (k < n && /\s/.test(text[k])) k++;
        const q = text[k];
        if (q !== '"' && q !== "'") fail(`attribute "${an}" is not quoted`);
        const qe = text.indexOf(q, k + 1);
        if (qe < 0) fail('unterminated attribute value');
        el.attrs[an] = decode(text.slice(k + 1, qe));
        j = qe + 1;
      }
      if (++nodes > MAX_NODES) fail('too many elements');
      stack[stack.length - 1].children.push(el);
      if (!selfClose) {
        if (stack.length > MAX_DEPTH) fail('nesting too deep');
        stack.push(el);
      }
      i = j;
    }
  }
  if (stack.length !== 1) throw new ParseError(format, `invalid XML (unclosed <${stack[stack.length - 1].name}>)`);
  const top = root.children[0];
  if (!top || root.children.length !== 1) throw new ParseError(format, 'invalid XML (needs exactly one root element)');
  return top;
}

export function childrenNamed(el: XmlElement, name: string): XmlElement[] {
  return el.children.filter((c) => c.name === name);
}

export function firstChild(el: XmlElement, name: string): XmlElement | undefined {
  return el.children.find((c) => c.name === name);
}

/** Serialise an element tree back to XML text (attributes in insertion order, text only on leaf elements). */
export function xmlToString(el: XmlElement, indent = ''): string {
  const attrs = Object.entries(el.attrs).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('');
  const text = el.text.trim();
  if (el.children.length === 0) {
    return text ? `${indent}<${el.name}${attrs}>${escapeXml(text)}</${el.name}>` : `${indent}<${el.name}${attrs}/>`;
  }
  return `${indent}<${el.name}${attrs}>\n${el.children.map((c) => xmlToString(c, indent + '  ')).join('\n')}\n${indent}</${el.name}>`;
}
