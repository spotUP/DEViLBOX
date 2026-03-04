/**
 * PixiTipOfTheDay — GL-native tip-of-the-day / changelog dialog.
 * Pixel-perfect match to DOM: src/components/dialogs/TipOfTheDay.tsx
 *
 * DOM structure:
 *   backdrop bg-black/80 → PixiModal overlayAlpha=0.8
 *   container max-w-xl rounded-xl border-2 → width=576, borderRadius=12, borderWidth=2
 *   header px-6 py-4 → 24/16
 *   tabs flex border-b bg-black/20 → row, borderBottom, tinted bg
 *   content h-[300px] overflow-y-auto bg-black/10
 *   nav footer px-6 py-4 border-t bg-black/20
 *   action footer p-4 bg-black/40 → full-width button
 */

import { useState, useEffect, useCallback } from 'react';
import { PixiModal, PixiButton, PixiCheckbox, PixiIcon } from '../components';
import { usePixiTheme, usePixiThemeId } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { DEVILBOX_TIPS } from '../../constants/tips';
import { CHANGELOG, CURRENT_VERSION, BUILD_NUMBER } from '@generated/changelog';
import type { ChangelogEntry } from '@generated/changelog';

// ─── Constants ────────────────────────────────────────────────────────────────

const W = 576; // max-w-xl
const CONTENT_H = 300;

const CHANGE_COLORS: Record<string, { bg: number; text: number }> = {
  feature:     { bg: 0x143a1f, text: 0x4ade80 },  // bg-green-500/20, text-green-400
  fix:         { bg: 0x3a2e14, text: 0xfbbf24 },  // bg-amber-500/20, text-amber-400
  improvement: { bg: 0x142a3a, text: 0x60a5fa },  // bg-blue-500/20, text-blue-400
};
const CHANGE_LABELS: Record<string, string> = { feature: 'New', fix: 'Fix', improvement: 'Improved' };

// ─── Change type badge — matches DOM ChangeTypeLabel ──────────────────────────
// px-1.5 py-0.5 text-[10px] font-bold rounded

const ChangeBadge: React.FC<{ type: string }> = ({ type }) => {
  const c = CHANGE_COLORS[type] ?? { bg: 0x333333, text: 0x888888 };
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

// ─── Category badge — matches DOM category pill ───────────────────────────────
// text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full

const CategoryBadge: React.FC<{ category: string; accentColor: number; isCyan: boolean }> = ({
  category, accentColor, isCyan,
}) => (
  <layoutContainer
    layout={{
      paddingLeft: 12, paddingRight: 12,
      paddingTop: 4, paddingBottom: 4,
      backgroundColor: isCyan ? 0x002a2a : 0x1a1a1a,
      borderRadius: 12,
    }}
  >
    <pixiBitmapText
      text={`Category: ${category}`}
      style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 12, fill: 0xffffff }}
      tint={isCyan ? accentColor : 0x888888}
      layout={{}}
    />
  </layoutContainer>
);

// ─── Version entry — matches DOM VersionEntry ─────────────────────────────────
// px-5 py-4 border-b border-border

const VersionEntry: React.FC<{
  entry: ChangelogEntry;
  isLatest: boolean;
  accentColor: number;
  mutedColor: number;
  secondaryColor: number;
  isCyan: boolean;
}> = ({ entry, isLatest, accentColor, mutedColor, secondaryColor, isCyan }) => (
  <layoutContainer
    layout={{
      flexDirection: 'column',
      gap: 8,
      paddingLeft: 20, paddingRight: 20,
      paddingTop: 16, paddingBottom: 16,
      borderBottomWidth: 1,
      borderColor: 0x333333,
      ...(isLatest ? { backgroundColor: isCyan ? 0x061a1a : 0x1e1010 } : {}),
    }}
  >
    {/* Version header row — flex items-center gap-2 mb-3 */}
    <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <pixiBitmapText
        text={`v${entry.version}`}
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 14, fill: 0xffffff }}
        tint={isLatest ? accentColor : 0xeeeeee}
        layout={{}}
      />
      <pixiBitmapText
        text={entry.date}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
        tint={mutedColor}
        layout={{}}
      />
      {isLatest && (
        <layoutContainer
          layout={{
            paddingLeft: 8, paddingRight: 8,
            paddingTop: 2, paddingBottom: 2,
            backgroundColor: accentColor,
            borderRadius: 10,
          }}
        >
          <pixiBitmapText
            text="LATEST"
            style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 12, fill: 0x000000 }}
            layout={{}}
          />
        </layoutContainer>
      )}
    </layoutContainer>
    {/* Changes list — space-y-2 */}
    {entry.changes.map((change, idx) => (
      <layoutContainer key={idx} layout={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ChangeBadge type={change.type} />
        <pixiBitmapText
          text={change.description}
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
          tint={secondaryColor}
          layout={{ maxWidth: W - 100 }}
        />
      </layoutContainer>
    ))}
  </layoutContainer>
);

