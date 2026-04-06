/**
 * GlobalConfirmDialog — Renders at the App level, driven by useConfirmStore.
 * Any code can trigger it via showConfirm() from the store.
 */

import React from 'react';
import { useConfirmStore } from '@stores/useConfirmStore';
import { ConfirmDialog } from './ConfirmDialog';

export const GlobalConfirmDialog: React.FC = () => {
  const { isOpen, request, _confirm, _cancel } = useConfirmStore();

  return (
    <ConfirmDialog
      isOpen={isOpen}
      title={request?.title ?? ''}
      message={request?.message ?? ''}
      confirmLabel={request?.confirmLabel ?? 'Continue'}
      danger={request?.danger ?? false}
      onConfirm={_confirm}
      onClose={_cancel}
    />
  );
};
