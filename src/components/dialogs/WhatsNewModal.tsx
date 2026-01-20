/**
 * WhatsNewModal - Shows recent changes on app startup
 */

import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { CHANGELOG, CURRENT_VERSION, type ChangelogEntry } from '@generated/changelog';

const STORAGE_KEY = 'devilbox-seen-version';

interface WhatsNewModalProps {
  onClose: () => void;
}

const ChangeTypeLabel: React.FC<{ type: 'feature' | 'fix' | 'improvement' }> = ({ type }) => {
  const labels = {
    feature: 'New',
    fix: 'Fix',
    improvement: 'Improved',
  };
  const colors = {
    feature: 'bg-green-500/20 text-green-400',
    fix: 'bg-amber-500/20 text-amber-400',
    improvement: 'bg-blue-500/20 text-blue-400',
  };
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${colors[type]}`}>
      {labels[type]}
    </span>
  );
};

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ onClose }) => {
  const handleClose = () => {
    // Mark current version as seen
    localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-xl bg-dark-bgSecondary border border-dark-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-accent-primary/20 to-purple-500/20 border-b border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-primary/20 rounded-lg">
              <Sparkles size={20} className="text-accent-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">What's New</h2>
              <p className="text-xs text-text-muted">DEViLBOX v{CURRENT_VERSION}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto scrollbar-modern">
          {CHANGELOG.slice(0, 5).map((entry, idx) => (
            <VersionEntry key={entry.version} entry={entry} isLatest={idx === 0} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-dark-bgTertiary border-t border-dark-border">
          <button
            onClick={handleClose}
            className="w-full py-2.5 bg-accent-primary text-dark-bg font-bold rounded-lg hover:bg-accent-primary/90 transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
};

const VersionEntry: React.FC<{ entry: ChangelogEntry; isLatest: boolean }> = ({ entry, isLatest }) => {
  return (
    <div className={`px-5 py-4 border-b border-dark-border last:border-b-0 ${isLatest ? 'bg-accent-primary/5' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`font-bold ${isLatest ? 'text-accent-primary' : 'text-text-primary'}`}>
          v{entry.version}
        </span>
        <span className="text-xs text-text-muted">{entry.date}</span>
        {isLatest && (
          <span className="px-2 py-0.5 text-[10px] font-bold bg-accent-primary text-dark-bg rounded-full">
            LATEST
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {entry.changes.map((change, idx) => (
          <li key={idx} className="flex items-start gap-2 text-sm">
            <ChangeTypeLabel type={change.type} />
            <span className="text-text-secondary">{change.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default WhatsNewModal;
