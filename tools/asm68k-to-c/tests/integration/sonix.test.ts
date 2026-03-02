/**
 * Integration test: Sonix Music Driver (SonixMusicDriver_v1.asm)
 *
 * This is a real 8973-line Amiga EaglePlayer replayer. It exercises:
 *   - Devpac-style column-0 bare labels (no colon)
 *   - Single-quoted strings (dc.b 'hello')
 *   - hex displacement offsets  $10(A2)
 *   - CLR to Paula registers (volume clear on init)
 *   - MOVE to $DFF096 (DMACON — paula_dma_write)
 *   - Many unresolved symbols from missing include files
 */

import { tokenize } from '../../src/lexer.js';
import { parse } from '../../src/parser.js';
import { resolve, ResolveResult } from '../../src/resolver.js';
import { emit } from '../../src/emitter.js';
import type { AstNode } from '../../src/ast.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SONIX_PATH = path.resolve(
  __dirname,
  '../../../../Reference Code/sonix-music-driver/SonixMusicDriver_v1.asm'
);
const RUNTIME_DIR = path.resolve(__dirname, '../../runtime');

let ast: AstNode[];
let resolved: ResolveResult;
let generated: string;

beforeAll(() => {
  const source = fs.readFileSync(SONIX_PATH, 'utf-8');
  const tokens = tokenize(source);
  ast = parse(tokens);
  resolved = resolve(ast);
  generated = emit(ast, resolved);
});

test('parses without crash (>500 AST nodes)', () => {
  expect(ast.length).toBeGreaterThan(500);
});

test('resolver finds Interrupt label', () => {
  expect(resolved.labels.has('Interrupt')).toBe(true);
});

test('resolver finds InitSound label', () => {
  expect(resolved.labels.has('InitSound')).toBe(true);
});

test('resolver finds PlaySNX label', () => {
  expect(resolved.labels.has('PlaySNX')).toBe(true);
});

test('resolver detects Paula writes (CLR to volume registers)', () => {
  expect(resolved.paulaWrites.length).toBeGreaterThan(0);
});

test('emitter includes paula_soft.h header', () => {
  expect(generated).toContain('#include "paula_soft.h"');
});

test('emitter produces paula_dma_write calls (MOVE to $DFF096)', () => {
  expect(generated).toContain('paula_dma_write');
});

test('generated C compiles with gcc -c (0 errors)', () => {
  const tmpDir = fs.mkdtempSync('/tmp/sonix-test-');
  try {
    const cFile = path.join(tmpDir, 'sonix.c');
    const paulaH = path.join(tmpDir, 'paula_soft.h');

    fs.copyFileSync(path.join(RUNTIME_DIR, 'paula_soft.h'), paulaH);
    fs.writeFileSync(cFile, generated);

    execSync(`gcc -c -o /dev/null "${cFile}" -I"${tmpDir}" 2>&1`, { stdio: 'pipe' });
  } catch (e: any) {
    const stderr = e.stderr?.toString() || e.stdout?.toString() || e.message;
    throw new Error(`gcc compile failed:\n${stderr}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});
