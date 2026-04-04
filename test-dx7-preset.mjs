/**
 * Standalone DX7 preset switching test.
 * Loads WASM + firmware + voices, sends program changes,
 * and checks EGS registers to verify the firmware processes them.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASE = resolve('.');

// Load the JS glue code and create the module factory
const jsCode = readFileSync(resolve(BASE, 'public/dx7/DX7.js'), 'utf8');
const wasmBinary = readFileSync(resolve(BASE, 'public/dx7/DX7.wasm'));

// Provide minimal DOM stubs
globalThis.document = { createElement: () => ({ relList: { supports: () => false }, tagName: 'DIV' }), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], getElementsByTagName: () => [], head: { appendChild: () => {} }, addEventListener: () => {}, removeEventListener: () => {} };
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, location: { href: '', pathname: '' } };

// Create module factory
const wrappedCode = jsCode + '\nreturn createDX7Module;';
const factory = new Function(wrappedCode);
const createDX7Module = factory();

const m = await createDX7Module({ wasmBinary: wasmBinary.buffer });
console.log('WASM module loaded');

// Init
m._dx7Init();
console.log('DX7 initialized');

// Load firmware ROM
const romPaths = ['public/roms/dx7/DX7-V1-8.OBJ', 'public/roms/dx7/dx7_rom.bin'];
let romData;
for (const p of romPaths) {
  try { romData = readFileSync(resolve(BASE, p)); break; } catch {}
}
if (!romData || romData.length !== 16384) { console.error('No 16KB ROM found!'); process.exit(1); }

const romPtr = m._malloc(16384);
m.HEAPU8.set(romData, romPtr);
const romResult = m._dx7LoadFirmware(romPtr, 16384);
m._free(romPtr);
console.log(`Firmware loaded: result=${romResult}`);

// Check cart present flag
console.log(`Cart present: ${m._dx7GetCartPresent()}`);
console.log(`Serial pending: ${m._dx7GetSerialPending()}`);

// Load voices
const voicePaths = ['public/roms/dx7/DX7_Voice_Rom2.BIN', 'public/roms/dx7/voices.bin'];
let voiceData;
for (const p of voicePaths) {
  try { voiceData = readFileSync(resolve(BASE, p)); break; } catch {}
}
if (voiceData) {
  const vPtr = m._malloc(voiceData.length);
  m.HEAPU8.set(voiceData, vPtr);
  m._dx7LoadVoices(vPtr, voiceData.length);
  m._free(vPtr);
  console.log(`Voices loaded: ${voiceData.length} bytes`);
}

// Helper: read memory bytes
function readMem(addr, count) {
  const bytes = [];
  for (let i = 0; i < count; i++) bytes.push(m._dx7ReadMem(addr + i));
  return bytes;
}

// Helper: read voice name from memory at 0x1000 + voiceIdx * 128 + 118
function readVoiceName(voiceIdx) {
  const offset = 0x1000 + voiceIdx * 128 + 118;
  return readMem(offset, 10).map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : ' ').join('').trim();
}

// Helper: read EGS registers
function readEGS() { return readMem(0x3000, 64); }

// Helper: generate N samples of audio (runs firmware CPU)
function generateAudio(n) {
  const outL = m._malloc(n * 4);
  const outR = m._malloc(n * 4);
  m._dx7Process(outL, outR, n);
  const heap = m.HEAPF32;
  const samples = [];
  for (let i = 0; i < Math.min(n, 16); i++) samples.push(heap[outL / 4 + i]);
  m._free(outL);
  m._free(outR);
  return samples;
}

console.log('\n=== AFTER INIT (before any sysex) ===');
console.log('Voice 0 name:', readVoiceName(0));
console.log('Voice 1 name:', readVoiceName(1));
console.log('Voice 5 name:', readVoiceName(5));
console.log('Cart present:', m._dx7GetCartPresent());
console.log('Serial pending:', m._dx7GetSerialPending());
console.log('EGS[0..15]:', readEGS().slice(0, 16));

// Generate some audio to let firmware settle
generateAudio(512);
generateAudio(512);
console.log('\n=== AFTER 1024 samples (firmware settled) ===');
console.log('Serial pending:', m._dx7GetSerialPending());
console.log('EGS[0..15]:', readEGS().slice(0, 16));

// Now load rom1a.syx
let sysexData;
try { sysexData = readFileSync(resolve(BASE, 'public/roms/dx7/Patches/rom1a.syx')); } catch {}
if (sysexData) {
  console.log('\n=== LOADING rom1a.syx (4104 bytes) ===');
  const egsBeforeSyx = readEGS();
  
  const sPtr = m._malloc(sysexData.length);
  m.HEAPU8.set(sysexData, sPtr);
  m._dx7LoadSysex(sPtr, sysexData.length);
  m._free(sPtr);
  
  console.log('Voice 0 name after memcpy:', readVoiceName(0));
  console.log('Voice 1 name after memcpy:', readVoiceName(1));
  console.log('Serial pending after loadSysex:', m._dx7GetSerialPending());
  
  // Run audio to let firmware process serial bytes
  generateAudio(512);
  console.log('Serial pending after 512 samples:', m._dx7GetSerialPending());
  generateAudio(512);
  console.log('Serial pending after 1024 samples:', m._dx7GetSerialPending());
  generateAudio(512);
  generateAudio(512);
  console.log('Serial pending after 2048 samples:', m._dx7GetSerialPending());
  
  const egsAfterSyx = readEGS();
  let egsChanged = false;
  for (let i = 0; i < 64; i++) {
    if (egsBeforeSyx[i] !== egsAfterSyx[i]) { egsChanged = true; break; }
  }
  console.log('EGS changed after sysex + PC:', egsChanged);
  console.log('EGS[0..15] before:', egsBeforeSyx.slice(0, 16));
  console.log('EGS[0..15] after:', egsAfterSyx.slice(0, 16));
}

// Now test standalone program change (voice 5 within current bank)
console.log('\n=== PROGRAM CHANGE to voice 5 ===');
const egsBeforePC = readEGS();
m._dx7ProgramChange(5);
console.log('Serial pending after PC:', m._dx7GetSerialPending());

// Run audio
generateAudio(512);
generateAudio(512);
generateAudio(512);
generateAudio(512);
console.log('Serial pending after 2048 samples:', m._dx7GetSerialPending());

const egsAfterPC = readEGS();
let pcChanged = false;
const diffs = [];
for (let i = 0; i < 64; i++) {
  if (egsBeforePC[i] !== egsAfterPC[i]) {
    pcChanged = true;
    diffs.push(`[${i}] ${egsBeforePC[i]} → ${egsAfterPC[i]}`);
  }
}
console.log('EGS changed after PC to voice 5:', pcChanged);
if (diffs.length > 0) console.log('Changed regs:', diffs.join(', '));
else console.log('EGS[0..31] before:', egsBeforePC.slice(0, 32));

// Test: read the P_CRT_PEDALS_LCD register and TRCSR
console.log('\n=== CPU STATE ===');
console.log('P_CRT_PEDALS_LCD (0x2802):', '0x' + m._dx7ReadMem(0x2802).toString(16));
console.log('TRCSR (0x11):', '0x' + m._dx7ReadMem(0x11).toString(16));
console.log('RMCR (0x10):', '0x' + m._dx7ReadMem(0x10).toString(16));
console.log('RDR (0x12):', '0x' + m._dx7ReadMem(0x12).toString(16));

// Final comprehensive check — try sending a VCED preset
console.log('\n=== VCED PRESET TEST ===');
// Build a simple electric piano VCED preset (155 bytes)
// Use algorithm 5 with a modulator+carrier setup
const vced = new Uint8Array(155);
// Set algorithm to 5 (4 in 0-indexed)
vced[134] = 4;
// Set feedback to 6
vced[135] = 6;
// Set operator 6 (carrier) output level to 99
vced[16] = 99; // op1 output level
vced[21 + 16] = 99; // op2 output level
// Set some EG rates for op1
vced[0] = 95; vced[1] = 50; vced[2] = 35; vced[3] = 78; // rates
vced[4] = 99; vced[5] = 75; vced[6] = 0; vced[7] = 0;   // levels
// Transpose
vced[144] = 24;
// Name
const name = 'TEST EP  ';
for (let i = 0; i < 10; i++) vced[145 + i] = name.charCodeAt(i);

// Pack VCED to VMEM (simplified inline version of vcedToVmem)
const vmem = new Uint8Array(128);
for (let op = 0; op < 6; op++) {
  const vs = op * 21, vd = op * 17;
  for (let i = 0; i < 8; i++) vmem[vd + i] = vced[vs + i];
  vmem[vd + 8] = vced[vs + 8];
  vmem[vd + 9] = vced[vs + 9];
  vmem[vd + 10] = vced[vs + 10];
  vmem[vd + 11] = (vced[vs + 11] & 0x03) | ((vced[vs + 12] & 0x03) << 2);
  vmem[vd + 12] = (vced[vs + 13] & 0x07) | ((vced[vs + 20] & 0x0F) << 3);
  vmem[vd + 13] = (vced[vs + 14] & 0x03) | ((vced[vs + 15] & 0x07) << 2);
  vmem[vd + 14] = vced[vs + 16];
  vmem[vd + 15] = (vced[vs + 17] & 0x01) | ((vced[vs + 18] & 0x1F) << 1);
  vmem[vd + 16] = vced[vs + 19];
}
for (let i = 0; i < 8; i++) vmem[102 + i] = vced[126 + i];
vmem[110] = vced[134] & 0x1F;
vmem[111] = (vced[135] & 0x07) | ((vced[136] & 0x01) << 3);
vmem[112] = vced[137]; vmem[113] = vced[138]; vmem[114] = vced[139]; vmem[115] = vced[140];
vmem[116] = (vced[141] & 0x01) | ((vced[142] & 0x07) << 1) | ((vced[143] & 0x07) << 4);
vmem[117] = vced[144];
for (let i = 0; i < 10; i++) vmem[118 + i] = vced[145 + i];

// Build 4104-byte sysex
const sysex = new Uint8Array(4104);
sysex[0] = 0xF0; sysex[1] = 0x43; sysex[2] = 0x00; sysex[3] = 0x09; sysex[4] = 0x20; sysex[5] = 0x00;
sysex.set(vmem, 6);
let sum = 0;
for (let i = 6; i < 4102; i++) sum += sysex[i];
sysex[4102] = (-sum) & 0x7F;
sysex[4103] = 0xF7;

const egsBeforeVced = readEGS();
const sxPtr = m._malloc(4104);
m.HEAPU8.set(sysex, sxPtr);
m._dx7LoadSysex(sxPtr, 4104);
m._free(sxPtr);

console.log('Voice 0 name after VCED load:', readVoiceName(0));
console.log('Serial pending after VCED sysex:', m._dx7GetSerialPending());

// Run lots of audio
for (let i = 0; i < 20; i++) generateAudio(512);
console.log('Serial pending after 10240 samples:', m._dx7GetSerialPending());

const egsAfterVced = readEGS();
let vcedChanged = false;
const vcedDiffs = [];
for (let i = 0; i < 64; i++) {
  if (egsBeforeVced[i] !== egsAfterVced[i]) {
    vcedChanged = true;
    vcedDiffs.push(`[${i}] ${egsBeforeVced[i]} → ${egsAfterVced[i]}`);
  }
}
console.log('EGS changed after VCED preset:', vcedChanged);
if (vcedDiffs.length > 0) console.log('Changed regs:', vcedDiffs.slice(0, 20).join(', '));
else {
  console.log('EGS[0..31]:', egsAfterVced.slice(0, 32));
  console.log('NO EGS CHANGE — FIRMWARE IS NOT PROCESSING PROGRAM CHANGES!');
}

console.log('\n=== DONE ===');
