/**
 * PixiTipOfTheDay — GL-native tip-of-the-day / changelog dialog.
 * Reference: src/components/dialogs/TipOfTheDay.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { PixiModal, PixiModalFooter, PixiButton, PixiLabel, PixiCheckbox } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { DEVILBOX_TIPS } from '../../constants/tips';
import { CHANGELOG, CURRENT_VERSION, BUILD_NUMBER } from '@generated/changelog';
import type { ChangelogEntry } from '@generated/changelog';

const CHANGE_COLORS: Record<string, number> = { feature: 0x4ADE80, fix: 0xFBBF24, improvement: 0x60A5FA };
const CHANGE_LABELS: Record<string, string> = { feature: 'New', fix: 'Fix', improvement: 'Improved' };

interface PixiTipOfTheDayProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'tips' | 'changelog';
}

// ─── Change type badge ────────────────────────────────────────────────────────

const ChangeBadge: React.FC<{ type: string }> = ({ type }) => (
  <layoutContainer
    layout={{
      paddingLeft: 4,
      paddingRight: 4,
      paddingTop: 1,
      paddingBottom: 1,
      backgroundColor: CHANGE_COLORS[type] ?? 0x888888,
      borderRadius: 3,
    }}
  >
    <pixiBitmapText
      text={CHANGE_LABELS[type] ?? type}
      style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 8, fill: 0x000000 }}
      layout={{}}
    />
  </layoutContainer>
);

// ─── Category badge ───────────────────────────────────────────────────────────

const CategoryBadge: React.FC<{ category: string; accentColor: number }> = ({ category, accentColor }) => (
  <layoutContainer
    layout={{
      paddingLeft: 8,
      paddingRight: 8,
      paddingTop: 2,
      paddingBottom: 2,
      borderWidth: 1,
      borderColor: accentColor,
      borderRadius: 10,
    }}
  >
    <pixiBitmapText
      text={category.toUpperCase()}
      style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 9, fill: 0xffffff }}
      tint={accentColor}
      layout={{}}
    />
  </layoutContainer>
);

// ─── Version entry ────────────────────────────────────────────────────────────

const VersionEntry: React.FC<{ entry: ChangelogEntry; isLatest: boolean; accentColor: number; mutedColor: number; secondaryColor: number }> = ({
  entry, isLatest, accentColor, mutedColor, secondaryColor,
}) => (
  <layoutContainer
    layout={{
      flexDirection: 'column',
      gap: 6,
      paddingLeft: 12,
      paddingRight: 12,
      paddingTop: 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderColor: 0x333333,
    }}
  >
    {/* Version header row */}
    <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <pixiBitmapText
        text={`v${entry.version}`}
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={isLatest ? accentColor : 0xffffff}
        layout={{}}
      />
      <pixiBitmapText
        text={entry.date}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
        tint={mutedColor}
        layout={{}}
      />
      {isLatest && (
        <layoutContainer
          layout={{
            paddingLeft: 6,
            paddingRight: 6,
            paddingTop: 1,
            paddingBottom: 1,
            backgroundColor: accentColor,
            borderRadius: 6,
          }}
        >
          <pixiBitmapText
            text="LATEST"
            style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 8, fill: 0x000000 }}
            layout={{}}
          />
        </layoutContainer>
      )}
    </layoutContainer>
    {/* Changes list */}
    {entry.changes.map((change, idx) => (
      <layoutContainer key={idx} layout={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
        <ChangeBadge type={change.type} />
        <pixiBitmapText
          text={change.description}
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
          tint={secondaryColor}
          layout={{}}
        />
      </layoutContainer>
    ))}
  </layoutContainer>
);

// ─── Tab button ───────────────────────────────────────────────────────────────

