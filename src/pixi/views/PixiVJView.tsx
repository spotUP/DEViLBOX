/**
 * PixiVJView — VJ view for WebGL (PixiJS) mode.
 *
 * Embeds the butterchurn canvas via PixiDOMOverlay (butterchurn needs its
 * own WebGL context, can't share Pixi's). The DOM overlay stretches to fill
 * the layout region, and the VJCanvas + VJControls render inside it.
 */

import { PixiDOMOverlay } from '../components/PixiDOMOverlay';
import { VJView } from '@components/vj/VJView';

export const PixiVJView: React.FC = () => {
  return (
    <pixiContainer layout={{ width: '100%', height: '100%' }}>
      <PixiDOMOverlay
        layout={{ width: '100%', height: '100%' }}
        style={{ overflow: 'hidden', background: '#000' }}
      >
        <VJView />
      </PixiDOMOverlay>
    </pixiContainer>
  );
};
