/**
 * PixiSynthErrorDialog — GL-native synth error dialog.
 * Shows synth initialization/runtime errors with debug info.
 * DOM reference: src/components/ui/SynthErrorDialog.tsx
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiLabel } from '../components';
import { usePixiTheme } from '../theme';
import { useSynthErrorStore, type SynthError } from '@/stores/useSynthErrorStore';

function tintBg(color: number, factor = 0.15): number {
  return (((color >> 16 & 0xff) * factor | 0) << 16) | (((color >> 8 & 0xff) * factor | 0) << 8) | ((color & 0xff) * factor | 0);
}

const ERROR_TYPE_LABELS: Record<SynthError['errorType'], string> = {
  init: 'Initialization Error',
  wasm: 'WASM Engine Error',
  runtime: 'Runtime Error',
  audio: 'Audio Context Error',
};

const MODAL_W = 480;
const MODAL_H = 380;

export const PixiSynthErrorDialog: React.FC = () => {
  const theme = usePixiTheme();
  const activeError = useSynthErrorStore((s) => s.activeError);
  const dismissError = useSynthErrorStore((s) => s.dismissError);
  const copyToClipboard = useSynthErrorStore((s) => s.copyToClipboard);
  const getDebugString = useSynthErrorStore((s) => s.getDebugString);

  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!activeError) return;
    const success = await copyToClipboard(activeError);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [activeError, copyToClipboard]);

  const handleDismiss = useCallback(() => {
    if (!activeError) return;
    dismissError(activeError.id);
    setCopied(false);
    setShowDetails(false);
  }, [activeError, dismissError]);

  const toggleDetails = useCallback(() => {
    setShowDetails((v) => !v);
  }, []);

  const subtitle = activeError ? ERROR_TYPE_LABELS[activeError.errorType] : '';
  const synthLabel = activeError?.synthName
    ? `${activeError.synthType} (${activeError.synthName})`
    : activeError?.synthType ?? '';

  const debugString = activeError ? getDebugString(activeError) : '';
  const stackText = activeError?.stack
    ? activeError.stack.length > 300
      ? activeError.stack.slice(0, 300) + '…'
      : activeError.stack
    : '';

  return (
    <PixiModal isOpen={!!activeError} onClose={handleDismiss} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="Synth Error" onClose={handleDismiss} />

      {/* Scrollable content area */}
      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
        {/* Subtitle */}
        <PixiLabel text={subtitle} size="xs" color="error" />

        {/* Error summary box */}
        <layoutContainer
          layout={{
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: tintBg(theme.error.color),
            borderColor: theme.error.color,
            flexDirection: 'column',
            gap: 6,
            width: MODAL_W - 26,
          }}
        >
          <PixiLabel text={synthLabel} size="sm" weight="bold" color="custom" customColor={theme.error.color} />
          <PixiLabel text={activeError?.message ?? ''} size="xs" color="text" layout={{ maxWidth: MODAL_W - 50 }} />
        </layoutContainer>

        {/* Toggle debug details */}
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={toggleDetails}
          layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}
        >
          <PixiLabel
            text={showDetails ? '▾ Hide Debug Details' : '▸ Show Debug Details'}
            size="xs"
            color="textSecondary"
          />
        </layoutContainer>

        {/* Debug details */}
        {showDetails && (
          <layoutContainer
            layout={{
              flexDirection: 'column',
              gap: 8,
              padding: 10,
              borderRadius: 6,
              backgroundColor: theme.bgTertiary.color,
              borderWidth: 1,
              borderColor: theme.border.color,
              width: MODAL_W - 26,
              overflow: 'hidden',
            }}
          >
            {/* Info grid — 2 columns */}
            <layoutContainer layout={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
              <layoutContainer layout={{ flexDirection: 'column', gap: 2, width: (MODAL_W - 70) / 2 }}>
                <PixiLabel text="Timestamp" size="xs" color="textMuted" />
                <PixiLabel text={activeError?.debugData.timestamp ?? ''} size="xs" font="mono" color="textSecondary" />
              </layoutContainer>
              <layoutContainer layout={{ flexDirection: 'column', gap: 2, width: (MODAL_W - 70) / 2 }}>
                <PixiLabel text="AudioContext" size="xs" color="textMuted" />
                <PixiLabel text={activeError?.debugData.audioContextState ?? 'unknown'} size="xs" font="mono" color="textSecondary" />
              </layoutContainer>
              <layoutContainer layout={{ flexDirection: 'column', gap: 2, width: (MODAL_W - 70) / 2 }}>
                <PixiLabel text="WASM Supported" size="xs" color="textMuted" />
                <PixiLabel text={activeError?.debugData.wasmSupported ? 'Yes' : 'No'} size="xs" font="mono" color="textSecondary" />
              </layoutContainer>
              <layoutContainer layout={{ flexDirection: 'column', gap: 2, width: (MODAL_W - 70) / 2 }}>
                <PixiLabel text="Error Type" size="xs" color="textMuted" />
                <PixiLabel text={activeError?.errorType ?? ''} size="xs" font="mono" color="textSecondary" />
              </layoutContainer>
            </layoutContainer>

            {/* Stack trace */}
            {stackText && (
              <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
                <PixiLabel text="Stack Trace:" size="xs" color="textMuted" />
                <layoutContainer
                  layout={{
                    padding: 6,
                    borderRadius: 4,
                    backgroundColor: theme.bg.color,
                    maxHeight: 60,
                    overflow: 'hidden',
                    width: MODAL_W - 50,
                  }}
                >
                  <PixiLabel text={stackText} size="xs" font="mono" color="custom" customColor={theme.error.color} />
                </layoutContainer>
              </layoutContainer>
            )}

            {/* Full debug report */}
            <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
              <PixiLabel text="Full Debug Report:" size="xs" color="textMuted" />
              <layoutContainer
                layout={{
                  padding: 6,
                  borderRadius: 4,
                  backgroundColor: theme.bg.color,
                  maxHeight: 80,
                  overflow: 'hidden',
                  width: MODAL_W - 50,
                }}
              >
                <PixiLabel
                  text={debugString.length > 500 ? debugString.slice(0, 500) + '…' : debugString}
                  size="xs"
                  font="mono"
                  color="textMuted"
                />
              </layoutContainer>
            </layoutContainer>
          </layoutContainer>
        )}

        {/* Help text */}
        <PixiLabel
          text="Copy debug info and report this issue. The synth will not be available until resolved."
          size="xs"
          color="textMuted"
          layout={{ maxWidth: MODAL_W - 26 }}
        />
      </layoutContainer>

      <PixiModalFooter width={MODAL_W}>
        <PixiButton
          label={copied ? '✓ Copied!' : 'Copy Debug Info'}
          variant="default"
          onClick={handleCopy}
        />
        <PixiButton label="Dismiss" variant="danger" onClick={handleDismiss} />
      </PixiModalFooter>
    </PixiModal>
  );
};
