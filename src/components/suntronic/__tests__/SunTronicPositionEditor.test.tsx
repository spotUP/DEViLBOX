// SunTronicPositionEditor.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SunTronicPositionEditor } from '../SunTronicPositionEditor';

// Mock SongOrderMatrix to avoid pulling in the Web Worker render stack.
vi.mock('@/components/shared/SongOrderMatrix', () => ({
  SongOrderMatrix: () => null,
  MATRIX_COLLAPSED_HEIGHT: 40,
}));

vi.mock('@stores', () => ({
  useFormatStore: (sel: (s: unknown) => unknown) => sel({ setSunTronicPositionCell: () => {} }),
}));

describe('SunTronicPositionEditor', () => {
  it('renders a positions matrix from native data without throwing', () => {
    const nativeData = {
      blocks: [[{ note: 40, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }]],
      positions: [{ blockIndex: [0, 0, 0, 0], transpose: [0, 12, 0, -5] }],
    };
    const { container } = render(
      <SunTronicPositionEditor width={400} height={200} nativeData={nativeData as never}
        currentPosition={0} onPositionChange={() => {}} />,
    );
    expect(container).toBeTruthy();
  });
});
