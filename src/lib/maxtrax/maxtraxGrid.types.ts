export interface GridColumn { channel: number; voice: number }
export interface GridNoteCell {
  kind: 'noteOn' | 'noteOff';
  eventIndex: number; column: number; row: number; offset: number;
  pitch: number; velocity: number; channel: number; duration: number;
}
export interface GridEffectCell {
  eventIndex: number; channel: number | 'global'; row: number; offset: number;
  command: number; data: number; stopTime: number;
}
export interface MaxTraxGrid {
  ticksPerRow: number; rowCount: number;
  columns: GridColumn[]; noteCells: GridNoteCell[]; effectCells: GridEffectCell[];
}
