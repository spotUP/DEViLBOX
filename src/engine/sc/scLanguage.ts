import { HighlightStyle, syntaxHighlighting, StreamLanguage } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// SuperCollider keywords
const SC_KEYWORDS = new Set([
  'var', 'arg', 'if', 'while', 'do', 'true', 'false', 'nil',
  'this', 'super', 'thisFunction', 'currentEnvironment',
  'inf', 'pi', 'and', 'or', 'not',
]);

// State type for tracking nested block-comment depth across lines
interface SCState { blockDepth: number; }

// Minimal SuperCollider stream language for CodeMirror 6
// Highlights: keywords, UGen names (PascalCase), strings, numbers, comments
const scStreamLanguage = StreamLanguage.define<SCState>({
  name: 'supercollider',
  startState: (): SCState => ({ blockDepth: 0 }),
  copyState: (state: SCState): SCState => ({ ...state }),
  token(stream, state) {
    // If we are inside a block comment carried over from a previous line,
    // consume this line tracking nested /* and */ to update depth.
    if (state.blockDepth > 0) {
      while (!stream.eol()) {
        if (stream.match('/*')) { state.blockDepth++; }
        else if (stream.match('*/')) {
          state.blockDepth--;
          if (state.blockDepth === 0) break;
        } else {
          stream.next();
        }
      }
      return 'comment';
    }

    if (stream.eatSpace()) return null;

    // Single-line comment
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }

    // Block comment — may span multiple lines; track depth in state
    if (stream.match('/*')) {
      state.blockDepth = 1;
      while (!stream.eol()) {
        if (stream.match('/*')) { state.blockDepth++; }
        else if (stream.match('*/')) {
          state.blockDepth--;
          if (state.blockDepth === 0) break;
        } else {
          stream.next();
        }
      }
      return 'comment';
    }

    // Double-quoted string
    if (stream.match('"')) {
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === '\\') { stream.next(); continue; }
        if (ch === '"') break;
      }
      return 'string';
    }

    // Single-quoted symbol ('symbolName')
    if (stream.match("'")) {
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === '\\') { stream.next(); continue; }
        if (ch === "'") break;
      }
      return 'string';
    }

    // Backslash symbol (\symbolName)
    if (stream.match(/^\\\w*/)) {
      return 'string';
    }

    // Hexadecimal number
    if (stream.match(/^0x[\da-fA-F]+/)) return 'number';

    // Radix integer (e.g. 16rFF)
    if (stream.match(/^\d+r[\dA-Za-z]+/)) return 'number';

    // Float or integer
    if (stream.match(/^\d+(\.\d+)?([eE][+-]?\d+)?/)) return 'number';

    // Identifiers: UGens are PascalCase, keywords and vars are lowercase
    if (stream.match(/^[A-Za-z_]\w*/)) {
      const word = stream.current();
      if (SC_KEYWORDS.has(word)) return 'keyword';
      // PascalCase => UGen or class name
      if (/^[A-Z]/.test(word)) return 'keyword';
      return 'variableName';
    }

    // Operator / punctuation characters
    if (stream.match(/^[\\|{}[\]().,;:+\-*/<>=!@#$%^&~?]+/)) return 'operator';

    stream.next();
    return null;
  },
});

export const scHighlightStyle = HighlightStyle.define([
  { tag: tags.comment,      color: '#6a9955', fontStyle: 'italic' },
  { tag: tags.string,       color: '#ce9178' },
  { tag: tags.number,       color: '#b5cea8' },
  { tag: tags.keyword,      color: '#569cd6' },
  { tag: tags.variableName, color: '#9cdcfe' },
  { tag: tags.operator,     color: '#d4d4d4' },
]);

export const superColliderLanguage = [
  scStreamLanguage,
  syntaxHighlighting(scHighlightStyle),
];
