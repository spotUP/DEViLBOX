/**
 * PixiHelpModal — GL-native interactive help system.
 * 4 tabs: Keyboard Shortcuts, Standard Effects, Chip Effects, Tutorial.
 * GL replacement for src/components/help/HelpModal.tsx
 */

import React, { useMemo, useState, useEffect } from 'react';
import { PixiModal, PixiModalFooter, PixiButton } from '../components';
import { PixiScrollView } from '../components/PixiScrollView';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { EFFECT_COMMANDS, TUTORIAL_STEPS, HELP_TABS, type HelpTab, type EffectCommand } from '@/data/helpContent';
import { useHelpDialog } from '@hooks/dialogs/useHelpDialog';
import { useKeyboardStore } from '@stores/useKeyboardStore';

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

/** Build shortcut groups dynamically from active keyboard scheme JSON (matches DOM HelpModal) */
function buildShortcutGroups(schemeData: Record<string, string> | null): ShortcutGroup[] {
  const noteEntry: ShortcutGroup = {
    title: 'Note Entry',
    shortcuts: [
      { keys: 'Z,S,X,D,C...', description: 'Piano keys lower row (C-B)' },
      { keys: 'Q,2,W,3,E...', description: 'Piano keys upper row (+1 octave)' },
      { keys: '0-9, A-F', description: 'Hex digits (instrument, volume, effect)' },
    ],
  };

  if (!schemeData || Object.keys(schemeData).length === 0) return [noteEntry];

  const cats: Record<string, { keys: string; description: string }[]> = {};
  const addTo = (cat: string, keys: string, cmd: string) => {
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push({ keys, description: cmd.replace(/_/g, ' ') });
  };

  for (const [key, cmd] of Object.entries(schemeData)) {
    if (typeof cmd !== 'string') continue;
    if (/^(play_|stop|pause|continue_)/.test(cmd)) addTo('Transport', key, cmd);
    else if (/^(cursor_|jump_to_|goto_|seek_|scroll_|snap_|screen_|song_start|song_end|stay_in)/.test(cmd)) addTo('Navigation', key, cmd);
    else if (/^(insert_|delete_|clear_|roll_|advance_|backspace)/.test(cmd)) addTo('Editing', key, cmd);
    else if (/^(select_|mark_block|block_|unmark|copy_|cut_|paste_|quick_)/.test(cmd)) addTo('Selection & Clipboard', key, cmd);
    else if (/^transpose_/.test(cmd)) addTo('Transpose', key, cmd);
    else if (/^(set_octave|next_octave|prev_octave)/.test(cmd)) addTo('Octave', key, cmd);
    else if (/^(set_instrument|next_instrument|prev_instrument|set_sample|instrument_|swap_instrument)/.test(cmd)) addTo('Instruments', key, cmd);
    else if (/^(mute_|solo_|unmute_|set_track|set_multi|reset_channel|channel_)/.test(cmd)) addTo('Channels', key, cmd);
    else if (/^(next_pattern|prev_pattern|next_block|prev_block|clone_|next_order|prev_order|next_sequence|prev_sequence|set_position|save_position|goto_position|sequence_|set_playback)/.test(cmd)) addTo('Patterns & Position', key, cmd);
    else if (/^(increase_|decrease_|set_step|set_edit|set_quantize|double_block|halve_block)/.test(cmd)) addTo('Step & Volume', key, cmd);
    else if (/^(toggle_|show_|open_|view_|close_|help$|configure|order_list|layout_|display_|cycle_|switch_to)/.test(cmd)) addTo('View & Settings', key, cmd);
    else if (/^(undo|redo|save_|export_|load_|new_|fast_save)/.test(cmd)) addTo('File & History', key, cmd);
    else if (/^(tracker_|power_cut|dj_)/.test(cmd)) addTo('DJ & Scratch', key, cmd);
    else addTo('Other', key, cmd);
  }

  const groups: ShortcutGroup[] = [noteEntry];
  const order = ['Transport', 'Navigation', 'Editing', 'Selection & Clipboard', 'Transpose',
    'Octave', 'Instruments', 'Channels', 'Patterns & Position', 'Step & Volume',
    'View & Settings', 'File & History', 'DJ & Scratch', 'Other'];
  for (const cat of order) {
    if (cats[cat]?.length) groups.push({ title: cat, shortcuts: cats[cat] });
  }
  return groups;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Parsed markdown line — one element per visual line in the Pixi render */
interface MdLine {
  type: 'h1' | 'h2' | 'h3' | 'bullet' | 'code' | 'gap' | 'text';
  text: string;
}

/** Parse markdown content into a flat list of typed lines for Pixi rendering */
function parseMarkdownLines(md: string): MdLine[] {
  const raw = md.split('\n');
  const out: MdLine[] = [];
  let i = 0;

  while (i < raw.length) {
    const line = raw[i];

    // Fenced code block
    if (line.startsWith('```')) {
      i++; // skip opening fence
      while (i < raw.length && !raw[i].startsWith('```')) {
        out.push({ type: 'code', text: raw[i] });
        i++;
      }
      i++; // skip closing fence
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = hMatch[2].replace(/\*\*(.+?)\*\*/g, '$1');
      if (level === 1) out.push({ type: 'h1', text });
      else if (level === 2) out.push({ type: 'h2', text });
      else out.push({ type: 'h3', text });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      out.push({ type: 'gap', text: '' });
      i++;
      continue;
    }

    // Table rows — skip separator rows, render data rows as text
    if (line.trimStart().startsWith('|')) {
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(line)) {
        const cells = line.split('|').slice(1, -1).map(c => c.trim()).join('  |  ');
        out.push({ type: 'text', text: cells });
      }
      i++;
      continue;
    }

    // Unordered list item
    if (/^\s*[-*]\s+/.test(line)) {
      const content = line.replace(/^\s*[-*]\s+/, '');
      out.push({ type: 'bullet', text: stripInlineMarkdown(content) });
      i++;
      continue;
    }

    // Ordered list item
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const content = line.replace(/^\s*\d+[.)]\s+/, '');
      out.push({ type: 'bullet', text: stripInlineMarkdown(content) });
      i++;
      continue;
    }

    // Empty line → gap
    if (line.trim() === '') {
      out.push({ type: 'gap', text: '' });
      i++;
      continue;
    }

    // Regular text (strip inline markdown for display)
    out.push({ type: 'text', text: stripInlineMarkdown(line) });
    i++;
  }

  return out;
}

