/**
 * The edit slot (plan D3/D4, owner decision 1): nuade has no write API at the pinned commit, only the typed
 * <id>_from_nuade state read. The engine boundary is built so the API emoon is expected to publish slots in without a
 * routing change: the worklet probes `nw_caps()` at load, this module remembers the bits per player, and
 *   - `createNuadeEditPort(caps, post)` returns null while neither CELL_WRITE nor INSTRUMENT_WRITE is set;
 *   - the registry descriptor sets `gridCellEdits` for a song only when its player's caps have CELL_WRITE
 *     (`nuadeSongHasCellWrite`), evaluated each time the route is decided, i.e. after the load that recorded the caps.
 * No DEViLBOX-side pokes into player structs: they are upstream-private and would break on every bump.
 */
import { NuadeCap, type NuadeIn } from './nuadeProtocol';

export interface NuadeEditPort {
  readonly caps: number;
  /** values: the cell's columns in the player's tracker_info order. Present only with CELL_WRITE. */
  setCell?(pattern: number, row: number, channel: number, values: number[]): void;
  /** Present only with INSTRUMENT_WRITE. */
  setInstrumentParam?(instrument: number, param: number, value: number): void;
}

export function createNuadeEditPort(caps: number, post: (msg: NuadeIn) => void): NuadeEditPort | null {
  const cell = (caps & NuadeCap.CellWrite) !== 0;
  const inst = (caps & NuadeCap.InstrumentWrite) !== 0;
  if (!cell && !inst) return null;
  const port: NuadeEditPort = { caps };
  if (cell) port.setCell = (pattern, row, channel, values) => post({ type: 'cellWrite', pattern, row, channel, values });
  if (inst) port.setInstrumentParam = (instrument, param, value) => post({ type: 'instrumentWrite', instrument, param, value });
  return port;
}

export { recordNuadePlayerCaps, nuadePlayerCaps, resetNuadePlayerCaps, nuadeSongHasCellWrite } from './nuadeCaps';
