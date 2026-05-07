/**
 * NKSLibraryModal — wrapper that opens the NKS browser in a full-screen modal.
 * Open with: useUIStore.getState().openModal('nks-library')
 */

import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { KontaktPlayer } from '@components/instruments/KontaktPlayer';
import { useUIStore } from '@stores/useUIStore';
import { NKSLibraryBrowser } from './NKSLibraryBrowser';
import type { DevilboxPreset, NKSPreset } from '@/stores/useNKSLibraryStore';
import { notify } from '@stores/useNotificationStore';

export const NKSLibraryModal: React.FC = () => {
  const modalOpen = useUIStore(s => s.modalOpen);
  const closeModal = useUIStore(s => s.closeModal);

  if (modalOpen !== 'nks-library') return null;

  const handleLoad = (preset: NKSPreset | DevilboxPreset) => {
    notify.success(`Loaded: ${preset.name}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-black/70 backdrop-blur-sm">
      <div className="flex flex-col w-full h-full bg-dark-bg">
        <div className="flex items-center justify-between px-4 py-2 border-b border-dark-border bg-dark-bgSecondary flex-shrink-0">
          <span className="text-sm font-semibold text-text-primary tracking-wide">Preset Library Browser</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={closeModal}
            aria-label="Close"
            icon={<X size={16} />}
          />
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 min-h-0 min-w-0">
            <NKSLibraryBrowser onLoadPreset={handleLoad} />
          </div>
          <aside className="w-[22rem] border-l border-dark-border bg-dark-bgSecondary min-h-0">
            <KontaktPlayer />
          </aside>
        </div>
      </div>
    </div>
  );
};
