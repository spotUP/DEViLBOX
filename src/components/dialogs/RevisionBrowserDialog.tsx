/**
 * RevisionBrowserDialog - Browse and restore local IndexedDB song revisions
 */

import React, { useEffect, useState, useCallback } from 'react';
import { History, X, RotateCcw, Trash2 } from 'lucide-react';
import { listLocalRevisions, loadLocalRevision, deleteLocalRevision, type LocalRevision } from '@hooks/useProjectPersistence';
import { notify } from '@stores/useNotificationStore';

interface RevisionBrowserDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RevisionBrowserDialog: React.FC<RevisionBrowserDialogProps> = ({ isOpen, onClose }) => {
  const [revisions, setRevisions] = useState<LocalRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);

  const fetchRevisions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listLocalRevisions();
      setRevisions(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchRevisions();
      setConfirmRestore(null);
    }
  }, [isOpen, fetchRevisions]);

  const handleRestore = async (key: number) => {
    const ok = await loadLocalRevision(key);
    if (ok) {
      notify.success('Revision restored');
      onClose();
    } else {
      notify.error('Failed to restore revision');
    }
    setConfirmRestore(null);
  };

  const handleDelete = async (key: number) => {
    await deleteLocalRevision(key);
    setRevisions(prev => prev.filter(r => r.key !== key));
    notify.success('Revision deleted');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]">
      <div className="bg-dark-bgPrimary border border-dark-border rounded-lg w-[440px] max-h-[520px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <History size={18} className="text-accent-primary" />
            <span className="font-semibold text-text-primary">Local Revisions</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        {/* Revision list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full" />
            </div>
          ) : revisions.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              No revisions yet.
              <br />
              <span className="text-sm">Revisions are created automatically when you save.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {revisions.map((rev) => (
                <div
                  key={rev.key}
                  className="flex items-center justify-between p-3 bg-dark-bgTertiary rounded border border-dark-border"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-text-primary font-medium truncate">{rev.name}</div>
                    <div className="text-xs text-text-muted">
                      {new Date(rev.savedAt).toLocaleString()}
                    </div>
                    <div className="text-xs text-text-muted">
                      {rev.patternCount} pattern{rev.patternCount !== 1 ? 's' : ''}, {rev.instrumentCount} instrument{rev.instrumentCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    {confirmRestore === rev.key ? (
                      <>
                        <button
                          onClick={() => handleRestore(rev.key)}
                          className="px-2 py-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded text-xs font-medium"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmRestore(null)}
                          className="px-2 py-1 text-text-muted hover:text-text-primary rounded text-xs"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setConfirmRestore(rev.key)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 rounded text-sm font-medium"
                          title="Restore this revision"
                        >
                          <RotateCcw size={14} />
                          Restore
                        </button>
                        <button
                          onClick={() => handleDelete(rev.key)}
                          className="p-1.5 text-text-muted hover:text-red-400 rounded"
                          title="Delete this revision"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-dark-border text-xs text-text-muted">
          Up to 50 revisions are kept. Restoring overwrites current project state.
        </div>
      </div>
    </div>
  );
};
