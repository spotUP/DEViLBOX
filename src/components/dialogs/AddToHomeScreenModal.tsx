/**
 * AddToHomeScreenModal - Shows instructions for adding DEViLBOX to home screen
 *
 * iOS Safari doesn't support the beforeinstallprompt API, so we show manual instructions.
 * For supported browsers, we can trigger the native install prompt.
 */

import React, { useState, useEffect } from 'react';
import { X, Share, Plus, Square } from 'lucide-react';

interface AddToHomeScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddToHomeScreenModal: React.FC<AddToHomeScreenModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Check if already running in standalone mode
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Listen for beforeinstallprompt event (Chrome/Edge/Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User ${outcome} the install prompt`);

    // Clear the deferredPrompt
    setDeferredPrompt(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-[10001]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-dark-bgTertiary border-2 border-dark-border rounded-lg shadow-2xl z-[10002]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border bg-dark-bgSecondary">
          <h2 className="font-bold text-lg text-text-primary">Add to Home Screen</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-dark-bgHover rounded transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {isStandalone ? (
            <div className="text-center py-8">
              <div className="text-accent-success text-5xl mb-4">✓</div>
              <p className="text-text-primary font-bold mb-2">Already Installed!</p>
              <p className="text-text-secondary text-sm">
                DEViLBOX is already running in fullscreen mode from your home screen.
              </p>
            </div>
          ) : isIOS ? (
            <>
              <p className="text-text-primary">
                Add DEViLBOX to your home screen for a fullscreen app experience:
              </p>

              <ol className="space-y-4 text-text-secondary text-sm">
                <li className="flex gap-3">
                  <span className="font-bold text-accent-primary flex-shrink-0">1.</span>
                  <div>
                    <p className="mb-2">
                      Tap the <strong className="text-text-primary">Share button</strong>
                      <Share size={16} className="inline mx-1 text-accent-primary" />
                      at the bottom of Safari
                    </p>
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="font-bold text-accent-primary flex-shrink-0">2.</span>
                  <div>
                    <p className="mb-2">
                      Scroll and tap <strong className="text-text-primary">"Add to Home Screen"</strong>
                      <Plus size={16} className="inline mx-1 text-accent-primary" />
                    </p>
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="font-bold text-accent-primary flex-shrink-0">3.</span>
                  <div>
                    <p>
                      Tap <strong className="text-text-primary">"Add"</strong> to confirm
                    </p>
                  </div>
                </li>
              </ol>

              <div className="bg-accent-info/10 border border-accent-info/30 rounded p-3 mt-4">
                <p className="text-xs text-accent-info">
                  <strong>Tip:</strong> Once added, launch DEViLBOX from your home screen
                  for true fullscreen mode without the Safari browser UI.
                </p>
              </div>
            </>
          ) : deferredPrompt ? (
            <>
              <p className="text-text-primary mb-4">
                Install DEViLBOX as a standalone app for the best experience:
              </p>

              <button
                onClick={handleInstallClick}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-accent-primary hover:bg-accent-primary/90 text-white font-bold rounded-lg transition-colors"
              >
                <Square size={20} />
                Install DEViLBOX
              </button>

              <div className="bg-accent-info/10 border border-accent-info/30 rounded p-3 mt-4">
                <p className="text-xs text-accent-info">
                  Runs fullscreen without browser UI, can be launched from your app drawer
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-text-primary mb-4">
                To install DEViLBOX, use your browser's menu and select "Install" or "Add to Home Screen"
              </p>
              <p className="text-text-secondary text-sm">
                The install option may appear in your browser's settings menu (⋮ or ···)
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-dark-border bg-dark-bgSecondary">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-dark-bgHover hover:bg-dark-border text-text-primary font-medium rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
};
