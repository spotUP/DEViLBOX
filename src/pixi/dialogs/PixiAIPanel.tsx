/**
 * PixiAIPanel — GL-native right-side panel for the in-app AI assistant.
 * Follows the PixiUndoHistoryPanel pattern.
 *
 * Messages are rendered as BitmapText. The input is a DOM hybrid (PixiTextInput portal).
 */

import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PixiButton, PixiLabel } from '../components';
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
  const isUser = msg.role === 'user';
  const wrapped = useMemo(() => wrapText(msg.content || (msg.isStreaming ? '...' : ''), MAX_CHARS_PER_LINE), [msg.content, msg.isStreaming]);
  const textColor = isUser ? 0x60A5FA : 0xD4D4D4;
  const bgColor = isUser ? 0x1E3A5F : 0x2A2A2A;

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
        tint={isUser ? 0x60A5FA : 0x4ADE80}
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
          tint={tc.result ? 0x4ADE80 : 0xFACC15}
          layout={{ paddingLeft: 6 }}
        />
      ))}
    </layoutContainer>
  );
};

/** DOM input portal for the chat input */
const ChatInput: React.FC<{ panelRight: number; isStreaming: boolean }> = ({ panelRight, isStreaming }) => {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const provider = useAIStore((s) => s.provider);
  const model = useAIStore((s) => s.model);
  const setProvider = useAIStore((s) => s.setProvider);
  const setModel = useAIStore((s) => s.setModel);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setText('');
  }, [text, isStreaming]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // Auto-focus when panel opens
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        right: panelRight,
        bottom: 28, // above status bar
        width: PANEL_W,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '6px 8px',
        background: '#1a1a1a',
        borderTop: '1px solid #333',
        zIndex: 46,
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Provider + Model selector */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* Provider toggle */}
        <div style={{ display: 'flex', gap: 1, background: 'var(--color-bg-secondary)', borderRadius: 3, padding: 1 }}>
          {AI_PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              style={{
                padding: '2px 6px',
                fontSize: 9,
                fontFamily: 'monospace',
                border: 'none',
                borderRadius: 2,
                cursor: 'pointer',
                background: provider === p.id ? '#444' : 'transparent',
                color: provider === p.id ? '#fff' : '#666',
                fontWeight: provider === p.id ? 600 : 400,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* Model buttons for current provider */}
        <div style={{ display: 'flex', gap: 2 }}>
          {getModelsForProvider(provider).map((m) => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              style={{
                padding: '2px 8px',
                fontSize: 10,
                fontFamily: 'monospace',
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
                background: model === m.id ? '#60A5FA' : '#222',
                color: model === m.id ? '#111' : '#888',
                fontWeight: model === m.id ? 600 : 400,
              }}
              title={m.description}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {/* Input + send row */}
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI..."
          style={{
            flex: 1,
            background: 'var(--color-bg-secondary)',
            border: '1px solid #333',
            borderRadius: 4,
            padding: '4px 8px',
            color: '#ddd',
            fontSize: 12,
            fontFamily: 'monospace',
            outline: 'none',
          }}
        />
        {isStreaming ? (
          <button
            onClick={stopStreaming}
            style={{
              padding: '4px 12px',
              background: '#3B1515',
              color: '#F87171',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            style={{
              padding: '4px 12px',
              background: text.trim() ? '#1E3A5F' : '#222',
              color: text.trim() ? '#60A5FA' : '#555',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              cursor: text.trim() ? 'pointer' : 'default',
            }}
          >
            Send
          </button>
        )}
      </div>
    </div>,
    document.body,
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
    <>
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

        {/* Messages area */}
        <layoutContainer
          layout={{
            flex: 1,
            flexDirection: 'column',
            overflow: 'scroll',
            paddingTop: 8,
            paddingBottom: 40,
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
      </layoutContainer>

      {/* DOM input overlay */}
      <ChatInput panelRight={0} isStreaming={isStreaming} />
    </>
  );
};
