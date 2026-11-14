import React from 'react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { applyReview, closeReview, pickAll, pickSide, useShareInboxStore } from '@lib/share/shareInbox';

/** Glue: the review of one reply. Merging and applying live in shareInbox. */
export const ShareReview: React.FC = () => {
  const review = useShareInboxStore((s) => s.review);
  if (!review) return null;
  const { conflicts, picks, appliedFromTheirs } = review;
  return (
    <Modal isOpen onClose={closeReview} size="lg">
      <ModalHeader title="Changes sent back to you" onClose={closeReview} />
      <div className="p-4 flex flex-col gap-3 text-sm text-text-primary">
        <span>{appliedFromTheirs} changes apply without a clash.</span>
        {conflicts.length === 0 ? (
          <span className="text-text-secondary">No conflicts.</span>
        ) : (
          <>
            <div className="flex gap-2 items-center">
              <span className="text-text-secondary">{conflicts.length} conflicts. Pick a side for each; unpicked keeps yours.</span>
              <Button variant="ghost" size="sm" onClick={() => pickAll('mine')}>All mine</Button>
              <Button variant="ghost" size="sm" onClick={() => pickAll('theirs')}>All theirs</Button>
            </div>
            <div className="max-h-80 overflow-y-auto flex flex-col gap-1">
              {conflicts.map((c) => (
                <div key={c.key} className="flex items-center gap-2 bg-dark-bgTertiary border border-dark-borderLight rounded px-2 py-1">
                  <span className="flex-1 font-mono text-xs text-text-primary">{c.label}</span>
                  <Button variant={(picks.get(c.key) ?? 'mine') === 'mine' ? 'primary' : 'ghost'} size="sm" onClick={() => pickSide(c.key, 'mine')}>Mine</Button>
                  <Button variant={picks.get(c.key) === 'theirs' ? 'primary' : 'ghost'} size="sm" onClick={() => pickSide(c.key, 'theirs')}>Theirs</Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={closeReview}>Cancel</Button>
        <Button variant="primary" onClick={() => void applyReview()}>Apply</Button>
      </ModalFooter>
    </Modal>
  );
};
