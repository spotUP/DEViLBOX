/**
 * PixiWhatsNewModal — GL-native What's New / changelog dialog.
 * Pixel-perfect match to DOM: src/components/dialogs/WhatsNewModal.tsx
 *
 * DOM structure:
 *   backdrop bg-black/80 → PixiModal overlayAlpha=0.8
 *   container max-w-xl bg-dark-bgSecondary border-dark-border rounded-xl
 *     → width=576, borderRadius=12
 *   header: px-5 py-4 gradient bg, border-b → custom header with gradient feel
 *   content: max-h-[60vh] overflow-y-auto → PixiScrollView
 *   footer: px-5 py-4 bg-dark-bgTertiary border-t → PixiModalFooter
 */

import React, { useMemo } from 'react';
import { PixiModal, PixiModalFooter, PixiButton, PixiScrollView, PixiIcon } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { CHANGELOG, CURRENT_VERSION } from '@generated/changelog';
import type { ChangelogEntry } from '@generated/changelog';

const STORAGE_KEY = 'devilbox-seen-version';

interface PixiWhatsNewModalProps {
  onClose: () => void;
}

const MODAL_W = 576;
const MODAL_H = 520;
const CONTENT_H = 320;

// ─── Change type badge — matches DOM ChangeTypeLabel ──────────────────────────
// px-1.5 py-0.5 text-[10px] font-bold rounded

/** Darken a color to ~15% intensity for tinted background */
function tintBg(color: number, factor = 0.15): number {
  return (((color >> 16 & 0xff) * factor | 0) << 16) | (((color >> 8 & 0xff) * factor | 0) << 8) | ((color & 0xff) * factor | 0);
}

const CHANGE_LABELS: Record<string, string> = {
  feature: 'New',
  fix: 'Fix',
  improvement: 'Improved',
};

const ChangeBadge: React.FC<{ type: string }> = ({ type }) => {
  const theme = usePixiTheme();
  const colorMap: Record<string, { bg: number; text: number }> = {
    feature:     { bg: tintBg(theme.success.color), text: theme.success.color },
    fix:         { bg: tintBg(theme.warning.color), text: theme.warning.color },
    improvement: { bg: tintBg(theme.accent.color),  text: theme.accent.color },
  };
  const c = colorMap[type] ?? { bg: theme.bgTertiary.color, text: theme.textMuted.color };
  return (
    <layoutContainer
      layout={{
        paddingLeft: 6, paddingRight: 6,
        paddingTop: 2, paddingBottom: 2,
        backgroundColor: c.bg,
        borderRadius: 4,
      }}
    >
      <pixiBitmapText
        text={CHANGE_LABELS[type] ?? type}
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={c.text}
        layout={{}}
      />
    </layoutContainer>
  );
};

// ─── Version entry — matches DOM VersionEntry ─────────────────────────────────

const VersionEntry: React.FC<{ entry: ChangelogEntry; isLatest: boolean; width: number; borderColor: number }> = ({
  entry, isLatest, width, borderColor,
}) => {
  const theme = usePixiTheme();
  return (
    <layoutContainer
      layout={{
        flexDirection: 'column',
        paddingLeft: 20, paddingRight: 20,
        paddingTop: 16, paddingBottom: 16,
        borderBottomWidth: 1,
        borderColor,
        width,
        ...(isLatest ? { backgroundColor: tintBg(theme.accent.color) } : {}),
      }}
    >
      {/* Version + date + LATEST badge */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <pixiBitmapText
          text={`v${entry.version}`}
          style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 16, fill: 0xffffff }}
          tint={isLatest ? theme.accent.color : theme.text.color}
          layout={{}}
        />
        <pixiBitmapText
          text={entry.date}
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        {isLatest && (
          <layoutContainer
            layout={{
              paddingLeft: 8, paddingRight: 8,
              paddingTop: 2, paddingBottom: 2,
              backgroundColor: theme.accent.color,
              borderRadius: 10,
            }}
          >
            <pixiBitmapText
              text="LATEST"
              style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 12, fill: 0xffffff }}
              tint={theme.bg.color}
              layout={{}}
            />
          </layoutContainer>
        )}
      </layoutContainer>

      {/* Changes list — space-y-2 → gap 8 */}
      <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
        {entry.changes.map((change, idx) => (
          <layoutContainer key={idx} layout={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <ChangeBadge type={change.type} />
            <pixiBitmapText
              text={change.description}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 16, fill: 0xffffff }}
              tint={theme.textSecondary.color}
              layout={{ maxWidth: width - 100 }}
            />
          </layoutContainer>
        ))}
      </layoutContainer>
    </layoutContainer>
  );
};

export const PixiWhatsNewModal: React.FC<PixiWhatsNewModalProps> = ({ onClose }) => {
  const theme = usePixiTheme();

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
    onClose();
  };

  const entries = CHANGELOG.slice(0, 5);

  // Estimate content height for scroll view
  const estimatedHeight = useMemo(() => {
    let h = 0;
    for (const entry of entries) {
      h += 32 + 12; // version row + margin
      h += entry.changes.length * 24; // changes
      h += 32; // padding
    }
    return Math.max(h, CONTENT_H);
  }, [entries]);

  return (
    <PixiModal isOpen={true} onClose={handleClose} width={MODAL_W} height={MODAL_H} overlayAlpha={0.8} borderRadius={12}>
      {/* Header — gradient-like bg with sparkle icon */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 16,
          paddingBottom: 16,
          backgroundColor: tintBg(theme.accent.color),
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <layoutContainer layout={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {/* Icon container — p-2 bg-accent-primary/20 rounded-lg */}
          <layoutContainer
            layout={{
              padding: 8,
              borderRadius: 8,
              backgroundColor: tintBg(theme.accent.color, 0.2),
            }}
          >
            <PixiIcon name="thunderbolt" size={20} color={theme.accent.color} layout={{}} />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
            <pixiBitmapText
              text="What's New"
              style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 20, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{}}
            />
            <pixiBitmapText
              text={`DEViLBOX v${CURRENT_VERSION}`}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </layoutContainer>
        </layoutContainer>

        {/* Close button */}
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={handleClose}
          onClick={handleClose}
          layout={{
            width: 28, height: 28,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 8,
          }}
        >
          <PixiIcon name="close" size={16} color={theme.textMuted.color} layout={{}} />
        </layoutContainer>
      </layoutContainer>

      {/* Content — scrollable changelog entries */}
      <layoutContainer layout={{ flex: 1, overflow: 'hidden' }}>
        <PixiScrollView width={MODAL_W - 2} height={CONTENT_H} contentHeight={estimatedHeight}>
          <layoutContainer layout={{ flexDirection: 'column', width: MODAL_W - 2 }}>
            {entries.map((entry, idx) => (
              <VersionEntry
                key={entry.version}
                entry={entry}
                isLatest={idx === 0}
                width={MODAL_W - 2}
                borderColor={theme.border.color}
              />
            ))}
          </layoutContainer>
        </PixiScrollView>
      </layoutContainer>

      {/* Footer — bg-dark-bgTertiary */}
      <PixiModalFooter bgColor={theme.bgTertiary.color}>
        <PixiButton
          label="Got it!"
          variant="primary"
          onClick={handleClose}
          layout={{ flex: 1 }}
        />
      </PixiModalFooter>
    </PixiModal>
  );
};
