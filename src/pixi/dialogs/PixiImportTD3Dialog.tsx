/**
 * PixiImportTD3Dialog — GL-native import dialog for Behringer TD-3 / Roland TB-303
 * pattern files (.sqs / .seq).
 *
 * Parses the file locally to preview the pattern list before committing to import.
 * Offers an option to append patterns or replace the current project.
 *
 * DOM reference: src/components/dialogs/ImportTD3Dialog.tsx
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  PixiModal,
  PixiModalHeader,
  PixiModalFooter,
  PixiButton,
  PixiLabel,
  PixiCheckbox,
  PixiScrollView,
} from '../components';
import { usePixiTheme } from '../theme';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TD3Preview {
  name: string;
  version: string;
  patternNames: string[];
}

interface PixiImportTD3DialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialFile?: File | null;
  /** Called when the user confirms import. Receives the File and whether to replace existing patterns. */
  onImport: (file: File, replacePatterns: boolean) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MODAL_W = 420;
const MODAL_H = 420;
const CONTENT_W = MODAL_W - 34;
const PATTERN_LIST_H = 140;
const PATTERN_ROW_H = 18;

/** Pre-blend two 0xRRGGBB colours at a given alpha (for semi-transparent backgrounds). */
function blendColor(base: number, overlay: number, alpha: number): number {
  const r1 = (base >> 16) & 0xFF, g1 = (base >> 8) & 0xFF, b1 = base & 0xFF;
  const r2 = (overlay >> 16) & 0xFF, g2 = (overlay >> 8) & 0xFF, b2 = overlay & 0xFF;
  return (Math.round(r1 + (r2 - r1) * alpha) << 16) | (Math.round(g1 + (g2 - g1) * alpha) << 8) | Math.round(b1 + (b2 - b1) * alpha);
}

function tintBg(color: number, factor = 0.15): number {
  return (((color >> 16 & 0xff) * factor | 0) << 16) | (((color >> 8 & 0xff) * factor | 0) << 8) | ((color & 0xff) * factor | 0);
}

// ── Component ──────────────────────────────────────────────────────────────────

