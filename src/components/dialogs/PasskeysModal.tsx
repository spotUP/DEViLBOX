/**
 * PasskeysModal - list, add, rename and remove the signed-in account's passkeys.
 * Calls go through @lib/auth/passkey; this component only holds the edit state.
 */

import React, { useEffect, useState } from 'react';
import { Fingerprint, Pencil, Trash2, Plus } from 'lucide-react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { useAuthStore } from '@stores/useAuthStore';
import { notify } from '@stores/useNotificationStore';
import {
  passkeySupported, passkeyList, passkeyAdd, passkeyRename, passkeyRemove, canRemovePasskey, type PasskeyList,
} from '@lib/auth/passkey';

interface PasskeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatDate = (ms: number): string => new Date(ms).toLocaleDateString();
const message = (error: unknown): string => (error instanceof Error ? error.message : 'Passkey request failed');

export const PasskeysModal: React.FC<PasskeysModalProps> = ({ isOpen, onClose }) => {
  const token = useAuthStore((s) => s.token);
  const [list, setList] = useState<PasskeyList | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const reload = async (t: string) => {
    try {
      setList(await passkeyList(t));
    } catch (error) {
      notify.error(message(error));
    }
  };

  useEffect(() => {
    if (isOpen && token) void reload(token);
    if (!isOpen) setEditing(null);
  }, [isOpen, token]);

  const run = async (action: (t: string) => Promise<unknown>, done: string) => {
    if (!token) return;
    setBusy(true);
    try {
      await action(token);
      notify.success(done);
      await reload(token);
    } catch (error) {
      notify.error(message(error));
    } finally {
      setBusy(false);
    }
  };

  const saveName = () => {
    if (!editing) return;
    const { id, name } = editing;
    setEditing(null);
    void run((t) => passkeyRename(t, id, name.trim()), 'Passkey renamed');
  };

  const removable = list ? canRemovePasskey(list) : false;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" closeOnEnter={false}>
      <ModalHeader title="Passkeys" subtitle="Sign in with Touch ID, Face ID or a security key" icon={<Fingerprint size={18} />} onClose={onClose} />
      <div className="p-4 space-y-2">
        {!passkeySupported() && (
          <p className="text-xs text-accent-warning">This browser does not support passkeys.</p>
        )}
        {list === null ? (
          <p className="text-xs text-text-muted">Loading...</p>
        ) : list.passkeys.length === 0 ? (
          <p className="text-xs text-text-muted">No passkeys yet. Add one to sign in without your password.</p>
        ) : (
          list.passkeys.map((p) => (
            <div key={p.id} className="flex items-center gap-2 p-2 bg-dark-bgSecondary border border-dark-borderLight rounded">
              <Fingerprint size={16} className="text-accent-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {editing?.id === p.id ? (
                  <input
                    autoFocus
                    value={editing.name}
                    maxLength={64}
                    onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editing.name.trim()) saveName();
                      if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); }
                    }}
                    className="w-full px-2 py-1 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs focus:outline-none focus:ring-1 focus:ring-accent-primary"
                    aria-label="Passkey name"
                  />
                ) : (
                  <div className="text-xs text-text-primary truncate">{p.name}</div>
                )}
                <div className="text-[10px] font-mono text-text-muted">
                  Added {formatDate(p.createdAt)}{p.lastUsed !== null ? ` - last used ${formatDate(p.lastUsed)}` : ''}
                </div>
              </div>
              {editing?.id === p.id ? (
                <Button variant="primary" size="sm" disabled={busy || !editing.name.trim()} onClick={saveName}>Save</Button>
              ) : (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing({ id: p.id, name: p.name })}
                  icon={<Pencil size={14} />} title="Rename passkey" aria-label={`Rename ${p.name}`} />
              )}
              <Button
                variant="danger"
                size="sm"
                disabled={busy || !removable}
                onClick={() => void run((t) => passkeyRemove(t, p.id), 'Passkey removed')}
                icon={<Trash2 size={14} />}
                title={removable ? 'Remove passkey' : 'This is your only way to sign in. Add another passkey first.'}
                aria-label={`Remove ${p.name}`}
              />
            </div>
          ))
        )}
      </div>
      <ModalFooter align="between">
        <Button
          variant="primary"
          disabled={busy || !passkeySupported()}
          onClick={() => void run((t) => passkeyAdd(t), 'Passkey added')}
          icon={<Plus size={14} />}
          iconPosition="left"
        >
          Add Passkey
        </Button>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
};
