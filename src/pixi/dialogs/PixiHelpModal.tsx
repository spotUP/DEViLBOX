/**
 * PixiHelpModal — GL-native interactive help system.
 * 4 tabs: Keyboard Shortcuts, Standard Effects, Chip Effects, Tutorial.
 * GL replacement for src/components/help/HelpModal.tsx
 */

import React, { useMemo } from 'react';
import { PixiModal, PixiModalFooter, PixiButton } from '../components';
import { PixiScrollView } from '../components/PixiScrollView';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { EFFECT_COMMANDS, TUTORIAL_STEPS, HELP_TABS, type HelpTab, type EffectCommand } from '@/data/helpContent';
import { useHelpDialog } from '@hooks/dialogs/useHelpDialog';

// ── Types ───────────────────────────────────────────────────────────────────

interface PixiHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: HelpTab;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

// ── Constants ───────────────────────────────────────────────────────────────

const W = 800;
const H = 560;
const CONTENT_W = W - 24;
const CONTENT_H = H - 36 - 36 - 44; // header, tabs, footer
const HIGHLIGHT = 0xFDE047;

const KEYBOARD_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: '↑ ↓ ← →', description: 'Move cursor in pattern' },
      { keys: 'Tab', description: 'Next channel' },
      { keys: 'Shift+Tab', description: 'Previous channel' },
      { keys: 'Home', description: 'Jump to row 0' },
      { keys: 'End', description: 'Jump to last row' },
      { keys: 'Page Up/Down', description: 'Jump 16 rows up/down' },
      { keys: 'Ctrl+↑/↓', description: 'Fast cursor (16 rows)' },
      { keys: 'F9', description: 'Jump to row 0 (0%)' },
      { keys: 'F10', description: 'Jump to 25% of pattern' },
      { keys: 'F11', description: 'Jump to 50% of pattern' },
      { keys: 'F12', description: 'Jump to 75% of pattern' },
    ],
  },
  {
    title: 'Note Entry',
    shortcuts: [
      { keys: 'Z,S,X,D,C...', description: 'Piano keys lower row (C-B)' },
      { keys: 'Q,2,W,3,E...', description: 'Piano keys upper row (+1 octave)' },
      { keys: 'F1-F7', description: 'Select octave 1-7' },
      { keys: '0-9, A-F', description: 'Hex digits (instrument, volume, effect)' },
      { keys: 'CapsLock', description: 'Note off (===)' },
      { keys: 'Space', description: 'Stop + Toggle Edit mode' },
      { keys: 'Enter', description: 'Toggle Edit/Record mode' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: 'Delete', description: 'Clear note' },
      { keys: 'Shift+Del', description: 'Clear note + instrument' },
      { keys: 'Ctrl+Del', description: 'Clear all columns' },
      { keys: 'Backspace', description: 'Clear and move up' },
      { keys: 'Insert', description: 'Insert row (shift down)' },
      { keys: 'Shift+↑/↓', description: 'Change instrument number' },
    ],
  },
  {
    title: 'Block Operations (FT2 Style)',
    shortcuts: [
      { keys: 'Alt+Arrow', description: 'Mark block selection' },
      { keys: 'Shift+F3', description: 'Cut block' },
      { keys: 'Shift+F4', description: 'Copy block' },
      { keys: 'Shift+F5', description: 'Paste block' },
      { keys: 'Ctrl+F3', description: 'Cut channel' },
      { keys: 'Ctrl+F4', description: 'Copy channel' },
      { keys: 'Ctrl+F5', description: 'Paste channel' },
      { keys: 'Alt+F3', description: 'Cut pattern' },
      { keys: 'Alt+F4', description: 'Copy pattern' },
      { keys: 'Alt+F5', description: 'Paste pattern' },
    ],
  },
  {
    title: 'Track Jump (FT2 Style)',
    shortcuts: [
      { keys: 'Alt+Q,W,E,R,T,Y,U,I', description: 'Jump to tracks 1-8' },
      { keys: 'Alt+A,S,D,F,G,H,J,K', description: 'Jump to tracks 9-16' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: '?', description: 'Show this help' },
      { keys: 'Ctrl+Shift+E', description: 'Export dialog' },
      { keys: 'Ctrl+Shift+P', description: 'Toggle patterns panel' },
      { keys: 'Escape', description: 'Close dialogs / Stop playback' },
    ],
  },
];

