/**
 * PixiDownloadModal — GL-native download dialog.
 * Shows download links for Windows, macOS, and Linux native apps.
 *
 * DOM reference: src/components/dialogs/DownloadModal.tsx
 */

import React, { useCallback, useState } from 'react';
import { PixiModal, PixiIcon } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';

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

const MODAL_W = 480;
const MODAL_H = 420;

export const PixiDownloadModal: React.FC<PixiDownloadModalProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();
  const [closeHovered, setCloseHovered] = useState(false);

  const handleDownload = useCallback(() => {
    window.open(RELEASES_URL, '_blank');
  }, []);

  if (!isOpen) return null;

  return (
    <PixiModal
      isOpen={isOpen}
      onClose={onClose}
      width={MODAL_W}
      height={MODAL_H}
      bgColor={theme.bgSecondary.color}
      borderRadius={12}
    >
      {/* Header — DOM: bg-dark-bgTertiary px-6 py-4 border-b */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 24,
          paddingRight: 24,
          paddingTop: 16,
          paddingBottom: 16,
          backgroundColor: theme.bgTertiary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
          <pixiBitmapText
            text="Download DEViLBOX"
            style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 20, fill: 0xffffff }}
            tint={theme.text.color}
            layout={{}}
          />
          <pixiBitmapText
            text="Native Desktop Applications"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 14, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />
        </layoutContainer>
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPointerOver={() => setCloseHovered(true)}
          onPointerOut={() => setCloseHovered(false)}
          onPointerUp={onClose}
          onClick={onClose}
          layout={{
            width: 28,
            height: 28,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 6,
            ...(closeHovered ? { backgroundColor: theme.bgHover.color } : {}),
          }}
        >
          <PixiIcon name="close" size={16} color={closeHovered ? theme.text.color : theme.textMuted.color} layout={{}} />
        </layoutContainer>
      </layoutContainer>

      {/* Content — DOM: p-6 */}
      <layoutContainer layout={{ flex: 1, flexDirection: 'column', padding: 24 }}>
        {/* Description — DOM: text-sm text-text-secondary mb-6 leading-relaxed */}
        <pixiBitmapText
          text="Experience DEViLBOX with lower latency, better performance, and offline support. Native apps provide full access to system audio and MIDI resources."
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 16, fill: 0xffffff }}
          tint={theme.textSecondary.color}
          layout={{ marginBottom: 24 }}
        />

        {/* Platform cards — DOM: space-y-3 */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 12 }}>
          {platforms.map((p) => (
            <layoutContainer
              key={p.name}
              eventMode="static"
              cursor="pointer"
              onPointerUp={handleDownload}
              onClick={handleDownload}
              layout={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
                padding: 16,
                borderRadius: 12,
                borderWidth: 1,
                backgroundColor: theme.bg.color,
                borderColor: theme.border.color,
              }}
            >
              <layoutContainer layout={{ flexDirection: 'column', flex: 1 }}>
                <pixiBitmapText
                  text={p.name}
                  style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 16, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{}}
                />
                <pixiBitmapText
                  text={p.desc}
                  style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                  layout={{}}
                />
              </layoutContainer>
            </layoutContainer>
          ))}
        </layoutContainer>

        {/* Footer note — DOM: mt-8 pt-6 border-t text-center text-[10px] font-mono uppercase */}
        <layoutContainer
          layout={{
            alignItems: 'center',
            marginTop: 32,
            paddingTop: 24,
            borderTopWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          <pixiBitmapText
            text="BUILT WITH ELECTRON & TONE.JS"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />
        </layoutContainer>
      </layoutContainer>
    </PixiModal>
  );
};
