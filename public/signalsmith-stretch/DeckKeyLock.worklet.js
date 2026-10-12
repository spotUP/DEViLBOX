/**
 * DeckKeyLock.worklet.js - AudioWorklet module for the DJ deck Key Lock.
 *
 * Module evaluation follows import order: the idle shim installs its
 * registerProcessor wrapper first, then the vendored, unmodified Signalsmith
 * Stretch 1.3.2 build (MIT, Geraint Luff / Signalsmith Audio, LICENSE.txt)
 * registers 'signalsmith-stretch' through it.
 */
import './idleWhenBypassed.js';
import './SignalsmithStretch.mjs';
