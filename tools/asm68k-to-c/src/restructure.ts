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

/** Count how many times `goto label;` appears in the code. */
function countGotoRefs(code: string, label: string): number {
  const re = new RegExp(`\\bgoto ${label}\\b`, 'g');
  return (code.match(re) || []).length;
}

export function restructure(code: string): string {
  let out = code;

  // ── Jump table: JMP label(PC,Dn.W) → switch(reg/4) ──────────────────
  // Marker: /* JUMPTABLE label reg */ goto label;
  // Followed by: label:\n  goto target0;\n  goto target1;\n ...
  // Each BRA.W is 4 bytes, so switch case = index / 4.
  out = out.replace(
    /\/\* JUMPTABLE (\w+) (\w+) \*\/ goto \1;[^\n]*\n/g,
    (_m, label, reg) => {
      // Find the jump table at label: and collect consecutive goto statements
      const labelRe = new RegExp(`^${label}:\\n((?:  goto \\w+;[^\\n]*\\n)+)`, 'm');
      const tableMatch = out.match(labelRe);
      if (!tableMatch) return _m; // can't find table, leave unchanged
      const entries = tableMatch[1].match(/goto (\w+);/g);
      if (!entries) return _m;
      const targets = entries.map(e => e.match(/goto (\w+);/)![1]);
      let sw = `  switch ((uint16_t)(${reg}) / 4) {\n`;
      targets.forEach((t, i) => { sw += `    case ${i}: goto ${t};\n`; });
      sw += `  }\n`;
      // Remove the jump table entries (they become dead code)
      out = out.replace(labelRe, `${label}:\n`);
      return sw;
    }
  );

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
      // Count goto refs to this label in the FULL output (not just this match).
      // The matched pattern consumes 1 goto; if others exist, preserve the label.
      const externalRefs = countGotoRefs(out, label) - 1; // -1 for the one in this match
      const prefix = externalRefs > 0 ? `${label}:\n` : '';
      return `${prefix}do {\n${body}} while (${cond});\n`;
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
      // Pattern consumes elseLabel: and endLabel: definitions plus 1 goto each.
      // Preserve labels that are still referenced by other gotos.
      const elseExtRefs = countGotoRefs(out, elseLabel) - 1; // -1 for the one in this match
      const endExtRefs = countGotoRefs(out, endLabel) - 1;   // -1 for the one in this match
      const elseSuffix = elseExtRefs > 0 ? `${elseLabel}:\n` : '';
      const endSuffix = endExtRefs > 0 ? `${endLabel}:\n` : '';
      return `  if (${invertCondition(cond)}) {\n${thenBody}  } else {\n${elseBody}  }\n${elseSuffix}${endSuffix}`;
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
      // The matched pattern consumes the label definition and 1 goto ref.
      // If other gotos to this label exist elsewhere, preserve the label.
      const externalRefs = countGotoRefs(out, label) - 1; // -1 for the one in this match
      const suffix = externalRefs > 0 ? `${label}:\n` : '';
      return `  if (${invertCondition(cond)}) {\n${body}  }\n${suffix}`;
    }
  );

  // ── Cross-function goto → function call ─────────────────────────────
  // When a goto targets a label that is also a declared function, and the
  // target label doesn't exist as a local label nearby, convert to a call.
  {
    // Find all function names from forward declarations
    const funcNames = new Set<string>();
    const funcDeclRe = /^static void (\w+)\(void\);$/gm;
    let dm;
    while ((dm = funcDeclRe.exec(out)) !== null) {
      funcNames.add(dm[1]);
    }

    // Collect ALL labels defined anywhere (label:)
    const allLabels = new Set<string>();
    const allLabelRe = /^(\w+):/gm;
    let alm;
    while ((alm = allLabelRe.exec(out)) !== null) {
      allLabels.add(alm[1]);
    }

    // Replace gotos to function names that DON'T also exist as local labels in the file
    // (i.e., the function IS the only definition of that label, not also a goto target)
    out = out.replace(
      /(\s*)if \(([^;]+)\) goto (\w+);([^\n]*)\n/g,
      (m: string, indent: string, cond: string, target: string, rest: string) => {
        if (funcNames.has(target) && !allLabels.has(target)) {
          return `${indent}if (${cond}) { ${target}(); return; }${rest}\n`;
        }
        return m;
      }
    );
    out = out.replace(
      /(\s*)goto (\w+);([^\n]*)\n/g,
      (m: string, indent: string, target: string, rest: string) => {
        if (funcNames.has(target) && !allLabels.has(target)) {
          return `${indent}${target}(); return;${rest}\n`;
        }
        return m;
      }
    );
  }

  return out;
}
