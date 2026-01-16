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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl w-[95vw] h-[90vh] max-w-[1400px] flex flex-col overflow-hidden animate-scale-in">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-text-muted hover:text-text-primary"
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
