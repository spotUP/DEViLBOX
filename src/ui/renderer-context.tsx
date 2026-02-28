// src/ui/renderer-context.tsx
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type RendererKind = 'dom' | 'gl';

export const RendererCtx = createContext<RendererKind>('dom');

export function useRenderer(): RendererKind {
  return useContext(RendererCtx);
}

export function GLRenderer({ children }: { children: ReactNode }) {
  return <RendererCtx.Provider value="gl">{children}</RendererCtx.Provider>;
}
