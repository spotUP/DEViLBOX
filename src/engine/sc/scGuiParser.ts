/**
 * scGuiParser.ts — Parse SuperCollider GUI code into an intermediate widget tree.
 *
 * Extracts Window, CompositeView, Slider, Button, StaticText, NumberBox, Knob
 * widget declarations and their property chains (.value_, .step_, .action_, etc.)
 * from SC source code. Actions containing `s.sendMsg("n_set", ...)` are mapped to
 * param+transform pairs for wiring into DEViLBOX's engine.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SCColor {
  r: number; g: number; b: number; a?: number;
}

export interface SCRect {
  x: number; y: number; w: number; h: number;
}

export interface SCAction {
  /** The synth param name from s.sendMsg("n_set", node, 'param', ...) */
  param: string;
  /**
   * JS expression transforming `value` (0-1 slider) to the param value.
   * e.g. "((value)*(10000-50))+50" or "value" for direct.
   */
  transform: string;
}

export type SCWidgetType =
  | 'window'
  | 'compositeView'
  | 'staticText'
  | 'numberBox'
  | 'slider'
  | 'button'
  | 'knob';

export interface SCButtonState {
  label: string;
  textColor?: SCColor;
  bgColor?: SCColor;
}

export interface SCWidget {
  type: SCWidgetType;
  varName?: string;
  rect?: SCRect;
  label?: string;
  properties: {
    value?: number;
    step?: number;
    string?: string;
    background?: SCColor;
    stringColor?: SCColor;
    states?: SCButtonState[];
    orientation?: 'horizontal' | 'vertical';
  };
  action?: SCAction;
  children: SCWidget[];
}

export interface SCGuiParseResult {
  /** Top-level window (if found) */
  window?: SCWidget;
  /** All widgets in flat list (for simpler rendering) */
  widgets: SCWidget[];
  /** Whether any GUI code was detected */
  hasGui: boolean;
  /** Extracted variable assignments (arrays, scalars) for context */
  variables: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Color parsing
// ---------------------------------------------------------------------------

function parseColor(src: string): SCColor | undefined {
  // Color.new(r, g, b) or Color.new(r, g, b, a) — values 0-1
  const m = src.match(/Color\s*\.\s*(?:new|fromFloatRGBA)\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (m) {
    return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]), a: m[4] ? parseFloat(m[4]) : undefined };
  }
  // Color.white, Color.black, Color.red, Color.green, Color.blue
  const named: Record<string, SCColor> = {
    white: { r: 1, g: 1, b: 1 },
    black: { r: 0, g: 0, b: 0 },
    red: { r: 1, g: 0, b: 0 },
    green: { r: 0, g: 1, b: 0 },
    blue: { r: 0, g: 0, b: 1 },
    grey: { r: 0.5, g: 0.5, b: 0.5 },
    gray: { r: 0.5, g: 0.5, b: 0.5 },
  };
  const nm = src.match(/Color\s*\.\s*(\w+)/);
  if (nm && named[nm[1]]) return named[nm[1]];
  return undefined;
}

// ---------------------------------------------------------------------------
// Rect parsing
// ---------------------------------------------------------------------------

function parseRect(src: string): SCRect | undefined {
  const m = src.match(/Rect\s*\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/);
  if (!m) return undefined;
  return { x: parseFloat(m[1]), y: parseFloat(m[2]), w: parseFloat(m[3]), h: parseFloat(m[4]) };
}

// ---------------------------------------------------------------------------
// Action parsing — extract param name and value transform
// ---------------------------------------------------------------------------

/**
 * Parse an SC `.action_({...})` callback to extract the synth param and transform.
 *
 * Supported patterns:
 *   s.sendMsg("n_set", ~node, 'param', expr)
 *   s.sendMsg("n_set", ~node, \param, expr)
 *
 * The `expr` part is converted to a JS expression with `sldr.value`/`item.value`
 * replaced by `value`.
 */
