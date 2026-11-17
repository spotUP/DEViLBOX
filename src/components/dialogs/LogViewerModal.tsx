/**
 * Log Viewer: the chip command log (every command the Furnace dispatch sends a chip),
 * collected while this window is open. Data comes from the dispatch worklet's cmd log.
 */
import React, { useEffect } from 'react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { Button } from '@components/ui/Button';
import { FurnaceDispatchEngine } from '@engine/furnace-dispatch/FurnaceDispatchEngine';
import { FURNACE_DISPATCH_CMD_NAMES } from '@engine/furnace-dispatch/furnaceEffectTable.gen';
import { useFurnaceLogStore } from '@stores/useFurnaceLogStore';

interface LogViewerModalProps { isOpen: boolean; onClose: () => void }

export const LogViewerModal: React.FC<LogViewerModalProps> = ({ isOpen, onClose }) => {
  const entries = useFurnaceLogStore(s => s.entries);

  useEffect(() => {
    if (!isOpen || !FurnaceDispatchEngine.hasInstance()) return;
    const engine = FurnaceDispatchEngine.getInstance();
    engine.enableCmdLog(true);
    const unsubscribe = engine.onCmdLog(batch => useFurnaceLogStore.getState().append(batch));
    return () => { unsubscribe(); engine.enableCmdLog(false); };
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader title="Log Viewer" onClose={onClose} />
      <div className="p-3 bg-dark-bg text-text-primary text-[10px] font-mono">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-text-muted">{entries.length} chip commands (newest last)</span>
          <Button variant="ghost" size="sm" onClick={() => useFurnaceLogStore.getState().clear()}>Clear</Button>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          {entries.length === 0 && <div className="text-text-muted">No commands yet. Load a Furnace song and play it.</div>}
          {entries.map((e, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-text-muted w-12 text-right">{e.tick}</span>
              <span className="w-10">Ch {e.channel}</span>
              <span className="text-accent-primary w-56">{(FURNACE_DISPATCH_CMD_NAMES[e.cmd] ?? `cmd ${e.cmd}`).replace('DIV_CMD_', '')}</span>
              <span>{e.value1} {e.value2}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};
