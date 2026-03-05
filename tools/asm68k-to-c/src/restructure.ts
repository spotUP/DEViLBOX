/**
 * Pass 2 restructurer — regex-based post-processing of Pass 1 C output.
 * Converts recognizable goto patterns into structured C (for/while/if).
 * Unrecognized patterns are left unchanged — never introduces bugs.
 */

/** Invert a simple C condition expression. */
function invertCondition(cond: string): string {
  const c = cond.trim();
  if (c.startsWith('!') && !c.includes('&&') && !c.includes('||')) {
    return c.slice(1);
  }
  return `!(${c})`;
}

export function restructure(code: string): string {
  let out = code;

  // ── DBRA-style counted loop ──────────────────────────────────────────
  // Handles MOVEQ format: reg = (uint32_t)(int32_t)(int8_t)(N);
  // Allows 0-3 lines of other code between counter init and loop label.
  out = out.replace(
    /(\w+)\s*=\s*(?:\(uint32_t\)\(int32_t\)\(int8_t\)\()?(\d+)\)?;[^\n]*\n((?:  [^\n]*\n){0,3})(\w+):\n([\s\S]+?)  if \(\(int16_t\)\(--\1\) >= 0\) goto \4;[^\n]*\n/g,
    (_m, reg, count, between, _label, body) => {
      return `${between}for (int _i_${reg} = ${count}; _i_${reg} >= 0; _i_${reg}--) {\n${body}}\n`;
    }
  );

  // ── Do-while loop (MUST run before skip/if-else) ──────────────────────
  // Backward branch at end of block → do { } while (cond);
  out = out.replace(
    /^(\w+):\n((?:  [^\n]*\n)+?)  if \(((?:[^()]*|\([^()]*\))*)\) goto \1;[^\n]*\n/gm,
    (m, label, body, cond) => {
      if (body.includes(`goto ${label}`)) return m;
      // Safety: body must have balanced braces
      let depth = 0;
      for (const ch of body) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        if (depth < 0) return m;
      }
      if (depth !== 0) return m;
      return `do {\n${body}} while (${cond});\n`;
    }
  );

  // ── If-else detection (MUST run before conditional skip) ─────────────
  out = out.replace(
    /  if \(([^)]+(?:\([^)]*\))?[^)]*)\) goto (\w+);[^\n]*\n([\s\S]+?)  goto (\w+);[^\n]*\n\2:\n([\s\S]+?)\4:\n/g,
    (m, cond, elseLabel, thenBody, endLabel, elseBody) => {
      if (thenBody.includes(`goto ${elseLabel}`) || thenBody.includes(`goto ${endLabel}`)) return m;
      if (elseBody.includes(`goto ${endLabel}`) || elseBody.includes(`goto ${elseLabel}`)) return m;
      // Safety: both bodies must have balanced braces
      for (const b of [thenBody, elseBody]) {
        let depth = 0;
        for (const ch of b) {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
          if (depth < 0) return m;
        }
        if (depth !== 0) return m;
      }
      return `  if (${invertCondition(cond)}) {\n${thenBody}  } else {\n${elseBody}  }\n`;
    }
  );

  // ── Conditional skip (forward branch over a block) ───────────────────
  // Only matches when the label is NOT referenced in the body (pure skip).
  out = out.replace(
    /  if \(([^)]+(?:\([^)]*\))?[^)]*)\) goto (\w+);[^\n]*\n([\s\S]+?)\2:\n/g,
    (m, cond, label, body) => {
      if (body.includes(`goto ${label}`)) return m;
      // Safety: body must have balanced braces
      let depth = 0;
      for (const ch of body) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        if (depth < 0) return m;
      }
      if (depth !== 0) return m;
      return `  if (${invertCondition(cond)}) {\n${body}  }\n`;
    }
  );

  return out;
}
