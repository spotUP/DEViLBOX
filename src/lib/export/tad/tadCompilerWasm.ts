// Thin loader: runs the vendored Terrific Audio Driver compiler (tad-wasm/, WASM) on MEMFS.
// No compiler logic lives here; same shape as xgmtoolWasm.ts.
interface TadModule {
  FS: {
    writeFile(p: string, d: Uint8Array | string): void;
    readFile(p: string): Uint8Array;
    mkdirTree(p: string): void;
    readdir(p: string): string[];
  };
  callMain(args: string[]): number;
}
export type CreateTadCompiler = (opts?: {
  locateFile?: (f: string) => string;
  print?: (s: string) => void;
  printErr?: (s: string) => void;
}) => Promise<TadModule>;

export interface TadRun { code: number; log: string }

/** A project directory in MEMFS plus a way to run tad-compiler commands against it. */
export interface TadSession {
  /** Run one tad-compiler command; paths are MEMFS paths (project lives under /p, write outputs to /o). */
  run(args: string[]): TadRun;
  read(path: string): Uint8Array;
}

/** Load the compiler and write `files` (relative path -> bytes or text) under /p. */
export async function openTadSession(
  files: Record<string, Uint8Array | string>,
  create: CreateTadCompiler,
  locateFile?: (f: string) => string,
): Promise<TadSession> {
  let lines: string[] = [];
  const push = (s: string) => lines.push(s);
  const mod = await create({ locateFile, print: push, printErr: push });
  for (const [rel, data] of Object.entries(files)) {
    const p = `/p/${rel}`;
    mod.FS.mkdirTree(p.slice(0, p.lastIndexOf('/')));
    mod.FS.writeFile(p, data);
  }
  mod.FS.mkdirTree('/o');
  return {
    run(args) {
      lines = [];
      let code: number;
      try {
        code = mod.callMain(args);
      } catch (e) {
        // clap / process::exit surface as Emscripten ExitStatus
        code = (e as { status?: number }).status ?? 1;
      }
      return { code, log: lines.join('\n') };
    },
    read: (path) => mod.FS.readFile(path),
  };
}
