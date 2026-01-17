/**
 * InstrumentModal - Full-screen modal for instrument editing
 * Now uses UnifiedInstrumentEditor for a consistent, modern UI
 */

import React from 'react';
import { X } from 'lucide-react';
import { UnifiedInstrumentEditor } from './UnifiedInstrumentEditor';

interface InstrumentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstrumentModal: React.FC<InstrumentModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90"
      onClick={handleBackdropClick}
    >
      <div className="bg-dark-bg w-full h-full flex flex-col overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="fixed top-3 right-3 z-10 p-2 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-text-muted hover:text-text-primary"
        >
          <X size={24} />
        </button>

        {/* Unified Instrument Editor */}
        <UnifiedInstrumentEditor
          mode="modal"
          showInstrumentList={true}
          showKeyboard={true}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
