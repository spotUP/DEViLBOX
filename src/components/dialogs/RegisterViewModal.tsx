/**
 * Register View: each running Furnace chip's register pool (DivDispatch::getRegisterPool)
 * as a hex dump, refreshed at about 20 Hz while open. Data comes from the dispatch WASM.
 */
import React, { useEffect, useState } from 'react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { FurnaceDispatchEngine } from '@engine/furnace-dispatch/FurnaceDispatchEngine';
import { FurnaceDispatchPlatform } from '@engine/furnace-dispatch/platforms';
import { toHexRows } from '@lib/hexDump';

interface RegisterViewModalProps { isOpen: boolean; onClose: () => void }
interface ChipPool { platform: number; bytes: Uint8Array }

const platformLabel = (id: number): string =>
  Object.entries(FurnaceDispatchPlatform).find(([, v]) => v === id)?.[0] ?? `Chip ${id}`;

export const RegisterViewModal: React.FC<RegisterViewModalProps> = ({ isOpen, onClose }) => {
  const [pools, setPools] = useState<ChipPool[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    const poll = async () => {
      if (!FurnaceDispatchEngine.hasInstance()) return;
      const engine = FurnaceDispatchEngine.getInstance();
      const next = await Promise.all(engine.getChipPlatforms().map(async platform => ({ platform, bytes: await engine.getRegisterPool(platform) })));
      if (alive) setPools(next);
    };
    void poll();
    const timer = setInterval(() => void poll(), 50);
    return () => { alive = false; clearInterval(timer); };
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader title="Register View" onClose={onClose} />
      <div className="max-h-[70vh] overflow-auto p-3 bg-dark-bg text-text-primary text-[10px] font-mono">
        {pools.length === 0 && <div className="text-text-muted">No Furnace chip is running. Load a Furnace song and play it.</div>}
        {pools.map(({ platform, bytes }) => (
          <section key={platform} className="mb-3">
            <h3 className="text-accent-primary mb-1">{platformLabel(platform)} ({bytes.length} bytes)</h3>
            {bytes.length === 0 && <div className="text-text-muted">This chip exposes no register pool.</div>}
            {toHexRows(bytes).map(row => (
              <div key={row.offset} className="flex gap-2">
                <span className="text-text-muted">{row.offset}</span>
                <span>{row.cells.join(' ')}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
};
