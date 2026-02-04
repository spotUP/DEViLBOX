/**
 * SynthErrorDialog - Modal for displaying synth initialization/runtime errors
 * Shows detailed debug info with copy-to-clipboard functionality
 */

import React, { useState } from 'react';
import { Modal } from './Modal';
import { ModalHeader } from './ModalHeader';
import { ModalFooter } from './ModalFooter';
import { useSynthErrorStore, type SynthError } from '@/stores/useSynthErrorStore';
import { AlertTriangle, Copy, Check, X, ChevronDown, ChevronUp } from 'lucide-react';

export const SynthErrorDialog: React.FC = () => {
  const { activeError, dismissError, copyToClipboard, getDebugString } = useSynthErrorStore();
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  if (!activeError) return null;

  const handleCopy = async () => {
    const success = await copyToClipboard(activeError);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDismiss = () => {
    dismissError(activeError.id);
    setCopied(false);
    setShowDetails(false);
  };

  const errorTypeLabels: Record<SynthError['errorType'], string> = {
    init: 'Initialization Error',
    wasm: 'WASM Engine Error',
    runtime: 'Runtime Error',
    audio: 'Audio Context Error',
  };

  return (
    <Modal
      isOpen={true}
      onClose={handleDismiss}
      size="lg"
      closeOnBackdropClick={false}
      closeOnEscape={true}
    >
      <ModalHeader
        title="Synth Error"
        subtitle={errorTypeLabels[activeError.errorType]}
        icon={<AlertTriangle className="w-6 h-6 text-red-500" />}
      />

      <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
        {/* Error Summary */}
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="font-mono text-sm text-red-300">
                <span className="text-red-400 font-bold">{activeError.synthType}</span>
                {activeError.synthName && (
                  <span className="text-red-300/70"> ({activeError.synthName})</span>
                )}
              </p>
              <p className="mt-2 text-white">{activeError.message}</p>
            </div>
          </div>
        </div>

        {/* Expand/Collapse Debug Details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-2 text-sm text-dark-text-secondary hover:text-white transition-colors"
        >
          {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showDetails ? 'Hide' : 'Show'} Debug Details
        </button>

        {/* Debug Details */}
        {showDetails && (
          <div className="bg-dark-surface rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-dark-text-secondary">Timestamp:</span>
                <p className="font-mono text-xs">{activeError.debugData.timestamp}</p>
              </div>
              <div>
                <span className="text-dark-text-secondary">AudioContext:</span>
                <p className="font-mono text-xs">{activeError.debugData.audioContextState}</p>
              </div>
              <div>
                <span className="text-dark-text-secondary">WASM Supported:</span>
                <p className="font-mono text-xs">
                  {activeError.debugData.wasmSupported ? 'Yes' : 'No'}
                </p>
              </div>
              <div>
                <span className="text-dark-text-secondary">Error Type:</span>
                <p className="font-mono text-xs">{activeError.errorType}</p>
              </div>
            </div>

            {/* Stack Trace */}
            {activeError.stack && (
              <div>
                <span className="text-dark-text-secondary text-sm">Stack Trace:</span>
                <pre className="mt-1 p-2 bg-black/50 rounded text-xs font-mono text-red-300 overflow-x-auto max-h-32 overflow-y-auto">
                  {activeError.stack}
                </pre>
              </div>
            )}

            {/* Full Debug String (for copy) */}
            <div>
              <span className="text-dark-text-secondary text-sm">Full Debug Report:</span>
              <pre className="mt-1 p-2 bg-black/50 rounded text-xs font-mono text-dark-text-secondary overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
                {getDebugString(activeError)}
              </pre>
            </div>
          </div>
        )}

        {/* Help Text */}
        <p className="text-sm text-dark-text-secondary">
          This synth failed to initialize properly. Please copy the debug information
          and report this issue. The synth will not be available until the error is resolved.
        </p>
      </div>

      <ModalFooter>
        <div className="flex justify-between w-full">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 bg-dark-surface hover:bg-dark-hover rounded transition-colors"
          >
            {copied ? (
              <>
                <Check size={16} className="text-green-500" />
                <span className="text-green-500">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={16} />
                <span>Copy Debug Info</span>
              </>
            )}
          </button>

          <button
            onClick={handleDismiss}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
          >
            <X size={16} />
            <span>Dismiss</span>
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
};