const TabButton: React.FC<{ label: string; active: boolean; accentColor: number; mutedColor: number; onClick: () => void }> = ({
  label, active, accentColor, mutedColor, onClick,
}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <layoutContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={onClick}
      layout={{
        flex: 1,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
        ...(active ? { borderBottomWidth: 2, borderColor: accentColor, backgroundColor: 0xffffff10 } : {}),
      }}
    >
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 11, fill: 0xffffff }}
        tint={active ? accentColor : hovered ? 0xcccccc : mutedColor}
        layout={{}}
      />
    </layoutContainer>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const PixiTipOfTheDay: React.FC<PixiTipOfTheDayProps> = ({
  isOpen,
  onClose,
  initialTab = 'tips',
}) => {
  const theme = usePixiTheme();
  const [activeTab, setActiveTab] = useState<'tips' | 'changelog'>(initialTab);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showAtStartup, setShowAtStartup] = useState(() => {
    const saved = localStorage.getItem('show-tips-at-startup');
    return saved === null ? true : saved === 'true';
  });

  const accentColor = theme.accent.color;
  const mutedColor = theme.textMuted.color;
  const secondaryColor = theme.textSecondary.color;

  // Sync tab & pick random tip when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setCurrentTipIndex(Math.floor(Math.random() * DEVILBOX_TIPS.length));
      localStorage.setItem('devilbox-seen-version', BUILD_NUMBER);
    }
  }, [isOpen, initialTab]);

  const handleNext = useCallback(() => {
    setCurrentTipIndex((prev) => (prev + 1) % DEVILBOX_TIPS.length);
  }, []);

  const handlePrev = useCallback(() => {
    setCurrentTipIndex((prev) => (prev - 1 + DEVILBOX_TIPS.length) % DEVILBOX_TIPS.length);
  }, []);

  const toggleStartup = useCallback((checked: boolean) => {
    setShowAtStartup(checked);
    localStorage.setItem('show-tips-at-startup', checked.toString());
  }, []);

  const tip = DEVILBOX_TIPS[currentTipIndex];
  const W = 500;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={W} height={460}>
      {/* Header */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingLeft: 12,
          paddingRight: 12,
          height: 40,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <layoutContainer layout={{ flexDirection: 'column', gap: 1 }}>
          <pixiBitmapText
            text={activeTab === 'tips' ? 'TIP OF THE DAY' : "WHAT'S NEW"}
            style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 13, fill: 0xffffff }}
            tint={theme.text.color}
            layout={{}}
          />
          <pixiBitmapText
            text={`DEViLBOX v${CURRENT_VERSION}`}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 9, fill: 0xffffff }}
            tint={mutedColor}
            layout={{}}
          />
        </layoutContainer>
        <PixiButton label="×" variant="ghost" size="sm" onClick={onClose} width={28} height={28} />
      </layoutContainer>

      {/* Tab bar */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: 32,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
          backgroundColor: 0x00000033,
        }}
      >
        <TabButton label="Tips" active={activeTab === 'tips'} accentColor={accentColor} mutedColor={mutedColor} onClick={() => setActiveTab('tips')} />
        <TabButton label="Changelog" active={activeTab === 'changelog'} accentColor={accentColor} mutedColor={mutedColor} onClick={() => setActiveTab('changelog')} />
      </layoutContainer>

      {/* Content area */}
      <layoutContainer layout={{ flex: 1, overflow: 'scroll', flexDirection: 'column' }}>
        {activeTab === 'tips' ? (
          /* Tips tab — centered single tip */
          <layoutContainer
            layout={{
              flex: 1,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              gap: 12,
            }}
          >
            <pixiBitmapText
              text={tip.title}
              style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 16, fill: 0xffffff }}
              tint={accentColor}
              layout={{ marginBottom: 4 }}
            />
            <pixiBitmapText
              text={tip.content}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
              tint={secondaryColor}
              layout={{ maxWidth: W - 80 }}
            />
            <CategoryBadge category={tip.category} accentColor={accentColor} />
          </layoutContainer>
        ) : (
          /* Changelog tab — scrollable list */
          <layoutContainer layout={{ flexDirection: 'column' }}>
            {CHANGELOG.slice(0, 5).map((entry, idx) => (
              <VersionEntry
                key={entry.version}
                entry={entry}
                isLatest={idx === 0}
                accentColor={accentColor}
                mutedColor={mutedColor}
                secondaryColor={secondaryColor}
              />
            ))}
          </layoutContainer>
        )}
      </layoutContainer>

      {/* Footer with nav/checkbox + close button */}
      <PixiModalFooter width={W}>
        <layoutContainer
          layout={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Left side: prev/next or info text */}
          {activeTab === 'tips' ? (
            <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
              <PixiButton label="◀" variant="default" size="sm" onClick={handlePrev} width={32} height={26} />
              <PixiButton label="▶" variant="default" size="sm" onClick={handleNext} width={32} height={26} />
            </layoutContainer>
          ) : (
            <PixiLabel text="Showing recent updates" size="xs" color="textMuted" font="sans" />
          )}

          {/* Right side: checkbox + close */}
          <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <PixiCheckbox
              checked={showAtStartup}
              onChange={toggleStartup}
              label="Show at startup"
            />
            <PixiButton label="Start Jamming!" variant="primary" size="sm" onClick={onClose} width={110} height={26} />
          </layoutContainer>
        </layoutContainer>
      </PixiModalFooter>
    </PixiModal>
  );
};
