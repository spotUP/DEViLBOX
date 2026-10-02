/**
 * A recording Web Audio implementation, good enough to construct the real
 * `DubBus` (and real Tone) under Node.
 *
 * This exists because `DubBus` cannot be instantiated in a test otherwise:
 * Tone checks `instanceof AudioParam`, so a duck-typed stub gets as far as the
 * first gain write and then throws. That constraint is why every dub defect of
 * 2026-09 and 10 — a branch silently disconnected by a `Tone.connect` cast, a
 * band-limit filter never connected, a gain decayed to zero by its own setup
 * line, a wet mix re-muted by the settings mirror — was found by hand in a
 * browser instead of by a test.
 *
 * It records rather than computes. Nothing is rendered: `getFloatTimeDomainData`
 * returns silence, so this can prove WIRING and PARAMETER VALUES but never
 * audibility. A test that wants to know whether something is audible still has
 * to ask a human. Keep that line clear.
 *
 * Two things matter more than fidelity:
 *
 *  - Every `connect` is recorded, in both directions, including connects to an
 *    `AudioParam` and to `destination`. The cast bug — `Tone.connect(native,
 *    toneNode)` silently connecting nothing — is invisible to a stub that
 *    ignores its arguments and obvious to one that keeps them.
 *  - Every `AudioParam` keeps its scheduled-event history, so a test can assert
 *    "the value was set to 0.7071 and stayed there" rather than sampling a
 *    `.value` that a later mirror overwrote. That is precisely the failure the
 *    Liquid regression test exists for.
 */

/** One scheduled automation event on a parameter. */
export interface ParamEvent {
  kind: 'setValue' | 'setTarget' | 'linearRamp' | 'exponentialRamp' | 'valueCurve';
  value: number;
  time: number;
  timeConstant?: number;
}

export class TestAudioParam {
  /** Every write, in order. The first element is the initial value. */
  readonly history: ParamEvent[] = [];
  private _value: number;

  constructor(initial = 1) {
    this._value = initial;
    this.history.push({ kind: 'setValue', value: initial, time: 0 });
  }

  get value(): number { return this._value; }

  /**
   * Setting `.value` is an implicit `setValueAtTime` and is recorded as one, so
   * "who overwrote this and when" is answerable from `history` alone.
   */
  set value(v: number) {
    this._value = v;
    this.history.push({ kind: 'setValue', value: v, time: 0 });
  }

  setValueAtTime(value: number, time: number): this {
    this._value = value;
    this.history.push({ kind: 'setValue', value, time });
    return this;
  }

