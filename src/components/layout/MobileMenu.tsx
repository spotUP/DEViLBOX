/**
 * MobileMenu - Hamburger menu for mobile devices
 * Provides access to MIDI, settings, export, and other features
 */

import React, { useState } from 'react';
import { Menu, X, Settings, Download, HelpCircle, Sliders, Zap } from 'lucide-react';
import { MIDIToolbarDropdown } from '@components/midi/MIDIToolbarDropdown';

interface MobileMenuProps {
  onShowSettings?: () => void;
  onShowExport?: () => void;
  onShowHelp?: () => void;
  onShowMasterFX?: () => void;
  onShowPatterns?: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({
  onShowSettings,
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowPatterns,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleMenuClick = (action?: () => void) => {
    if (action) action();
    setIsOpen(false);
  };

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-2 right-2 z-50 p-2 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-lg hover:bg-dark-bgHover transition-colors"
        aria-label="Menu"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Menu Overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu Panel */}
          <div className="fixed top-0 right-0 bottom-0 w-80 max-w-[85vw] bg-dark-bgTertiary border-l border-dark-border z-50 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-dark-bgSecondary border-b border-dark-border p-4 flex items-center justify-between">
              <h2 className="font-bold text-lg text-text-primary">Menu</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-dark-bgHover rounded transition-colors"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* Menu Items */}
            <div className="p-4 space-y-2">
              {/* MIDI Settings - Inline component */}
              <div className="mb-4">
                <h3 className="text-xs font-bold text-text-muted uppercase mb-2 px-3">
                  MIDI Settings
                </h3>
                <div className="bg-dark-bgSecondary rounded-lg p-3">
                  <MIDIToolbarDropdown />
                </div>
              </div>

              {/* Actions */}
              <h3 className="text-xs font-bold text-text-muted uppercase mb-2 px-3 mt-6">
                Actions
              </h3>

              {onShowMasterFX && (
                <button
                  onClick={() => handleMenuClick(onShowMasterFX)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <Sliders size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">Master Effects</span>
                </button>
              )}

              {onShowPatterns && (
                <button
                  onClick={() => handleMenuClick(onShowPatterns)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <Zap size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">Patterns</span>
                </button>
              )}

              {onShowExport && (
                <button
                  onClick={() => handleMenuClick(onShowExport)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <Download size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">Export / Import</span>
                </button>
              )}

              {onShowSettings && (
                <button
                  onClick={() => handleMenuClick(onShowSettings)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <Settings size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">Settings</span>
                </button>
              )}

              {onShowHelp && (
                <button
                  onClick={() => handleMenuClick(onShowHelp)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <HelpCircle size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">Help</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};
