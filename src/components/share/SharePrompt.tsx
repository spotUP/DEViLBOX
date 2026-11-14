import React from 'react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { useSharePromptStore } from '@lib/share/sharePromptStore';
import { useFT2ToolbarActions } from '@stores/useFT2ToolbarActions';
import { useTransportStore } from '@stores';

/** Glue for share links: the Play prompt after a shared song opens, and the copy-by-hand box for a link the browser would not copy. */
export const SharePrompt: React.FC = () => {
  const { name, link, dismiss, dismissLink } = useSharePromptStore();
  const play = () => {
    // The click is the audio unlock gesture; the toolbar's handler starts the context synchronously.
    const playSong = useFT2ToolbarActions.getState().playSong;
    if (playSong) playSong(); else void useTransportStore.getState().play();
    dismiss();
  };
  return (
    <>
      <Modal isOpen={name !== null} onClose={dismiss} onConfirm={play} size="sm">
        <ModalHeader title="Shared song opened" onClose={dismiss} />
        <div className="p-4 text-sm text-text-primary">{name} is loaded. It does not play until you press Play.</div>
        <ModalFooter>
          <Button variant="ghost" onClick={dismiss}>Close</Button>
          <Button variant="primary" onClick={play}>Play</Button>
        </ModalFooter>
      </Modal>
      <Modal isOpen={link !== null} onClose={dismissLink} size="md">
        <ModalHeader title="Share link" onClose={dismissLink} />
        <div className="p-4 flex flex-col gap-2 text-sm text-text-primary">
          <span>Your browser did not allow copying. Copy the link by hand.</span>
          <input readOnly value={link ?? ''} onFocus={(e) => e.currentTarget.select()}
            className="w-full bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-2 py-1" />
        </div>
        <ModalFooter><Button variant="primary" onClick={dismissLink}>Done</Button></ModalFooter>
      </Modal>
    </>
  );
};
