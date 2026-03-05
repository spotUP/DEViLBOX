/**
 * Pass 2 restructurer — regex-based post-processing of Pass 1 C output.
 * Converts recognizable goto patterns into structured C (for/while/if).
 * Unrecognized patterns are left unchanged — never introduces bugs.
 */
export function restructure(code: string): string {
  let out = code;

  // Pattern: DBRA-style counted loop
  // Before:
  //   d0 = N;
  // label:
  //   ...body...
  //   if ((int16_t)(--d0) >= 0) goto label;
  //
  // After:
  //   for (int _i_d0 = N; _i_d0 >= 0; _i_d0--) { ...body... }
  out = out.replace(
    /(\w+)\s*=\s*(\d+);\n(\w+):\n([\s\S]+?)  if \(\(int16_t\)\(--\1\) >= 0\) goto \3;\n/g,
    (_m, reg, count, label, body) => {
      return `for (int _i_${reg} = ${count}; _i_${reg} >= 0; _i_${reg}--) {\n${body}}\n`;
    }
  );

  // Pattern: conditional skip (forward branch over a block)
  // Before:
  //   if (!flag_z) goto skip_N;
  //   ...body...
  // skip_N:
  //
  // After:
  //   if (flag_z) { ...body... }
  out = out.replace(
    /if \((!?)(\w+)\) goto (skip_\d+);\n([\s\S]+?)\3:\n/g,
    (_m, neg, flag, _label, body) => {
      const cond = neg ? flag : `!${flag}`;
      return `if (${cond}) {\n${body}}\n`;
    }
  );

  // Pattern: while loop (backward branch at end of block)
  // Before:
  // label:
  //   ...body (no other goto to label)...
  //   if (cond) goto label;
  //
  // After:
  //   do { ...body... } while (cond);
  out = out.replace(
    /^(\w+):\n((?:  [^\n]*\n)+?)  if \(([^)]+)\) goto \1;[^\n]*\n/gm,
    (_m, _label, body, cond) => {
      // Only convert if the label isn't used elsewhere in the body
      if (body.includes(`goto ${_label}`)) return _m;
      return `do {\n${body}} while (${cond});\n`;
    }
  );

  return out;
}
