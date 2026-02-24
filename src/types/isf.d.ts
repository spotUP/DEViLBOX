declare module 'interactive-shader-format' {
  export class Renderer {
    constructor(gl: WebGLRenderingContext | WebGL2RenderingContext);
    valid: boolean;
    error: any;
    errorLine: any;
    model: any;
    loadSource(fragmentISF: string, vertexISF?: string): void;
    setValue(name: string, value: any): void;
    draw(destination: HTMLCanvasElement | { width: number; height: number; offsetWidth?: number; offsetHeight?: number }): void;
    cleanup(): void;
  }

  export class Parser {
    inputs: Array<{
      NAME: string;
      TYPE: string;
      DEFAULT?: any;
      MIN?: number;
      MAX?: number;
      LABEL?: string;
      LABELS?: string[];
      VALUES?: number[];
    }>;
    metadata: any;
    fragmentShader: string;
    vertexShader: string;
    valid: boolean;
    error: any;
    errorLine: any;
    rawFragmentShader: string;
    parse(fragmentISF: string, vertexISF?: string): void;
  }

  export class Upgrader {
    upgrade(source: string): string;
  }

  export class MetadataExtractor {
    extract(source: string): any;
  }
}