// ─── Tab button — matches DOM tab styling ─────────────────────────────────────
// flex-1 py-3 text-xs font-bold uppercase tracking-wider

const TabButton: React.FC<{
  label: string;
  icon?: string;
  active: boolean;
  accentColor: number;
  mutedColor: number;
  activeBg: number;
  onClick: () => void;
}> = ({ label, icon, active, accentColor, mutedColor, activeBg, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const tint = active ? accentColor : hovered ? 0xcccccc : mutedColor;
  return (
    <layoutContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={onClick}
      layout={{
        flex: 1,
        height: 40,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        ...(active ? {
          borderBottomWidth: 2,
          borderColor: accentColor,
          backgroundColor: activeBg,
        } : {}),
      }}
    >
      {icon && <PixiIcon name={icon} size={13} color={tint} layout={{}} />}
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 13, fill: 0xffffff }}
        tint={tint}
        layout={{}}
      />
    </layoutContainer>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

interface PixiTipOfTheDayProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'tips' | 'changelog';
}

export const PixiTipOfTheDay: React.FC<PixiTipOfTheDayProps> = ({
  isOpen,
  onClose,
  initialTab = 'tips',
}) => {
  const theme = usePixiTheme();
  const themeId = usePixiThemeId();
  const isCyan = themeId === 'cyan-lineart';

  const [activeTab, setActiveTab] = useState<'tips' | 'changelog'>(initialTab);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showAtStartup, setShowAtStartup] = useState(() => {
    const saved = localStorage.getItem('show-tips-at-startup');
    return saved === null ? true : saved === 'true';
  });

  const accentColor = theme.accent.color;
  const mutedColor = theme.textMuted.color;
  const secondaryColor = theme.textSecondary.color;

  // Theme-derived colors matching DOM TipOfTheDay
  const panelBg = isCyan ? 0x051515 : 0x1a1a1a;
  const panelBorder = isCyan ? 0x008888 : theme.border.color;
  const headerBg = isCyan ? 0x072020 : theme.bgSecondary.color;
  const tabBg = isCyan ? 0x041010 : 0x151515;         // bg-black/20 on panel
  const activeTabBg = isCyan ? 0x0a1e1e : 0x1f1f1f;   // bg-white/5 on panel
  const contentBg = isCyan ? 0x041313 : 0x171717;      // bg-black/10 on panel
  const navFooterBg = isCyan ? 0x041010 : 0x151515;    // bg-black/20 on panel
  const actionFooterBg = isCyan ? 0x030c0c : 0x101010; // bg-black/40 on panel

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
  // header(~68) + tabs(40) + content(CONTENT_H) + navFooter(~65) + actionFooter(~72)
  const H = 548;

  return (
    <PixiModal
      isOpen={isOpen}
      onClose={onClose}
      width={W}
      height={H}
      overlayAlpha={0.8}
      borderWidth={2}
      borderRadius={12}
      bgColor={panelBg}
      borderColor={panelBorder}
    >
      {/* ── Header ── px-6 py-4 → 24/16 */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingLeft: 24, paddingRight: 24,
          paddingTop: 16, paddingBottom: 16,
          backgroundColor: headerBg,
        }}
      >
        <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Icon badge — p-2 rounded-lg */}
          <layoutContainer
            layout={{
              width: 36, height: 36,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: isCyan ? 0x003333 : 0x2a0808,
              borderRadius: 8,
            }}
          >
            <PixiIcon name="thunderbolt" size={20} color={accentColor} layout={{}} />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
            <pixiBitmapText
              text={activeTab === 'tips' ? 'TIP OF THE DAY' : "WHAT'S NEW"}
              style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 18, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{}}
            />
            <pixiBitmapText
              text={`DEViLBOX v${CURRENT_VERSION}`}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
              tint={mutedColor}
              layout={{}}
            />
          </layoutContainer>
        </layoutContainer>
        <PixiButton icon="close" label="" variant="ghost" size="sm" onClick={onClose} width={28} height={28} />
      </layoutContainer>

      {/* ── Tab bar ── flex border-b bg-black/20 */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: 40,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
          backgroundColor: tabBg,
        }}
      >
        <TabButton icon="thunderbolt" label="Tips" active={activeTab === 'tips'} accentColor={accentColor} mutedColor={mutedColor} activeBg={activeTabBg} onClick={() => setActiveTab('tips')} />
        <TabButton icon="diskio" label="Changelog" active={activeTab === 'changelog'} accentColor={accentColor} mutedColor={mutedColor} activeBg={activeTabBg} onClick={() => setActiveTab('changelog')} />
      </layoutContainer>

      {/* ── Content area ── h-[300px] overflow-y-auto bg-black/10 */}
      <layoutContainer
        layout={{
          height: CONTENT_H,
          overflow: 'scroll',
          flexDirection: 'column',
          backgroundColor: contentBg,
        }}
      >
        {/* Always mount both tabs to avoid Yoga BindingError on tab switch */}
        <layoutContainer
          visible={activeTab === 'tips'}
          layout={activeTab === 'tips' ? {
            flex: 1,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            gap: 16,
          } : { width: 0, height: 0, overflow: 'hidden' }}
        >
          {/* Info circle icon — w-16 h-16 rounded-full */}
          <layoutContainer
            layout={{
              width: 64, height: 64,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: isCyan ? 0x003333 : 0x2a0808,
              borderRadius: 32,
              marginBottom: 8,
            }}
          >
            <pixiBitmapText
              text="i"
              style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 30, fill: 0xffffff }}
              tint={accentColor}
              layout={{}}
            />
          </layoutContainer>

          {/* Tip title — text-xl font-bold */}
          <pixiBitmapText
            text={tip.title}
            style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 20, fill: 0xffffff }}
            tint={accentColor}
            layout={{}}
          />
          {/* Tip content — text-sm text-secondary leading-relaxed */}
          <pixiBitmapText
            text={tip.content}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
            tint={secondaryColor}
            layout={{ maxWidth: W - 80 }}
          />
          {/* Category badge */}
          <CategoryBadge category={tip.category} accentColor={accentColor} isCyan={isCyan} />
        </layoutContainer>

        <layoutContainer
          visible={activeTab === 'changelog'}
          layout={activeTab === 'changelog' ? {
            flexDirection: 'column',
          } : { width: 0, height: 0, overflow: 'hidden' }}
        >
          {CHANGELOG.slice(0, 5).map((entry, idx) => (
            <VersionEntry
              key={entry.version}
              entry={entry}
              isLatest={idx === 0}
              accentColor={accentColor}
              mutedColor={mutedColor}
              secondaryColor={secondaryColor}
              isCyan={isCyan}
            />
          ))}
        </layoutContainer>
      </layoutContainer>

      {/* ── Nav Footer ── px-6 py-4 border-t bg-black/20 */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 24, paddingRight: 24,
          paddingTop: 16, paddingBottom: 16,
          borderTopWidth: 1,
          borderColor: theme.border.color,
          backgroundColor: navFooterBg,
        }}
      >
        {/* Always mount both nav variants to avoid Yoga BindingError */}
        <layoutContainer
          visible={activeTab === 'tips'}
          layout={activeTab === 'tips' ? { flexDirection: 'row', gap: 8 } : { width: 0, height: 0, overflow: 'hidden' }}
        >
          <PixiButton icon="prev" label="" variant="default" size="sm" onClick={handlePrev} width={36} height={32} />
          <PixiButton icon="next" label="" variant="default" size="sm" onClick={handleNext} width={36} height={32} />
        </layoutContainer>
        <pixiBitmapText
          visible={activeTab === 'changelog'}
          text="Showing recent updates"
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
          tint={mutedColor}
          layout={activeTab === 'changelog' ? {} : { width: 0, height: 0 }}
        />
        <PixiCheckbox
          checked={showAtStartup}
          onChange={toggleStartup}
          label="SHOW AT STARTUP"
        />
      </layoutContainer>

      {/* ── Action Footer ── p-4 bg-black/40 */}
      <layoutContainer
        layout={{
          padding: 16,
          backgroundColor: actionFooterBg,
        }}
      >
        <PixiButton
          label="Start Jamming!"
          variant="primary"
          size="lg"
          onClick={onClose}
          width={W - 32 - 4}
          height={40}
        />
      </layoutContainer>
    </PixiModal>
  );
};
