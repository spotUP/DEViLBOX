/** GTKeyHelp: shortcut sheet generated from gtKeyTable (opened with "?" or the Keys button). */
import React from 'react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { useGTUltraStore } from '../../stores/useGTUltraStore';
import { GT_KEY_GROUPS } from './gtKeyTable';

export const GTKeyHelp: React.FC = () => {
  const open = useGTUltraStore((s) => s.keyHelpOpen);
  const setOpen = useGTUltraStore((s) => s.setKeyHelpOpen);
  const close = () => setOpen(false);
  return (
    <Modal isOpen={open} onClose={close} size="lg">
      <ModalHeader title="GoatTracker keys" onClose={close} />
      <div className="p-3 grid grid-cols-2 gap-x-6 gap-y-3 text-[10px] font-mono text-text-primary max-h-[70vh] overflow-auto">
        {GT_KEY_GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="text-text-muted mb-1">{g.title}</h3>
            {g.bindings.map((b) => (
              <div key={b.keys} className="flex gap-2 py-0.5">
                <span className="text-accent-primary w-40 shrink-0">{b.keys}</span>
                <span>{b.action}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
};
