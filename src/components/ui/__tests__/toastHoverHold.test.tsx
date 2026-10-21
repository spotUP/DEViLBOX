import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';
import { ToastNotification } from '../ToastNotification';
import { notify, useNotificationStore } from '@stores/useNotificationStore';

afterEach(() => {
  cleanup();
  act(() => useNotificationStore.getState().clearAll());
  vi.useRealTimers();
});

describe('error toast holds while the reader is on it', () => {
  it('does not auto-dismiss under the pointer, then closes after the time that was left', () => {
    vi.useFakeTimers();
    render(<ToastNotification />);
    const message = 'generator failed: usage: song_file.py [-h] {styles,new} ...';
    act(() => { notify.error(message); });
    act(() => { vi.advanceTimersByTime(3000); });

    const toast = screen.getByRole('alert');
    fireEvent.mouseEnter(toast);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByRole('alert').textContent).toContain(message);

    fireEvent.mouseLeave(toast);
    act(() => { vi.advanceTimersByTime(4900); });
    expect(screen.queryByRole('alert')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