/** Strip inline markdown tokens for bitmap text display */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')       // bold
    .replace(/`([^`]+)`/g, '$1')           // inline code
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[$1]') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');    // links
}

/** Render parsed markdown lines as Pixi layout elements */
const MarkdownContent: React.FC<{ lines: MdLine[]; maxWidth: number }> = ({ lines, maxWidth }) => {
  const theme = usePixiTheme();
  return (
    <>
      {lines.map((line, i) => {
        switch (line.type) {
          case 'h1':
            return (
              <pixiBitmapText
                key={i}
                text={line.text}
                style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 16, fill: 0xffffff }}
                tint={theme.text.color}
                layout={{ marginTop: 8, marginBottom: 4, maxWidth }}
              />
            );
          case 'h2':
            return (
              <pixiBitmapText
                key={i}
                text={line.text}
                style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 14, fill: 0xffffff }}
                tint={theme.text.color}
                layout={{ marginTop: 6, marginBottom: 3, maxWidth }}
              />
            );
          case 'h3':
            return (
              <pixiBitmapText
                key={i}
                text={line.text}
                style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 12, fill: 0xffffff }}
                tint={theme.text.color}
                layout={{ marginTop: 4, marginBottom: 2, maxWidth }}
              />
            );
          case 'bullet':
            return (
              <layoutContainer key={i} layout={{ flexDirection: 'row', gap: 4, paddingLeft: 8, maxWidth }}>
                <pixiBitmapText
                  text={'\u2022'}
                  style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                  tint={theme.textSecondary.color}
                  layout={{}}
                />
                <pixiBitmapText
                  text={line.text}
                  style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                  tint={theme.textSecondary.color}
                  layout={{ maxWidth: maxWidth - 20 }}
                />
              </layoutContainer>
            );
          case 'code':
            return (
              <pixiBitmapText
                key={i}
                text={line.text}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                tint={theme.accent.color}
                layout={{ paddingLeft: 8, maxWidth }}
              />
            );
          case 'gap':
            return <layoutContainer key={i} layout={{ height: 8 }} />;
          case 'text':
          default:
            return (
              <pixiBitmapText
                key={i}
                text={line.text}
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                tint={theme.textSecondary.color}
                layout={{ maxWidth }}
              />
            );
        }
      })}
    </>
  );
};

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
  const activeScheme = useKeyboardStore((s) => s.activeScheme);

  // Dynamically load keyboard scheme JSON (matches DOM HelpModal)
  const [schemeData, setSchemeData] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const isMac = navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac');
    fetch(`/keyboard-schemes/${activeScheme}.json`)
      .then(r => r.json())
      .then(data => {
        const plat = data.platform || data;
        setSchemeData(plat[isMac ? 'mac' : 'pc'] || plat.pc || {});
      })
      .catch(() => setSchemeData(null));
  }, [isOpen, activeScheme]);

  const shortcutGroups = useMemo(() => buildShortcutGroups(schemeData), [schemeData]);

  // ── Estimated content heights for scroll view ─────────────────────────

  const shortcutsContentHeight = useMemo(() => {
    let height = 0;
    for (const g of shortcutGroups) {
      height += 24 + g.shortcuts.length * 18 + 16;
    }
    return height + 40;
  }, [shortcutGroups]);

  const effectsContentHeight = useMemo(() => {
    return 60 + EFFECT_COMMANDS.length * 72;
  }, []);

  const chipEffectsContentHeight = useMemo(() => {
    if (h.chipEffects.length === 0) return 160;
    return 80 + h.chipEffects.length * 50;
  }, [h.chipEffects]);

  const currentManualChapter = useMemo(() => {
    if (h.filteredChapters.length === 0) return null;
    return h.filteredChapters[h.manualChapterIndex] || h.filteredChapters[0];
  }, [h.filteredChapters, h.manualChapterIndex]);

  const parsedManualLines = useMemo(() => {
    if (!currentManualChapter) return [];
    return parseMarkdownLines(currentManualChapter.content);
  }, [currentManualChapter]);

  const manualContentHeight = useMemo(() => {
    if (!currentManualChapter) return 200;
    let height = 60; // chapter title + part subtitle
    for (const line of parsedManualLines) {
      switch (line.type) {
        case 'h1': height += 28; break;
        case 'h2': height += 24; break;
        case 'h3': height += 20; break;
        case 'gap': height += 8; break;
        case 'bullet': height += 18; break;
        case 'code': height += 16; break;
        default: height += 16; break;
      }
    }
    return Math.max(200, height + 80); // extra for nav buttons
  }, [currentManualChapter, parsedManualLines]);

  const manualSidebarHeight = useMemo(() => {
    let height = 0;
    for (const part of h.manualParts) {
      height += 24; // part header
      const partChapters = h.filteredChapters.filter(c => c.partNumber === part.number);
      height += partChapters.length * 22;
      height += 4; // gap
    }
    return Math.max(200, height + 20);
  }, [h.filteredChapters, h.manualParts]);

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
              {shortcutGroups.map((group, idx) => (
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

        {/* ── Manual ───────────────────────────────────────────────── */}
        {h.activeTab === 'manual' && (
          h.filteredChapters.length === 0 ? (
            <layoutContainer layout={{ width: CONTENT_W, height: CONTENT_H, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 8 }}>
              <pixiBitmapText
                text={h.manualSearchQuery ? 'No chapters match your search.' : 'Manual not yet generated.'}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
              {h.manualSearchQuery && (
                <PixiPureTextInput
                  value={h.manualSearchQuery}
                  onChange={h.setManualSearchQuery}
                  placeholder="Search manual..."
                  width={200}
                  height={22}
                  fontSize={11}
                />
              )}
            </layoutContainer>
          ) : (
            <layoutContainer layout={{ flexDirection: 'row', gap: 8, width: CONTENT_W, height: CONTENT_H }}>
              {/* Left sidebar: search + chapter list */}
              <layoutContainer layout={{ flexDirection: 'column', width: 180, height: CONTENT_H }}>
                {/* Search input */}
                <layoutContainer
                  layout={{
                    paddingLeft: 2,
                    paddingRight: 2,
                    paddingTop: 4,
                    paddingBottom: 4,
                    borderBottomWidth: 1,
                    borderColor: theme.border.color,
                    width: 180,
                  }}
                >
                  <PixiPureTextInput
                    value={h.manualSearchQuery}
                    onChange={h.setManualSearchQuery}
                    placeholder="Search manual..."
                    width={176}
                    height={22}
                    fontSize={11}
                  />
                </layoutContainer>
                {/* Chapter tree */}
                <PixiScrollView width={180} height={CONTENT_H - 30} contentHeight={manualSidebarHeight}>
                  <layoutContainer layout={{ flexDirection: 'column', gap: 2, width: 180 }}>
                    {h.manualParts.map((part) => {
                      const partChapters = h.filteredChapters.filter(c => c.partNumber === part.number);
                      if (partChapters.length === 0) return null;
                      return (
                        <layoutContainer key={part.number} layout={{ flexDirection: 'column', gap: 1, width: 176 }}>
                          {/* Part header */}
                          <layoutContainer
                            layout={{
                              paddingLeft: 4,
                              paddingTop: 4,
                              paddingBottom: 2,
                              width: 176,
                            }}
                          >
                            <pixiBitmapText
                              text={`PART ${part.number}: ${part.name.toUpperCase()}`}
                              style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 9, fill: 0xffffff }}
                              tint={theme.textMuted.color}
                              layout={{}}
                            />
                          </layoutContainer>
                          {/* Chapter entries */}
                          {partChapters.map((chapter) => {
                            const globalIdx = h.filteredChapters.indexOf(chapter);
                            const isActive = globalIdx === h.manualChapterIndex;
                            return (
                              <layoutContainer
                                key={chapter.id}
                                eventMode="static"
                                cursor="pointer"
                                onPointerUp={() => h.setManualChapterIndex(globalIdx)}
                                onClick={() => h.setManualChapterIndex(globalIdx)}
                                layout={{
                                  paddingLeft: 6,
                                  paddingRight: 4,
                                  paddingTop: 3,
                                  paddingBottom: 3,
                                  width: 176,
                                  backgroundColor: isActive ? theme.accent.color : undefined,
                                  borderRadius: 2,
                                }}
                              >
                                <pixiBitmapText
                                  text={`${chapter.number}. ${chapter.title}`}
                                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
                                  tint={isActive ? theme.bg.color : theme.text.color}
                                  layout={{ maxWidth: 164 }}
                                />
                              </layoutContainer>
                            );
                          })}
                        </layoutContainer>
                      );
                    })}
                  </layoutContainer>
                </PixiScrollView>
              </layoutContainer>

              {/* Right content: chapter body */}
              <PixiScrollView width={CONTENT_W - 180 - 8} height={CONTENT_H} contentHeight={manualContentHeight}>
                <layoutContainer layout={{ flexDirection: 'column', gap: 2, width: CONTENT_W - 180 - 20 }}>
                  {currentManualChapter && (
                    <>
                      {/* Chapter title */}
                      <pixiBitmapText
                        text={`${currentManualChapter.number}. ${currentManualChapter.title}`}
                        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 14, fill: 0xffffff }}
                        tint={HIGHLIGHT}
                        layout={{ marginBottom: 2 }}
                      />
                      {/* Part subtitle */}
                      <pixiBitmapText
                        text={`Part ${currentManualChapter.partNumber}: ${currentManualChapter.part}`}
                        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
                        tint={theme.textMuted.color}
                        layout={{ marginBottom: 8 }}
                      />
                      {/* Rendered markdown content */}
                      <MarkdownContent lines={parsedManualLines} maxWidth={CONTENT_W - 180 - 32} />

                      {/* Prev/Next navigation */}
                      <layoutContainer
                        layout={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          width: CONTENT_W - 180 - 20,
                          marginTop: 16,
                          paddingTop: 8,
                          borderTopWidth: 1,
                          borderColor: theme.border.color,
                        }}
                      >
                        <PixiButton
                          label="PREV"
                          variant="ft2"
                          size="sm"
                          disabled={h.manualChapterIndex === 0}
                          onClick={() => h.setManualChapterIndex(Math.max(0, h.manualChapterIndex - 1))}
                        />
                        <pixiBitmapText
                          text={`${h.manualChapterIndex + 1} / ${h.filteredChapters.length}`}
                          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
                          tint={theme.textMuted.color}
                          layout={{}}
                        />
                        <PixiButton
                          label="NEXT"
                          variant="ft2"
                          size="sm"
                          disabled={h.manualChapterIndex === h.filteredChapters.length - 1}
                          onClick={() => h.setManualChapterIndex(Math.min(h.filteredChapters.length - 1, h.manualChapterIndex + 1))}
                        />
                      </layoutContainer>
                    </>
                  )}
                </layoutContainer>
              </PixiScrollView>
            </layoutContainer>
          )
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
