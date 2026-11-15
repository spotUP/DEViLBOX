// Thin loader: runs the vendored SGDK xgmtool (WASM) on MEMFS. No conversion logic lives here.
interface XgmtoolModule {
  FS: { writeFile(p: string, d: Uint8Array): void; readFile(p: string): Uint8Array };
  callMain(args: string[]): number;
}
type CreateXgmtool = (opts?: { locateFile?: (f: string) => string; print?: (s: string) => void }) => Promise<XgmtoolModule>;

export interface XgmtoolOptions {
  /** Resolves xgmtool.wasm; defaults to the file beside xgmtool.js. */
  locateFile?: (file: string) => string;
  /** Extra xgmtool flags, e.g. ['-s'] to keep sample bank. */
  flags?: string[];
}

/** Convert VGM bytes (uncompressed) to XGM bytes. Throws with xgmtool's output on failure. */
export async function vgmToXgm(vgm: Uint8Array, create: CreateXgmtool, opts: XgmtoolOptions = {}): Promise<{ xgm: Uint8Array; log: string }> {
  const lines: string[] = [];
  const mod = await create({ locateFile: opts.locateFile, print: (s) => lines.push(s) });
  mod.FS.writeFile('/in.vgm', vgm);
  let code: number;
  try {
    code = mod.callMain(['/in.vgm', '/out.xgm', ...(opts.flags ?? [])]);
  } catch (e) {
    // xgmtool calls exit(n); Emscripten surfaces it as ExitStatus
    code = (e as { status?: number }).status ?? 1;
  }
  const log = lines.join('\n');
  if (code !== 0) throw new Error(`xgmtool exit ${code}: ${log}`);
  return { xgm: mod.FS.readFile('/out.xgm'), log };
}