export const PixiImportTD3Dialog: React.FC<PixiImportTD3DialogProps> = ({
  isOpen,
  onClose,
  initialFile,
  onImport,
}) => {
  const theme = usePixiTheme();
  const [preview, setPreview] = useState<TD3Preview | null>(null);
  const [td3File, setTD3File] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacePatterns, setReplacePatterns] = useState(true);

  // ── File parsing ───────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    setPreview(null);
    setTD3File(null);

    try {
      const buf = await file.arrayBuffer();
      const { parseTD3File } = await import('@lib/import/TD3PatternLoader');
      const parsed = await parseTD3File(buf);

      setPreview({
        name: parsed.name || file.name.replace(/\.[^/.]+$/, ''),
        version: parsed.version || 'Unknown',
        patternNames: parsed.patterns.map((p, i) => p.name || `Pattern ${i + 1}`),
      });
      setTD3File(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse TD-3 file');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-parse initialFile on mount / open
  useEffect(() => {
    if (initialFile && isOpen) {
      handleFileSelect(initialFile);
    }
  }, [initialFile, isOpen, handleFileSelect]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleImport = useCallback(() => {
    if (!td3File) return;
    onImport(td3File, replacePatterns);
    onClose();
  }, [td3File, replacePatterns, onImport, onClose]);

  const handleClose = useCallback(() => {
    setPreview(null);
    setTD3File(null);
    setError(null);
    onClose();
  }, [onClose]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const patternCount = preview?.patternNames.length ?? 0;
  const patternCountLabel = `${patternCount} pattern${patternCount !== 1 ? 's' : ''}`;

  const accentBg = blendColor(theme.bg.color, theme.accent.color, 0.2);

  return (
    <PixiModal isOpen={isOpen} onClose={handleClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="Import TD-3 / TB-303 Patterns" onClose={handleClose} width={MODAL_W} />

      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 16, overflow: 'hidden' }}>

        {/* Loading state */}
        {isLoading && (
          <layoutContainer layout={{ alignItems: 'center', justifyContent: 'center', height: 60 }}>
            <PixiLabel text="Parsing file…" size="md" color="textMuted" />
          </layoutContainer>
        )}

        {/* Error state */}
        {error && (
          <layoutContainer
            layout={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 12,
              borderRadius: 6,
              borderWidth: 1,
              backgroundColor: tintBg(theme.error.color),
              borderColor: theme.error.color,
              width: CONTENT_W,
            }}
          >
            <PixiLabel text="⚠" size="md" color="error" />
            <PixiLabel text={error} size="md" color="error" layout={{ maxWidth: CONTENT_W - 40 }} />
          </layoutContainer>
        )}

        {/* Preview content */}
        {preview && (
          <>
            {/* File info card */}
            <layoutContainer
              layout={{
                flexDirection: 'column',
                gap: 8,
                padding: 16,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: theme.bg.color,
                borderColor: theme.border.color,
                width: CONTENT_W,
              }}
            >
              <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 32 }}>
                <PixiLabel text={preview.name} size="lg" weight="medium" color="text" />
                <layoutContainer
                  layout={{
                    paddingLeft: 8,
                    paddingRight: 8,
                    paddingTop: 2,
                    paddingBottom: 2,
                    borderRadius: 4,
                    backgroundColor: accentBg,
                  }}
                >
                  <PixiLabel text={`v${preview.version}`} size="sm" color="accent" />
                </layoutContainer>
              </layoutContainer>
              <PixiLabel text={patternCountLabel} size="sm" color="textMuted" />
            </layoutContainer>

            {/* Pattern list */}
            {patternCount > 0 && (
              <layoutContainer
                layout={{
                  borderRadius: 8,
                  borderWidth: 1,
                  padding: 12,
                  backgroundColor: theme.bg.color,
                  borderColor: theme.border.color,
                  width: CONTENT_W,
                  overflow: 'hidden',
                }}
              >
                <PixiScrollView
                  width={CONTENT_W - 26}
                  height={Math.min(PATTERN_LIST_H, patternCount * PATTERN_ROW_H + 8)}
                  contentHeight={patternCount * PATTERN_ROW_H + 8}
                >
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
                    {preview.patternNames.map((name, i) => (
                      <layoutContainer
                        key={i}
                        layout={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          height: PATTERN_ROW_H,
                        }}
                      >
                        <PixiLabel
                          text={String(i + 1).padStart(2, ' ')}
                          size="sm"
                          font="mono"
                          color="textMuted"
                          layout={{ width: 24 }}
                        />
                        <PixiLabel text={name} size="sm" color="text" />
                      </layoutContainer>
                    ))}
                  </layoutContainer>
                </PixiScrollView>
              </layoutContainer>
            )}

            {/* Import mode selection */}
            <layoutContainer
              layout={{
                flexDirection: 'column',
                gap: 8,
                padding: 16,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: theme.bg.color,
                borderColor: theme.border.color,
                width: CONTENT_W,
              }}
            >
              <PixiLabel text="Import Mode" size="sm" weight="medium" color="text" />

              <PixiCheckbox
                checked={replacePatterns}
                onChange={() => setReplacePatterns(true)}
                label="Load as new song"
              />
              <PixiLabel
                text="Replace current project with TD-3 patterns"
                size="sm"
                color="textMuted"
                layout={{ marginLeft: 18 }}
              />

              <PixiCheckbox
                checked={!replacePatterns}
                onChange={() => setReplacePatterns(false)}
                label="Append to project"
              />
              <PixiLabel
                text="Add patterns alongside existing patterns"
                size="sm"
                color="textMuted"
                layout={{ marginLeft: 18 }}
              />
            </layoutContainer>
          </>
        )}
      </layoutContainer>

      <PixiModalFooter width={MODAL_W}>
        <PixiButton label="Cancel" variant="ghost" onClick={handleClose} />
        <PixiButton label="Import Patterns" variant="primary" onClick={handleImport} disabled={!td3File} />
      </PixiModalFooter>
    </PixiModal>
  );
};
