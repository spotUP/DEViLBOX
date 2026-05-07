/**
 * NKSLibraryModal — wrapper that opens the NKS browser in a full-screen modal.
 * Open with: useUIStore.getState().openModal('nks-library')
 */

import React from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { NKSLibraryBrowser } from './NKSLibraryBrowser';
import type { NKSPreset } from '@/stores/useNKSLibraryStore';
import { notify } from '@stores/useNotificationStore';

export const NKSLibraryModal: React.FC = () => {
  const modalOpen = useUIStore(s => s.modalOpen);
  const closeModal = useUIStore(s => s.closeModal);

  if (modalOpen !== 'nks-library') return null;

  const handleLoad = (preset: NKSPreset) => {
    // TODO: wire to active instrument loader once a synth accepts NKSF paths
    notify.success(`Loaded: ${preset.name}`);
    closeModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-black/70 backdrop-blur-sm">
      <div className="flex flex-col w-full h-full bg-dark-bg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-dark-border bg-dark-bgSecondary flex-shrink-0">
          <span className="text-sm font-semibold text-text-primary tracking-wide">NKS Library Browser</span>
          <button
            onClick={closeModal}
            className="p-1 rounded hover:bg-dark-bgHover text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Browser fills remaining space */}
        <div className="flex-1 min-h-0">
          <NKSLibraryBrowser onLoadPreset={handleLoad} />
        </div>
      </div>
    </div>
  );
};
