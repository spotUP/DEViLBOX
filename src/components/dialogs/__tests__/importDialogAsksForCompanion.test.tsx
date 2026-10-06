/**
 * "Load failed - bob4e.dum: ... file not found '/uade/bob4e.ins'" (2026-10-06).
 *
 * Picking a lone Infogrames .dum in the Import dialog loaded it without its
 * .ins instrument file: the dialog kept its own companion list (TFMX and MFP
 * only) instead of asking the companion resolver. It now asks the resolver,
 * so every multi-file format it knows prompts for the second file.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ImportModuleDialog } from '../ImportModuleDialog';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function pickLoneFile(name: string): { companionPrompted: boolean } {
  const clicks = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  render(<ImportModuleDialog isOpen onClose={() => {}} onImport={() => {}} />);
  const picker = document.querySelector('input[type="file"][multiple]') as HTMLInputElement;
  fireEvent.change(picker, { target: { files: [new File([new Uint8Array(16)], name)] } });
  return { companionPrompted: clicks.mock.calls.length > 0 };
}

describe('Import dialog, a lone multi-file module', () => {
  it('asks for the .ins file when an Infogrames .dum is picked alone', () => {
    expect(pickLoneFile('bob4e.dum').companionPrompted).toBe(true);
  });

  it('still asks for smpl. when a TFMX mdat. is picked alone', () => {
    expect(pickLoneFile('mdat.jaguar').companionPrompted).toBe(true);
  });

  it('does not ask for anything when a ProTracker module is picked', () => {
    expect(pickLoneFile('song.mod').companionPrompted).toBe(false);
  });
});
