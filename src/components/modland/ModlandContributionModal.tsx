/**
 * Modland Contribution Modal
 * 
 * Shown when user imports a tracker module that's not in the Modland database (727K+ files).
 * Encourages them to share it with the demoscene community via Demozoo.
 */

import React from 'react';
import { Sparkles, ExternalLink, X } from 'lucide-react';
import { Modal } from '../ui/Modal';

interface ModlandContributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDismiss: () => void;
  filename: string;
  hash?: string;
}

export const ModlandContributionModal: React.FC<ModlandContributionModalProps> = ({
  isOpen,
  onClose,
  onDismiss,
  filename,
  hash
}) => {
  const demozooDiscord = 'https://discord.gg/AJ2xV8X';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      theme="modern"
      closeOnBackdropClick={true}
      closeOnEscape={true}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-dark-bgSecondary border-b border-dark-border">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-accent-primary/20 rounded-lg">
            <Sparkles size={18} className="text-accent-primary" />
          </div>
          <h2 className="text-base font-bold text-text-primary">Rare Find!</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary rounded-lg transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body — two-column layout */}
      <div className="p-5 flex gap-5">
        {/* Left: context */}
        <div className="flex-1 space-y-3">
          <div className="border border-accent-primary/20 rounded-lg p-3">
            <p className="text-sm font-semibold text-text-primary mb-1">
              Not in Modland's <span className="text-accent-primary">727,000+</span> file archive!
            </p>
            <p className="text-text-secondary text-xs">
              <span className="font-mono text-accent-primary">{filename}</span> may be a rare release, personal creation, or lost demoscene gem.
            </p>
          </div>

          <p className="text-text-secondary text-xs leading-relaxed">
            Modland preserves tracker module history since the 1980s.
            Your file could be valuable to collectors and future musicians.
          </p>

          {hash && (
            <details className="bg-dark-bgTertiary border border-dark-border rounded p-2">
              <summary className="text-[10px] text-text-muted cursor-pointer hover:text-text-secondary">
                SHA-256 Hash
              </summary>
              <p className="mt-1.5 text-[10px] font-mono text-text-muted break-all bg-dark-bg p-1.5 rounded">
                {hash}
              </p>
            </details>
          )}
        </div>

        {/* Right: how to contribute */}
        <div className="flex-1 bg-dark-bgTertiary border border-dark-border rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-text-primary">How to contribute:</p>
          <ol className="text-text-secondary text-xs space-y-1.5 list-decimal list-inside">
            <li>Join the <a href={demozooDiscord} target="_blank" rel="noopener noreferrer" 
                className="text-accent-primary hover:text-accent-secondary underline">Demozoo Discord</a></li>
            <li>Share info about the module (artist, year, etc.)</li>
            <li>Upload via FTP to <code className="bg-dark-bg px-1 py-0.5 rounded text-[10px] text-text-muted">
                ftp.modland.com/incoming/</code></li>
            <li>Or send to a Demozoo staff member</li>
          </ol>
          <p className="text-text-muted text-[10px] italic pt-1 border-t border-dark-border">
            Demozoo is user-editable — add productions, music, groups, sceners and parties.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex gap-2 px-5 py-3 border-t border-dark-border bg-dark-bgSecondary justify-end">
        <button
          onClick={onDismiss}
          className="px-3 py-1.5 bg-dark-bgTertiary hover:bg-dark-bgHover text-text-muted hover:text-text-secondary rounded text-xs transition-colors"
          title="Don't show this message again for this file"
        >
          Don't Show Again
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 bg-dark-bgHover hover:bg-dark-bgActive text-text-secondary hover:text-text-primary rounded text-xs transition-colors"
        >
          Maybe Later
        </button>
        <a
          href={demozooDiscord}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="px-3 py-1.5 bg-accent-primary hover:bg-accent-secondary text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <ExternalLink size={13} />
          Join Demozoo
        </a>
      </div>
    </Modal>
  );
};
