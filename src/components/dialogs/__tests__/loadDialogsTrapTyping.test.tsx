/**
 * Keys typed in a load dialog reached the tracker behind it (owner 2026-10-07):
 * a letter pressed in the file browser also played a note. Every load dialog
 * now carries the shared data-captures-typing marker (lib/keyboard/
 * isTextEntryTarget) and keeps the key from reaching window listeners, so note
 * entry, shortcuts and the keyboard router all leave it alone.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { isTextEntryTarget } from '@/lib/keyboard/isTextEntryTarget';
import { FileBrowser } from '../FileBrowser';
import { ImportModuleDialog } from '../ImportModuleDialog';
import { ImportAudioDialog } from '../ImportAudioDialog';
import { ImportMIDIDialog } from '../ImportMIDIDialog';
import { ImportFurnaceDialog } from '../ImportFurnaceDialog';
import { ImportTD3Dialog } from '../ImportTD3Dialog';
import { ImportDBXDialog } from '../ImportDBXDialog';
import { ImportInstrumentDialog } from '../ImportInstrumentDialog';
import { resetFileBrowserMemory } from '../fileBrowserMemory';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetFileBrowserMemory(); });

const noop = () => {};
const file = new File(['{}'], 'x.json');

const DIALOGS: Array<[string, () => React.ReactElement]> = [
  ['file browser', () => <FileBrowser isOpen mode="load" onClose={noop} onLoad={noop} onLoadTrackerModule={async () => {}} />],
  ['module import', () => <ImportModuleDialog isOpen onClose={noop} onImport={noop} />],
  ['audio import', () => <ImportAudioDialog isOpen onClose={noop} />],
  ['MIDI import', () => <ImportMIDIDialog isOpen onClose={noop} onImport={noop} />],
  ['Furnace import', () => <ImportFurnaceDialog isOpen onClose={noop} onImport={noop} />],
  ['TD-3 import', () => <ImportTD3Dialog isOpen onClose={noop} onImport={noop} />],
  ['DBX import', () => <ImportDBXDialog isOpen file={file} onConfirm={noop} onCancel={noop} />],
  ['instrument import', () => <ImportInstrumentDialog isOpen file={file} onConfirm={noop} onCancel={noop} />],
];

describe('keys typed in a load dialog do not reach the tracker behind it', () => {
  for (const [name, make] of DIALOGS) {
    it(`${name}: a key is a text-entry target and never reaches window`, () => {
      vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }));
      const reachedWindow = vi.fn();
      window.addEventListener('keydown', reachedWindow);
      const { container } = render(make());
      const overlay = container.querySelector('[data-captures-typing]') as HTMLElement | null;
      expect(overlay, 'dialog overlay carries the marker').not.toBeNull();
      const inner = (overlay!.querySelector('button, input, select') ?? overlay!) as HTMLElement;
      expect(isTextEntryTarget(inner)).toBe(true);
      fireEvent.keyDown(inner, { key: 'a' });
      fireEvent.keyDown(overlay!, { key: 'z' });
      window.removeEventListener('keydown', reachedWindow);
      expect(reachedWindow).not.toHaveBeenCalled();
    });
  }

  it('focus moves into the dialog when it opens', () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }));
    const { container } = render(<ImportTD3Dialog isOpen onClose={noop} onImport={noop} />);
    const overlay = container.querySelector('[data-captures-typing]') as HTMLElement;
    expect(overlay.contains(document.activeElement)).toBe(true);
  });
});
