/**
 * PixiRevisionBrowserDialog — GL-native dialog for browsing/restoring local IndexedDB song revisions.
 * Reference: src/components/dialogs/RevisionBrowserDialog.tsx
 */

import React, { useEffect, useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiLabel } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { listLocalRevisions, loadLocalRevision, deleteLocalRevision, type LocalRevision } from '@hooks/useProjectPersistence';
import { notify } from '@stores/useNotificationStore';

interface PixiRevisionBrowserDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODAL_W = 440;
const MODAL_H = 480;

const formatDate = (iso: string) => new Date(iso).toLocaleString();

const truncate = (s: string, max = 32) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

export const PixiRevisionBrowserDialog: React.FC<PixiRevisionBrowserDialogProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();
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

  const handleRestore = useCallback(async (key: number) => {
    const ok = await loadLocalRevision(key);
    if (ok) {
      notify.success('Revision restored');
      onClose();
    } else {
      notify.error('Failed to restore revision');
    }
    setConfirmRestore(null);
  }, [onClose]);

  const handleDelete = useCallback(async (key: number) => {
    await deleteLocalRevision(key);
    setRevisions(prev => prev.filter(r => r.key !== key));
    notify.success('Revision deleted');
  }, []);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="Local Revisions" width={MODAL_W} onClose={onClose} />

      {/* Content area */}
      <layoutContainer layout={{ flex: 1, flexDirection: 'column', padding: 12, overflow: 'scroll' }}>
        {loading ? (
          /* Loading indicator */
          <layoutContainer layout={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 }}>
            <PixiLabel text="Loading revisions…" size="xs" color="textMuted" />
          </layoutContainer>
        ) : revisions.length === 0 ? (
          /* Empty state */
          <layoutContainer layout={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48, gap: 6 }}>
            <PixiLabel text="No revisions yet." size="sm" color="textMuted" />
            <PixiLabel text="Revisions are created automatically when you save." size="xs" color="textMuted" />
          </layoutContainer>
        ) : (
          /* Revision cards */
          <layoutContainer layout={{ flexDirection: 'column', gap: 6 }}>
            {revisions.map((rev) => (
              <layoutContainer
                key={rev.key}
                layout={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: theme.bgTertiary.color,
                  borderColor: theme.border.color,
                  gap: 8,
                }}
              >
                {/* Info column */}
                <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 2 }}>
                  <pixiBitmapText
                    text={truncate(rev.name)}
                    style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 12, fill: 0xffffff }}
                    tint={theme.text.color}
                    layout={{}}
                  />
                  <pixiBitmapText
                    text={formatDate(rev.savedAt)}
                    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                    tint={theme.textMuted.color}
                    layout={{}}
                  />
                  <pixiBitmapText
                    text={`${rev.patternCount} pattern${rev.patternCount !== 1 ? 's' : ''}, ${rev.instrumentCount} instrument${rev.instrumentCount !== 1 ? 's' : ''}`}
                    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                    tint={theme.textMuted.color}
                    layout={{}}
                  />
                </layoutContainer>

                {/* Action buttons */}
                <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {confirmRestore === rev.key ? (
                    <>
                      <PixiButton
                        label="Confirm"
                        variant="primary"
                        size="sm"
                        onClick={() => handleRestore(rev.key)}
                        width={64}
                        height={24}
                      />
                      <PixiButton
                        label="Cancel"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmRestore(null)}
                        width={52}
                        height={24}
                      />
                    </>
                  ) : (
                    <>
                      <PixiButton
                        label="Restore"
                        variant="default"
                        size="sm"
                        onClick={() => setConfirmRestore(rev.key)}
                        width={64}
                        height={24}
                      />
                      <PixiButton
                        label="x"
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(rev.key)}
                        width={24}
                        height={24}
                      />
                    </>
                  )}
                </layoutContainer>
              </layoutContainer>
            ))}
          </layoutContainer>
        )}
      </layoutContainer>

      {/* Footer */}
      <PixiModalFooter width={MODAL_W}>
        <pixiBitmapText
          text="Up to 50 revisions are kept. Restoring overwrites current project state."
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ flex: 1 }}
        />
      </PixiModalFooter>
    </PixiModal>
  );
};
