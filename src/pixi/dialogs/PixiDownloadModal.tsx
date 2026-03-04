/**
 * PixiDownloadModal — GL-native download dialog.
 * Shows download links for Windows, macOS, and Linux native apps.
 */

import React, { useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiLabel } from '../components';
import { usePixiTheme } from '../theme';

interface PixiDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RELEASES_URL = 'https://github.com/spotUP/DEViLBOX/releases/latest';

const platforms = [
  { name: 'Windows', desc: 'Installer (.exe) or Portable (.zip)' },
  { name: 'macOS', desc: 'Disk Image (.dmg) for Intel/Apple Silicon' },
  { name: 'Linux', desc: 'AppImage, Debian, or Tarball' },
];

export const PixiDownloadModal: React.FC<PixiDownloadModalProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();

  const handleDownload = useCallback(() => {
    window.open(RELEASES_URL, '_blank');
  }, []);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={420} height={360}>
      <PixiModalHeader title="Download DEViLBOX" onClose={onClose} />

      <layoutContainer layout={{ flex: 1, flexDirection: 'column', padding: 16, gap: 12 }}>
        {/* Subtitle */}
        <PixiLabel text="Native Desktop Applications" size="xs" weight="bold" color="textMuted" />

        {/* Description */}
        <PixiLabel
          text="Experience DEViLBOX with lower latency, better performance, and offline support. Native apps provide full access to system audio and MIDI resources."
          size="xs"
          color="textSecondary"
        />

        {/* Platform cards */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          {platforms.map((p) => (
            <layoutContainer
              key={p.name}
              layout={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: theme.bg.color,
                borderColor: theme.border.color,
              }}
            >
              <PixiLabel text={p.name} size="sm" weight="semibold" color="text" />
              <PixiLabel text={p.desc} size="xs" color="textMuted" />
            </layoutContainer>
          ))}
        </layoutContainer>

        {/* Footer note */}
        <layoutContainer layout={{ alignItems: 'center', marginTop: 8 }}>
          <PixiLabel text="Built with Electron & Tone.js" size="xs" color="textMuted" />
        </layoutContainer>
      </layoutContainer>

      <PixiModalFooter>
        <PixiButton label="Close" variant="ghost" onClick={onClose} />
        <PixiButton label="Go to Downloads" variant="primary" onClick={handleDownload} />
      </PixiModalFooter>
    </PixiModal>
  );
};