  setTargetAtTime(value: number, time: number, timeConstant: number): this {
    this._value = value;
    this.history.push({ kind: 'setTarget', value, time, timeConstant });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this._value = value;
    this.history.push({ kind: 'linearRamp', value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    this._value = value;
    this.history.push({ kind: 'exponentialRamp', value, time });
    return this;
  }

  setValueCurveAtTime(curve: Float32Array, time: number): this {
    const last = curve.length ? curve[curve.length - 1] : 0;
    this._value = last;
    this.history.push({ kind: 'valueCurve', value: last, time });
    return this;
  }

  cancelScheduledValues(): this { return this; }

  cancelAndHoldAtTime(): this { return this; }

  /** Values written, in order. */
  get values(): number[] { return this.history.map(h => h.value); }

  /** How many times a value was written — a proxy for "did anything move it". */
  get writeCount(): number { return this.history.length; }

  /** Every distinct value written, ignoring repeats — "has this ever moved". */
  get distinctValues(): number[] {
    const seen: number[] = [];
    for (const v of this.values) if (!seen.includes(v)) seen.push(v);
    return seen;
  }
}

/** Marker class so `connect(node)` can be told apart from `connect(param)`. */
export class TestAudioDestination {
  readonly kind = 'destination';
  maxChannelCount = 2;
  channelCount = 2;
  channelCountMode = 'explicit';
  channelInterpretation = 'speakers';
}

export type EdgeTarget = TestAudioNode | TestAudioParam | TestAudioDestination;

/** A connection, recorded as the source made it. */
export interface RecordedEdge {
  from: TestAudioNode;
  to: EdgeTarget;
  /** Output index on the source, for `connect(node, output, input)`. */
  output: number;
  /** Input index on the target, when the caller named one. */
  input?: number;
}

export class TestAudioNode {
  readonly kind = 'node';
  numberOfInputs = 1;
  numberOfOutputs = 1;
  channelCount = 2;
  channelCountMode = 'max';
  channelInterpretation = 'speakers';
  maxChannelCount = 2;
  /** Base gain, initialised to unity; real node types reset it as needed. */
  readonly gain = new TestAudioParam(1);
  /** Every outgoing connection this node has made. */
  readonly outEdges: RecordedEdge[] = [];
  /** Every incoming connection, recorded from the other end. */
  readonly inEdges: RecordedEdge[] = [];
  /** Connections made from this node to a param rather than to a node. */
  readonly paramEdges: RecordedEdge[] = [];

  context: TestAudioContext;
  nodeName: string;

  constructor(context: TestAudioContext, nodeName = 'node') {
    this.context = context;
    this.nodeName = nodeName;
  }

  connect(target: EdgeTarget, output = 0, input?: number): TestAudioNode {
    // Recorded unconditionally. Swallowing a bad connect is exactly how the
    // Tone cast bug stayed invisible, so there is no type check here.
    const edge: RecordedEdge = { from: this, to: target, output, input };
    this.outEdges.push(edge);
    if (target instanceof TestAudioNode) target.inEdges.push(edge);
    else if (target instanceof TestAudioParam) this.paramEdges.push(edge);
    return this;
  }

  disconnect(target?: EdgeTarget): void {
    for (let i = this.outEdges.length - 1; i >= 0; i--) {
      if (!target || this.outEdges[i].to === target) this.outEdges.splice(i, 1);
    }
  }

  /** True when this node feeds `target` at all. */
  feeds(target: EdgeTarget): boolean {
    return this.outEdges.some(e => e.to === target);
  }

  /** True when anything feeds this node. */
  get isFed(): boolean { return this.inEdges.length > 0; }
}

export class TestDelayNode extends TestAudioNode {
  readonly delayTime = new TestAudioParam(0);
  constructor(context: TestAudioContext, nodeName = 'delay') { super(context, nodeName); }
}

export class TestBiquadFilterNode extends TestAudioNode {
  readonly frequency = new TestAudioParam(350);
  readonly detune = new TestAudioParam(0);
  readonly Q = new TestAudioParam(1);
  type: BiquadFilterType = 'lowpass';
  constructor(context: TestAudioContext, nodeName = 'biquad') {
    super(context, nodeName);
    this.gain.value = 0;
  }
}

export class TestWaveShaperNode extends TestAudioNode {
  curve: Float32Array | null = null;
  oversample: OverSampleType = 'none';
  constructor(context: TestAudioContext, nodeName = 'waveshaper') { super(context, nodeName); }
}

export class TestAnalyserNode extends TestAudioNode {
  fftSize = 2048;
  frequencyBinCount = 1024;
  smoothingTimeConstant = 0.8;
  minDecibels = -100;
  maxDecibels = -30;
  constructor(context: TestAudioContext, nodeName = 'analyser') { super(context, nodeName); }
  /** Silence. This harness proves wiring, never level — see the header note. */
  getFloatTimeDomainData(): Float32Array { return new Float32Array(this.fftSize); }
  getByteFrequencyData(): Uint8Array { return new Uint8Array(this.frequencyBinCount); }
}

export class TestConvolverNode extends TestAudioNode {
  buffer: AudioBuffer | null = null;
  normalize = true;
  constructor(context: TestAudioContext, nodeName = 'convolver') { super(context, nodeName); }
}

export class TestDynamicsCompressorNode extends TestAudioNode {
  readonly threshold = new TestAudioParam(-24);
  readonly knee = new TestAudioParam(30);
  readonly ratio = new TestAudioParam(12);
  readonly attack = new TestAudioParam(0.003);
  readonly release = new TestAudioParam(0.25);
  reduction = 0;
  constructor(context: TestAudioContext, nodeName = 'compressor') { super(context, nodeName); }
}

export class TestStereoPannerNode extends TestAudioNode {
  readonly pan = new TestAudioParam(0);
  constructor(context: TestAudioContext, nodeName = 'panner') { super(context, nodeName); }
}

export class TestAudioBufferSourceNode extends TestAudioNode {
  buffer: AudioBuffer | null = null;
  readonly playbackRate = new TestAudioParam(1);
  readonly detune = new TestAudioParam(0);
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: ((ev: unknown) => void) | null = null;
  constructor(context: TestAudioContext, nodeName = 'bufsrc') { super(context, nodeName); }
  start(): void { /* no transport: the harness never renders */ }
  stop(): void { /* no transport */ }
}

export class TestConstantSourceNode extends TestAudioNode {
  readonly offset = new TestAudioParam(1);
  constructor(context: TestAudioContext, nodeName = 'constsrc') { super(context, nodeName); }
  start(): void { /* no transport */ }
  stop(): void { /* no transport */ }
}

export class TestChannelMergerNode extends TestAudioNode {
  constructor(context: TestAudioContext, nodeName = 'merger', inputs = 6) {
    super(context, nodeName);
    this.numberOfInputs = inputs;
  }
}

export class TestChannelSplitterNode extends TestAudioNode {
  constructor(context: TestAudioContext, nodeName = 'splitter', outputs = 6) {
    super(context, nodeName);
    this.numberOfOutputs = outputs;
  }
}

export class TestAudioWorkletNode extends TestAudioNode {
  readonly port = { postMessage: () => {}, onmessage: null as null | ((e: unknown) => void) };
  constructor(context: TestAudioContext, nodeName = 'worklet', inputs = 1) {
    super(context, nodeName);
    this.numberOfInputs = inputs;
  }
}

export class TestAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private readonly channels: Float32Array[];
  constructor(numberOfChannels = 2, length = 1, sampleRate = 48000) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get durationSeconds(): number { return this.duration; }
  getChannelData(channel: number): Float32Array { return this.channels[channel]; }
  copyFromChannel(dest: Float32Array, channel: number, start = 0): void {
    dest.set(this.channels[channel].subarray(start, start + dest.length));
  }
}

export class TestAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state: AudioContextState = 'running';
  readonly destination = new TestAudioDestination();
  readonly listener = {
    positionX: new TestAudioParam(0),
    positionY: new TestAudioParam(0),
    positionZ: new TestAudioParam(0),
    setPosition: () => {},
    setOrientation: () => {},
  };
  readonly audioWorklet = { addModule: (_url: string) => Promise.resolve(), port: null };

