/**
 * JSX type declarations for @pixi/layout components registered via extend().
 * pixi-react auto-lowercases: LayoutContainer → <layoutContainer>
 */
import type { LayoutContainer } from '@pixi/layout/components';
import type { PixiReactElementProps } from '@pixi/react/types/typedefs/PixiReactNode';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      layoutContainer: PixiReactElementProps<typeof LayoutContainer>;
    }
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      layoutContainer: PixiReactElementProps<typeof LayoutContainer>;
    }
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      layoutContainer: PixiReactElementProps<typeof LayoutContainer>;
    }
  }
}
