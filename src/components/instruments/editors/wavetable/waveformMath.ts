/**
 * waveformMath — a small self-contained expression evaluator for
 * generating waveforms via math formulas.
 *
 * Built-in variables: `x` (0..1 phase position)
 * Built-in constants: `PI`, `TAU` (2*PI), `E`
 * Built-in functions:
 *   sin(x), cos(x), tan(x), abs(x), sign(x), sqrt(x), exp(x), log(x)
 *   min(a,b), max(a,b), clamp(x, lo, hi), mix(a, b, t), floor(x), ceil(x), round(x)
 *   saw(x)        — bipolar sawtooth, -1..+1
 *   tri(x)        — bipolar triangle, -1..+1
 *   sq(x)         — bipolar square, -1/+1
 *   pulse(x, d)   — bipolar pulse wave with duty d (0..1)
 *   noise(x)      — deterministic noise seeded by x
 *   env(x, a, r)  — attack/release envelope in the 0..1 window
 *
 * Example: `sin(x*TAU) + 0.3*saw(x*3)`
 *
 * Output is clamped to [-1, +1] before being rendered to the canvas.
 *
 * Parser is a tiny recursive-descent with Pratt-style precedence:
 *   expr     = term (('+' | '-') term)*
 *   term     = factor (('*' | '/' | '%') factor)*
 *   factor   = unary ('^' factor)?
 *   unary    = ('-' | '+')? primary
 *   primary  = number | ident | '(' expr ')' | call
 *   call     = ident '(' expr (',' expr)* ')'
 */

type NumberOp = (ctx: EvalCtx) => number;

interface EvalCtx {
  x: number;
}

// ──────────────────────────────────────────────────────────────────
// Tokenizer
// ──────────────────────────────────────────────────────────────────