// ── Sub-components ──────────────────────────────────────────────────────────

/** Keyboard shortcut group section */
const ShortcutSection: React.FC<{ group: ShortcutGroup; width: number }> = ({ group, width }) => {
  const theme = usePixiTheme();
  return (
    <layoutContainer
      layout={{
        flexDirection: 'column',
        gap: 2,
        padding: 8,
        backgroundColor: theme.bgTertiary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 4,
        width,
      }}
    >
      <pixiBitmapText
        text={group.title.toUpperCase()}
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={theme.accentHighlight.color}
        layout={{ marginBottom: 4 }}
      />
      {group.shortcuts.map((s, i) => (
        <layoutContainer
          key={`${group.title}-${i}`}
          layout={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingTop: 1,
            paddingBottom: 1,
          }}
        >
          <layoutContainer
            layout={{
              width: 140,
              paddingLeft: 4,
              paddingRight: 4,
              paddingTop: 2,
              paddingBottom: 2,
              backgroundColor: theme.bg.color,
              borderWidth: 1,
              borderColor: theme.border.color,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <pixiBitmapText
              text={s.keys}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
              tint={HIGHLIGHT}
              layout={{}}
            />
          </layoutContainer>
          <pixiBitmapText
            text={s.description}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
            tint={theme.text.color}
            layout={{}}
          />
        </layoutContainer>
      ))}
    </layoutContainer>
  );
};

/** Effect command card */
const EffectCard: React.FC<{ effect: EffectCommand; width: number }> = ({ effect, width }) => {
  const theme = usePixiTheme();
  return (
    <layoutContainer
      layout={{
        flexDirection: 'row',
        gap: 8,
        padding: 6,
        backgroundColor: theme.bgTertiary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 4,
        width,
        alignItems: 'flex-start',
      }}
    >
      <layoutContainer
        layout={{
          width: 40,
          paddingTop: 2,
          paddingBottom: 2,
          backgroundColor: theme.bg.color,
          borderWidth: 1,
          borderColor: theme.accent.color,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <pixiBitmapText
          text={effect.code}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
          tint={HIGHLIGHT}
          layout={{}}
        />
      </layoutContainer>
      <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 2 }}>
        <pixiBitmapText
          text={effect.name}
          style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 12, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{}}
        />
        <pixiBitmapText
          text={effect.description}
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        <pixiBitmapText
          text={`Range: ${effect.paramRange}`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textSecondary.color}
          layout={{}}
        />
        {effect.example && (
          <pixiBitmapText
            text={`Example: ${effect.example}`}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
            tint={theme.textSecondary.color}
            layout={{}}
          />
        )}
      </layoutContainer>
    </layoutContainer>
  );
};

// ── Main Component ──────────────────────────────────────────────────────────

