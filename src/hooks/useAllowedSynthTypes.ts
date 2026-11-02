import { useFormatStore } from '@stores/useFormatStore';
import { allowedSynthTypes, isSynthAllowed, formatDisplayName } from '@/lib/formats/EditableFormatRegistry';
import type { SynthType } from '@typedefs/instrument';

export interface AllowedSynthTypes {
  /** Loaded format name, or null for a generic (unlocked) project. */
  lockedBy: string | null;
  /** Allowed set; null = every synth type. */
  allowed: readonly SynthType[] | null;
  isAllowed: (synthType: SynthType) => boolean;
  /** Tooltip text for a disabled picker entry; empty when the type is allowed. */
  disabledReason: (synthType: SynthType) => string;
}

/** The instrument kinds the loaded format can hold (N14); pickers disable the rest. */
export function useAllowedSynthTypes(): AllowedSynthTypes {
  const formatId = useFormatStore((s) => s.activeFormatId);
  const allowed = allowedSynthTypes(formatId);
  const lockedBy = allowed && formatId ? formatDisplayName(formatId) : null;
  return {
    lockedBy,
    allowed,
    isAllowed: (synthType) => isSynthAllowed(formatId, synthType),
    disabledReason: (synthType) =>
      isSynthAllowed(formatId, synthType) ? '' : `${lockedBy} cannot hold ${synthType} instruments`,
  };
}