type Tok =
  | { k: 'num'; v: number }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string }
  | { k: 'lp' }
  | { k: 'rp' }
  | { k: 'comma' }
  | { k: 'end' };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
      out.push({ k: 'num', v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let j = i;
      while (j < src.length && (
        (src[j] >= 'a' && src[j] <= 'z') ||
        (src[j] >= 'A' && src[j] <= 'Z') ||
        (src[j] >= '0' && src[j] <= '9') ||
        src[j] === '_'
      )) j++;
      out.push({ k: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/%^'.includes(c)) { out.push({ k: 'op', v: c }); i++; continue; }
    if (c === '(') { out.push({ k: 'lp' }); i++; continue; }
    if (c === ')') { out.push({ k: 'rp' }); i++; continue; }
    if (c === ',') { out.push({ k: 'comma' }); i++; continue; }
    throw new Error(`Unexpected character '${c}' at ${i}`);
  }
  out.push({ k: 'end' });
  return out;
}

// ──────────────────────────────────────────────────────────────────
// Parser → compiled NumberOp
// ──────────────────────────────────────────────────────────────────

const CONSTANTS: Record<string, number> = {
  PI: Math.PI,
  TAU: Math.PI * 2,
  E: Math.E,
};

/** Deterministic hash-based noise so the waveform is stable frame-to-frame. */
function hashNoise(x: number): number {
  // Mangle the input into a uint32 then normalize to [-1, +1]
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  sin: ([x]) => Math.sin(x),
  cos: ([x]) => Math.cos(x),
  tan: ([x]) => Math.tan(x),
  abs: ([x]) => Math.abs(x),
  sign: ([x]) => Math.sign(x),
  sqrt: ([x]) => Math.sqrt(Math.max(0, x)),
  exp: ([x]) => Math.exp(x),
  log: ([x]) => Math.log(Math.max(1e-9, x)),
  min: ([a, b]) => Math.min(a, b),
  max: ([a, b]) => Math.max(a, b),
  clamp: ([x, lo, hi]) => Math.max(lo, Math.min(hi, x)),
  mix: ([a, b, t]) => a + (b - a) * t,
  floor: ([x]) => Math.floor(x),
  ceil: ([x]) => Math.ceil(x),
  round: ([x]) => Math.round(x),
  saw: ([x]) => {
    const p = x - Math.floor(x);
    return p * 2 - 1;
  },
  tri: ([x]) => {
    const p = x - Math.floor(x);
    return p < 0.5 ? p * 4 - 1 : 3 - p * 4;
  },
  sq: ([x]) => {
    const p = x - Math.floor(x);
    return p < 0.5 ? 1 : -1;
  },
  pulse: ([x, d]) => {
    const p = x - Math.floor(x);
    const duty = Math.max(0, Math.min(1, d));
    return p < duty ? 1 : -1;
  },
  noise: ([x]) => hashNoise(x),
  env: ([x, a, r]) => {
    const att = Math.max(0.0001, a);
    const rel = Math.max(0.0001, r);
    if (x < 0 || x > 1) return 0;
    if (x < att) return x / att;
    if (x > 1 - rel) return (1 - x) / rel;
    return 1;
  },
};

interface ParserState {
  toks: Tok[];
  pos: number;
}

function peek(s: ParserState): Tok { return s.toks[s.pos]; }
function eat(s: ParserState): Tok { return s.toks[s.pos++]; }

function parseAddSub(s: ParserState): NumberOp {
  let left = parseMulDiv(s);
  while (true) {
    const t = peek(s);
    if (t.k === 'op' && (t.v === '+' || t.v === '-')) {
      const op = t.v;
      eat(s);
      const right = parseMulDiv(s);
      const l = left, r = right;
      left = op === '+' ? (c) => l(c) + r(c) : (c) => l(c) - r(c);
    } else break;
  }
  return left;
}

function parseMulDiv(s: ParserState): NumberOp {
  let left = parsePow(s);
  while (true) {
    const t = peek(s);
    if (t.k === 'op' && (t.v === '*' || t.v === '/' || t.v === '%')) {
      const op = t.v;
      eat(s);
      const right = parsePow(s);
      const l = left, r = right;
      if (op === '*') left = (c) => l(c) * r(c);
      else if (op === '/') left = (c) => { const v = r(c); return v === 0 ? 0 : l(c) / v; };
      else left = (c) => { const v = r(c); return v === 0 ? 0 : l(c) % v; };
    } else break;
  }
  return left;
}

function parsePow(s: ParserState): NumberOp {
  const left = parseUnary(s);
  const t = peek(s);
  if (t.k === 'op' && t.v === '^') {
    eat(s);
    const right = parsePow(s);
    return (c) => Math.pow(left(c), right(c));
  }
  return left;
}

function parseUnary(s: ParserState): NumberOp {
  const t = peek(s);
  if (t.k === 'op' && (t.v === '+' || t.v === '-')) {
    eat(s);
    const inner = parseUnary(s);
    return t.v === '-' ? (c) => -inner(c) : inner;
  }
  return parsePrimary(s);
}

function parsePrimary(s: ParserState): NumberOp {
  const t = eat(s);
  if (t.k === 'num') {
    const v = t.v;
    return () => v;
  }
  if (t.k === 'lp') {
    const inner = parseAddSub(s);
    if (peek(s).k !== 'rp') throw new Error('Expected )');
    eat(s);
    return inner;
  }
  if (t.k === 'id') {
    // Function call?
    if (peek(s).k === 'lp') {
      eat(s); // consume (
      const args: NumberOp[] = [];
      if (peek(s).k !== 'rp') {
        args.push(parseAddSub(s));
        while (peek(s).k === 'comma') {
          eat(s);
          args.push(parseAddSub(s));
        }
      }
      if (peek(s).k !== 'rp') throw new Error(`Expected ) after ${t.v}(...)`);
      eat(s);
      const fn = FUNCTIONS[t.v];
      if (!fn) throw new Error(`Unknown function: ${t.v}`);
      return (c) => fn(args.map((a) => a(c)));
    }
    // Variable or constant
    if (t.v === 'x') return (c) => c.x;
    const k = CONSTANTS[t.v];
    if (k !== undefined) return () => k;
    throw new Error(`Unknown identifier: ${t.v}`);
  }
  throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
}

function parseExpr(s: ParserState): NumberOp {
  const result = parseAddSub(s);
  if (peek(s).k !== 'end') throw new Error('Unexpected trailing input');
  return result;
}

/**
 * Compile an expression into a fast NumberOp. Throws on parse error.
 */
export function compileWaveformExpression(src: string): NumberOp {
  const toks = tokenize(src);
  const state: ParserState = { toks, pos: 0 };
  return parseExpr(state);
}

/**
 * Evaluate an expression across `length` samples, returning an int
 * array in [0, maxValue]. Output is clamped and DC-centered.
 */
export function evaluateWaveformExpression(
  src: string,
  length: number,
  maxValue: number,
): { data: number[]; error: string | null } {
  try {
    const op = compileWaveformExpression(src);
    const mid = maxValue / 2;
    const out: number[] = [];
    for (let i = 0; i < length; i++) {
      const x = i / length;
      const v = op({ x });
      const clamped = Math.max(-1, Math.min(1, v));
      out.push(Math.max(0, Math.min(maxValue, Math.round(clamped * mid + mid))));
    }
    return { data: out, error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Built-in expression presets for the Math panel's "Examples" dropdown.
 */
export const MATH_PRESETS: Array<{ name: string; expr: string }> = [
  { name: 'Sine', expr: 'sin(x*TAU)' },
  { name: 'Triangle', expr: 'tri(x)' },
  { name: 'Saw', expr: 'saw(x)' },
  { name: 'Square', expr: 'sq(x)' },
  { name: '25% Pulse', expr: 'pulse(x, 0.25)' },
  { name: 'Harmonic 1+3+5', expr: 'sin(x*TAU) + sin(x*TAU*3)/3 + sin(x*TAU*5)/5' },
  { name: 'Detuned dual sine', expr: 'sin(x*TAU) * 0.5 + sin(x*TAU*1.01) * 0.5' },
  { name: 'Soft saw', expr: 'tri(x) * abs(sin(x*TAU*2))' },
  { name: 'Sync-ish', expr: 'saw(x*3) * 0.5 + sin(x*TAU)*0.5' },
  { name: 'Noise burst', expr: 'noise(x*32) * env(x, 0.01, 0.5)' },
  { name: 'Bell-ish', expr: 'sin(x*TAU) * env(x, 0.001, 0.99) + sin(x*TAU*3.1)*0.3*env(x, 0.001, 0.5)' },
  { name: 'Brassy', expr: 'sin(x*TAU + sin(x*TAU)*0.8)' },
  { name: 'Plucked', expr: '(sin(x*TAU) + noise(x*100)*0.2) * env(x, 0.001, 0.9)' },
];
