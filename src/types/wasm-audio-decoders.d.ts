/**
 * Type declarations for @wasm-audio-decoders packages
 */

declare module '@wasm-audio-decoders/flac' {
  interface DecodedAudio {
    channelData: Float32Array[];
    samplesDecoded: number;
    sampleRate: number;
    bitDepth: number;
    errors?: Array<{
      message: string;
      frameLength?: number;
      frameNumber?: number;
      inputBytes?: number;
      outputSamples?: number;
    }>;
  }

  export class FLACDecoder {
    ready: Promise<void>;
    decode(data: Uint8Array): DecodedAudio;
    decodeFile(data: Uint8Array): DecodedAudio;
    reset(): Promise<void>;
    free(): void;
  }

  export class FLACDecoderWebWorker {
    ready: Promise<void>;
    decode(data: Uint8Array): Promise<DecodedAudio>;
    decodeFile(data: Uint8Array): Promise<DecodedAudio>;
    reset(): Promise<void>;
    free(): void;
  }
}

declare module '@wasm-audio-decoders/ogg-vorbis' {
  interface DecodedAudio {
    channelData: Float32Array[];
    samplesDecoded: number;
    sampleRate: number;
    bitDepth?: number;
    errors?: Array<{
      message: string;
    }>;
  }

  export class OggVorbisDecoder {
    ready: Promise<void>;
    decode(data: Uint8Array): DecodedAudio;
    decodeFile(data: Uint8Array): DecodedAudio;
    reset(): Promise<void>;
    free(): void;
  }

  export class OggVorbisDecoderWebWorker {
    ready: Promise<void>;
    decode(data: Uint8Array): Promise<DecodedAudio>;
    decodeFile(data: Uint8Array): Promise<DecodedAudio>;
    reset(): Promise<void>;
    free(): void;
  }
}

declare module '@wasm-audio-decoders/opus-ml' {
  interface DecodedAudio {
    channelData: Float32Array[];
    samplesDecoded: number;
    sampleRate: number;
    errors?: Array<{
      message: string;
    }>;
  }

  export class OpusDecoder {
    ready: Promise<void>;
    decode(data: Uint8Array): DecodedAudio;
    decodeFile(data: Uint8Array): DecodedAudio;
    reset(): Promise<void>;
    free(): void;
  }

  export class OpusDecoderWebWorker {
    ready: Promise<void>;
    decode(data: Uint8Array): Promise<DecodedAudio>;
    decodeFile(data: Uint8Array): Promise<DecodedAudio>;
    reset(): Promise<void>;
    free(): void;
  }
}

declare module 'mpg123-decoder' {
  interface DecodedAudio {
    channelData: Float32Array[];
    samplesDecoded: number;
    sampleRate: number;
    errors?: Array<{
      message: string;
    }>;
  }

  export class MPEGDecoder {
    ready: Promise<void>;
    decode(data: Uint8Array): DecodedAudio;
    decodeFile(data: Uint8Array): DecodedAudio;
    reset(): Promise<void>;
    free(): void;
  }

  export class MPEGDecoderWebWorker {
    ready: Promise<void>;
    decode(data: Uint8Array): Promise<DecodedAudio>;
    decodeFile(data: Uint8Array): Promise<DecodedAudio>;
    reset(): Promise<void>;
    free(): void;
  }
}
