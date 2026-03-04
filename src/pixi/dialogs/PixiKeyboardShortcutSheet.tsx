/**
 * PixiKeyboardShortcutSheet — GL-native keyboard shortcut overlay.
 * Reference: src/components/tracker/KeyboardShortcutSheet.tsx
 */

import { useMemo, useState } from 'react';
import { PixiModal, PixiModalFooter, PixiLabel, PixiButton } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';

interface ShortcutEntry {
  keys: string;
  action: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'Arrow Up/Down', action: 'Move cursor up/down' },
      { keys: 'Arrow Left/Right', action: 'Move cursor left/right' },
      { keys: 'Tab / Shift+Tab', action: 'Next/prev channel' },
      { keys: 'PageUp / PageDown', action: 'Jump 16 rows' },
      { keys: 'Home / End', action: 'Jump to first/last row' },
      { keys: 'F9-F12', action: 'Jump to 0%/25%/50%/75%' },
      { keys: 'Shift+Arrow L/R', action: 'Prev/next pattern' },
      { keys: 'Alt+Q-I', action: 'Jump to tracks 0-7' },
      { keys: 'Alt+A-K', action: 'Jump to tracks 8-15' },
    ],
  },
  {
    title: 'Playback',
    shortcuts: [
      { keys: 'Space', action: 'Stop / toggle edit mode' },
      { keys: 'Right Shift', action: 'Record + play pattern' },
      { keys: 'Right Ctrl', action: 'Play song' },
      { keys: 'Right Alt', action: 'Play pattern' },
      { keys: 'Ctrl+Enter', action: 'Play song' },
    ],
  },
  {
    title: 'Note Entry',
    shortcuts: [
      { keys: 'Z-M (bottom row)', action: 'Notes C-B (lower octave)' },
      { keys: 'Q-P (top row)', action: 'Notes C-E (upper octave)' },
      { keys: 'F1-F7', action: 'Select octave 1-7' },
      { keys: 'Numpad +/-', action: 'Octave up/down' },
      { keys: 'CapsLock', action: 'Note off' },
      { keys: '` / ~', action: 'Edit step +1 / -1' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: 'Delete', action: 'Delete at cursor' },
      { keys: 'Shift+Delete', action: 'Delete entire cell' },
      { keys: 'Backspace', action: 'Delete previous & move up' },
      { keys: 'Insert', action: 'Insert row / toggle insert mode' },
      { keys: 'Shift+Insert', action: 'Insert entire line' },
    ],
  },
  {
    title: 'Block Operations',
    shortcuts: [
      { keys: 'Alt+B / Alt+E', action: 'Mark block start/end' },
      { keys: 'Ctrl+C / Ctrl+X', action: 'Copy / Cut' },
      { keys: 'Ctrl+V', action: 'Paste' },
      { keys: 'Ctrl+Shift+V', action: 'Mix paste (fill empty)' },
      { keys: 'Ctrl+Shift+F', action: 'Flood paste (to end)' },
      { keys: 'F3 / F4 / F5', action: 'Cut / Copy / Paste (FT2)' },
      { keys: 'Alt+Arrow keys', action: 'Extend selection' },
    ],
  },
  {
    title: 'Transpose',
    shortcuts: [
      { keys: 'Ctrl+Up/Down', action: 'Transpose ±1 semitone' },
      { keys: 'Ctrl+Shift+Up/Down', action: 'Transpose ±1 octave' },
      { keys: 'Alt+T / Alt+Shift+T', action: 'Block transpose ±1' },
    ],
  },
  {
    title: 'Macros & Dialogs',
    shortcuts: [
      { keys: 'Ctrl+1-8', action: 'Recall macro slot' },
      { keys: 'Ctrl+Shift+1-8', action: 'Save macro slot' },
      { keys: 'Ctrl+I', action: 'Interpolate' },
      { keys: 'Ctrl+H', action: 'Humanize' },
      { keys: 'Ctrl+F', action: 'Find & Replace' },
      { keys: 'Ctrl+O', action: 'Import module' },
      { keys: '?', action: 'This shortcut sheet' },
    ],
  },
  {
    title: 'Effect Commands',
    shortcuts: [
      { keys: '0xy', action: 'Arpeggio' },
      { keys: '1/2xx', action: 'Pitch slide up/down' },
      { keys: '3xx', action: 'Tone portamento' },
      { keys: '4xy', action: 'Vibrato' },
      { keys: 'Axy', action: 'Volume slide' },
      { keys: 'Cxx', action: 'Set volume (00-40)' },
      { keys: 'Fxx', action: 'Speed (01-1F) / BPM (20-FF)' },
      { keys: 'Exy', action: 'Extended commands' },
    ],
  },
];

interface PixiKeyboardShortcutSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const KEY_COLOR = 0xFDE047;

const SectionBlock: React.FC<{ section: ShortcutSection }> = ({ section }) => {
  const theme = usePixiTheme();
  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
      <pixiBitmapText
        text={section.title.toUpperCase()}
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={0x60A5FA}
        layout={{ marginBottom: 4 }}
      />
      {section.shortcuts.map((s, i) => (
        <layoutContainer
          key={`${section.title}-${i}`}
          layout={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 4,
            paddingTop: 1,
            paddingBottom: 1,
          }}
        >
          <pixiBitmapText
            text={s.keys}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
            tint={KEY_COLOR}
            layout={{}}
          />
          <pixiBitmapText
            text={s.action}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
            tint={theme.textSecondary.color}
            layout={{}}
          />
        </layoutContainer>
      ))}
    </layoutContainer>
  );
};

export const PixiKeyboardShortcutSheet: React.FC<PixiKeyboardShortcutSheetProps> = ({
  isOpen,
  onClose,
}) => {
  const theme = usePixiTheme();
  const [filter, setFilter] = useState('');

  const filteredSections = useMemo(() => {
    const lf = filter.toLowerCase();
    if (!lf) return SHORTCUT_SECTIONS;
    return SHORTCUT_SECTIONS.map((section) => ({
      ...section,
      shortcuts: section.shortcuts.filter(
        (s) =>
          s.keys.toLowerCase().includes(lf) ||
          s.action.toLowerCase().includes(lf),
      ),
    })).filter((section) => section.shortcuts.length > 0);
  }, [filter]);

  const leftSections = useMemo(
    () => filteredSections.slice(0, Math.ceil(filteredSections.length / 2)),
    [filteredSections],
  );
  const rightSections = useMemo(
    () => filteredSections.slice(Math.ceil(filteredSections.length / 2)),
    [filteredSections],
  );

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={700} height={520}>
      {/* Custom header with inline filter */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel text="Keyboard Shortcuts" size="md" weight="semibold" font="sans" />
        <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PixiPureTextInput
            value={filter}
            onChange={setFilter}
            placeholder="Filter..."
            width={120}
            height={24}
            fontSize={11}
          />
          <PixiButton label="×" variant="ghost" onClick={onClose} />
        </layoutContainer>
      </layoutContainer>

      {/* Two-column content */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, flex: 1, overflow: 'scroll', padding: 16 }}>
        <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 8 }}>
          {leftSections.map((section) => (
            <SectionBlock key={section.title} section={section} />
          ))}
        </layoutContainer>
        <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 8 }}>
          {rightSections.map((section) => (
            <SectionBlock key={section.title} section={section} />
          ))}
        </layoutContainer>
      </layoutContainer>

      {/* Footer */}
      <PixiModalFooter width={700}>
        <pixiBitmapText
          text="Press Esc to close | Ctrl/Cmd shown as Ctrl (use Cmd on macOS)"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
      </PixiModalFooter>
    </PixiModal>
  );
};
