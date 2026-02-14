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
