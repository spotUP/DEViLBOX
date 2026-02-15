/**
 * MobileMenu - Hamburger menu for mobile devices
 * Provides access to MIDI, settings, export, and other features
 */

import React, { useState } from 'react';
import { Menu, X, Settings, Download, HelpCircle, Sliders, Zap, FolderOpen, Save, FilePlus, Trash2, List, Music, Grid3x3, Clock, Smartphone, LogIn, LogOut, User } from 'lucide-react';
import { AddToHomeScreenModal } from '@components/dialogs/AddToHomeScreenModal';
import { useAuthStore } from '@stores/useAuthStore';

interface MobileMenuProps {
  onShowSettings?: () => void;
  onShowExport?: () => void;
  onShowHelp?: () => void;
  onShowMasterFX?: () => void;
  onShowPatterns?: () => void;
  onLoad?: () => void;
  onSave?: () => void;
  onNew?: () => void;
  onClear?: () => void;
  onShowInstruments?: () => void;
  onShowPatternOrder?: () => void;
  onShowDrumpads?: () => void;
  onShowGrooveSettings?: () => void;
  onShowAuth?: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({
  onShowSettings,
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowPatterns,
  onLoad,
  onSave,
  onNew,
  onClear,
  onShowInstruments,
  onShowPatternOrder,
  onShowDrumpads,
  onShowGrooveSettings,
  onShowAuth,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const { user, logout, isServerAvailable } = useAuthStore();

  const handleMenuClick = (action?: () => void) => {
    if (action) action();
    setIsOpen(false);
  };

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-2 right-2 z-[10000] p-2 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-lg hover:bg-dark-bgHover transition-colors"
        aria-label="Menu"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Menu Overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu Panel */}
          <div className="fixed top-0 right-0 bottom-0 w-80 max-w-[85vw] bg-dark-bgTertiary border-l border-dark-border z-[9999] flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 bg-dark-bgSecondary border-b border-dark-border p-4 flex items-center justify-between">
              <h2 className="font-bold text-lg text-text-primary">Menu</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-dark-bgHover rounded transition-colors"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* Menu Items - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {/* User Account - Show at top if server is available */}
              {isServerAvailable && (
                <div className="mb-4">
                  <h3 className="text-xs font-bold text-text-muted uppercase mb-2 px-3">
                    Account
                  </h3>
                  {user ? (
                    <div className="bg-dark-bgSecondary rounded-lg p-3">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 rounded-full bg-accent-primary/20 text-accent-primary">
                          <User size={16} />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-text-primary">{user.username}</div>
                          <div className="text-xs text-text-muted">Signed in</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          logout();
                          setIsOpen(false);
                        }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-dark-bgTertiary hover:bg-dark-bgHover transition-colors text-text-secondary hover:text-text-primary text-sm"
                      >
                        <LogOut size={14} />
                        Sign Out
                      </button>
                    </div>
                  ) : onShowAuth ? (
                    <button
                      onClick={() => handleMenuClick(onShowAuth)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                    >
                      <LogIn size={20} className="text-accent-primary" />
                      <div>
                        <div className="text-text-primary font-medium">Sign In</div>
                        <div className="text-xs text-text-muted">Save files to the cloud</div>
                      </div>
                    </button>
                  ) : null}
                </div>
              )}

              {/* Note: MIDI settings moved to desktop navbar only - too complex for mobile menu */}

              {/* File Operations */}
              <h3 className="text-xs font-bold text-text-muted uppercase mb-2 px-3 mt-6">
                File
              </h3>

              {onLoad && (
                <button
                  onClick={() => handleMenuClick(onLoad)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <FolderOpen size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">Load</span>
                </button>
              )}

              {onSave && (
                <button
                  onClick={() => handleMenuClick(onSave)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <Save size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">Save / Download</span>
                </button>
              )}

              {onNew && (
                <button
                  onClick={() => handleMenuClick(onNew)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <FilePlus size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">New</span>
                </button>
              )}

              {onClear && (
                <button
                  onClick={() => handleMenuClick(onClear)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <Trash2 size={20} className="text-accent-warning" />
                  <span className="text-text-primary font-medium">Clear</span>
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

              {/* View / Panels */}
              <h3 className="text-xs font-bold text-text-muted uppercase mb-2 px-3 mt-6">
                View
              </h3>

              {onShowPatternOrder && (
                <button
                  onClick={() => handleMenuClick(onShowPatternOrder)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <List size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">Pattern Order</span>
                </button>
              )}

              {onShowInstruments && (
                <button
                  onClick={() => handleMenuClick(onShowInstruments)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <Music size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">Instruments</span>
                </button>
              )}

              {onShowDrumpads && (
                <button
                  onClick={() => handleMenuClick(onShowDrumpads)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <Grid3x3 size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">Drum Pads</span>
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

              {onShowMasterFX && (
                <button
                  onClick={() => handleMenuClick(onShowMasterFX)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <Sliders size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">Master Effects</span>
                </button>
              )}

              {/* Options */}
              <h3 className="text-xs font-bold text-text-muted uppercase mb-2 px-3 mt-6">
                Options
              </h3>

              {/* Add to Home Screen */}
              <button
                onClick={() => {
                  setShowInstallModal(true);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
              >
                <Smartphone size={20} className="text-accent-primary" />
                <span className="text-text-primary font-medium">Add to Home Screen</span>
              </button>

              {onShowGrooveSettings && (
                <button
                  onClick={() => handleMenuClick(onShowGrooveSettings)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-left"
                >
                  <Clock size={20} className="text-accent-primary" />
                  <span className="text-text-primary font-medium">Groove Settings</span>
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

      {/* Add to Home Screen Modal */}
      <AddToHomeScreenModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />
    </>
  );
};
