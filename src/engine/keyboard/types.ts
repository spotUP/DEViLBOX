export interface NormalizedKeyEvent {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  code?: string;
}

export type PlatformType = 'mac' | 'pc';

export type CommandContext = 'pattern' | 'sample' | 'dialog' | 'global';

export interface Command {
  name: string;
  contexts: CommandContext[];
  handler: () => boolean;
  description: string;
  undoable?: boolean;
  /** If set, this handler is called on keyup for hold-to-activate commands (e.g., fader cut) */
  releaseHandler?: () => boolean;
}

export interface KeyboardScheme {
  name: string;
  version: string;
  platform: {
    pc: Record<string, string>;
    mac: Record<string, string>;
  };
  conflicts?: Array<{
    combo: string;
    browser: string;
    solution: string;
  }>;
}
