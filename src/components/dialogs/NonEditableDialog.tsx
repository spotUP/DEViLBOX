/**
 * NonEditableDialog — Shown when the user attempts to edit a pattern that
 * was imported in UADE playback-only (classic) mode.
 *
 * This happens when UADE's enhanced scan fails to extract real PCM samples
 * (e.g. pure synthesis formats, broken files). The patterns are display-only
 * and cannot be written back to the tracker.
 */

import React from 'react';
import { Lock, RefreshCcw } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { useUIStore } from '@stores/useUIStore';
import { useModalClose } from '@hooks/useDialogKeyboard';

export const NonEditableDialog: React.FC = () => {
  const isOpen = useUIStore((s) => s.nonEditableDialogOpen);
  const close  = useUIStore((s) => s.closeNonEditableDialog);
  useModalClose({ isOpen, onClose: close });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9990]">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-full max-w-[90vw] md:max-w-[420px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-dark-border">
          <Lock size={18} className="text-accent-primary shrink-0" />
          <h2 className="text-sm font-semibold text-text-primary">Pattern is Read-Only</h2>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-text-primary">
            This song was imported in <span className="text-accent-primary font-medium">UADE playback mode</span> because
            the enhanced scan could not extract editable audio data from it.
          </p>
          <p className="text-sm text-text-muted">
            This usually happens with synthesis-based formats where samples are generated
            by the 68k CPU at runtime rather than stored as PCM in the file.
          </p>
          <div className="flex items-start gap-2 p-3 bg-dark-bg rounded text-xs text-text-muted border border-dark-border">
            <RefreshCcw size={12} className="mt-0.5 shrink-0 text-accent-primary" />
            <span>
              To edit this song, re-import the file. If the format has a native parser,
              it will load with full instrument and pattern editing support.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-dark-border">
          <Button variant="primary" size="sm" onClick={close}>
            OK
          </Button>
        </div>
      </div>
    </div>
  );
};
