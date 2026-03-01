import type { AstNode, DataNode } from './ast.js';
import type { ResolveResult } from './resolver.js';
import { emitInstruction } from './instr-map.js';

const PREAMBLE = `\
#include "paula_soft.h"
#include <stdint.h>

/* Register file */
static uint32_t d0,d1,d2,d3,d4,d5,d6,d7;
static uint32_t a0,a1,a2,a3,a4,a5,a6,sp;
static int flag_z=0, flag_n=0, flag_c=0, flag_v=0, flag_x=0;

/* Size helpers */
#define W(r)  (*((uint16_t*)&(r)))
#define B(r)  (*((uint8_t*)&(r)))

/* Memory access */
#define READ8(addr)   (*((const uint8_t*)(uintptr_t)(addr)))
#define READ16(addr)  (*((const uint16_t*)(uintptr_t)(addr)))
#define READ32(addr)  (*((const uint32_t*)(uintptr_t)(addr)))
#define WRITE8(addr,v)  (*((uint8_t*)(uintptr_t)(addr)) = (uint8_t)(v))
#define WRITE16(addr,v) (*((uint16_t*)(uintptr_t)(addr)) = (uint16_t)(v))
#define WRITE32(addr,v) (*((uint32_t*)(uintptr_t)(addr)) = (uint32_t)(v))
#define READ8_POST(r)   ({ uint32_t _r=(r); (r)+=1; READ8(_r); })
#define READ16_POST(r)  ({ uint32_t _r=(r); (r)+=2; READ16(_r); })
#define READ32_POST(r)  ({ uint32_t _r=(r); (r)+=4; READ32(_r); })
#define READ8_PRE(r)    ({ (r)-=1; READ8(r); })
#define READ16_PRE(r)   ({ (r)-=2; READ16(r); })
#define READ32_PRE(r)   ({ (r)-=4; READ32(r); })
#define WRITE8_POST(r,v)  ({ WRITE8(r,v);  (r)+=1; })
#define WRITE16_POST(r,v) ({ WRITE16(r,v); (r)+=2; })
#define WRITE32_POST(r,v) ({ WRITE32(r,v); (r)+=4; })
#define WRITE8_PRE(r,v)   ({ (r)-=1; WRITE8(r,v); })
#define WRITE16_PRE(r,v)  ({ (r)-=2; WRITE16(r,v); })
#define WRITE32_PRE(r,v)  ({ (r)-=4; WRITE32(r,v); })

/* Rotation helpers */
#define ROL32(v,n)  (((v)<<(n))|((v)>>(32-(n))))
#define ROR32(v,n)  (((v)>>(n))|((v)<<(32-(n))))
`;

function emitData(node: DataNode, label: string | undefined): string {
  const typeStr: Record<string, string> = { B: 'uint8_t', W: 'uint16_t', L: 'uint32_t', S: 'uint16_t' };
  const t = typeStr[node.size ?? 'B'] ?? 'uint8_t';
  const vals = node.values.map(v =>
    typeof v === 'string' ? `"${v}"` : `0x${v.toString(16)}`
  ).join(', ');
  const name = label ?? `_data_${node.line}`;
  return `static const ${t} ${name}[] = { ${vals} };`;
}

export function emit(ast: AstNode[], resolved: ResolveResult): string {
  const lines: string[] = [PREAMBLE];

  // EQU constants as #defines
  lines.push('/* EQU constants */');
  for (const [name, value] of resolved.symbols) {
    lines.push(`#define ${name} ${value}`);
  }
  lines.push('');

  // Forward declarations for BSR/JSR targets
  const funcLabels = new Set<string>();
  for (const node of ast) {
    if (node.kind === 'instruction' && (node.mnemonic === 'BSR' || node.mnemonic === 'JSR')) {
      const t = node.operands[0];
      if (t?.kind === 'label_ref') funcLabels.add(t.name);
      if (t?.kind === 'pc_rel') funcLabels.add(t.label);
    }
  }
  if (funcLabels.size > 0) {
    lines.push('/* Forward declarations */');
    for (const name of funcLabels) {
      lines.push(`static void ${name}(void);`);
    }
    lines.push('');
  }

  // Walk AST
  let inFunction = false;
  let pendingLabel: string | undefined;
  let anonCount = 0;

  for (let i = 0; i < ast.length; i++) {
    const node = ast[i];

    switch (node.kind) {
      case 'comment':
        if (!inFunction) lines.push(`/* ${node.text.replace(/^[;*]\s*/, '')} */`);
        else lines.push(`  /* ${node.text.replace(/^[;*]\s*/, '')} */`);
        break;

      case 'equ':
        // Already emitted as #define above
        break;

      case 'xdef':
        break;

      case 'section':
        if (inFunction) { lines.push('}'); inFunction = false; }
        lines.push(`\n/* SECTION ${node.name} */`);
        break;

      case 'data': {
        if (inFunction) { lines.push('}'); inFunction = false; }
        lines.push(emitData(node, pendingLabel));
        pendingLabel = undefined;
        break;
      }

      case 'label': {
        // Peek at the next non-comment node
        let nextIdx = i + 1;
        while (nextIdx < ast.length && ast[nextIdx].kind === 'comment') nextIdx++;
        const next = ast[nextIdx];

        if (next?.kind === 'instruction' || next?.kind === 'label') {
          // Start a new function
          if (next?.kind === 'label') {
            // Note: consecutive labels — fall-through not preserved in C
            if (inFunction) {
              lines.push('  /* NOTE: fall-through to next label not preserved */');
            }
          }
          if (inFunction) lines.push('}');
          const isExported = resolved.exports.includes(node.name);
          const qualifier = isExported ? '' : 'static ';
          lines.push(`\n${qualifier}void ${node.name}(void) {`);
          inFunction = true;
          pendingLabel = undefined;
        } else {
          // Data label or end-of-file label — store for data emission
          pendingLabel = node.name;
        }
        break;
      }

      case 'instruction': {
        if (!inFunction) {
          lines.push(`\nstatic void _anon${anonCount++}(void) {`);
          inFunction = true;
        }
        const c = emitInstruction(node);
        lines.push(`  ${c}`);
        break;
      }
    }
  }

  if (inFunction) lines.push('}');

  if (resolved.warnings.length > 0) {
    lines.push('\n/* TRANSPILER WARNINGS:');
    for (const w of resolved.warnings) lines.push(` * ${w}`);
    lines.push(' */');
  }

  return lines.join('\n');
}
