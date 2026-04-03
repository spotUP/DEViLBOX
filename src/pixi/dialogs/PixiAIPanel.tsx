/**
 * PixiAIPanel — GL-native right-side panel for the in-app AI assistant.
 * Follows the PixiUndoHistoryPanel pattern.
 *
 * Messages are rendered as BitmapText. The input area is fully native GL:
 * PixiPureTextInput + PixiButton rows for providers/models/send.
 */

import { useCallback, useMemo, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PixiButton, PixiLabel } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useModalClose } from '@hooks/useDialogKeyboard';
import { useAIStore, AI_PROVIDERS, getModelsForProvider, type AIMessage } from '@stores/useAIStore';
import { sendMessage, stopStreaming } from '@/services/aiChatService';

const PANEL_W = 440;
const MSG_PAD = 8;
const LINE_H = 14;
const MAX_CHARS_PER_LINE = 48;
const INPUT_AREA_H = 60;
const PROVIDER_ROW_H = 22;
const INPUT_ROW_H = 28;
const INPUT_PAD = 6;

/** Darken a color by a factor (0-1) to create a tinted background */
function tintBg(color: number, factor = 0.15): number {
  return (((color >> 16 & 0xff) * factor | 0) << 16) | (((color >> 8 & 0xff) * factor | 0) << 8) | ((color & 0xff) * factor | 0);
}

/** Simple word-wrap for BitmapText */
function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    const words = paragraph.split(' ');
    let line = '';
    for (const word of words) {
      if (line.length + word.length + 1 > maxChars && line.length > 0) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Calculate the visual height of a message */
function messageHeight(msg: AIMessage): number {
  const textLines = wrapText(msg.content || (msg.isStreaming ? '...' : ''), MAX_CHARS_PER_LINE);
  const toolLines = msg.toolCalls.length;
  return Math.max(LINE_H, textLines.length * LINE_H) + toolLines * LINE_H + MSG_PAD;
}

/** Single message row */
const MessageRow: React.FC<{ msg: AIMessage; width: number }> = ({ msg, width }) => {
  const theme = usePixiTheme();
  const isUser = msg.role === 'user';
  const wrapped = useMemo(() => wrapText(msg.content || (msg.isStreaming ? '...' : ''), MAX_CHARS_PER_LINE), [msg.content, msg.isStreaming]);
  const textColor = isUser ? theme.accent.color : theme.textSecondary.color;
  const bgColor = isUser ? tintBg(theme.accent.color) : theme.bgTertiary.color;

  const h = messageHeight(msg);

  const drawBg = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.roundRect(0, 0, width - MSG_PAD * 2, h, 4);
      g.fill({ color: bgColor, alpha: 0.5 });
    },
    [width, h, bgColor],
  );

  return (
    <layoutContainer layout={{ flexDirection: 'column', paddingLeft: MSG_PAD, paddingRight: MSG_PAD, paddingBottom: 4, width }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: width - MSG_PAD * 2, height: h }} />

      {/* Role label */}
      <pixiBitmapText
        text={isUser ? 'You' : 'AI'}
        style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 10, fill: 0xffffff }}
        tint={isUser ? theme.accent.color : theme.success.color}
        layout={{ paddingLeft: 6, paddingTop: 3 }}
      />

      {/* Message text */}
      {wrapped.map((line, i) => (
        <pixiBitmapText
          key={i}
          text={line}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={textColor}
          layout={{ paddingLeft: 6 }}
        />
      ))}

      {/* Tool calls */}
      {msg.toolCalls.map((tc, i) => (
        <pixiBitmapText
          key={`tc-${i}`}
          text={`  ${tc.result ? '+' : '>'} ${tc.tool}`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={tc.result ? theme.success.color : theme.warning.color}
          layout={{ paddingLeft: 6 }}
        />
      ))}
    </layoutContainer>
  );
};

