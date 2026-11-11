/**
 * RevisionBrowserDialog - Browse and restore local IndexedDB song revisions:
 * the ones taken when the song was saved and the ones taken just before
 * another song replaced it. Restoring is itself a replace, so the song open
 * now becomes a revision first.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { History, RotateCcw, Trash2 } from 'lucide-react';
import { listLocalRevisions, loadLocalRevision, deleteLocalRevision, type LocalRevision } from '@hooks/useProjectPersistence';
import { notify } from '@stores/useNotificationStore';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { MAX_REPLACED_REVISIONS } from '@/lib/song/songRevisions';

interface RevisionBrowserDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const idOf = (r: LocalRevision): string => `${r.kind}:${r.key}`;

export const RevisionBrowserDialog: React.FC<RevisionBrowserDialogProps> = ({ isOpen, onClose }) => {
  const [revisions, setRevisions] = useState<LocalRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const fetchRevisions = useCallback(async () => {
    setLoading(true);
    try {
      setRevisions(await listLocalRevisions());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchRevisions();
      setConfirmRestore(null);
    }
  }, [isOpen, fetchRevisions]);

  const handleRestore = async (rev: LocalRevision) => {
    const ok = await loadLocalRevision(rev.key, rev.kind);
    if (ok) {
      notify.success('Revision restored');
      onClose();
    } else {
      notify.error('Failed to restore revision');
    }
    setConfirmRestore(null);
  };

  const handleDelete = async (rev: LocalRevision) => {
    await deleteLocalRevision(rev.key, rev.kind);
    setRevisions(prev => prev.filter(r => idOf(r) !== idOf(rev)));
    notify.success('Revision deleted');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" closeOnEnter={false}>
      <ModalHeader title="Revisions" icon={<History size={18} className="text-accent-primary" />} onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 max-h-[60vh]">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full" />
          </div>
        ) : revisions.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            No revisions yet.
            <br />
            <span className="text-sm">A revision is kept when you save, and when another song is about to replace the open one.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {revisions.map((rev) => (
              <div
                key={idOf(rev)}
                className="flex items-center justify-between p-3 bg-dark-bgTertiary rounded border border-dark-border"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-text-primary font-medium truncate">{rev.name}</div>
                  <div className="text-xs text-text-muted">
                    {new Date(rev.savedAt).toLocaleString()}
                    {rev.kind === 'replaced' ? ' - before another song replaced it' : ' - saved'}
                  </div>
                  <div className="text-xs text-text-muted">
                    {rev.patternCount} pattern{rev.patternCount !== 1 ? 's' : ''}, {rev.instrumentCount} instrument{rev.instrumentCount !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  {confirmRestore === idOf(rev) ? (
                    <>
                      <Button size="sm" variant="primary" onClick={() => void handleRestore(rev)}>Confirm</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="default" icon={<RotateCcw size={14} />} title="Restore this revision" onClick={() => setConfirmRestore(idOf(rev))}>
                        Restore
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} title="Delete this revision" aria-label="Delete this revision" onClick={() => void handleDelete(rev)} />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ModalFooter align="between">
        <span className="text-xs text-text-muted">
          The last {MAX_REPLACED_REVISIONS} replaced songs are kept. Restoring saves the open song first.
        </span>
        <Button variant="default" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
};
