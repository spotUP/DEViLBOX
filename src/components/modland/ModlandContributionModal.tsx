/**
 * Modland Contribution Modal
 * 
 * Shown when user imports a tracker module that's not in the Modland database (727K+ files).
 * Encourages them to share it with the demoscene community via Demozoo.
 */

import React from 'react';
import { Sparkles, Share2, ExternalLink } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { ModalHeader } from '../ui/ModalHeader';
import { ModalFooter } from '../ui/ModalFooter';

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
      size="md"
      theme="modern"
      closeOnBackdropClick={true}
      closeOnEscape={true}
    >
      <div className="bg-dark-800 border border-dark-600 rounded-lg shadow-2xl">
        <ModalHeader 
          title="Rare Find!"
          icon={<Sparkles size={24} className="text-purple-400" />}
          onClose={onClose}
        />

        <div className="p-6 space-y-4">
          {/* Congratulations */}
          <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-lg p-4">
            <p className="text-lg font-semibold text-white mb-2">
              This module isn't in Modland's archive of <span className="text-purple-400">727,000+</span> files!
            </p>
            <p className="text-gray-300 text-sm">
              <span className="font-mono bg-dark-700 px-2 py-1 rounded">{filename}</span> might be a rare release,
              personal creation, or lost gem from the demoscene.
            </p>
          </div>

          {/* Contribution Info */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Share2 size={18} className="text-purple-400" />
              Share It With The Community
            </h3>

            <div className="bg-dark-700 border border-dark-600 rounded-lg p-4 space-y-3">
              <div className="space-y-2">
                <p className="text-gray-300 text-sm leading-relaxed">
                  Modland is the world's largest tracker module archive, preserving demoscene history since the 1980s.
                  Your module could be valuable to collectors, historians, and future musicians!
                </p>
              </div>

              <div className="border-t border-dark-600 pt-3 space-y-2">
                <p className="text-white font-semibold text-sm">How to contribute:</p>
                <ol className="text-gray-300 text-sm space-y-2 list-decimal list-inside">
                  <li>Join the <a href={demozooDiscord} target="_blank" rel="noopener noreferrer" 
                      className="text-purple-400 hover:text-purple-300 underline font-semibold">Demozoo Discord</a></li>
                  <li>Share information about the module (artist, year, etc.)</li>
                  <li>Upload via FTP to <code className="bg-dark-800 px-1.5 py-0.5 rounded text-xs">
                      ftp.modland.com/incoming/</code></li>
                  <li>Or send to a Demozoo staff member for verification</li>
                </ol>
              </div>

              <div className="border-t border-dark-600 pt-3">
                <p className="text-gray-400 text-xs italic leading-relaxed">
                  Most of Demozoo is user-editable. You can add productions, music, graphics, groups, sceners,
                  and parties. For help or questions, the community is friendly and welcoming on Discord!
                </p>
              </div>
            </div>

            {/* Hash Info (for nerds) */}
            {hash && (
              <details className="bg-dark-900 border border-dark-700 rounded p-3">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                  Technical Info (SHA-256 Hash)
                </summary>
                <p className="mt-2 text-xs font-mono text-gray-400 break-all bg-dark-800 p-2 rounded">
                  {hash}
                </p>
              </details>
            )}
          </div>
        </div>

        <ModalFooter>
          <button
            onClick={onDismiss}
            className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-gray-300 rounded transition-colors text-sm"
            title="Don't show this message again for this file"
          >
            Don't Show Again
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-dark-600 hover:bg-dark-500 text-white rounded transition-colors"
          >
            Maybe Later
          </button>
          <a
            href={demozooDiscord}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors font-semibold flex items-center gap-2"
          >
            <ExternalLink size={16} />
            Join Demozoo Discord
          </a>
        </ModalFooter>
      </div>
    </Modal>
  );
};
