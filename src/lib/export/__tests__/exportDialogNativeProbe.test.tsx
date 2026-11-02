/**
 * Plan G23: opening the Export dialog (and editing the song under it) asks whether a Native export exists
 * from the router's table; the full export runs only when the Export button asks (3fdf11774 ran it on open
 * and on every song change).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const exportNativeFile = vi.fn(async () => null);
const nativeExportAvailableForLiveSong = vi.fn(async () => true);
vi.mock('@lib/export/moduleExportService', () => ({ exportNativeFile, nativeExportAvailableForLiveSong }));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({}) }));
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => ({}) }));

describe('Export dialog Native probe', { timeout: 120_000 }, () => {
  it('asks availability on open and does not run the export', async () => {
    const { useExportDialog } = await import('@/hooks/dialogs/useExportDialog');
    const { result } = renderHook(() => useExportDialog({ isOpen: true }));
    await waitFor(() => expect(result.current.nativeAvailable).toBe(true));
    expect(nativeExportAvailableForLiveSong).toHaveBeenCalled();
    expect(exportNativeFile, 'opening must not serialize the song').not.toHaveBeenCalled();
  });
});
