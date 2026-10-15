/**
 * Test rig for ZynAddSubFX: runs the real worklet and WASM in Node. The engine class patches the Emscripten loader text before
 * handing it to the worklet (URL polyfills and the filesystem syscall stubs); this does the same edits.
 */
import { makeRig, emscriptenTransform, type Rig } from './wasmRig';

export const zynTransform = (code: string): string =>
  emscriptenTransform(code)
    .replace(/function ___syscall_openat\([^)]*\)\s*\{[\s\S]*?abort\([\s\S]*?\);\s*\}/, 'function ___syscall_openat(dirfd, path, flags, varargs) { return -44; }')
    .replace(/_fd_write\s*=\s*\(fd,iov,iovcnt,pnum\)\s*=>\s*\{[\s\S]*?HEAPU32\[pnum>>\d+\]\s*=\s*num;return\s+0\s*\}/, '_fd_write=(fd,iov,iovcnt,pnum)=>{return 8}');

export const makeZynRig = (): Promise<Rig> => makeRig('zynaddsubfx', 'ZynAddSubFX', { transform: zynTransform });
