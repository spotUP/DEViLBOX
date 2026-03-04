/**
 * PixiAddToHomeScreenModal — GL-native add-to-home-screen dialog.
 * Pixel-perfect match to DOM: src/components/dialogs/AddToHomeScreenModal.tsx
 *
 * DOM structure:
 *   backdrop bg-black/70 → PixiModal overlayAlpha=0.7
 *   container max-w-md border-2 rounded-lg → width=448, borderRadius=8, borderWidth=2
 *   header p-4 border-b bg-dark-bgSecondary → PixiModalHeader
 *   content p-6 space-y-4 → padding 24, gap 16
 *   footer p-4 border-t bg-dark-bgSecondary → PixiModalFooter
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiLabel } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';

interface PixiAddToHomeScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODAL_W = 448;
const MODAL_H = 400;

export const PixiAddToHomeScreenModal: React.FC<PixiAddToHomeScreenModalProps> = ({
  isOpen,
  onClose,
}) => {
  const theme = usePixiTheme();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                       (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User ${outcome} the install prompt`);
    setDeferredPrompt(null);
    onClose();
  }, [deferredPrompt, onClose]);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H} overlayAlpha={0.7} borderWidth={2}>
      <PixiModalHeader title="Add to Home Screen" onClose={onClose} />

      {/* Content — p-6 space-y-4 → padding 24, gap 16 */}
      <layoutContainer layout={{ flex: 1, flexDirection: 'column', padding: 24, gap: 16 }}>
        {isStandalone ? (
          /* Already installed */
          <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', paddingTop: 32, paddingBottom: 32, gap: 16 }}>
            <pixiBitmapText
              text="✓"
              style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 50, fill: 0xffffff }}
              tint={theme.success.color}
              layout={{}}
            />
            <PixiLabel text="Already Installed!" size="md" weight="bold" color="text" />
            <PixiLabel
              text="DEViLBOX is already running in fullscreen mode from your home screen."
              size="sm"
              color="textSecondary"
              layout={{ maxWidth: MODAL_W - 80 }}
            />
          </layoutContainer>
        ) : isIOS ? (
          /* iOS instructions */
          <>
            <PixiLabel
              text="Add DEViLBOX to your home screen for a fullscreen app experience:"
              size="sm"
              color="text"
              layout={{ maxWidth: MODAL_W - 48 }}
            />

            {/* Step 1 */}
            <layoutContainer layout={{ flexDirection: 'row', gap: 12 }}>
              <PixiLabel text="1." size="sm" weight="bold" color="accent" />
              <PixiLabel
                text={'Tap the Share button at the bottom of Safari'}
                size="sm"
                color="textSecondary"
                layout={{ maxWidth: MODAL_W - 96 }}
              />
            </layoutContainer>

            {/* Step 2 */}
            <layoutContainer layout={{ flexDirection: 'row', gap: 12 }}>
              <PixiLabel text="2." size="sm" weight="bold" color="accent" />
              <PixiLabel
                text={'Scroll and tap "Add to Home Screen" ＋'}
                size="sm"
                color="textSecondary"
                layout={{ maxWidth: MODAL_W - 96 }}
              />
            </layoutContainer>

            {/* Step 3 */}
            <layoutContainer layout={{ flexDirection: 'row', gap: 12 }}>
              <PixiLabel text="3." size="sm" weight="bold" color="accent" />
              <PixiLabel
                text={'Tap "Add" to confirm'}
                size="sm"
                color="textSecondary"
                layout={{ maxWidth: MODAL_W - 96 }}
              />
            </layoutContainer>

            {/* Tip box — bg-accent-info/10 border-accent-info/30 p-3 */}
            <layoutContainer
              layout={{
                padding: 12,
                borderRadius: 6,
                borderWidth: 1,
                backgroundColor: 0x0a2a3a,
                borderColor: 0x1a5a7a,
                marginTop: 16,
              }}
            >
              <PixiLabel
                text="Tip: Once added, launch DEViLBOX from your home screen for true fullscreen mode without the Safari browser UI."
                size="xs"
                color="custom"
                customColor={0x60a5fa}
                layout={{ maxWidth: MODAL_W - 80 }}
              />
            </layoutContainer>
          </>
        ) : deferredPrompt ? (
          /* Install prompt available */
          <>
            <PixiLabel
              text="Install DEViLBOX as a standalone app for the best experience:"
              size="sm"
              color="text"
              layout={{ maxWidth: MODAL_W - 48 }}
            />

            <PixiButton
              label="⬜ Install DEViLBOX"
              variant="primary"
              size="lg"
              onClick={handleInstallClick}
              layout={{ width: MODAL_W - 48 }}
            />

            {/* Info box */}
            <layoutContainer
              layout={{
                padding: 12,
                borderRadius: 6,
                borderWidth: 1,
                backgroundColor: 0x0a2a3a,
                borderColor: 0x1a5a7a,
                marginTop: 16,
              }}
            >
              <PixiLabel
                text="Runs fullscreen without browser UI, can be launched from your app drawer"
                size="xs"
                color="custom"
                customColor={0x60a5fa}
                layout={{ maxWidth: MODAL_W - 80 }}
              />
            </layoutContainer>
          </>
        ) : (
          /* Generic instructions */
          <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', paddingTop: 32, paddingBottom: 32, gap: 16 }}>
            <PixiLabel
              text={'To install DEViLBOX, use your browser\'s menu and select "Install" or "Add to Home Screen"'}
              size="sm"
              color="text"
              layout={{ maxWidth: MODAL_W - 80 }}
            />
            <PixiLabel
              text="The install option may appear in your browser's settings menu (⋮ or ···)"
              size="sm"
              color="textSecondary"
              layout={{ maxWidth: MODAL_W - 80 }}
            />
          </layoutContainer>
        )}
      </layoutContainer>

      <PixiModalFooter>
        <PixiButton label="Close" variant="default" onClick={onClose} layout={{ flex: 1 }} />
      </PixiModalFooter>
    </PixiModal>
  );
};
