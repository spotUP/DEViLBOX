/** One hex-dump line: offset label plus the byte cells, as the Register View shows them. */
export interface HexRow { offset: string; cells: string[] }

/** Split bytes into rows of `perRow` two-digit upper-case hex cells with a 4-digit hex offset. */
export function toHexRows(bytes: Uint8Array, perRow = 16): HexRow[] {
  const rows: HexRow[] = [];
  for (let i = 0; i < bytes.length; i += perRow) {
    rows.push({
      offset: i.toString(16).toUpperCase().padStart(4, '0'),
      cells: Array.from(bytes.subarray(i, i + perRow), b => b.toString(16).toUpperCase().padStart(2, '0')),
    });
  }
  return rows;
}
