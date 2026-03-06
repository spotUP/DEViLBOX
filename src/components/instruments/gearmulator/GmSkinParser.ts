/**
 * GmSkinParser — Parses gearmulator RML/RCSS/JSON skin files and produces
 * a structured skin definition that can be rendered by GmSkinRenderer.
 *
 * This runs at build time (via a script) or at runtime (lazy parse).
 */

export interface GmSkinDef {
  name: string;
  width: number;
  height: number;
  scale: number;
  background: string;
  knobStyles: Record<string, GmKnobStyleDef>;
  buttonStyles: Record<string, GmButtonStyleDef>;
  tabs: GmSkinTabGroupDef;
  controls: GmSkinControlDef[];
}

export interface GmKnobStyleDef {
  src: string;
  frameWidth: number;
  frameHeight: number;
  cols: number;
  totalFrames: number;
}

export interface GmButtonStyleDef {
  src: string;
  width: number;
  height: number;
  uncheckedY: number;
  checkedY: number;
}

export interface GmSkinTabGroupDef {
  buttons: { id: string; tabIndex: number; style: Record<string, string> }[];
  pages: { id: string; tabIndex: number; backgroundSrc?: string; style: Record<string, string> }[];
}

export interface GmSkinControlDef {
  type: 'knob' | 'button' | 'combo' | 'label' | 'image';
  id: string;
  param?: string;
  knobStyle?: string;
  buttonStyle?: string;
  isToggle?: boolean;
  valueOn?: number;
  pageId?: string; // which tab page this control belongs to
  style: Record<string, string>;
  text?: string;
  src?: string;
}

/** Parse inline RML style string → object */
function parseInlineStyle(styleStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!styleStr) return result;
  for (const part of styleStr.split(';')) {
    const [key, ...valueParts] = part.split(':');
    if (key && valueParts.length) {
      result[key.trim()] = valueParts.join(':').trim();
    }
  }
  return result;
}

/** Parse RCSS spritesheet definitions */
export function parseRcssSpritesheets(rcss: string): Record<string, { src: string; frames: Record<string, { x: number; y: number; w: number; h: number }> }> {
  const sheets: Record<string, { src: string; frames: Record<string, { x: number; y: number; w: number; h: number }> }> = {};
  const sheetRegex = /@spritesheet\s+(\S+)\s*\{([^}]+)\}/g;
  let match;
  while ((match = sheetRegex.exec(rcss))) {
    const name = match[1];
    const body = match[2];
    const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
    let src = '';

    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('src:')) {
        src = trimmed.replace('src:', '').replace(';', '').trim();
      } else if (trimmed.includes(':')) {
        const [frameName, coords] = trimmed.split(':');
        if (frameName && coords) {
          const nums = coords.match(/(\d+)px/g);
          if (nums && nums.length >= 4) {
            const [x, y, w, h] = nums.map(n => parseInt(n));
            frames[frameName.trim()] = { x, y, w, h };
          }
        }
      }
    }

    sheets[name] = { src, frames };
  }
  return sheets;
}

/** Parse an RML file and extract all controls with their positions and params */
export function parseRml(rmlContent: string): {
  body: { width: string; height: string; scale: string };
  elements: GmSkinControlDef[];
} {
  const elements: GmSkinControlDef[] = [];

  // Extract body attributes
  const bodyMatch = rmlContent.match(/<body[^>]*style="([^"]*)"[^>]*>/);
  const bodyStyle = bodyMatch ? parseInlineStyle(bodyMatch[1]) : {};
  const rootScaleMatch = rmlContent.match(/rootScale="([^"]*)"/);

  const body = {
    width: bodyStyle['width'] ?? '2501dp',
    height: bodyStyle['height'] ?? '1152dp',
    scale: rootScaleMatch?.[1] ?? '0.5',
  };

  // Track current parent page
  let currentPageId: string | undefined;

  // Process line by line to track page context
  const lines = rmlContent.split('\n');
  const pageStack: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Track page entry/exit
    const imgPageMatch = trimmed.match(/<img\s+id="(page_\w+)"/);
    if (imgPageMatch) {
      currentPageId = imgPageMatch[1];
      pageStack.push(currentPageId);
    }

    // Track page close (simplified — assumes properly nested)
    if (trimmed === '</img>' && pageStack.length > 0) {
      pageStack.pop();
      currentPageId = pageStack[pageStack.length - 1];
    }

    // Parse knobs
    const knobMatch = trimmed.match(/<knob\s+([^>]+)\/?\s*>/);
    if (knobMatch) {
      const attrs = parseAttributes(knobMatch[1]);
      elements.push({
        type: 'knob',
        id: attrs['id'] ?? '',
        param: attrs['param'],
        knobStyle: attrs['class']?.includes('knob2') ? 'knob_2' : 'knob_1',
        pageId: currentPageId,
        style: parseInlineStyle(attrs['style'] ?? ''),
      });
    }

    // Parse buttons
    const buttonMatch = trimmed.match(/<button\s+([^>]+)\/?\s*>/);
    if (buttonMatch) {
      const attrs = parseAttributes(buttonMatch[1]);
      elements.push({
        type: 'button',
        id: attrs['id'] ?? '',
        param: attrs['param'],
        buttonStyle: extractButtonStyle(attrs['class'] ?? ''),
        isToggle: attrs['isToggle'] === '1',
        valueOn: attrs['valueOn'] ? parseInt(attrs['valueOn']) : undefined,
        pageId: currentPageId,
        style: parseInlineStyle(attrs['style'] ?? ''),
      });
    }

    // Parse combos
    const comboMatch = trimmed.match(/<combo\s+([^>]+)>/);
    if (comboMatch) {
      const attrs = parseAttributes(comboMatch[1]);
      elements.push({
        type: 'combo',
        id: attrs['id'] ?? '',
        param: attrs['param'],
        pageId: currentPageId,
        style: parseInlineStyle(attrs['style'] ?? ''),
      });
    }

    // Parse labels (divs with text)
    const divMatch = trimmed.match(/<div\s+id="(\w+)"\s+([^>]+)>(.*?)<\/div>/);
    if (divMatch) {
      const attrs = parseAttributes(divMatch[2].replace(/>.*/, ''));
      elements.push({
        type: 'label',
        id: divMatch[1],
        pageId: currentPageId,
        style: parseInlineStyle(attrs['style'] ?? ''),
        text: divMatch[3],
      });
    }

    // Parse images
    const imgMatch = trimmed.match(/<img\s+([^>]+?)\/?\s*>/);
    if (imgMatch && !trimmed.includes('tabgroup') && !trimmed.includes('page_')) {
      const attrs = parseAttributes(imgMatch[1]);
      if (attrs['src']) {
        elements.push({
          type: 'image',
          id: attrs['id'] ?? '',
          src: attrs['src'],
          pageId: currentPageId,
          style: parseInlineStyle(attrs['style'] ?? ''),
        });
      }
    }
  }

  return { body, elements };
}

/** Parse HTML-like attributes from a string */
function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /(\w[\w-]*)="([^"]*)"/g;
  let m;
  while ((m = regex.exec(attrStr))) {
    attrs[m[1]] = m[2];
  }
  return regex.lastIndex = 0, attrs;
}

/** Extract button style class name (e.g., "btn_1" from "jucePos juceButton btn_1") */
function extractButtonStyle(className: string): string {
  const match = className.match(/btn_\w+/);
  return match ? match[0] : 'btn_1';
}
