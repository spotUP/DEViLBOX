export interface ScrollListItem {
  id: string;
  label: string;
  /** Secondary label shown muted (e.g. synth type) */
  sublabel?: string;
}

export interface ScrollListProps {
  items: ScrollListItem[];
  /** id of the currently selected item */
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onDoubleClick?: (id: string) => void;
  /** Required — sets the fixed height of the visible scroll area */
  height: number;
  /** Row height in px. Default 28 (matches PixiList default) */
  itemHeight?: number;
  /** Required in GL; optional in DOM. Sets the container width. */
  width?: number;
  /** Extra layout props forwarded to the Pixi container (GL only, ignored in DOM) */
  layout?: Record<string, unknown>;
}
