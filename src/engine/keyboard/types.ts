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
  id: string;
  version: string;
  mappings: Record<string, { pc: string; mac: string }>;
}