/** Native GL chat input area — provider selector, model selector, text input, send/stop */
const ChatInputGL: React.FC<{ isStreaming: boolean }> = ({ isStreaming }) => {
  const [text, setText] = useState('');
  const provider = useAIStore((s) => s.provider);
  const model = useAIStore((s) => s.model);
  const setProvider = useAIStore((s) => s.setProvider);
  const setModel = useAIStore((s) => s.setModel);
  const theme = usePixiTheme();

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setText('');
  }, [text, isStreaming]);

  const models = getModelsForProvider(provider);

  const drawInputAreaBg = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 0, PANEL_W, INPUT_AREA_H);
      g.fill({ color: theme.bgSecondary.color });
      g.rect(1, 0, PANEL_W - 1, 1);
      g.fill({ color: theme.border.color });
    },
    [theme],
  );

  const drawSeparator = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 3, 1, 14);
      g.fill({ color: theme.border.color, alpha: 0.5 });
    },
    [theme],
  );

  return (
    <layoutContainer
      layout={{
        width: PANEL_W,
        height: INPUT_AREA_H,
        flexDirection: 'column',
        paddingLeft: INPUT_PAD,
        paddingRight: INPUT_PAD,
        paddingTop: INPUT_PAD,
        gap: 4,
      }}
    >
      <pixiGraphics draw={drawInputAreaBg} layout={{ position: 'absolute', width: PANEL_W, height: INPUT_AREA_H }} />

      {/* Provider + model selector row */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: PROVIDER_ROW_H,
          gap: 2,
          alignItems: 'center',
        }}
      >
        {AI_PROVIDERS.map((p) => (
          <PixiButton
            key={p.id}
            label={p.label}
            variant={provider === p.id ? 'primary' : 'ghost'}
            size="sm"
            width={52}
            height={18}
            onClick={() => setProvider(p.id)}
          />
        ))}
        <pixiGraphics draw={drawSeparator} layout={{ width: 5, height: PROVIDER_ROW_H }} />
        {models.map((m) => (
          <PixiButton
            key={m.id}
            label={m.label}
            variant={model === m.id ? 'primary' : 'ghost'}
            size="sm"
            width={m.label.length > 5 ? 52 : 44}
            height={18}
            onClick={() => setModel(m.id)}
          />
        ))}
      </layoutContainer>

      {/* Text input + send/stop row */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: INPUT_ROW_H,
          gap: 4,
          alignItems: 'center',
        }}
      >
        <PixiPureTextInput
          value={text}
          onChange={setText}
          onSubmit={handleSubmit}
          placeholder="Ask AI..."
          width={PANEL_W - INPUT_PAD * 2 - 56}
          height={24}
          fontSize={11}
          font="sans"
          layout={{ flex: 1 }}
        />
        {isStreaming ? (
          <PixiButton
            label="Stop"
            variant="danger"
            size="sm"
            width={50}
            height={24}
            onClick={stopStreaming}
          />
        ) : (
          <PixiButton
            label="Send"
            variant={text.trim() ? 'primary' : 'ghost'}
            size="sm"
            width={50}
            height={24}
            onClick={handleSubmit}
            disabled={!text.trim()}
          />
        )}
      </layoutContainer>
    </layoutContainer>
  );
};

export const PixiAIPanel: React.FC = () => {
  const theme = usePixiTheme();
  usePixiResponsive(); // subscribe to responsive updates
  const isOpen = useAIStore((s) => s.isOpen);
  const messages = useAIStore((s) => s.messages);
  const isStreaming = useAIStore((s) => s.isStreaming);
  const close = useAIStore((s) => s.close);
  const clearHistory = useAIStore((s) => s.clearHistory);

  useModalClose({ isOpen, onClose: close });

  const drawPanelBg = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 0, PANEL_W, 4096);
      g.fill({ color: theme.bg.color });
      // left border
      g.rect(0, 0, 1, 4096);
      g.fill({ color: theme.border.color });
    },
    [theme],
  );

  const drawHeaderBorder = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 27, PANEL_W, 1);
      g.fill({ color: theme.border.color });
    },
    [theme],
  );

  if (!isOpen) return null;

  return (
    <layoutContainer
      layout={{
        position: 'absolute',
        right: 0,
        top: 0,
        width: PANEL_W,
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Panel background */}
      <pixiGraphics draw={drawPanelBg} layout={{ position: 'absolute', width: PANEL_W, height: '100%' }} />

      {/* Header */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 28,
          paddingLeft: 12,
          paddingRight: 8,
        }}
      >
        <pixiGraphics draw={drawHeaderBorder} layout={{ position: 'absolute', width: PANEL_W, height: 28 }} />
        <PixiLabel text="AI" size="xs" weight="semibold" font="sans" layout={{ flex: 1 }} />
        <PixiButton
          label="Clear"
          variant="ghost"
          size="sm"
          onClick={clearHistory}
          width={40}
          height={22}
        />
        <PixiButton
          label="x"
          variant="ghost"
          size="sm"
          onClick={close}
          width={24}
          height={22}
        />
      </layoutContainer>

      {/* Messages area — paddingBottom reserves space for the input area */}
      <layoutContainer
        layout={{
          flex: 1,
          flexDirection: 'column',
          overflow: 'scroll',
          paddingTop: 8,
          paddingBottom: INPUT_AREA_H + 4,
        }}
      >
        {messages.length === 0 && (
          <layoutContainer layout={{ paddingLeft: 16, paddingTop: 32 }}>
            <pixiBitmapText
              text="Ask the AI to edit patterns,"
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
            <pixiBitmapText
              text="mix, search music, and more."
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{ paddingTop: 2 }}
            />
            <pixiBitmapText
              text="Ctrl+L to toggle this panel"
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{ paddingTop: 12 }}
            />
          </layoutContainer>
        )}
        {messages.map((msg) => (
          <MessageRow key={msg.id} msg={msg} width={PANEL_W} />
        ))}
      </layoutContainer>

      {/* Native GL input area — provider selector + text input + send button */}
      <ChatInputGL isStreaming={isStreaming} />
    </layoutContainer>
  );
};