  /** Every node this context made, in creation order. */
  readonly created: TestAudioNode[] = [];
  /** Manually advanced; nothing renders, but automations carry timestamps. */
  advanceTime(seconds: number): void { this.currentTime += seconds; }

  private track<T extends TestAudioNode>(node: T): T {
    this.created.push(node);
    return node;
  }

  // A gain node is the base node: `gain` is already a unity param on it, so
  // there is no separate class to distinguish.
  createGain(): TestAudioNode { return this.track(new TestAudioNode(this, 'gain')); }
  createDelay(): TestDelayNode { return this.track(new TestDelayNode(this)); }
  createBiquadFilter(): TestBiquadFilterNode { return this.track(new TestBiquadFilterNode(this)); }
  createWaveShaper(): TestWaveShaperNode { return this.track(new TestWaveShaperNode(this)); }
  createAnalyser(): TestAnalyserNode { return this.track(new TestAnalyserNode(this)); }
  createConvolver(): TestConvolverNode { return this.track(new TestConvolverNode(this)); }
  createDynamicsCompressor(): TestDynamicsCompressorNode {
    return this.track(new TestDynamicsCompressorNode(this));
  }
  createStereoPanner(): TestStereoPannerNode { return this.track(new TestStereoPannerNode(this)); }
  createBufferSource(): TestAudioBufferSourceNode { return this.track(new TestAudioBufferSourceNode(this)); }
  createConstantSource(): TestConstantSourceNode { return this.track(new TestConstantSourceNode(this)); }
  createChannelMerger(count?: number): TestChannelMergerNode {
    return this.track(new TestChannelMergerNode(this, 'merger', count));
  }
  createChannelSplitter(count?: number): TestChannelSplitterNode {
    return this.track(new TestChannelSplitterNode(this, 'splitter', count));
  }
  createAudioWorklet(): TestAudioWorkletNode { return this.track(new TestAudioWorkletNode(this)); }
  createBuffer(channels: number, length: number, sampleRate: number): TestAudioBuffer {
    return new TestAudioBuffer(channels, length, sampleRate);
  }
  async resume(): Promise<void> { this.state = 'running'; }
  async close(): Promise<void> { this.state = 'closed'; }
  async suspend(): Promise<void> { this.state = 'suspended'; }
  async decodeAudioData(): Promise<TestAudioBuffer> { return new TestAudioBuffer(); }
}

export class TestOfflineAudioContext extends TestAudioContext {}

/**
 * Install the polyfill's classes as globals, for tests that construct audio
 * graphs without the harness (Tone checks `instanceof` on these).
 */
export function installAudioGlobals(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g.AudioParam = TestAudioParam;
  g.AudioNode = TestAudioNode;
  g.AudioBuffer = TestAudioBuffer;
  g.AudioContext = TestAudioContext;
  g.OfflineAudioContext = TestOfflineAudioContext;
  g.BaseAudioContext = TestAudioContext;
  g.GainNode = TestAudioNode;
  g.DelayNode = TestDelayNode;
  g.BiquadFilterNode = TestBiquadFilterNode;
  g.WaveShaperNode = TestWaveShaperNode;
  g.AnalyserNode = TestAnalyserNode;
  g.ConvolverNode = TestConvolverNode;
  g.DynamicsCompressorNode = TestDynamicsCompressorNode;
  g.StereoPannerNode = TestStereoPannerNode;
  g.AudioBufferSourceNode = TestAudioBufferSourceNode;
  g.ConstantSourceNode = TestConstantSourceNode;
  g.AudioWorkletNode = TestAudioWorkletNode;
}