export interface NormalizedKeyEvent {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  code?: string;
}

export type PlatformType = 'mac' | 'pc';