export const PixiHelpModal: React.FC<PixiHelpModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'shortcuts',
}) => {
  const theme = usePixiTheme();
  const h = useHelpDialog({ isOpen, initialTab });

  // ── Estimated content heights for scroll view ─────────────────────────

  const shortcutsContentHeight = useMemo(() => {
    let height = 0;
    for (const g of KEYBOARD_SHORTCUTS) {
      height += 24 + g.shortcuts.length * 18 + 16;
    }
    return height + 40;
  }, []);

  const effectsContentHeight = useMemo(() => {
    return 60 + EFFECT_COMMANDS.length * 72;
  }, []);

  const chipEffectsContentHeight = useMemo(() => {
    if (h.chipEffects.length === 0) return 160;
    return 80 + h.chipEffects.length * 50;
  }, [h.chipEffects]);

  if (!isOpen) return null;

  const step = TUTORIAL_STEPS[h.tutorialStep];

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={W} height={H}>
      {/* Header */}
      <layoutContainer
        layout={{
          width: W,
          height: 36,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 12,
          paddingRight: 12,
          backgroundColor: theme.bgTertiary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <pixiBitmapText
          text="HELP & DOCUMENTATION"
          style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 14, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{}}
        />
        <pixiBitmapText
          text="×"
          style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 18, fill: 0xffffff }}
          tint={theme.textMuted.color}
          eventMode="static"
          cursor="pointer"
          onPointerUp={onClose}
          onClick={onClose}
        />
      </layoutContainer>

      {/* Tab row */}
      <layoutContainer
        layout={{
          width: W,
          height: 32,
          flexDirection: 'row',
          backgroundColor: theme.bgTertiary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        {HELP_TABS.map((tab) => {
          const isActive = h.activeTab === tab.id;
          return (
            <layoutContainer
              key={tab.id}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => h.setActiveTab(tab.id)}
              onClick={() => h.setActiveTab(tab.id)}
              layout={{
                flex: 1,
                height: 32,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: isActive ? theme.accent.color : undefined,
                borderRightWidth: 1,
                borderColor: theme.border.color,
              }}
            >
              <pixiBitmapText
                text={tab.label}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                tint={isActive ? theme.bg.color : theme.text.color}
                layout={{}}
              />
            </layoutContainer>
          );
        })}
      </layoutContainer>

      {/* Content area */}
      <pixiContainer layout={{ flex: 1, width: W, padding: 16 }}>
        {/* ── Keyboard Shortcuts ───────────────────────────────────── */}
        {h.activeTab === 'shortcuts' && (
          <PixiScrollView
            width={CONTENT_W}
            height={CONTENT_H}
            contentHeight={shortcutsContentHeight}
          >
            <layoutContainer layout={{ flexDirection: 'column', gap: 8, width: CONTENT_W }}>
              {KEYBOARD_SHORTCUTS.map((group, idx) => (
                <ShortcutSection key={idx} group={group} width={CONTENT_W - 12} />
              ))}
            </layoutContainer>
          </PixiScrollView>
        )}

        {/* ── Standard Effects ─────────────────────────────────────── */}
        {h.activeTab === 'effects' && (
          <PixiScrollView
            width={CONTENT_W}
            height={CONTENT_H}
            contentHeight={effectsContentHeight}
          >
            <layoutContainer layout={{ flexDirection: 'column', gap: 6, width: CONTENT_W }}>
              {/* Intro text */}
              <layoutContainer
                layout={{
                  padding: 8,
                  backgroundColor: theme.bgTertiary.color,
                  borderWidth: 1,
                  borderColor: theme.border.color,
                  borderRadius: 4,
                  width: CONTENT_W - 12,
                }}
              >
                <pixiBitmapText
                  text="Effect commands follow the FastTracker 2 format: 3 hex characters (0xy-Fxx). Enter effects in the EFFECT column. Multiple effects can be chained across rows."
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{ maxWidth: CONTENT_W - 40 }}
                />
              </layoutContainer>
              {EFFECT_COMMANDS.map((effect, idx) => (
                <EffectCard key={idx} effect={effect} width={CONTENT_W - 12} />
              ))}
            </layoutContainer>
          </PixiScrollView>
        )}

        {/* ── Chip Effects ─────────────────────────────────────────── */}
        {h.activeTab === 'chip-effects' && (
          <PixiScrollView
            width={CONTENT_W}
            height={CONTENT_H}
            contentHeight={chipEffectsContentHeight}
          >
            <layoutContainer layout={{ flexDirection: 'column', gap: 6, width: CONTENT_W }}>
              {/* Chip header */}
              <layoutContainer
                layout={{
                  padding: 8,
                  backgroundColor: theme.bgTertiary.color,
                  borderWidth: 1,
                  borderColor: theme.border.color,
                  borderRadius: 4,
                  width: CONTENT_W - 12,
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <pixiBitmapText
                  text={h.currentChip !== null ? `CHIP EFFECTS: ${h.chipName}` : 'CHIP EFFECTS'}
                  style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 12, fill: 0xffffff }}
                  tint={HIGHLIGHT}
                  layout={{}}
                />
                <pixiBitmapText
                  text={
                    h.currentChip !== null
                      ? `These effects are specific to the ${h.chipName} sound chip used by the current instrument. They use effect codes 10xx and above.`
                      : 'Select a chip-based instrument (Furnace) in the tracker to see its specific effect commands here.'
                  }
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{ maxWidth: CONTENT_W - 40 }}
                />
              </layoutContainer>

              {h.chipEffects.length > 0 ? (
                h.chipEffects.map((effect, idx) => (
                  <layoutContainer
                    key={idx}
                    layout={{
                      flexDirection: 'row',
                      gap: 8,
                      padding: 6,
                      backgroundColor: theme.bgTertiary.color,
                      borderWidth: 1,
                      borderColor: theme.border.color,
                      borderRadius: 4,
                      width: CONTENT_W - 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <layoutContainer
                      layout={{
                        width: 40,
                        paddingTop: 2,
                        paddingBottom: 2,
                        backgroundColor: theme.bg.color,
                        borderWidth: 1,
                        borderColor: theme.accent.color,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <pixiBitmapText
                        text={effect.command}
                        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
                        tint={HIGHLIGHT}
                        layout={{}}
                      />
                    </layoutContainer>
                    <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 2 }}>
                      <pixiBitmapText
                        text={effect.name}
                        style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 12, fill: 0xffffff }}
                        tint={theme.text.color}
                        layout={{}}
                      />
                      <pixiBitmapText
                        text={effect.desc}
                        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
                        tint={theme.textMuted.color}
                        layout={{}}
                      />
                    </layoutContainer>
                  </layoutContainer>
                ))
              ) : h.currentChip !== null ? (
                <pixiBitmapText
                  text={`No specific chip effects defined for ${h.chipName} yet.`}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                  layout={{ marginTop: 40, alignSelf: 'center' }}
                />
              ) : (
                <pixiBitmapText
                  text="No chip-based instrument selected."
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                  layout={{ marginTop: 40, alignSelf: 'center' }}
                />
              )}
            </layoutContainer>
          </PixiScrollView>
        )}

        {/* ── Tutorial ─────────────────────────────────────────────── */}
        {h.activeTab === 'tutorial' && (
          <layoutContainer layout={{ flexDirection: 'column', gap: 8, width: CONTENT_W }}>
            {/* Step content */}
            <layoutContainer
              layout={{
                padding: 16,
                backgroundColor: theme.bgTertiary.color,
                borderWidth: 2,
                borderColor: theme.accent.color,
                borderRadius: 4,
                width: CONTENT_W,
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {/* Step header */}
              <layoutContainer
                layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 36 }}
              >
                <pixiBitmapText
                  text={`STEP ${step.step} OF ${TUTORIAL_STEPS.length}`}
                  style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 14, fill: 0xffffff }}
                  tint={HIGHLIGHT}
                  layout={{}}
                />
                <pixiBitmapText
                  text={`${h.tutorialProgress}% Complete`}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                  layout={{}}
                />
              </layoutContainer>

              {/* Title */}
              <pixiBitmapText
                text={step.title}
                style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 16, fill: 0xffffff }}
                tint={theme.text.color}
                layout={{ marginBottom: 4 }}
              />

              {/* Content paragraphs */}
              {step.content.map((paragraph, idx) => (
                <pixiBitmapText
                  key={idx}
                  text={paragraph}
                  style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{ maxWidth: CONTENT_W - 40 }}
                />
              ))}
            </layoutContainer>

            {/* Navigation */}
            <layoutContainer
              layout={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: CONTENT_W,
              }}
            >
              <PixiButton
                label="← PREVIOUS"
                variant="ft2"
                size="sm"
                disabled={h.tutorialStep === 0}
                onClick={h.prevTutorialStep}
              />

              {/* Step number buttons */}
              <layoutContainer layout={{ flexDirection: 'row', gap: 2 }}>
                {TUTORIAL_STEPS.map((_, idx) => {
                  const isCurrent = idx === h.tutorialStep;
                  return (
                    <layoutContainer
                      key={idx}
                      eventMode="static"
                      cursor="pointer"
                      onPointerUp={() => h.setTutorialStep(idx)}
                      layout={{
                        width: 24,
                        height: 24,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: isCurrent ? theme.accent.color : theme.bg.color,
                        borderWidth: 1,
                        borderColor: isCurrent ? theme.accent.color : theme.border.color,
                      }}
                    >
                      <pixiBitmapText
                        text={String(idx + 1)}
                        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
                        tint={isCurrent ? theme.bg.color : theme.text.color}
                        layout={{}}
                      />
                    </layoutContainer>
                  );
                })}
              </layoutContainer>

              <PixiButton
                label="NEXT →"
                variant="ft2"
                size="sm"
                disabled={h.tutorialStep === TUTORIAL_STEPS.length - 1}
                onClick={h.nextTutorialStep}
              />
            </layoutContainer>
          </layoutContainer>
        )}
      </pixiContainer>

      {/* Footer */}
      <PixiModalFooter width={W}>
        <pixiBitmapText
          text="Press ? anytime to open this help"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ flex: 1 }}
        />
        <PixiButton label="CLOSE" variant="primary" size="sm" onClick={onClose} />
      </PixiModalFooter>
    </PixiModal>
  );
};
