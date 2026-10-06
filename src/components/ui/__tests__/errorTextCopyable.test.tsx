/**
 * A failed import showed a modal "Load Failed" alert whose text could not be
 * selected (the app sets user-select: none on the body), so the owner could not
 * copy the error. Import failures are now a toast that stays until closed, and
 * toast and dialog messages are selectable.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ToastNotification } from '../ToastNotification';
import { notify, useNotificationStore } from '@stores/useNotificationStore';

describe('error text can be copied', () => {
  afterEach(() => { cleanup(); useNotificationStore.setState({ notifications: [] } as never); });

  it('an error toast message is selectable and stays until closed', () => {
    render(<ToastNotification />);
    act(() => { notify.error('Load failed - bob4e.dum: file not found', 0); });
    const msg = document.querySelector('[role="alert"] p');
    expect(msg?.textContent).toContain('bob4e.dum');
    expect(msg?.className).toContain('select-text');
    expect(useNotificationStore.getState().notifications[0]?.duration).toBe(0);
  });

  it('a failed import reports through a toast, not a modal alert; dialog messages are selectable', () => {
    const root = join(__dirname, '../../../..');
    const imp = readFileSync(join(root, 'src/hooks/tracker/useModuleImport.ts'), 'utf8');
    expect(imp).toContain('notify.error(`Load failed');
    expect(imp).not.toContain("title: 'Load Failed'");
    expect(readFileSync(join(root, 'src/components/common/ConfirmDialog.tsx'), 'utf8')).toMatch(/\{message\}<\/p>/);
    expect(readFileSync(join(root, 'src/components/common/ConfirmDialog.tsx'), 'utf8')).toContain('select-text cursor-text">{message}');
  });
});