function parseAction(actionBody: string): SCAction | undefined {
  // Match s.sendMsg("n_set", ..., 'param', valueExpr)
  const m = actionBody.match(
    /s\s*\.\s*sendMsg\s*\(\s*["']n_set["']\s*,\s*[^,]+,\s*(?:['\\])(\w+)['"]?\s*,\s*(.+?)\s*\)\s*;?\s*$/m
  );
  if (!m) return undefined;

  const param = m[1];
  let transform = m[2].trim();

  // Replace SC value references with `value`
  transform = transform.replace(/\b(?:sldr|slider|item|knob|val)\s*\.\s*value\b/gi, 'value');
  // Remove trailing semicolons
  transform = transform.replace(/;\s*$/, '').trim();

  // Validate: must contain `value` or be a simple number/expression
  if (!transform.includes('value') && !/^\d/.test(transform)) {
    // Might be item.value for buttons — check for just 'item.value' pattern
    transform = transform.replace(/\bitem\b/g, 'value');
  }

  return { param, transform };
}

/**
 * Extract the body of an `.action_({...})` call, handling nested braces.
 */
function extractActionBody(src: string, startIdx: number): { body: string; endIdx: number } | null {
  // Find .action_({ after startIdx
  const actionMatch = src.slice(startIdx).match(/\.action_\s*\(\s*\{/);
  if (!actionMatch || actionMatch.index === undefined) return null;

  const bodyStart = startIdx + actionMatch.index + actionMatch[0].length;
  let depth = 1;
  let i = bodyStart;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;

  // body is between opening { and closing }
  const body = src.slice(bodyStart, i - 1).trim();
  // Find the closing paren after }
  const afterClose = src.slice(i).match(/^\s*\)/);
  const endIdx = afterClose ? i + afterClose[0].length : i;
  return { body, endIdx };
}

// ---------------------------------------------------------------------------
// Property chain parsing
// ---------------------------------------------------------------------------

interface ParsedProperties {
  value?: number;
  step?: number;
  string?: string;
  background?: SCColor;
  stringColor?: SCColor;
  states?: SCButtonState[];
}

function parsePropertyChain(chainSrc: string): ParsedProperties {
  const props: ParsedProperties = {};

  // .value_(x)
  const valueM = chainSrc.match(/\.value_\s*\(\s*([\d.e+-]+|\([^)]+\))/);
  if (valueM) props.value = parseFloat(valueM[1].replace(/[()]/g, '')) || 0;

  // .step_(x)
  const stepM = chainSrc.match(/\.step_\s*\(\s*([\d.e/+-]+)/);
  if (stepM) {
    // Handle fractions like 1/24
    const stepStr = stepM[1];
    if (stepStr.includes('/')) {
      const [num, den] = stepStr.split('/');
      props.step = parseFloat(num) / parseFloat(den);
    } else {
      props.step = parseFloat(stepStr);
    }
  }

  // .string_(x)
  const strM = chainSrc.match(/\.string_\s*\(\s*["']([^"']*)/);
  if (strM) props.string = strM[1];

  // .background_(Color...)
  const bgM = chainSrc.match(/\.background_\s*\(\s*(Color[^)]+\))/);
  if (bgM) props.background = parseColor(bgM[1]);

  // .stringColor_(Color...)
  const scM = chainSrc.match(/\.stringColor_\s*\(\s*(Color[^)]+\))/);
  if (scM) props.stringColor = parseColor(scM[1]);

  // .states_([[...]])
  const statesM = chainSrc.match(/\.states_\s*\(\s*\[(.*?)\]\s*\)/s);
  if (statesM) {
    props.states = [];
    const stateEntries = statesM[1].match(/\[([^\]]*)\]/g);
    if (stateEntries) {
      for (const entry of stateEntries) {
        const parts = entry.replace(/[[\]]/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        props.states.push({ label: parts[0] || '' });
      }
    }
  }

  return props;
}

// ---------------------------------------------------------------------------
// Widget detection patterns
// ---------------------------------------------------------------------------

const WIDGET_PATTERNS: Array<{ type: SCWidgetType; pattern: RegExp }> = [
  { type: 'window',        pattern: /\bWindow\s*\(/ },
  { type: 'compositeView', pattern: /\bCompositeView\s*\(/ },
  { type: 'staticText',    pattern: /\bStaticText\s*\(/ },
  { type: 'numberBox',     pattern: /\bNumberBox\s*\(/ },
  { type: 'slider',        pattern: /\bSlider\s*\(/ },
  { type: 'button',        pattern: /\bButton\s*\(/ },
  { type: 'knob',          pattern: /\bKnob\s*\(/ },
];

// ---------------------------------------------------------------------------
// Variable extraction (arrays, scalars)
// ---------------------------------------------------------------------------

function extractVariables(source: string): Record<string, unknown> {
  const vars: Record<string, unknown> = {};

  // ~varName = value;
  const scalarRe = /~(\w+)\s*=\s*([\d.e+-]+)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = scalarRe.exec(source)) !== null) {
    vars[m[1]] = parseFloat(m[2]);
  }

  // ~varName = [1, 2, 3, ...];
  const arrayRe = /~(\w+)\s*=\s*\[\s*([\d.,\s+-]+)\s*\]/g;
  while ((m = arrayRe.exec(source)) !== null) {
    vars[m[1]] = m[2].split(',').map(s => parseFloat(s.trim()));
  }

  // Array.fill(N, val)
  const fillRe = /~(\w+)\s*=\s*Array\s*\.\s*fill\s*\(\s*(\d+)\s*,\s*([\d.]+)\s*\)/g;
  while ((m = fillRe.exec(source)) !== null) {
    vars[m[1]] = Array(parseInt(m[2])).fill(parseFloat(m[3]));
  }

  return vars;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Extract a balanced parenthesized expression starting at `openIdx` (the opening paren).
 * Returns the content between parens and the index after the closing paren.
 */
function extractBalancedParens(src: string, openIdx: number): { content: string; endIdx: number } | null {
  let depth = 0;
  let i = openIdx;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return { content: src.slice(openIdx + 1, i), endIdx: i + 1 };
      }
    } else if (ch === '"') {
      i++;
      while (i < src.length && src[i] !== '"') { if (src[i] === '\\') i++; i++; }
    } else if (ch === '\'') {
      i++;
      while (i < src.length && src[i] !== '\'') { if (src[i] === '\\') i++; i++; }
    }
    i++;
  }
  return null;
}

/**
 * Walk forward from `startIdx` consuming chained method calls (`.method_(...)`)
 * including multi-line action blocks. Returns the index after the last chain call.
 */
function findChainEnd(src: string, startIdx: number): number {
  let i = startIdx;
  while (i < src.length) {
    // Skip whitespace/newlines
    while (i < src.length && /[\s\n\r]/.test(src[i])) i++;
    // Continue chain if next char is '.'
    if (i < src.length && src[i] === '.') {
      const rest = src.slice(i);
      const methodMatch = rest.match(/^\.\s*\w+_?\s*\(/);
      if (methodMatch) {
        const parenOffset = rest.indexOf('(');
        const bal = extractBalancedParens(src, i + parenOffset);
        if (bal) {
          i = bal.endIdx;
          continue;
        }
      }
    }
    break;
  }
  return i;
}

/**
 * Parse SC source code and extract GUI widget declarations.
 */
export function parseSCGui(source: string): SCGuiParseResult {
  const widgets: SCWidget[] = [];
  const variables = extractVariables(source);
  let windowWidget: SCWidget | undefined;

  // Strip comments (// and /* */)
  const stripped = source
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Find all widget creation calls
  for (const { type, pattern } of WIDGET_PATTERNS) {
    const re = new RegExp(pattern.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = re.exec(stripped)) !== null) {
      const callStart = match.index;
      const parenIdx = stripped.indexOf('(', callStart);
      if (parenIdx < 0) continue;

      const balanced = extractBalancedParens(stripped, parenIdx);
      if (!balanced) continue;

      const { content: args, endIdx } = balanced;

      // Parse Rect from args
      const rect = parseRect(args);

      // Determine orientation for sliders from Rect dimensions
      let orientation: 'horizontal' | 'vertical' | undefined;
      if (type === 'slider' && rect) {
        orientation = rect.w > rect.h ? 'horizontal' : 'vertical';
      }

      // Look for label in Window
      let label: string | undefined;
      if (type === 'window') {
        const lm = args.match(/^\s*["']([^"']+)/);
        if (lm) label = lm[1];
      }

      // Walk the full chained method call from the constructor's closing paren
      const chainEndIdx = findChainEnd(stripped, endIdx);
      const fullChain = stripped.slice(endIdx, chainEndIdx);

      const props = parsePropertyChain(fullChain);

      // For StaticText/NumberBox, extract label from .string_()
      if ((type === 'staticText' || type === 'numberBox') && !label) {
        if (props.string) {
          label = props.string;
        } else {
          const strInChain = fullChain.match(/\.string_\s*\(\s*(.+?)\s*\)/);
          if (strInChain) {
            label = strInChain[1].replace(/^["']|["']$/g, '');
          }
        }
      }

      // Parse action — only if .action_ is within this widget's chain
      let action: SCAction | undefined;
      if (fullChain.includes('.action_')) {
        const actionResult = extractActionBody(stripped, endIdx);
        if (actionResult && actionResult.endIdx <= chainEndIdx) {
          action = parseAction(actionResult.body);
        }
      }

      // Check for variable assignment: ~varName = Widget(...)
      let varName: string | undefined;
      const beforeCall = stripped.slice(Math.max(0, callStart - 60), callStart);
      const varM = beforeCall.match(/~(\w+)\s*=\s*(?:~\w+\s*=\s*~\w+\s*\.\s*add\s*\(\s*)?$/);
      if (varM) varName = varM[1];

      const widget: SCWidget = {
        type,
        varName,
        rect,
        label,
        properties: {
          ...props,
          ...(orientation ? { orientation } : {}),
        },
        action,
        children: [],
      };

      widgets.push(widget);

      if (type === 'window' && !windowWidget) {
        windowWidget = widget;
      }
    }
  }

  // Detect .do({ }) loop-generated widgets (e.g., 16.do({ |i| ... }))
  // These create repeated widget instances like step LEDs, pitch sliders, etc.
  const doLoopRe = /(\d+)\s*\.\s*do\s*\(\s*\{/g;
  let doMatch: RegExpExecArray | null;
  while ((doMatch = doLoopRe.exec(stripped)) !== null) {
    const count = parseInt(doMatch[1]);
    const loopStart = doMatch.index + doMatch[0].length;

    // Find closing of the do block
    let depth = 1;
    let i = loopStart;
    while (i < stripped.length && depth > 0) {
      if (stripped[i] === '{') depth++;
      else if (stripped[i] === '}') depth--;
      i++;
    }
    const loopBody = stripped.slice(loopStart, i - 1);

    // Check if loop body creates widgets
    for (const { type, pattern } of WIDGET_PATTERNS) {
      if (pattern.test(loopBody)) {
        // Mark existing widgets created in this loop with their count
        // Find the widget in our list that was parsed from inside this loop region
        for (const w of widgets) {
          // Check if widget's source position falls within the loop
          const widgetSrc = stripped.indexOf(
            `${type.charAt(0).toUpperCase()}${type.slice(1)}`,
            doMatch.index
          );
          if (widgetSrc >= doMatch.index && widgetSrc < i) {
            // Tag it as a repeated widget
            (w as SCWidget & { repeatCount?: number }).repeatCount = count;
            break;
          }
        }
      }
    }
  }

  return {
    window: windowWidget,
    widgets,
    hasGui: widgets.length > 0,
    variables,
  };
}
