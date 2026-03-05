/**
 * Community SuperCollider SynthDef presets.
 *
 * Curated from SCLOrkSynths (https://github.com/SCLOrkHub/SCLOrkSynths)
 * Licensed under GPL-3.0. Original authors credited per preset.
 *
 * These are source-code templates — they must be compiled via the SC
 * compile endpoint before use. The user loads a preset, can modify the
 * code, then hits Compile to get a working instrument.
 */

export interface SCPreset {
  name: string;
  category: string;
  credit: string;
  tags: string[];
  source: string;
}

export const SC_PRESET_CATEGORIES = [
  'Bass',
  'Bells',
  'Drums',
  'Guitar',
  'Keys',
  'Misc',
  'Organ',
  'Pads',
  'Percussion',
  'Strings',
  'Winds',
] as const;

export type SCPresetCategory = typeof SC_PRESET_CATEGORIES[number];

export const SC_PRESETS: SCPreset[] = [
  {
    name: 'acidOto3091',
    category: 'Bass',
    credit: '08091500Acid309 by otophilia',
    tags: ['pitched', 'acid', 'phat', 'subtractive'],
    source: `/*
Retrieved from acid_oto309.scd
Envelopes from original changed to ADSR, filterRange calculated in octaves
Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("acidOto3091", {
	arg
	// Standard Arguments
	out = 0, gate = 1, freq = 440, amp = 0.1, pan = 0, att = 0.001, dec = 0.5, sus = 0.1, rel = 0.5, curve = -4,
	// Other Controls
	// width is 0 - 1
	// filterRange is in octaves
	lagTime = 0.12, filterRange = 6, width = 0.51, rq = 0.3;

	var ampEnv, filterEnv, snd;

	freq = Lag.kr(freq, lagTime);

	ampEnv = Env.adsr(
		attackTime: att,
		decayTime: dec,
		sustainLevel: sus,
		releaseTime: rel,
		peakLevel: amp,
		curve: [0, curve, curve, curve]
	).kr(gate: gate);

	filterEnv = Env.adsr(
		attackTime: att,
		decayTime: dec * 2,
		sustainLevel: sus / 2,
		releaseTime: rel * 2,
		peakLevel: 2.pow(filterRange), // octaves multiplier
		curve: [-1 * curve, curve, curve, curve],
		bias: 1 // env sweeps from 1 to 2.pow(filterRange) and back
	).kr(gate: gate, doneAction: 2);

	snd = LFPulse.ar(freq: freq, width: width).range(-1, 1);

	snd = RLPF.ar(snd, freq * filterEnv, rq);

	snd = snd * ampEnv;

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "08091500Acid309 by otophilia",
	category: \\bass,
	tags: [\\pitched, \\acid, \\phat, \\subtractive]
	)
).add;`,
  },
  {
    name: 'acidOto3092',
    category: 'Bass',
    credit: 'based on 08091500Acid309 by otophilia',
    tags: ['pitched', 'acid', 'phat', 'subtractive'],
    source: `/*
Based on acid_oto309.scd

This version uses percussive envelopes for both amp and filter sweep.
Filter sweep is calculated in octaves

Modified by Bruno Ruviaro and Josh Mitchell, August 2019.
*/

SynthDef("acidOto3092", {
	arg
	// Standard Arguments
	out = 0, freq = 440, amp = 0.1, pan = 0, att = 0.001, rel = 0.5,
	// Other Controls
	// width is 0 to 1
	// filterRange is in octaves
	lagTime = 0.12, filterRange = 6, width = 0.51, rq = 0.3;

	var ampEnv, filterEnv, snd, pitch;

	pitch = freq.cpsmidi; // Lag only useful if synth is played with Pmono

	ampEnv = Env.perc(
		attackTime: att,
		releaseTime: rel,
		level: amp
	).kr(doneAction: 2);

	filterEnv = Env.perc(
		attackTime: att,
		releaseTime: rel,
		level: filterRange * 12, // octaves to semitones
	).kr;

	snd = LFPulse.ar(freq: pitch.midicps, width: width).range(-1, 1);

	// filter sweeps from current pitch all the way up to <filterRange> octaves above and back down.
	snd = RLPF.ar(snd, (pitch + filterEnv).midicps, rq).distort;

	snd = snd * ampEnv;

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "based on 08091500Acid309 by otophilia",
	category: \\bass,
	tags: [\\pitched, \\acid, \\phat, \\subtractive]
	)
).add;`,
  },
  {
    name: 'bassWarsaw',
    category: 'Bass',
    credit: 'James Harkins',
    tags: ['bass', 'synth', 'pitched'],
    source: `/*
James Harkins
http://doc.sccode.org/Tutorials/A-Practical-Guide/PG_04_Words_to_Phrases.html

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("bassWarsaw", {
	arg
	//Standard Values:
	out = 0, freq = 440, gate = 1, amp = 0.5, pan = 0, att = 0.01, dec = 0.3, sus = 0.4, rel = 0.1,
	//Other Controls:
	slideTime = 0.17, cutoff = 1100, width = 0.15, detune = 1.005, preamp = 4;

	var snd, env;

	env = Env.adsr(att, dec, sus, rel).kr(gate: gate, doneAction: 2);
	freq = Lag.kr(freq, slideTime);
	snd = VarSaw.ar(freq: [freq, freq * detune], width: width, mul: preamp);
	snd = Mix(snd).distort;
	snd = snd * env;
	snd = LPF.ar(snd, cutoff, amp);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "James Harkins",
	category: \\bass,
	tags: [\\bass, \\synth, \\pitched]
	)
).add;`,
  },
  {
    name: 'combs',
    category: 'Bass',
    credit: 'Josh Mitchell',
    tags: ['metallic', 'bass', 'synth', 'pitched'],
    source: `/*
A SynthDef by Josh Mitchell, 8/19.

The core sound comes from brown noise being sent through two comb filters in series.
The first comb filter randomly fluctuates around the root frequency, creating an effect
halfway between vibrato and a flanger. The second filter is set to a harmonic of the
root frequency. After that, a tiny bit of runaway low end gets filtered out and the
sound is sent through an envelope filter for a vocal sort of sound.
*/

SynthDef("combs", {
	arg
	//Standard Arguments
	out = 0, pan = 0, amp = 0.1, freq = 440, gate = 1, att = 0.01, dec = 0.1, sus = 0.7, rel = 0.5,
	//Other Controls
	rate = 6, depth = 0.2, regen = -3, sweep = 16, rq = 0.5, harmonic = 1.5;

	var max, min, vibrato, snd, env, filterenv;

	//Setting some values for the filters:
	max = ((1 + depth) / freq);
	min = (1 / (freq * (1 + depth)));
	vibrato = LFNoise1.ar(rate).range(min, max);

	//Amplitude and filter cutoff envelopes
	env = Env.adsr(att, dec, sus, rel).kr(gate: gate, doneAction: 2);
	filterenv = Env.perc(att, rel).kr;
	filterenv = ((filterenv * sweep) + 1) * freq;

	//The core noise:
	snd = BrownNoise.ar(1);
	snd = CombL.ar(snd, max, vibrato, regen);
	snd = CombN.ar(snd, harmonic / freq, harmonic / freq, regen, env);

	//More filters and output stuff:
	snd = RHPF.ar(snd, freq * 4, rq);
	snd = RLPF.ar(snd, filterenv, rq, amp);
	snd = Limiter.ar(snd, amp);
	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Josh Mitchell",
	category: \\bass,
	tags: [\\metallic, \\bass, \\synth, \\pitched]
	)
).add`,
  },
  {
    name: 'doubleBass',
    category: 'Bass',
    credit: 'Matias Monteagudo',
    tags: ['pitched', 'bass'],
    source: `/*
This Double Bass SynthDef, (originally called "~bass") was made by Matias Monteagudo on
his Generative Jazz Project "MM – Coltrane’s Giant Steps," which can be found here:
https://patchstorage.com/mm-giant-steps-with-visuals/

First, a percussive envelope is defined in order to mimic the distinctive pluck of a double bass.
Frequency modualation synthesis is used such that the sine oscillators "op1", "op2", "op3", and "op4" are
operators with phase modulation. "op1", "op2", and "op3" share harmonic overtones while "op4" shares the fundamental
frequency. "op4" utilizes slight frequency deviation, which can be altered through the "freqDev" argument. This frequency deviation alters the level of precision in the intonation of each note, such that a value of zero would create perfect intonation on each note. The "mul" arguments for each operator linearly increase or decrease the amplitude for their
respective sine oscillators. Then, "op4" is passed through a delay line with multi-channel expansion. A high pass filter
removes frequencies below human perception. The array of channels is then spread across the stereo field,
and the "pan" and "sprd" argument can be used to alter this. A sub-bass is added which is correspondingly
panned, and the "subAmp" argument linearly increases or decreases its amplitude. Lastly, a limiter provides protection
in the event that extreme values are passed into the Synth.

Modifications Made:
- argument/variable names, formatting, and syntax were altered to better fit the SCLOrkSynth guidlines and conventions
- documentation was added in the form of comments outlining processes throughout the SynthDef
- a percussive envelope was substitutued over an ADSR envelope for the sake of optimization
- a sub-bass was added to build a deeper double bass sound
- the "pan", "sprd", "subAmp", and "freqDev" arguments were added and appropriatley substituted
- the "maxdelaytime" argument in the DelayN UGen was altered to 0.06 to fit the maximum of the established "delaytime" range
- constants in mul arguments throghout processes were multiplied together and reduced to simplify the SynthDef
- a limiter was added to provide protection against large amplitudes

By Matias Monteagudo, Prof. Composer, Salzburg Austria
Description by Suhel Keswani
SynthDef and Pattern modified by Suhel Keswani and Josh Mitchell, September 2020
*/

SynthDef("doubleBass", {
	arg
	// Standard Values
	out = 0, pan = 0, amp = 1.0, freq = 440, att = 0.01, rel = 1.0 , crv = -30, vel = 1.0,
	// Other Controls
	freqDev = 2, op1mul = 0.1, op2mul = 0.1, op3mul = 0.1, sprd = 0.5, subAmp = 0.1;

	var env, op1, op2, op3, op4, snd, sub;

	// Percussive Envelope
	env = Env.perc(
		attackTime: att,
		releaseTime: rel,
		curve: crv
	).ar(doneAction: 2);

	// Overtones
	op1 = SinOsc.ar(
		freq: freq * 4,
		mul: vel / 2 + op1mul);

	op2 = SinOsc.ar(
		freq: freq * 3,
		phase: op1,
		mul: vel / 2 + op2mul);

	op3 = SinOsc.ar(
		freq: freq * 2,
		phase: op2,
		mul: vel / 2 + op3mul);

	// Fundamental Frequency
	op4 = SinOsc.ar(
		freq: freq + NRand(-1 * freqDev, freqDev, 3),
		phase: op3,
		mul: vel);

	// Delay Line with Multi-Channel Expansion
	snd = {
		DelayN.ar(
			in: op4,
			maxdelaytime: 0.06,
			delaytime: Rand(0.03, 0.06)
		)} !8;

	// High Pass Filter
	snd = LeakDC.ar(snd);

	// Stereo Spread
	snd = Splay.ar(
		inArray: snd,
		spread: sprd,
		level: 0.6,
		center: pan);

	// Add a sub
	sub = SinOsc.ar(
		freq: freq/2,
		mul: env * subAmp);
	sub = Pan2.ar(sub, pan);
	snd = snd + sub;

	//Ouput Stuff
	snd = snd * env;
	snd = snd * amp;
	snd = Limiter.ar(snd);
	Out.ar(out, snd);
},
metadata: (
	credit: "Matias Monteagudo",
	category: \\bass,
	tags: [\\pitched, \\bass]
)
).add;`,
  },
  {
    name: 'fmBass',
    category: 'Bass',
    credit: 'Josh Mitchell',
    tags: ['pitched', 'fm'],
    source: `/*
A lot of what's in here comes from the great Eli Fieldsteel's tutorials on how to
write an FM-based SynthDef (https://www.youtube.com/watch?v=UoXMUQIqFk4), so I'll
just describe the things I added beyond very a very basic sine wave FM synth.

First, the modulator and carrier are controlled by seperate envelopes, which allows
for a sort of envelope-filter-type sound as the modulation index is increased and
decreased. The attack and release times of this envelope can be shorter than the
carrier envelope. This allows, for example, a burst of high frequencies at the start
of a note paired with a long low frequency fade. When attFraction + relFraction is
less than or equal to one, they act as fractions of the total note time, and when
their sum is larger than 1, they get scaled down to add up to the total note time.

Next, the modulator is SinOscFB, and not SinOsc. This way, you can still get glassy,
clean sine wave FM sounds when the modFB is set to 0, but a little bit more grit from
the added frequencies as modFB is turned up. Lastly, I added a sub sine wave an
octave below the fundamental to ground the note a bit more to the fundamental. The
volume of this is controlled by subAmp, which is a fraction of the fundamental's
amplitude.

By Josh Mitchell July 2020
*/

SynthDef(\\fmBass, {
	arg
	//Standard Values
	out = 0, pan = 0, amp = 0.1, freq = 150, att = 0.0005, rel = 1, crv = -3,
	// Other Controls
	attFraction = 0.05, relFraction = 0.7, modIndex = 500, modRatio = 1.51,
	subAmp = 0.75, modFB = 0.4;

	var scale, mAtt, mRel, modulatorEnv, modulator, carrierEnv, carrier, snd;

	// Scale the att/rel for the Modulator
	scale = (attFraction + relFraction);
	scale = Select.kr(
		which: InRange.kr(
			in: scale,
			lo: 1,
			hi: inf),
		array: [
			DC.kr([attFraction, relFraction]),
			DC.kr([attFraction/scale, relFraction/scale])
	]);
	scale = scale * (att + rel);

	mAtt = scale[0];
	mRel = scale[1];

	// Modulator
	modulatorEnv = Env.perc(
		attackTime: mAtt,
		releaseTime: mRel,
		level: modIndex,
		curve: crv).ar;
	modulator = SinOscFB.ar(
		freq: freq * modRatio,
		feedback: modFB,
		mul: modulatorEnv);

	// Carrier
	carrierEnv = Env.perc(
		attackTime: att,
		releaseTime: rel,
		curve: crv).ar(doneAction: 2);
	carrier = SinOsc.ar(
		freq: freq + modulator,
		mul: carrierEnv);

    // Add a Sub
	snd = carrier + SinOsc.ar(
		freq: freq/2,
		mul: carrierEnv * subAmp);

	// Output Stuff
	snd = snd * amp;
	snd = Limiter.ar(snd);

	Out.ar(out, Pan2.ar(snd));
},
metadata: (
	credit: "Josh Mitchell",
	category: \\bass,
	tags: [\\pitched, \\fm]
	)
).add;
`,
  },
  {
    name: 'ikedaBass',
    category: 'Bass',
    credit: 'meunier.fabien, possibly by Batuhan Bozkurt',
    tags: ['pitched'],
    source: `/* Retrieved from
//from http://sccode.org/1-5aW

Useable as a sub bass or bass drum.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("ikedaBass", {

	arg out = 0, freq = 0, att = 0, dec = 0.1, sus = 0.8, rel = 0.01, curve = -5, gate = 1, pan = 0, amp = 1, harmonic = 14.015, iphase = pi/3;

	var env, snd;

	env = Env.adsr(
	    	attackTime: att,
	    	decayTime: dec,
	    	sustainLevel: sus,
	    	releaseTime: rel,
	    	curve: curve,
	    ).kr(gate: gate, doneAction: 2);

	env = env * amp.curvelin(inMin: 0, inMax: 1, outMin: 0, outMax: 1, curve: log(10));

	snd = SinOsc.ar(
		    //Any value for freq here gets added to the freq of the note (n + 0 = n)
		    freq: 0,
		    //Phase sweeps around a circle at (rate / 2pi) to make a sine wave.
		    phase: (Sweep.ar(trig: gate, rate: 2pi * [freq, freq * harmonic]) + iphase).wrap(-pi, pi),
	        mul: [1, 0.01]
	    );

	snd = Mix.ar(snd).tanh;

	snd = LeakDC.ar(snd);

	snd = snd * env;

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "meunier.fabien, possibly by Batuhan Bozkurt",
	category: \\bass,
	tags: [\\pitched]
	)
).add;`,
  },
  {
    name: 'ksBass',
    category: 'Bass',
    credit: 'Josh Mitchell',
    tags: ['pitched', 'bass'],
    source: `/*
This is a synthDef based on Karplus-Strong synthesis (just like Pluck.ar).

Karplus-Strong synthesis involves an initial impulse being sent through a delay,
which then, through a feedback loop, creates a sound with a frequency given by
1/(the delay time), which often sounds like a string pluck. There's usually a
filter in the feedback loop of the delay, which is the coef argument of Pluck.
It's pretty important to the string sound. However, it takes math to get the
pitch right when there's any filter in the feedback loop, and I don't really
like the typical Pluck.ar sound anyways.

So, I rebuilt a simpler version of Pluck! The biggest difference aside from the
filter being after the delay line, instead of in a feedback loop, is the initial
pulse I used. Using a sharp impulse produces a saw-like sound, but the initial
shape I made looks a bit like a trapezoid, for a less "buzzy" sound. The shape
of it varies with the impulse Att, Sus, Dec, and Hold parameters; if one is
bigger, that section of the shape lasts for a longer percentage of the waveform.

Stethoscope.new is helpful when playing around with the shape.

I also added a simple compressor, because of the apparent volume level changes
different impulse shapes can cause. If you don't want it, just set ratio to 1.

By Josh Mitchell June 2020
*/

SynthDef("ksBass", {
    arg
	// Standard Values
	out = 0, pan = 0, freq = 100, amp = 1, rel = 1.5,
    // Parameters for the impulse shape
	impulseAtt = 0.5, impulseSus = 1, impulseDec = 0.5, impulseHold = 1,
	// Filter and compressor parameters, thresh goes from 0 to 1.
	filtermin = 250, filtermax = 5000, rq = 0.35, thresh = 0.4, ratio = 2.5;

	var total, exciter, snd;

	// Rescale impulse values for the frequency of the note
	total = (impulseAtt + impulseSus + impulseDec + impulseHold) * freq;

	// Initial impulse
	exciter = Env.new(
		levels: [0, 1, 1, 0, 0],
		times: [impulseAtt, impulseSus, impulseDec, impulseHold]/total).ar;

	// Delay line
	snd = CombN.ar(
		in: exciter,
		maxdelaytime: 0.06,
		delaytime: 1/freq,
		decaytime: rel);

	// LPF
	snd = RLPF.ar(
		in: snd,
		freq: LinExp.ar(Amplitude.ar(in: snd), 0, 1, filtermin, filtermax),
		rq: rq);
	
	// Compressor for fun
	snd = CompanderD.ar(
		in: snd, 
		thresh: thresh, 
		slopeBelow: 1, 
		slopeAbove: 1/ratio);

	// Output stuff
	snd = Mix.ar(snd) * amp;
	snd = Limiter.ar(snd);

	DetectSilence.ar(in: snd, doneAction: 2);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Josh Mitchell",
	category: \\bass,
	tags: [\\pitched, \\bass]
	)
).add;
`,
  },
  {
    name: 'moogBass',
    category: 'Bass',
    credit: 'Nick Collins',
    tags: ['pitched', 'bass'],
    source: `/*
Mitchell Sigman (2011) Steal this Sound. Milwaukee, WI: Hal Leonard Books
pp. 18-19

Adapted for SuperCollider and elaborated by Nick Collins
http://www.sussex.ac.uk/Users/nc81/index.html
under GNU GPL 3 as per SuperCollider license

Minor SynthDef modifications by Bruno Ruviaro, June 2015.
*/

SynthDef("moogBass", {
	arg out = 0, pan = 0, freq = 440, amp = 0.1, gate = 1, cutoff = 1000, gain = 2.0, lagamount = 0.01, att = 0.001, dec = 0.3, sus = 0.9, rel = 0.2, chorus = 0.7;

	var osc, filter, env, filterenv, snd, chorusfx;

	osc = Mix(VarSaw.ar(
		freq: freq.lag(lagamount) * [1.0, 1.001, 2.0],
		iphase: Rand(0.0,1.0) ! 3,
		width: Rand(0.5,0.75) ! 3,
		mul: 0.5));

	filterenv = EnvGen.ar(
		envelope: Env.asr(0.2, 1, 0.2),
		gate: gate);

	filter =  MoogFF.ar(
		in: osc,
		freq: cutoff * (1.0 + (0.5 * filterenv)),
		gain: gain);

	env = EnvGen.ar(
		envelope: Env.adsr(0.001, 0.3, 0.9, 0.2, amp),
		gate: gate,
		doneAction: 2);

	snd = (0.7 * filter + (0.3 * filter.distort)) * env;

	chorusfx = Mix.fill(7, {

		var maxdelaytime = rrand(0.005, 0.02);
		DelayC.ar(
			in: snd,
			maxdelaytime: maxdelaytime,
			delaytime: LFNoise1.kr(
				freq: Rand(4.5, 10.5),
				mul: 0.25 * maxdelaytime,
				add: 0.75 * maxdelaytime)
		)
	});

	snd = snd + (chorusfx * chorus);

	Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Nick Collins",
	category: \\bass,
	tags: [\\pitched, \\bass]
)
).add;`,
  },
  {
    name: 'noQuarter',
    category: 'Bass',
    credit: 'by Eric Sluyter',
    tags: ['pitched', 'bass', 'karplus'],
    source: `/*
By Eric Sluyter
Retrieved from https://sccode.org/1-4YY and
https://sound.stackexchange.com/questions/35138/help-me-make-a-patch-for-this-bass-stab-pluck

Slightly reformatted by Bruno Ruviaro November 2019.

from Eric:
"You could definitely use any number of hardware synths or plugins to do the same thing. General method I used, create a "pluck" sound with Karplus-Strong synthesis, and combine with a triangle wave, sine wave, and sub sine (sine wave at 1/2 the frequency). I also added a "click" at the beginning to give a little more punch. Then used enveloped resonant low pass filters to give it that synthy twang, and applied a little distortion to give it some color."
*/

SynthDef("noQuarter", {
	arg
	// Standard Arguments
	out = 0, freq = 440, amp = 0.1, pan = 0, att = 0, rel = 1, curve = -4;

	var subfreq = freq / 2;

	// Envelopes
	var subenv = Env.perc(attackTime: att, releaseTime: rel, level: amp, curve: curve).kr(doneAction: 2);
	var env = Env.perc(att, rel/2, amp, curve).kr;

	// Component synthesis
	var pluck = Pluck.ar(
		in: PinkNoise.ar,
		trig: 1,
		maxdelaytime: 0.2,
		delaytime: subfreq.reciprocal
	) * subenv * 2;
	var tri = VarSaw.ar(freq) * env;
	var sin = SinOsc.ar(freq) * env;
	var sub = (SinOsc.ar([subfreq, subfreq - 2, subfreq + 2]).sum * subenv).tanh;
	var click = RLPF.ar(
		in: Impulse.ar(0),
		freq: [2000, 8000],
		rq: 1
	).sum * 1000;

	// Initial signal
	var snd = pluck + tri + sub + click;

	// Resonant LPFs
	snd = RLPF.ar(
		in: snd,
		freq: XLine.ar(freq * 100, freq * 10, 0.15)
	);
	snd = snd + (MoogFF.ar(in: snd, freq:  freq * 20, gain: 2.5) * 0.1);

	// EQ resulting signal
	snd = BPeakEQ.ar(snd, 400, 0.5, -9);
	snd = BPeakEQ.ar(snd, 2000, 0.5, 6);
	snd = BHiShelf.ar(snd, 8000, 1, 3);
	snd = BPeakEQ.ar(snd, 200, 1, 3);

	// Apply another envelope to dampen a bit more
	snd = snd * XLine.kr(1, 0.6, 0.1);

	// Tanh distortion / limiting
	snd = (snd * 1).tanh;

	// Another round of signal coloring, using another RLPF
	// and sine components
	snd = snd +
	RLPF.ar(
		in: snd,
		freq: XLine.ar(freq * 100, freq * 10, 0.15)
	) + sin + sub;

	// Another round of tanh distortion / limiting
	snd = (snd / 2.3).tanh;

	// Another resonant LPF
	snd = MoogFF.ar(
		in: snd,
		freq: XLine.ar(freq*150, freq*30, 0.1),
		gain:  0.1
	);

	snd = Pan2.ar(snd, pan);
	Out.ar(out, snd);
},
metadata: (
	credit: "by Eric Sluyter",
	category: \\bass,
	tags: [\\pitched, \\bass, \\karplus]
	)
).add;`,
  },
  {
    name: 'rubberBand',
    category: 'Bass',
    credit: 'Josh Mitchell',
    tags: ['pitched'],
    source: `/*
A silly little sound from my ongoing quest to make Pluck sound a little bit
less like Pluck. Here, the sound going in isn't a normal short impulse, but
a sine wave that gets quickly swept from one frequency down (or up!) to
another one. The idea comes from some percussion and modal synthesis
experiments I've done, and I wondered what this same technique would do to
Pluck. Turns out, it sounds kinda like a cartoony rubber band! So, I added a
little bit of pitch bend at the beginning of the note, controlled by bendTime
and bendMultiple, and called it a day.

By Josh Mitchell July 2020.
*/

SynthDef(\\rubberBand, {
	arg
	// Standard Values
	out = 0, amp = 1, freq = 75, pan = 0, att = 0, rel = 1,
	// Impulse arguments (onFraction goes from 0 to 1, coef from -1 to 1)
	bendMultiple = 0.25, bendTime = 0.075, impulseStartFreq = 800,
	impulseStopFreq = 120, onFraction = 1, coef = 0.125;

	var impulse, freqline, snd;

	// Stuff that gets sent into Pluck
	freqline = Line.ar(
		start: freq * bendMultiple,
		end: freq,
		dur: bendTime);

	impulse = SinOsc.ar(
		freq: Line.ar(
			start: impulseStartFreq,
			end: impulseStopFreq,
			dur: 1/freq * onFraction));

	// Pluck
    snd = Pluck.ar(
	    in: impulse,
	    trig: Impulse.ar(0),
	    maxdelaytime: 1/(freq * bendMultiple),
	    delaytime: 1/freqline,
	    decaytime: rel,
	    coef: coef,
		mul: amp);

	// Output Stuff
    DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Josh Mitchell",
	category: \\bass,
	tags: [\\pitched]
	)
).add;
`,
  },
  {
    name: 'subBass1',
    category: 'Bass',
    credit: 'Josh Mitchell, 2019',
    tags: ['pitched', 'sub'],
    source: `/*
A sub Bass based on octave-down guitar/bass effects from the 80s or so.
In particular, this version is based on the famous Boss oc2 pedal.

Josh Mitchell, 8/19.
*/

SynthDef(\\subBass1, {
    arg
	//Blend goes from 0 to 1
	out = 0, amp = 0.5, pan = 0, freq = 440, att = 0.001, rel = 0.15, curve = -8, blend = 0.5;

    var env, in, ina, synca, octa, inb, syncb, octb, octave, snd;

    //A slightly rounded percussive envelope
	env = Env.perc(att, rel, amp, [curve, -1 * curve]).kr(doneAction: 2);

	//Input wave - To use SinOsc.ar, replace "iphase: 2" with "phase: 3pi/2"
	in = LFPar.ar(freq: freq * 2, iphase: 2);

	//Mirroring the wave around the x-axis
	ina = in.range(0, 1);
	inb = ina * -1;

	//Two square waves exactly out of phase and an octave below the input wave
	synca = LFPulse.ar(freq: freq, iphase: 0);
	syncb = LFPulse.ar(freq: freq, iphase: 0.5);

	//This smoothly swaps between outputting the input wave and its mirror
	octa = ina * synca;
	octb = inb * syncb;
	octave = Mix.ar([octa, octb]);

	//Mixer stage, volume adjustments, envelope, and output
	snd = Mix.ar([octave * blend * 0.5, in * (1 - blend) * 0.25]);
	snd = LeakDC.ar(snd);
	snd = Limiter.ar(in: snd, level: 1);
	snd = snd * env;

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Josh Mitchell, 2019",
	category: \\bass,
	tags: [\\pitched, \\sub]
	)
).add;`,
  },
  {
    name: 'subBass2',
    category: 'Bass',
    credit: 'Josh Mitchell, 2019',
    tags: ['pitched', 'sub'],
    source: `/*
A sub Bass based on octave-down guitar/bass effects from the 80s or so.
This version changes where on the input wave switching happens,
meaning the sub octave is more distorted and gritty than subBass1.

Josh Mitchell, 8/19.
*/

SynthDef(\\subBass2, {
    arg
	//Blend goes from 0 to 1
	out = 0, amp = 0.5, pan = 0, freq = 440, att = 0.001, rel = 1, curve = 8, blend = 0.5;

    var env, in, ina, synca, octa, inb, syncb, octb, octave, snd;

	//A slightly rounded percussive envelope
	env = Env.perc(att, rel, amp, [curve, -1 * curve]).kr(doneAction: 2);

	/*  Input wave +/- 90 degrees - To use SinOsc.ar, replace:
	        -"iphase:  0" with "phase: pi/2"
	        -"iphase:  1" with "phase: 0"
	        -"iphase: -1" with "phase: pi"   */
	in = LFPar.ar(freq: freq * 2, iphase: 0);
	ina = LFPar.ar(freq: freq * 2, iphase: 1);
	inb = LFPar.ar(freq: freq * 2, iphase: -1);

	//Two square waves exactly out of phase and an octave below the input wave
	synca = LFPulse.ar(freq: freq, iphase: 0);
	syncb = LFPulse.ar(freq: freq, iphase: 0.5);

	//This smoothly swaps between outputting the +90 degree wave and -90 degree wave
	octa = ina * synca;
	octb = inb * syncb;
	octave = Mix.ar([octa, octb]);

	//Mixer stage, volume adjustments, envelope, and output
	snd = Mix.ar([octave * blend, in * (blend - 1)]);
    snd = LeakDC.ar(snd);
	snd = Limiter.ar(in: snd, level: 1);
	snd = snd * env;


	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Josh Mitchell, 2019",
	category: \\bass,
	tags: [\\pitched, \\sub]
	)
).add;`,
  },
  {
    name: 'glockenspiel',
    category: 'Bells',
    credit: 'http://sccode.org/1-5aD',
    tags: ['pitched'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Glockenspiel, xylophone, and tubularBell are all based on a very similar structure.
By nicolaariutti and edited by Zé Craum
http://sccode.org/1-5ay#c835

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\glockenspiel, {
	arg freq = 440, amp = 0.01, pan = 0, out = 0, att = 0.001, rel = 6, exciterRel = 0.05;

	var env, snd, exciter;

	env = Env.perc(att, exciterRel, 0.25).kr;

	exciter = WhiteNoise.ar(env);

	snd = DynKlank.ar(
		specificationsArrayRef:
	        	Ref.new([
	        		[1, 2, 2.803, 3.871, 5.074, 7.81, 10.948, 14.421],   // harmonics
			        [1, 0.044, 0.891, 0.0891, 0.794, 0.1, 0.281, 0.079], // amplitudes
		        	[1, 0.205, 1, 0.196, 0.339, 0.047, 0.058, 0.047]     // ring times
		        ]),
		input: exciter,
		freqscale: freq,
		decayscale: rel
	);

	DetectSilence.ar(
		        in: snd,
		        amp: 0.001,
		        time: 0.5,
		        doneAction: 2
		    );

	snd = snd * 0.1;

	Out.ar(out, Pan2.ar(snd, pan, amp));
},
metadata: (
	credit: "http://sccode.org/1-5aD",
	category: \\bells,
	tags: [\\pitched]
	)
).add`,
  },
  {
    name: 'prayerBell',
    category: 'Bells',
    credit: 'by wondersluyter',
    tags: ['percussion', 'bell', 'prayer', 'tibetan'],
    source: `/*
Retrieved from
http://sccode.org/1-5aD

Tibetan prayer bells acoustically modeled
by wondersluyter
http://sccode.org/wondersluyter

Slightly modified by Bruno Ruviaro, 2019.
*/

SynthDef("prayerBell", { arg out, singSwitch = 0, freq = 2434, amp = 0.5, decayScale = 1, lag = 10, pan = 0;
	var snd, input, first, freqScale, mallet, sing;
	freqScale = freq / 2434;
	freqScale = Lag3.kr(freqScale, lag);
	decayScale = Lag3.kr(decayScale, lag);

	// mallet
	mallet = LPF.ar(
		in: Impulse.ar(0) ! 2 * amp,
		freq: 10000 * freqScale
	);

	// sing
	sing = LPF.ar(
		in: {PinkNoise.ar * Integrator.kr(singSwitch * 0.001, 0.999).linexp(0, 1, 0.01, 1) * amp} ! 2,
		freq: 2434 * freqScale
	);

	sing = sing + Dust.ar(0.1);
	sing = LPF.ar(sing, 10000 * freqScale);
	sing = sing * LFNoise1.kr(0.5).range(-45, -30).dbamp;

	// input = mallet + sing
	input = mallet + (singSwitch.clip(0, 1) * sing);

	// resonant filter bank
	snd = DynKlank.ar(
		specificationsArrayRef: \`[
			// Array of filter frequencies
			[
				(first = LFNoise1.kr(0.5).range(2424, 2444)) + Line.kr(20, 0, 0.5),
				first + LFNoise1.kr(0.5).range(1,3),
				LFNoise1.kr(1.5).range(5435, 5440) - Line.kr(35, 0, 1),
				LFNoise1.kr(1.5).range(5480, 5485) - Line.kr(10, 0, 0.5),
				LFNoise1.kr(2).range(8435, 8445) + Line.kr(15, 0, 0.05),
				LFNoise1.kr(2).range(8665, 8670),
				LFNoise1.kr(2).range(8704, 8709),
				LFNoise1.kr(2).range(8807, 8817),
				LFNoise1.kr(2).range(9570, 9607),
				LFNoise1.kr(2).range(10567, 10572) - Line.kr(20, 0, 0.05),
				LFNoise1.kr(2).range(10627, 10636) + Line.kr(35, 0, 0.05),
				LFNoise1.kr(2).range(14689, 14697) - Line.kr(10, 0, 0.05)
			],
			// Array of filter amplitudes
			[
				LFNoise1.kr(1).range(-10, -5).dbamp,
				LFNoise1.kr(1).range(-20, -10).dbamp,
				LFNoise1.kr(1).range(-12, -6).dbamp,
				LFNoise1.kr(1).range(-12, -6).dbamp,
				-20.dbamp,
				-20.dbamp,
				-20.dbamp,
				-25.dbamp,
				-10.dbamp,
				-20.dbamp,
				-20.dbamp,
				-25.dbamp
			],
			// Array of filter decay times
			[
				20 * freqScale.pow(0.2),
				20 * freqScale.pow(0.2),
				5,
				5,
				0.6,
				0.5,
				0.3,
				0.25,
				0.4,
				0.5,
				0.4,
				0.6
			] * freqScale.reciprocal.pow(0.5)
		],
		input: input,
		freqscale: freqScale,
		freqoffset: 0,
		decayscale: decayScale
	);

	DetectSilence.ar(snd, doneAction: 2);

	Out.ar(out, Pan2.ar(Mix.ar(snd), pan));
},
metadata: (
	credit: "by wondersluyter",
	category: \\bells,
	tags: [\\percussion, \\bell, \\prayer, \\tibetan]
)
).add;`,
  },
  {
    name: 'pulseRisset',
    category: 'Bells',
    credit: 'by Bruno Tucunduva Ruviaro, based on Jean-Claude Risset\'s bell',
    tags: ['percussion', 'bell', 'inharmonic'],
    source: `SynthDef("pulseRisset", {arg freq = 440, att = 0.01, rel = 11, amp = 0.1, pan = 0, pulseFreq = 8;
    var partials, durs, amps, snd, env;
 	partials = [246.4, 247.4, 404.8, 406.5, 523.6, 748, 880, 1206, 1320, 1654, 1791]; // original freqs
	partials = (partials / 440) * freq; // consider 440 the 'root'
	durs = [11, 10, 7, 6, 4, 3.4, 3, 2.2, 2, 1.1, 1] / 11;
	amps = durs.linlin(1, 11, 0.2, 1);

	env = Env.perc(
		attackTime: att,
		releaseTime: durs * rel,
		level: amps
	).kr(doneAction: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // only longest env gets doneAction: 2

	snd = Pulse.ar(partials) * env * amp / 11;

	snd = RLPF.ar(
		in: snd,
		freq: freq * LFPulse.ar(pulseFreq).range(2, 4),
		rq: SinOsc.ar(LFNoise2.kr(1).range(4, 9)).range(0.1, 0.3));

	snd = LPF.ar(snd, 12000);
	snd = Limiter.ar(Mix.ar(snd));

	Out.ar(0, Pan2.ar(snd,pan) );
},
metadata: (
	credit: "by Bruno Tucunduva Ruviaro, based on Jean-Claude Risset's bell",
	category: \\bells,
	tags: [\\percussion, \\bell, \\inharmonic]
)
).add;
`,
  },
  {
    name: 'rissetBell',
    category: 'Bells',
    credit: 'based on Jean-Claude Risset\'s bell',
    tags: ['percussion', 'bell', 'inharmonic'],
    source: `SynthDef("rissetBell", { arg out = 0, pan = 0, freq = 400, amp = 0.1, att = 0.005, rel = 2, gate = 1;
	var amps = #[1, 0.67, 1, 1.8, 2.67, 1.67, 1.46, 1.33, 1.33, 1, 1.33];
	var durs = #[1, 0.9, 0.65, 0.55, 0.325, 0.35, 0.25, 0.2, 0.15, 0.1, 0.075];
	var frqs = #[0.56, 0.56, 0.92, 0.92, 1.19, 1.7, 2, 2.74, 3, 3.76, 4.07];
	var dets = #[0, 1, 0, 1.7, 0, 0, 0, 0, 0, 0, 0];
	var doneActionEnv = Env.linen(0, att+rel, 0).ar(gate: gate, doneAction: 2);
	var snd = Mix.fill(11, {arg i;
		var env = Env.perc(
			attackTime: att,
			releaseTime: rel * durs[i],
			level: amps[i],
			curve: att.explin(0.005, 4, -4.5, 0)
	).ar(gate: gate);
		SinOsc.ar(
			freq: freq * frqs[i] + dets[i],
			mul: amp * env
		);
	});
	snd = snd * doneActionEnv * 0.5;
	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "based on Jean-Claude Risset's bell",
	category: \\bells,
	tags: [\\percussion, \\bell, \\inharmonic]
)
).add;`,
  },
  {
    name: 'sosBell',
    category: 'Bells',
    credit: 'dan stowell',
    tags: ['bell', 'percussion', 'pitched', 'additive', 'sos'],
    source: `/* Received from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/sos_bell.scd

Original by dan stowell. based on a sound-on-sound 'synth secrets' tutorial.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("sosBell", {
	arg
	//Standard Values
	freq = 440, out = 0, amp = 0.1, pan = 0, rel = 2, curve = \\lin,
	//ring Controls (wobbleDepth goes from 0 to 1)
	ringAmp = 1, ringRel = 0.9, wobbleDepth = 0.6, wobbleMin = 1, wobbleMax = 1.8,
	//strike Controls
	strikeAmp = 1, strikeDec = 0.01, strikeRel = 0.04, strikeDepth = 0.028, strikeHarmonic = 8,
	//hum Controls
	humAmp = 0.5, humAtt = 0.5, humDec = 0.5, humRel = 1;

	var snd, ring, ringEnv, ringFreqs, strike, strikeEnv, strikeMod, hum, humEnv;

	ringFreqs = [2, 3, 4.1, 5.43, 6.8, 8.21];

	ringEnv = Env.new(
		            levels: [1, 0.3, 0.2, 0],
		            times: [1/3, 1/3, 1/3] * ringRel * rel,
		            curve: curve).kr;

	ring = SinOsc.ar(
		            freq: ringFreqs * freq,
		            mul: Array.series(6, 1, -0.1) * ringEnv);

	ring = ring * LFTri.ar(
		            freq: {Rand(wobbleMin, wobbleMax)}.dup(6)).range((1 - wobbleDepth), 1);

	strikeEnv = Env.new(
		            levels: [1, 0.1, 0],
		            times: [strikeDec, strikeRel * rel],
		            curve: curve).kr;

	strikeMod = LFNoise1.ar(freq * 36).range(1/ (strikeDepth + 1), strikeDepth + 1);

	strike = SinOsc.ar(
                    freq: freq * strikeHarmonic * strikeMod,
		            mul: strikeEnv);

	humEnv = Env.new(
		            levels: [0, 1, 0.8, 0],
		            times: [humAtt, humDec, humRel * rel],
		            curve: curve).kr;

	hum = SinOsc.ar(
		            freq: freq * [1.01, 0.47],
		            mul: humEnv);

	snd = Mix.ar((ring * ringAmp) + (strike * strikeAmp) + (hum * humAmp)) * amp;

	DetectSilence.ar(in: snd, doneAction: 2);

	snd = snd * 0.5;

    Out.ar(out, Pan2.ar(snd, pan));


},
metadata: (
	credit: "dan stowell",
	category: \\bells,
	tags: [\\bell, \\percussion, \\pitched, \\additive, \\sos]
	)
).add;`,
  },
  {
    name: 'tubularBell',
    category: 'Bells',
    credit: 'nicolaariutti, Zé Craum, Josh Mitchell',
    tags: ['pitched', 'tubular', 'bell'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Glockenspiel, xylophone, and tubularBell are all based on a very similar structure.
By nicolaariutti and edited by Zé Craum
http://sccode.org/1-5ay#c835

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\tubularBell, {
	arg freq = 440, amp = 0.1, pan = 0, out = 0, att = 0.005, rel = 9, exciterRel = 0.05;

	var env, snd, exciter;

	env = Env.perc(att, exciterRel, 0.05).kr;

	exciter = GrayNoise.ar(env);

	snd = DynKlank.ar(
		specificationsArrayRef:
	        	Ref.new([
	        		[1.013, 1.512, 2.113, 2.525, 3.35, 4.57, 6.48],   // harmonics
			        [1, 0.78, 0.89, 0.63, 0.31, 0.56, 0.25], // amplitudes
		        	[1, 0.9, 0.8, 0.65, 0.45, 0.3, 0.1]     // ring times
		        ]),
		input: exciter,
		freqscale: freq,
		decayscale: rel
	);

	snd = LPF.ar(snd, freq * 9.5);

	DetectSilence.ar(
		        in: snd,
		        amp: 0.001,
		        time: 0.5,
		        doneAction: 2
		    );

	Out.ar(out, Pan2.ar(snd, pan, amp));
},
metadata: (
	credit: "nicolaariutti, Zé Craum, Josh Mitchell",
	category: \\bells,
	tags: [\\pitched, \\tubular, \\bell]
	)
).add;
`,
  },
  {
    name: 'blueNoise',
    category: 'Drums',
    credit: 'Josh Mitchell',
    tags: ['noise', 'unpitched', 'cymbal'],
    source: `/*
Isn't it weird how supercollider offers pink, brown, and even gray noise, but not blue or purple?

Don't worry, this SynthDef offers a rough fix to supercollider's most urgent problem!
It uses a technique borrowed from diy synth schematics found online,
of sending white noise through a bunch of parallel filters.

Blue noise is the opposite of pink noise, it increases in volume 3dB every octave.
This probably makes it good for cymbals.
Now you can grab the code below and explore with it!

Made by Josh Mitchell, 8/19.
*/

SynthDef("blueNoise", {
	arg out = 0, pan = 0, amp = 0.1, gate = 1, att = 0.01, rel = 0.75, curve = -6;

	var noise, a, b, c, d, e, f, g, h, i, env, snd;

	noise = WhiteNoise.ar(1);

	a = HPF.ar(noise, 62,    1/9);
	b = HPF.ar(noise, 125,   1/9);
	c = HPF.ar(noise, 250,   1/9);
	d = HPF.ar(noise, 500,   1/9);
	e = HPF.ar(noise, 1000,  1/9);
	f = HPF.ar(noise, 2000,  1/9);
	g = HPF.ar(noise, 4000,  1/9);
	h = HPF.ar(noise, 8000,  1/9);
	i = HPF.ar(noise, 16000, 1/9);

	env = Env.perc(att, rel, amp, curve).kr(doneAction: 2);

	snd = Mix([a, b, c, d, e, f, g, h, i]) * env;

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Josh Mitchell",
	category: \\drums,
	tags: [\\noise, \\unpitched, \\cymbal]
	)
).add;`,
  },
  {
    name: 'clapElectro',
    category: 'Drums',
    credit: 'Nathan Ho aka Snappizz, http://sccode.org/1-523',
    tags: ['unpitched', 'clap', 'electronic', 'percussion'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Original by Nathan Ho aka Snappizz, http://sccode.org/1-523

**Note: Cool reverse-snare type sounds can be achieved with a slightly longer attack**

Modified By Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("clapElectro", {
    arg
	//Standard Arguments
	out = 0, amp = 0.5, pan = 0, att = 0.02, rel = 0.2, curve = -4,
	//Other Controls: mix is 0 - 1, fadeTime is a fraction of noise1's length.
	mix = 0.6, fadeFreq = 4000, fadeTime = 0.52;

    var env1, env2, snd, noise1, noise2;

    // noise 1: four short repeats
    env1 = Env.new(
            levels: [0, 1, 0, 0.9, 0, 0.7, 0, 0.5, 0],
            times: [att / 20, 0.009, 0, 0.008, 0, 0.01, 0, 0.03],
            curve: [0, curve, 0, curve, 0, curve, 0, curve]
        ).kr;

    noise1 = WhiteNoise.ar(env1);
	noise1 = HPF.ar(in: noise1, freq: 600);
    noise1 = LPF.ar(
		    in: noise1,
		    freq: XLine.kr(start: 7200, end: fadeFreq, dur: fadeTime * 0.058)
	    );
    noise1 = BPF.ar(in: noise1, freq: 1620, rq: 3);

    // noise 2: one longer single burst
	env2 = Env.perc(attackTime: att, releaseTime: rel, curve: [0, curve]).kr;

    noise2 = WhiteNoise.ar(env2);
    noise2 = HPF.ar(in: noise2, freq: 1000);
    noise2 = LPF.ar(in: noise2, freq: 7600);
    noise2 = BPF.ar(in: noise2, freq: 1230, rq: 0.7);

	//Mixing
	snd = Mix.ar((mix * noise1) + ((1 - mix) * noise2));
	snd = (snd * 2).softclip;
	snd = snd * amp;

	DetectSilence.ar(in: snd, doneAction: 2);

    Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Nathan Ho aka Snappizz, http://sccode.org/1-523",
	category: \\drums,
	tags: [\\unpitched, \\clap, \\electronic, \\percussion]
	)
).add;`,
  },
  {
    name: 'clapGray',
    category: 'Drums',
    credit: 'Josh Mitchell, 2019',
    tags: ['clap', 'percussion'],
    source: `/*
By Josh Mitchell, August 2019
SCLOrk - Santa Clara Laptop Orchestra
Santa Clara University

Inspired by
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/clap_oto309.scd

Some of the modifications from oto309:
-Instead of Env.new, the Synthdef now sends env1 through a delay line
-Light reverb added for a more realistic sound
-GrayNoise instead of WhiteNoise
*/

SynthDef("clapGray", {
	arg
	//Standard Values
	out = 0, amp = 0.1, pan = 0, att = 0.001, rel = 0.25, curve = -4,
	//Other Controls
	spreadRate = 75, minDelay = 0.025, maxDelay = 0.05, decay = 0.15, rq = 0.4,
	//Controls from 0 - 1
	blend = 0.7, reverb = 0.1, size = 0.25, damp = 1;

	var env1, env2, snd, noise1, noise2, spread;

	//Multiple Shorter Claps
	spread = LFNoise1.kr(spreadRate).range(minDelay, maxDelay);

	env1 = Env.perc(attackTime: att / 10, releaseTime: rel / 8, curve: [0, curve]).kr;
	env1 = CombC.ar(in: env1, maxdelaytime: maxDelay, delaytime: spread, decaytime: decay);

	noise1 = GrayNoise.ar(env1); //Play with frequencies here:
	noise1 = RHPF.ar(in: noise1, freq: 1000, rq: rq);
	noise1 = BPF.ar(in: noise1, freq: 2000, rq: 3);

	//One Longer Clap
	env2 = Env.perc(attackTime: att, releaseTime: rel, curve: [0, curve]).kr;

	noise2 = GrayNoise.ar(env2); //Play with frequencies here:
	noise2 = RHPF.ar(in: noise2, freq: 1200, rq: rq);
	noise2 = BPF.ar(in: noise2, freq: 1400, rq: 0.7);

	//Mixing and light Reverb
	snd = Mix.ar((blend * noise1) + ((1 - blend) * noise2));
	snd = (snd * 2).softclip;
	snd = FreeVerb.ar(in: snd, mix: reverb, room: size, damp: damp, mul: amp);

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Josh Mitchell, 2019",
	category: \\drums,
	tags: [\\clap, \\percussion]
	)
).add;`,
  },
  {
    name: 'clapOto309',
    category: 'Drums',
    credit: '08091500Acid309 by otophilia',
    tags: ['clap', 'percussion'],
    source: `/*
Retrieved from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/clap_oto309.scd

*/

SynthDef("clapOto309", {
	arg out = 0, amp = 0.1, pan = 0;
	var env1, env2, snd, noise1, noise2;

	env1 = Env.new(
		levels: [0, 1, 0, 1, 0, 1, 0, 1, 0],
		times: [0.001, 0.013, 0, 0.01, 0, 0.01, 0, 0.03],
		curve: [0, -3, 0, -3, 0, -3, 0, -4]
	).ar;
	env2 = Env.new(
		levels: [0, 1, 0],
		times: [0.02, 0.3],
		curve: [0, -4]
	).ar(doneAction: 2);

	noise1 = WhiteNoise.ar(env1);
	noise1 = HPF.ar(noise1, 600);
	noise1 = BPF.ar(noise1, 2000, 3);

	noise2 = WhiteNoise.ar(env2);
	noise2 = HPF.ar(noise2, 1000);
	noise2 = BPF.ar(noise2, 1200, 0.7, 0.7);

	snd = noise1 + noise2;
	snd = snd * 2;
	snd = snd.softclip * amp;

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "08091500Acid309 by otophilia",
	category: \\drums,
	tags: [\\clap, \\percussion]
	)
).add;`,
  },
  {
    name: 'cymbal808',
    category: 'Drums',
    credit: 'Published on sc-users 2007-08-25 by Ryan Brown',
    tags: ['808', 'hihat', 'percussion', 'cymbal', 'unpitched'],
    source: `/*
Retrieved from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/cymbal808_ryan.scd

Published on sc-users 2007-08-25 by Ryan Brown

alternate freqs values found in original:
	[78.6, 140.44, 123.87, 219.4, 787.5, 531.3];
	[300, 402.6, 369.36, 495.96, 585.69, 645.69];
	[205.35, 254.29, 294.03, 304.41, 369.64, 522.71];

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\cymbal808, {
	arg
	//Standard Values:
	out = 0, pan = 0, att = 0.002, dec = 0.25, rel = 0.05, amp = 0.1,
	//Other Controls:
	freqMultiplier = 4.09, decLevel = 0.4, reverb = 0.33, size = 0.5, damp = 0.5;

	var snda, sndb, snd, env, pulseEnv, freqs;

	freqs = [205.35, 304.41, 369.64, 522.71, 540.54, 812.21];

	env = Env.new(
		levels: [0, 1, decLevel, 0],
		times: [att, dec, rel],
		curve: [0, -0.5, 0]
	).kr;

	pulseEnv = Env.new(
		levels: [1.0, 0.6],
		times: dec,
		curve: -0.5
	).kr;

	snd = Mix.ar(LFPulse.ar(freq: freqs * 4.09));

	snd = (BinaryOpUGen('==', snd, 6.0) * 0.6) + (BinaryOpUGen('==', snd, 2.0) * 0.2) + (BinaryOpUGen('==', snd, 1.0) * 0.9);

	snd = (snd * pulseEnv) + Mix.ar(LFPulse.ar(freq: freqs, width: 0.55, mul: 0.9));

	snd = RLPF.ar(in: snd, freq: 7000, rq: 0.6);
 	snd = RHPF.ar(in: snd, freq: 6800, rq: 1.5);
	snd = RHPF.ar(in: snd, freq: 6800, rq: 1.5);
	snd = RHPF.ar(in: snd, freq: 1200, rq: 1.5);

	snd = snd + FreeVerb.ar(in: snd, mix: reverb, room: size, damp: damp);
	snd = Mix.ar(snd);
	snd = snd * env * amp;

	DetectSilence.ar(in: snd, doneAction: 2);

	OffsetOut.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Published on sc-users 2007-08-25 by Ryan Brown",
	category: \\drums,
	tags: [\\808, \\hihat, \\percussion, \\cymbal, \\unpitched]
	)
).add;`,
  },
  {
    name: 'cymbalicMCLD',
    category: 'Drums',
    credit: 'Dan Stowell',
    tags: ['percussion', 'cymbal', 'gong', 'inharmonic', 'additive', 'subtractive'],
    source: `/*
Recieved from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/cymbalic_mcld.scd

Based on the example at
http://www.mcld.co.uk/cymbalsynthesis/
published 2008 by Dan Stowell
Synth(\\cymbalic_mcld)

Modified by Bruno Ruviaro and Josh Mitchell 8/19
*/

SynthDef(\\cymbalicMCLD, {

	arg
	//Standard Values
	out = 0, pan = 0, amp = 0.5, att = 0.001, rel = 0.5, curve = -4,
	//Filter Frequencies
	lodriverMax = 20000, lodriverMin = 10, hidriverMax = 10001, hidriverMin = 1, hiAtt = 1, hiRel = 3, loAtt = 0.5, loRel = 5;

	var lodriver, locutoffenv, hidriver, hicutoffenv, freqs, snd, thwack, env;

	locutoffenv = Env.perc(attackTime: loAtt, releaseTime: loRel, level: (lodriverMax - lodriverMin), curve: curve).kr;

	lodriver = LPF.ar(WhiteNoise.ar(0.1), (locutoffenv + lodriverMin));

	hicutoffenv = Env.perc(attackTime: hiAtt, releaseTime: hiRel, level: (hidriverMax - hidriverMin), curve: curve).kr;

	hidriver = HPF.ar(WhiteNoise.ar(0.1), (hidriverMax - hicutoffenv));
	hidriver = hidriver * Env.perc(attackTime: hiAtt, releaseTime: 2/3 * hiRel, level: 0.25).kr;

	thwack = Env.perc(attackTime: att, releaseTime: att).kr;

	// This bit will regenerate new freqs every time you evaluate the SynthDef!
	freqs = {exprand(300, 20000)}.dup(100);

	env = Env.new(levels: [0, amp, amp, 0], times: [att, (loRel + hiRel), rel]).kr(doneAction: 2);

	snd = Ringz.ar(in: lodriver + hidriver + thwack, freq: freqs).mean;
	snd = Mix.ar([(snd * 1), (lodriver * 2), thwack]);
	snd = snd * env;
	snd = Limiter.ar(snd, amp);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Dan Stowell",
	category: \\drums,
	tags: [\\percussion, \\cymbal, \\gong, \\inharmonic, \\additive, \\subtractive]
	)
).add;`,
  },
  {
    name: 'hashercymbal',
    category: 'Drums',
    credit: 'Josh Mitchell',
    tags: ['unpitched', 'cymbal', 'noisy'],
    source: `/*
Here's yet another cymbal synthdef. This one's kind of cool in that it uses a
hash function to generate a really small chunk of sampled noise, which repeats
with a frequency set by looprate. Then, this just gets sampled at a lower rate
than supercollider's internal sample rate (see the decimator SynthDef for more
on that), and sent through a high pass filter with a fairly smooth slope across
most of the audible range of the sound.

The samplerate control seems to affect the pitch of the signal more directly than
the looprate control, but they do interact a lot, so it's probably easiest to just
play around with both of these controls.

The timbre control just alters the values the hash function sees, causing a slight
change in timbre. If it's changed continually during a note, you can get some
interesting noises.

By Josh Mitchell June 2020
*/

SynthDef("hashercymbal", {
    arg
	//Standard Values
	out = 0, pan = 0, amp = 0.1, att = 0.001, rel = 0.25, crv = -6,
    //Other controls
	timbre = 0, looprate = 10000, samplerate = 18500;

	var env, snd;

	// Envelope
	env = Env.perc(
		attackTime: att,
		releaseTime: rel,
		level: amp,
		curve: crv).ar(doneAction: 2);

	// Generating a loop of the same scrambled values to use as a noise source
	snd = Impulse.ar(freq: looprate, mul: 2, add: -1);
	snd = Sweep.ar(snd) + timbre;
	snd = Hasher.ar(in: snd);

	// Aliasing the noise and filtering out low frequencies
	snd = Latch.ar(
		in: snd,
		trig: Impulse.ar(
			freq: samplerate.clip(20, SampleRate.ir/2),
			mul: 2,
			add: -1));
	snd = HPF.ar(
		in: snd,
		freq: [62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
		mul: [1/9, 2/9, 3/9, 4/9, 5/9, 6/9, 7/9, 8/9, 9/9]);

	// Output stuff
	snd = Mix.ar(snd) * env;
	snd = Limiter.ar(snd);

	Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Josh Mitchell",
	category: \\drums,
	tags: [\\unpitched, \\cymbal, \\noisy]
	)
).add;`,
  },
  {
    name: 'hihat1',
    category: 'Drums',
    credit: 'Bruno Tucunduva Ruviaro',
    tags: ['percussion', 'hihat'],
    source: `SynthDef("hihat1", {arg out = 0, amp = 0.5, att = 0.01, rel = 0.2, ffreq = 6000, pan = 0;
	var snd = WhiteNoise.ar(amp);
	var env = Env.perc(att, rel).kr(doneAction: 2);
	snd = HPF.ar(snd * env, ffreq);
	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Bruno Tucunduva Ruviaro",
	category: \\drums,
	tags: [\\percussion, \\hihat]
)
).add;`,
  },
  {
    name: 'hihatElectro',
    category: 'Drums',
    credit: 'By Nathan Ho aka Snappizz',
    tags: ['clap', 'percussion', 'hihat'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

By Nathan Ho aka Snappizz
http://sccode.org/1-523

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("hihatElectro", {
    arg out = 0, pan = 0, amp = 0.3, att = 0.001, rel = 0.3, curve = -8, filterFreq = 4010, rq = 0.56;

    var env, snd;

    // noise -> resonance -> exponential dec envelope
    env = Env.perc(attackTime: att, releaseTime: rel, curve: curve).kr(doneAction: 2);

	snd = ClipNoise.ar(amp);
	snd = BPF.ar(
		in: snd,
		freq: [1, 1.035] * filterFreq,
		rq: [0.27, 1] * rq,
		mul: [1.0, 0.6]
	);
	snd = Mix(snd) * env;

    Out.ar(out, Pan2.ar(snd, pan));

	},
metadata: (
	credit: "By Nathan Ho aka Snappizz",
	category: \\drums,
	tags: [\\clap, \\percussion, \\hihat]
	)
).add;`,
  },
  {
    name: 'kick1',
    category: 'Drums',
    credit: 'Bruno Tucunduva Ruviaro',
    tags: ['percussion', 'kick'],
    source: `SynthDef("kick1", {arg out = 0, amp = 0.3, sinFreq = 60, glissf = 0.9, att = 0.01, rel = 0.45, pan = 0;
	var gliss = XLine.kr(sinFreq, sinFreq*glissf, rel);
	var snd = SinOsc.ar(gliss);
	var env = Env.perc(att, rel).kr(doneAction: 2);
	snd = snd * env * amp;
	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Bruno Tucunduva Ruviaro",
	category: \\drums,
	tags: [\\percussion, \\kick]
)
).add;`,
  },
  {
    name: 'kick808',
    category: 'Drums',
    credit: 'unknown',
    tags: ['percussion', 'kick', '808'],
    source: `SynthDef("kick808", {arg out = 0, freq1 = 240, freq2 = 60, amp = 1, ringTime = 10, att = 0.001, rel = 1, dist = 0.5, pan = 0;
	var snd, env;
	snd = Ringz.ar(
		in: Impulse.ar(0), // single impulse
		freq: XLine.ar(freq1, freq2, 0.1),
		decaytime: ringTime);
	env = Env.perc(att, rel, amp).kr(doneAction: 2);
	snd = (1.0 - dist) * snd + (dist * (snd.distort));
	snd = snd * env;
	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "unknown",
	category: \\drums,
	tags: [\\percussion, \\kick, \\808]
)
).add;
`,
  },
  {
    name: 'kickBlocks',
    category: 'Drums',
    credit: 'originals by Nathan Ho aka snapizz',
    tags: ['bass'],
    source: `/*
This SynthDef combines three kick SynthDefs by Nathan Ho that use very similar building blocks.
It should be very easy to add more of the same blocks for even more layers!

Originals use Hasher.ar(Sweep.ar) as a quick way to generate deterministic white noise,
to get exactly the same kick each time for a precise digital sampler effect.
WhiteNoise.ar should work too.

Some of the attacks are so fast that Env:kr doesn't correctly handle them.

Modified and combined into one SynthDef by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("kickBlocks", {
	arg
	//Standard Values
	out = 0, pan = 2, amp = 0.4, curve = -4,
	//tone1 arguments
	t1freq = 400, t1harmonic = 2, t1glide = 0.01,
	t1att = 0.0005, t1rel = 0.01, t1curve = -4, t1del = 0, t1amp = 1,
	//tone2 arguments
	t2freq = 50, t2harmonic = 3.44, t2glide = 0.01,
	t2att = 0.0001, t2rel = 0.3, t2curve = \\lin, t2del = 0.005, t2amp = 1,
	//hit1 arguments
	h1freq = 100, h1harmonic = 8, h1glide = 0.01, h1rq = 0.6,
	h1att = 0.001, h1rel = 0.02, h1curve = -4, h1del = 0.001, h1amp = 1,
	//hit2 arguments
	h2freq = 1320, h2harmonic = 1, h2glide = 0,
	h2att = 0.003, h2rel = 0.03, h2curve = -4, h2del = 0, h2amp = 0.5,
	//click arguments
	cfreq = 6100, crq = 1, camp = 1.41;

    var snd, noise, tone1, tone2, hit1, hit2, click;

	noise = Hasher.ar(Sweep.ar); //deterministic white noise

    tone1 = SinOsc.ar(
		freq: XLine.ar(start: t1freq * t1harmonic, end: t1freq, dur: t1glide),
		mul: Env.perc(attackTime: t1att, releaseTime: t1rel, level: t1amp, curve: t1curve).delay(t1del).ar);

	tone2 = SinOsc.ar(
		freq: XLine.ar(start: t2freq * t2harmonic, end: t2freq, dur: t2glide),
		mul: Env.perc(attackTime: t2att, releaseTime: t2rel, level: t2amp, curve: t2curve).delay(t2del).ar);

    hit1 = BPF.ar(
		in: noise,
		freq: XLine.ar(start: h1freq * h1harmonic, end: h1freq, dur: h1glide),
		rq: h1rq,
		mul: Env.perc(attackTime: h1att, releaseTime: h1rel, level: h1amp, curve: h1curve).delay(h1del).ar);

	hit2 = HPF.ar(
		in: noise,
		freq: XLine.ar(start: h2freq * h2harmonic, end: h2freq, dur: h2glide),
		mul: Env.perc(attackTime: h2att, releaseTime: h2rel, level: h2amp, curve: h2curve).delay(h2del).ar);

	click = BPF.ar(
		in: Impulse.ar(0) * SampleRate.ir / 48000,
		freq:  cfreq,
		rq: crq,
		mul: camp);

	snd = Mix.ar(tone1 + tone2 + hit1 + hit2 + click).tanh * amp;

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "originals by Nathan Ho aka snapizz",
	category: \\drums,
	tags: [\\bass]
	)
).add;`,
  },
  {
    name: 'kickRingz',
    category: 'Drums',
    credit: 'Author Unknown',
    tags: ['unpitched', 'bass'],
    source: `/*
Original Author Unknown.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("kickRingz", {
	arg out = 0, pan = 0, freq = 40, amp = 1, decay = 0.25, ffreq = 1000;

	var snd;

	snd = Ringz.ar(
		    in: LPF.ar(in: Impulse.ar(0), freq: ffreq),
		    freq: freq,
		    decaytime: decay,
		    mul: amp
	);

	snd = snd.tanh.sin * 2;

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Author Unknown",
	category: \\drums,
	tags: [\\unpitched, \\bass]
	)
).add;`,
  },
  {
    name: 'kick_chirp',
    category: 'Drums',
    credit: 'Original by dan stowell. public domain',
    tags: ['kick', 'drum', 'percussion', 'chirp'],
    source: `/* Recieved from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/kick_chrp.scd

A kick made using what radio folks would call a "chirp"

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\kick_chirp, {

	arg out = 0, amp = 0.1, pan = 0, curve = -20, att = 0.001, rel = 0.5, maxFreq = 500;

    var env, snd;

	env = Env.perc(attackTime: att, releaseTime: rel, curve: curve).exprange(0, maxFreq).kr(doneAction: 2);

    snd = SinOsc.ar(freq: env, mul: amp);
    snd = LeakDC.ar(snd);

Out.ar(out, Pan2.ar(snd, pan))
},
metadata: (
	credit: "Original by dan stowell. public domain",
	category: \\drums,
	tags: [\\kick, \\drum, \\percussion, \\chirp]
	)
).add;`,
  },
  {
    name: 'kick_electro',
    category: 'Drums',
    credit: 'By Nathan Ho aka Snappizz',
    tags: ['percussive', 'bass', 'kick', 'electronic'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Original by Nathan Ho aka Snappizz
http://sccode.org/1-523

Modified by Bruno Ruviaro and Josh Mitchell 8/19
*/

SynthDef(\\kick_electro, {
    arg out = 0, pan = 0, amp = 0.3, att = 0.005, rel = 0.3;

    var body, bodyFreq, bodyAmp, pop, popFreq, popAmp, click, clickAmp, snd;

    // body starts midrange, quickly drops down to low freqs, and trails off
    bodyFreq = Env.new(
		    levels: [261, 120, 51],
		    times: [rel / 8.57, rel / 3.75],
		    curve: \\exp
		).kr;

    bodyAmp = Env.linen(
		    attackTime: att,
		    sustainTime: rel / 3,
		    releaseTime: rel
	    ).kr;

    body = SinOsc.ar(freq: bodyFreq, mul: bodyAmp);

    // pop sweeps over the midrange
    popFreq = XLine.kr(start: 750, end: 261, dur: 0.02);

	popAmp = Env.linen(
		    attackTime: att / 5,
		    sustainTime: rel / 15,
		    releaseTime: rel / 30,
		    level: 0.15
	    ).kr;

    pop = SinOsc.ar(freq: popFreq, mul: popAmp);

    // click is spectrally rich, covering the high-freq range
    // you can use Formant, FM, noise, whatever
    clickAmp = Env.perc(
		    attackTime: att / 5,
		    releaseTime: rel / 300,
		    level: 0.15
	    ).kr;

    click = LPF.ar(
	    	in: Formant.ar(fundfreq: 910, formfreq: 4760, bwfreq: 2110),
	    	freq: 3140,
	    	mul: clickAmp
	    );

	//Putting it all together:
	snd = Mix.ar([body, pop, click]);
    snd = snd.tanh * amp;

	DetectSilence.ar(in: snd, doneAction: 2);

    Out.ar(out, Pan2.ar(snd, pan, amp));
},
metadata: (
	credit: "By Nathan Ho aka Snappizz",
	category: \\drums,
	tags: [\\percussive, \\bass, \\kick, \\electronic]
	)
).add;`,
  },
  {
    name: 'kick_oto309',
    category: 'Drums',
    credit: 'Originally from 08091500Acid309 by_otophilia',
    tags: ['kick', 'drum', 'percussion'],
    source: `/* Received from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/kick_oto309.scd

A wide variety of sounds can be achieved through changing the "Other Controls" section.
A siren sound is also available if you extend the attack and release.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("kick_oto309", {
	arg
	//Standard Values:
	out = 0, amp = 0.1, pan = 0, att = 0.005, rel = 0.29, curve = -4,
	//Other Controls:
	filterHarmonic = 1.5, preamp = 1.25, pulseAmp = 0.5, noiseAmp = 1, sineAmp = 1;

	var env, envp, snd;

	env = Env.new(levels: [0.5, 1, 0.5, 0], times: [att, rel * 0.2, rel * 0.9], curve: [curve, curve/2, curve]).kr(doneAction:2);
	envp = Env.new(levels: [110, 59, 29], times: [att, rel], curve: [curve, curve * 1.25]).kr.midicps;

	snd = LFPulse.ar(freq: envp).range(-1 * pulseAmp, pulseAmp);
	snd = snd + WhiteNoise.ar(mul: noiseAmp);
	snd = LPF.ar(in: snd, freq: envp * filterHarmonic, mul: env);
	snd = snd + SinOsc.ar(freq: envp, phase: 0.5, mul: env * sineAmp);

	snd = Mix.ar(snd) * preamp;
	snd = snd.clip2(1) * amp;

	Out.ar(out, Pan2.ar(snd));
},
metadata: (
	credit: "Originally from 08091500Acid309 by_otophilia",
	category: \\drums,
	tags: [\\kick, \\drum, \\percussion]
	)
).add;`,
  },
  {
    name: 'kik3',
    category: 'Drums',
    credit: 'Author Unknown',
    tags: ['unpitched', 'bass'],
    source: `/*
Original Author Unknown

Based on kik.scd and kick3.scd.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("kik3", {
	arg
	//Standard Values
	amp = 1, out = 0, pan = 0, freq = 66,
	//Amplitude Controls
	att = 0.01, dec = 0.1, decaylevel = 0.8, rel = 0.3, envCurve = -4,
	//Timbre Controls
	sweeptime = 0.08, sweepCurve = \\exp, harmonic = 6, preamp = 3;

	var snd, env, fenv;

	env = Env.new(levels: [0, amp, decaylevel * amp, 0], times: [att, dec, rel], curve: envCurve).kr(doneAction: 2);

	fenv = Env.new(levels: [freq * harmonic, freq], times: [sweeptime], curve: sweepCurve).kr;

	snd = SinOsc.ar(freq: fenv, mul: preamp).distort;

    snd = Normalizer.ar(in: snd, level: env);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Author Unknown",
	category: \\drums,
	tags: [\\unpitched, \\bass]
	)
).add;`,
  },
  {
    name: 'kraftySnare',
    category: 'Drums',
    credit: 'Author Unknown',
    tags: ['unpitched', 'snare'],
    source: `/*
Original Author Unknown

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("kraftySnare", {
	arg amp = 1, freq = 2000, rq = 3, att = 0.01, dec = 0.3, curve = -6, pan = 0, out = 0;

	var snd, env;

	env = Env.perc(attackTime: att, releaseTime: dec, curve: curve).kr(doneAction: 2);

	snd = PinkNoise.ar(amp);

	snd = BPF.ar(snd, freq, rq, env * rq.reciprocal * 2);

	snd = Limiter.ar(snd);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Author Unknown",
	category: \\drums,
	tags: [\\unpitched, \\snare]
	)
).add;`,
  },
  {
    name: 'neuroSnare',
    category: 'Drums',
    credit: 'Original by Nathan Ho aka Snapizz',
    tags: ['unpitched', 'snare'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Original by Snapizz http://sccode.org/1-57f

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("neuroSnare", {
	arg
	//Basic Controls
	out = 0, pan = 0, amp = 0.1, freq = 160, curve = -4, preamp = 1.4,
	//Click Controls
	clickatt = 0.001, clicksus = 0.01, clickrel = 0.001, clickamp = 1, hipass = 300, lopass = 8000,
	//Body Controls
	bodyatt = 0.04, bodyrel = 0.2, bodyamp = 2,
	//Rattle Controls
	rattlehold = 0.01, rattleatt = 0.05, rattlerel = 0.2, rattleamp = 0.7, rattlefreq = 4000, rq = 0.5, rattlepeak = 3,
	//Sweep Controls
	sweepatt = 0.001, sweeprel = 0.02, sweepamp = 1, sweepstart = 3000, sweepend = 1500;

    var snd, click, cEnv, body, bEnvFreq, bEnvAmp, rattle, rEnv, sweep, sEnvFreq, sEnvAmp;

    // a percussive click to give it some attack
	cEnv = Env.linen(
		            attackTime: 0.001,
		            sustainTime: 0.01,
		            releaseTime: 0.001,
			        level: clickamp
	            ).ar;

	click = Hasher.ar(Sweep.ar);

	click = HPF.ar(in: click, freq: hipass);

    click = LPF.ar(in: click, freq: lopass);

	click = click * cEnv;

    // sine sweep body
	bEnvFreq = Env.new(
			        levels: [2.5, 1.225, 1],
			        times: [bodyatt, bodyrel],
			        curve: \\exp
	            ).ar;

	bEnvAmp = Env.perc(
		            attackTime: bodyatt,
		            releaseTime: bodyrel,
		            level: bodyamp,
		            curve: curve
	            ).ar;

	body = SinOsc.ar(freq: freq * bEnvFreq, mul: bEnvAmp);

	body = body.tanh;

    // sound of snare coils rattling
	rEnv = Env.perc(
			        attackTime: rattleatt,
			        releaseTime: rattlerel,
			        level: rattleamp,
			        curve: curve
	            ).delay(rattlehold).ar;

	rattle = Hasher.ar(Sweep.ar);

	rattle = BPeakEQ.ar(in: rattle, freq: rattlefreq, rq: rq, db: rattlepeak);

	rattle = HPF.ar(in: rattle, freq: hipass);

	rattle = rattle * rEnv;

    // another sound sweep to improve the attack, optional
	sEnvFreq = XLine.kr(
		    	    start: sweepstart,
		    	    end: sweepend,
		    	    dur: sweeprel / 2
	            );

	sEnvAmp = Env.perc(
			        attackTime: sweepatt,
			        releaseTime: sweeprel,
			        level: sweepamp,
			        curve: curve
	            ).ar;

	sweep = SinOsc.ar(freq: sEnvFreq, mul: sEnvAmp);

    // distortion helps glue everything together and acts as a compressor
	snd = Mix.ar(click + body + rattle + sweep);

	snd = (snd * preamp).tanh * amp;

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Original by Nathan Ho aka Snapizz",
	category: \\drums,
	tags: [\\unpitched, \\snare]
	)
).add;`,
  },
  {
    name: 'oneclapThor',
    category: 'Drums',
    credit: 'original by thor',
    tags: ['clap', 'handclap'],
    source: `/* Received from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/oneclap_thor.scd

published on the sc-users list 2009-01-08 by thor

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("oneclapThor", {
	arg
	//Standard Values
	out = 0, amp = 0.1, att = 0.003, rel = 0.00035, freq = 100, rq = 0.1, pan = 0,
	//Other Controls
	echohz1 = 33.333, echohz2 = 33.156, curve = -4, decay = 0.06, shelfFreq = 7000, rs = 0.5, db = -3,
	// Controls Ranging from 0 to 1
	size = 0.15, tone = 0.4, mix = 0.23, damp = 0.5;

	var env, snd, noise1, noise2, hpf1, hpf2, delay1, delay2;

	noise1 = GrayNoise.ar(1 - tone) + WhiteNoise.ar(tone);

	noise1 = noise1 + SinOsc.ar(freq: [freq / 2, freq / 2 + 4 ]);

	noise2 = PinkNoise.ar;

	noise2 = noise2 + SinOsc.ar(freq: [freq, (freq * 1.04)] * XLine.kr(start: 1, end: 0.01, dur: 3));

	hpf1 = RLPF.ar(in: noise1, freq: freq, rq: rq);

	hpf2 = RHPF.ar(in: noise1, freq: freq/2, rq: rq/4);

	env = Env.perc(attackTime: att, releaseTime: rel, curve: curve).kr;

	snd = Mix.ar(hpf1 + hpf2) * env;

	delay1 = CombN.ar(in: snd, maxdelaytime: 1.1/echohz1, delaytime: 1/echohz1, decaytime: decay / 2);

	delay2 = CombN.ar(in: snd, maxdelaytime: 1.1/echohz2, delaytime: 1/echohz2, decaytime: decay);

	snd = FreeVerb.ar(in: Mix.ar(delay1 + delay2), mix: mix, room: size, damp: damp, mul: amp);

	snd = BHiShelf.ar(in: snd, freq: shelfFreq, rs: rs, db: db);

	DetectSilence.ar(snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "original by thor",
	tags: [\\clap, \\handclap]
	)
).add;
`,
  },
  {
    name: 'purpleNoise',
    category: 'Drums',
    credit: 'Josh Mitchell',
    tags: ['noise', 'unpitched', 'cymbal'],
    source: `/*
Isn't it weird how supercollider offers pink, brown, and even gray noise, but not blue or purple?

Don't worry, this SynthDef offers a rough fix to supercollider's most urgent problem!
It uses a technique borrowed from diy synth schematics found online,
of sending white noise through a bunch of parallel filters.

***I'm not sure if this is actually purple noise, but it sounds close to me!***

Purple noise is the opposite of brown noise, it increases in volume 6dB every octave.
This probably makes it good for cymbals.
Now you can grab the code below and explore with it!

Made by Josh Mitchell, 8/19.
*/

SynthDef("purpleNoise", {
	arg out = 0, pan = 0, amp = 0.1, gate = 1, att = 0.01, rel = 0.75, curve = -6;

	var noise, a, b, c, d, e, f, g, h, i, env, snd;

	noise = WhiteNoise.ar(1);

	a = HPF.ar(noise, 62,    1/9);
	b = HPF.ar(noise, 125,   2/9);
	c = HPF.ar(noise, 250,   3/9);
	d = HPF.ar(noise, 500,   4/9);
	e = HPF.ar(noise, 1000,  5/9);
	f = HPF.ar(noise, 2000,  6/9);
	g = HPF.ar(noise, 4000,  7/9);
	h = HPF.ar(noise, 8000,  8/9);
	i = HPF.ar(noise, 16000, 9/9);

	env = Env.perc(att, rel, amp, curve).kr(doneAction: 2);

	snd = Mix([a, b, c, d, e, f, g, h, i]) * env;

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Josh Mitchell",
	category: \\bass,
	tags: [\\noise, \\unpitched, \\cymbal]
	)
).add;`,
  },
  {
    name: 'snare1',
    category: 'Drums',
    credit: 'Bruno Tucunduva Ruviaro',
    tags: ['percussion', 'snare'],
    source: `SynthDef("snare1", {arg out = 0, amp = 0.1, sinfreq = 180, att = 0.01, rel = 0.2, ffreq = 2000, pan = 0;
	var snd1 = WhiteNoise.ar(amp);
	var snd2 = SinOsc.ar(sinfreq,0,amp);
	var env = Env.perc(att, rel).kr(doneAction: 2);
	var mix = HPF.ar(snd1, ffreq) + snd2;
	mix = mix * env;
	Out.ar(out, Pan2.ar(mix, pan));
},
metadata: (
	credit: "Bruno Tucunduva Ruviaro",
	category: \\drums,
	tags: [\\percussion, \\snare]
)
).add;`,
  },
  {
    name: 'snare909',
    category: 'Drums',
    credit: 'Author Unknown',
    tags: ['unpitched', 'snare', 'synth', '909'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

The original used WhiteNoise for noise.
This was replaced with Latch.ar(WhiteNoise.ar, Impulse.ar(nyquist * 2))
for an added aliasing effect

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("snare909", {
	arg
	//Standard Values
	out = 0, pan = 0, freq = 185, amp = 1, att = 0.0005, curve = -2,
	//Other Controls
	toneRel = 0.075, toneAmp = 0.25, noiseRel = 0.4, noiseAmp = 0.2,
	nyquist = 500, lpFreq = 7040, hpFreq = 523;

	var relTimes, env, tone, noise, snd;

	relTimes = ([1, 0.733] * toneRel) ++ ([1, 0.708] * noiseRel);

	env = Env.perc(attackTime: att, releaseTime: relTimes, level: amp, curve: curve).kr;

	tone = LFTri.ar(freq: [1, 1.78] * freq, mul: toneAmp);

	noise = Latch.ar(WhiteNoise.ar, Impulse.ar(nyquist * 2));

	noise = LPF.ar(in: noise, freq: lpFreq, mul: noiseAmp);

	snd = tone ++ [noise, HPF.ar(in: noise, freq: hpFreq)];

	snd = Mix.ar(snd * env);

	DetectSilence.ar(in: snd, doneAction: 2);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Author Unknown",
	category: \\drums,
	tags: [\\unpitched, \\snare, \\synth, \\909]
	)
).add;`,
  },
  {
    name: 'snareElectro',
    category: 'Drums',
    credit: 'Nathan Ho aka Snappizz',
    tags: ['pitched'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Original by Nathan Ho aka Snappizz
http://sccode.org/1-523

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("snareElectro", {
    arg
	//Standard Values
	out = 0, pan = 0, amp = 0.4, att = 0.001, rel = 0.15, curve = -4,
	//Other Controls, blend ranges from 0 to 1
	popfreq = 160, sweep = 0.01, noisefreq = 810, rq = 1.6, blend = 0.41;

    var pop, popEnv, popSweep, noise, noiseEnv, snd;

    // pop makes a click coming from very high frequencies
    // slowing down a little and stopping in mid-to-low
    popSweep = Env.new(levels: [20.4, 2.6, 1] * popfreq, times: [sweep / 2, sweep], curve: \\exp).ar;

    popEnv = Env.perc(attackTime: att, releaseTime: 0.73 * rel, level: blend, curve: curve).kr;

	pop = SinOsc.ar(freq: popSweep, mul: popEnv);

    // bandpass-filtered white noise
    noiseEnv = Env.perc(attackTime: att, releaseTime: rel, level: 1 - blend, curve: curve).kr(doneAction: 2);

	noise = BPF.ar(in: WhiteNoise.ar, freq: noisefreq, rq: rq, mul: noiseEnv);

    snd = Mix.ar(pop + noise) * amp;

    Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Nathan Ho aka Snappizz",
	category: \\organ,
	tags: [\\pitched]
	)
).add;`,
  },
  {
    name: 'snareOto309',
    category: 'Drums',
    credit: 'original by otophilia',
    tags: ['snare', 'drum', 'percussion'],
    source: `/* Received from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/snare_oto309.scd

from 08091500Acid309 by_otophilia

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("snareOto309", {
	arg
	//Standard Values
	out = 0, amp = 0.1, pan = 0, freq = 139, att = 0.05, dec = 0.03, rel = 0.1, curve = -4, preamp = 1.2,
	//Oscs Controls, blend ranges from 0 to 1
	filterHarmonic = 1.2, oscsHarmonic = 1.6, blend = 0.333, oscsAmp = 1,
	//Noise Controls
	noiseRatio = 0.4, noiseBottom = 200, noisePeak = 6900, rq = 0.6, noiseAmp = 1;

	var envOscs, envSweep, envNoise, oscs, noise, snd;

	//  E N V S
	envOscs = Env.new(
		            levels: [0.5, 1, 0.5, 0] * oscsAmp,
		            times: [(att * 0.1), dec, rel],
		            curve: [1, 0.5, 1] * curve).kr;

	envSweep = Env.new(
		            levels: [33.81, 1.88, 1] * freq,
		            times: [(att * 0.1), rel],
		            curve: [1, 1.25] * curve).kr;

	envNoise = Env.new(
		            levels: [1, noiseRatio, 0] * noiseAmp,
		            times: [att, (dec + rel)],
		            curve: [0.5, 0.5] * curve).kr(doneAction: 2);

	//  O S C S
	oscs = LFPulse.ar(
	            	freq: [envSweep, envSweep * oscsHarmonic],
	            	width: [0.5, 0.5],
	            	mul: [1 - blend, blend],
	            	add: [-0.5, -0.25]);

	oscs = LPF.ar(in: oscs, freq: envSweep * filterHarmonic, mul: envOscs * 1.5);

	oscs = oscs + SinOsc.ar(freq: envSweep, phase: pi/4, mul: envOscs);

	//  N O I S E
	noise = WhiteNoise.ar(1/3);

	noise = HPF.ar(in: noise, freq: noiseBottom);

	noise = noise + BPF.ar(in: noise, freq: noisePeak, rq: rq, mul: 3);

	noise = noise * envNoise;

	//  O U T P U T
	snd = Mix.ar(oscs + noise) * preamp;

	snd = snd.clip2(1) * amp;

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "original by otophilia",
	category: \\drums,
	tags: [\\snare, \\drum, \\percussion]
	)
).add;`,
  },
  {
    name: 'snareStein',
    category: 'Drums',
    credit: 'Original snare written by Esben Stein, I believe',
    tags: ['percussion', 'drum', 'snare'],
    source: `/* Received from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/snare_stein.scd

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("snareStein", {
	arg
	//Standard Arguments
	out = 0, amp = 1, pan = 0, att = 0.0005, curve = -4, tonerel = 0.075, noiserel = 0.2,
	//Other Controls, blend ranges from 0 to 1.
	noisetop = 7040, noisebottom = 523, noiseamp = 0.2, tonelo = 185, tonehi = 330, toneamp = 0.5, blend = 0.2;

    var tone, noise, snd;

	//Sines for the frequency of the drum:
    tone = SinOsc.ar(freq: [tonelo, tonehi]);

	tone = tone * Env.perc(
		                attackTime: att,
		                releaseTime: [tonerel, 0.73 * tonerel],
		                level: toneamp,
		                curve: curve
	                ).kr;

	//Noise for the rattling of the snares: (original used WhiteNoise alone)
	noise = PinkNoise.ar(noiseamp * (1 - blend)) + WhiteNoise.ar(noiseamp * blend);

	noise = LPF.ar(in: noise, freq: noisetop);

	snd = noise * Env.perc(
		                attackTime: att,
		                releaseTime: noiserel,
		                curve: curve
	                ).kr;

	snd = snd +	HPF.ar(
		            in: noise,
		            freq: noisebottom,
		            mul: Env.perc(
			                    attackTime: att,
			                    releaseTime: 0.915 * noiserel,
			                    curve: curve
			                ).kr
	            );

	//Mix it all together:
	snd = Mix.ar(snd + tone) * amp;

	DetectSilence.ar(in: snd, doneAction: 2);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Original snare written by Esben Stein, I believe",
	category: \\drums,
	tags: [\\percussion, \\drum, \\snare]
	)
).add;`,
  },
  {
    name: 'sosHats',
    category: 'Drums',
    credit: 'Renick Bell',
    tags: ['pitched', 'cymbal', 'sos'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

DrumSynths SC Example - SOS Drums by Renick Bell, renick_at_gmail.com
recipes from Gordon Reid in his Sound on Sound articles
SOShats -------
http://www.soundonsound.com/sos/Jun02/articles/synthsecrets0602.asp

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("sosHats", {
	arg
	//Standard Values
	out = 0, pan = 0, freq = 6000, amp = 0.8, curve = -4, rootIndex = 238.5, rq = 1,
	//Initial envelopes
	initAtt = 0.005, initRel = 0.1, initAmp = 1, initStart = 15000, initEnd = 9000,
	//Body envelopes
	bodyAtt = 0.005, bodyRel = 0.1, bodyAmp = 1, bodyStart = 9000, bodyEnd = 12000;

	var root, initialEnv, initialSweep, initial, bodyEnv, bodySweep, body, snd;

	root = Pulse.ar(freq: freq, width: 0.5, mul: 1);

	root = PMOsc.ar(
		            carfreq: root,
					modfreq: freq * [1.34, 2.405, 3.09, 1.309],
					pmindex: rootIndex * [1, 0.22, 0.014, 0.0038]);

	root = Mix.new(root);

	initialEnv = Env.perc(attackTime: initAtt, releaseTime: initRel, curve: curve).kr;

	initialSweep = Line.kr(start: initStart, end: initEnd, dur: initRel);

	initial = BPF.ar(in: root, freq: initialSweep, rq: rq, mul: initialEnv * initAmp);

	bodyEnv = Env.perc(attackTime: bodyAtt, releaseTime: bodyRel, curve: curve / 2).kr;

	bodySweep = Line.kr(start: bodyStart, end: bodyEnd, dur: bodyRel);

	body = HPF.ar(in: root, freq: bodySweep, mul: bodyEnv * bodyAmp);

	snd = Mix.ar([initial, body]) * amp;

    DetectSilence.ar(in: snd, doneAction: 2);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Renick Bell",
	category: \\drums,
	tags: [\\pitched, \\cymbal, \\sos]
	)
).add;`,
  },
  {
    name: 'sosKick',
    category: 'Drums',
    credit: 'Renick Bell',
    tags: ['pitched', 'kick', 'sos'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

DrumSynths SC Example - SOS Drums by Renick Bell, renick_at_gmail.com
recipes from Gordon Reid in his Sound on Sound articles
SOSkick -------
http://www.soundonsound.com/sos/jan02/articles/synthsecrets0102.asp
increase mod_freq and mod_index for interesting electronic percussion

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("sosKick", {
	arg
    //Standard Values
	out = 0, pan = 0, amp = 1, curve = -4, drumAmp = 1, beaterAmp = 0.02,
	//drum Controls
	drumFreq = 50, drumHarmonic = 2, drumSweep = 0.02, drumAtt = 0.005, drumRel = 0.4,
	drumFilter = 1000, modIndex = 6.5, modFreq = 5,
	//beater Controls
	beaterFreq = 500, beaterHarmonic = 12, beaterSweep = 0.03, beaterAtt = 0.01, beaterRel = 0.3;

	var drumEnv, drumContour, drum, beaterContour, beaterEnv, beater, snd;

	drumEnv = Env.perc(attackTime: drumAtt, releaseTime: drumRel, level: drumAmp, curve: curve).kr;

	drumContour = Line.kr(start: drumFreq * drumHarmonic, end: drumFreq, dur: drumSweep);

	drum = PMOsc.ar(
		        carfreq: drumContour,
				modfreq: modFreq,
				pmindex: modIndex);

	drum = LPF.ar(in: drum, freq: drumFilter, mul: drumEnv);

	beaterEnv = Env.perc(attackTime: beaterAtt, releaseTime: beaterRel, level: beaterAmp, curve: curve).kr;

	beaterContour = Line.kr(start: beaterFreq * beaterHarmonic, end: beaterFreq, dur: beaterSweep);

	beater = HPF.ar(in: WhiteNoise.ar, freq: beaterFreq);

	beater = LPF.ar(in: beater, freq: beaterContour, mul: beaterEnv);

	snd = Mix.ar(drum + beater) * amp;

    DetectSilence.ar(in: snd, doneAction: 2);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Renick Bell",
	category: \\drums,
	tags: [\\pitched, \\kick, \\sos]
	)
).add;	`,
  },
  {
    name: 'sosSnare',
    category: 'Drums',
    credit: 'Renick Bell',
    tags: ['pitched', 'snare', 'sos'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

DrumSynths SC Example - SOS Drums by Renick Bell, renick_at_gmail.com
recipes from Gordon Reid in his Sound on Sound articles
SOSsnare -------
http://www.soundonsound.com/sos/Mar02/articles/synthsecrets0302.asp

Latch.ar(WhiteNoise.ar(0.1), Impulse.ar(nyquist * 2)) is added aliasing for effect

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("sosSnare", {
	arg
	//Standard Values
	out = 0, pan = 0, freq = 405, amp = 0.8, att = 0.005, rel = 0.1, curve = -4,
	//drumMode Controls
	drumModeAmp = 0.25, timbreIndex = 0.385, modHarmonic = 0.452,
	//snares controls
	snareAmp = 40, nyquist = 1700, snareRez = 1000, ffreq = 2000, rq = 0.1, bwr = 1;

	var drumMode, drumModeEnv, snares, snareEnv, snd;

	drumModeEnv = Env.perc(attackTime: att, releaseTime: rel, level: 0.5, curve: curve).kr;

	drumMode = SinOsc.ar(freq: freq * 0.53, mul: drumModeEnv);

	drumMode = drumMode + SinOsc.ar(freq: freq, mul: drumModeEnv);

	drumMode = drumMode + PMOsc.ar(
		            carfreq: Saw.ar(freq * 0.85),
					modfreq: freq * modHarmonic,
					pmindex: timbreIndex,
					mul: drumModeEnv * 10);

	drumMode = Mix.ar(drumMode) * drumModeAmp;

	snareEnv = Env.perc(attackTime: att, releaseTime: rel, curve: curve).kr;

	snares = Latch.ar(WhiteNoise.ar(0.1), Impulse.ar(nyquist * 2));

	snares = BRF.ar(in: snares, freq: 4 * ffreq, mul: 0.5, rq: rq);

	snares = BRF.ar(in: snares, freq: 2.5 * ffreq, mul: 0.5, rq: rq);

	snares = BRF.ar(in: snares, freq: 1.8 * ffreq, mul: 0.5, rq: rq);

	snares = BRF.ar(in: snares, freq: ffreq, mul: snareEnv, rq: rq);

	snares = Resonz.ar(in: snares, freq: snareRez, bwr: bwr, mul: snareAmp) ;

	snd = Mix.new(drumMode + snares) * amp;

	DetectSilence.ar(in: snd, doneAction: 2);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Renick Bell",
	category: \\drums,
	tags: [\\pitched, \\snare, \\sos]
	)
).add;`,
  },
  {
    name: 'sosTom',
    category: 'Drums',
    credit: 'Renick Bell',
    tags: ['pitched', 'tom', 'sos'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

DrumSynths SC Example - SOS Drums by Renick Bell, renick_at_gmail.com
recipes from Gordon Reid in his Sound on Sound articles
SOStom -------
http://www.soundonsound.com/sos/Mar02/articles/synthsecrets0302.asp

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("sosTom", {
	arg out = 0, pan = 0, drumRel = 0.4, stickRel = 0.01, drumModeAmp = 0.25, freq = 250, timbreIndex = 0.77, amp = 1, att = 0.005, curve = -6;

	var drumMode, drumModeEnv, stick, stickEnv, snd;

	drumModeEnv = Env.perc(
		            attackTime: att,
		            releaseTime: drumRel,
		            level: 0.5,
		            curve: curve).kr(doneAction: 2);

	drumMode = PMOsc.ar(
		            carfreq: Saw.ar(freq: freq * 0.9),
					modfreq: freq * 0.85,
					pmindex: timbreIndex,
					mul: drumModeEnv * 10);

	drumMode = drumMode + SinOsc.ar(freq: [freq, freq * 0.8], mul: drumModeEnv);

	drumMode = Mix.ar(drumMode) * drumModeAmp;

	stick = Crackle.ar(chaosParam: 2.01);

	stickEnv = Env.perc(attackTime: att, releaseTime: stickRel, level: 3, curve: curve).kr;

	snd = Mix.ar(drumMode + stickEnv) * amp;

	snd = LeakDC.ar(snd);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Renick Bell",
	category: \\drums,
	tags: [\\pitched, \\tom, \\sos]
	)
).add;`,
  },
  {
    name: 'squareDrum',
    category: 'Drums',
    credit: 'by Josh Mitchell',
    tags: ['unpitched', 'snare', 'modal'],
    source: `/*
This is a snare drum using a shortcut for the resonant modes of a square-shaped membrane.

Get it? Square drum?

A common Problem in modal synthesis is how computationally expensive it is. Generating a
sound with 36 modes, for example (like below), takes a bank of 36 individual resonators.
Thanks to how simple Klank is to use, this doesn't look like a problem, but it can add
up fast. That's why this drum uses a square shape for the "drum head"; it can create more
higher-frequency modes with a smaller array than for a circle or other shape. This means
it's less computationally expensive for the same modes at the initial attack of the
virtual drum stick, at the cost of a tiny bit of accuracy to a physical snare drum.

decCoef determines some of the timbre of the head, and ampSlope is the constant slope
of a dB/oct filter.

A snare drum's snares themselves are really, really impractical to replicate in modal
synthesis. Because of this, I used PinkNoise and some filtering. The amplitude of this
pink noise is controlled by the amplitude of the drum head, similar to a real snare drum.
Next, I added some notches in the noise because real snares have notches in their
frequency spectrums. Rather than find new frequencies, I just reused some values from
freqArray.

The envelope follower sending the amplitude of the drum head to the snares is controlled
by followAtt and followRel, and because the snares rang out too much for my liking, I
added a noise gate controlled by snareGate (the amount of gating) and thresh, (the
threshold of the gate).

By Josh Mitchell July 2020.
*/

SynthDef(\\squareDrum, {
	arg
	// Standard values
	out = 0, freq = 180, amp = 0.6, pan = 0,
	// Stick Controls
	att = 0.001, dec = 0.01,
	// Head Controls
	headAmp = 0.5, decCoef = 0.175, ampSlope = 3, rel = 0.2,
	// Snares Controls (thresh goes from 0 to 1)
	snaresAmp = 0.65, followAtt = 0.005, followRel = 0.075, thresh = 0.25,
	snareGate = 0.6, rq = 0.5;

	var freqarray, amparray, decarray, stick, head, snares, snd;

	// Setting up arrays for Klank
	freqarray = Array.fill(8, {
		arg i = 1;
		(
			Array.fill((i + 1), {
				arg j;
				(j + 1).pow(2)
			}) +
			(i + 1).pow(2)
		).sqrt

	});
	freqarray = freqarray.flatten/(2.sqrt);

	amparray = Array.fill(36, {
		arg i;
		if (freqarray[i] > 20000)
			{ 0 }
			{
		        (ampSlope * (freqarray[i]).log2).dbamp
		    }
	});
	amparray = amparray/amparray.max;

	decarray = Array.fill(36, {
		arg i;
		exp(-1 * i * decCoef)
	});
	decarray = decarray/decarray[0];

	// Drumstick
	stick = Decay2.ar(
		in: Impulse.ar(0),
		attackTime: att,
		decayTime: dec,
		mul: 0.005); // This keeps the volume at a sane level

	// Drum Head
	head = Klank.ar(
		specificationsArrayRef:
		    Ref.new([freqarray, amparray, decarray]),
		input: stick,
		freqscale: freq,
		decayscale: rel);

	// Snares
	snares = PinkNoise.ar(
		Amplitude.ar(
		    in: head,
		    attackTime: followAtt,
		    releaseTime: followRel));
	snares = CompanderD.ar(
		in: snares,
		thresh: thresh,
		slopeBelow: 1 + snareGate.clip(0, inf));
	snares = BRF.ar(
		in: snares,
		freq: freqarray[1..6],
		rq: rq);

	//Output Stuff
	snd = (head * headAmp) + (snares * snaresAmp);
	snd = Mix.ar(snd * amp);
	snd = Limiter.ar(snd);

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "by Josh Mitchell",
	category: \\drums,
	tags: [\\unpitched, \\snare, \\modal]
)
).add;
`,
  },
  {
    name: 'distortedGuitar',
    category: 'Guitar',
    credit: 'Josh Mitchell',
    tags: ['pitched'],
    source: `/*
This is an attempt at making an electric guitar sound using Pluck.ar, as well as a couple
delay-based comb filters which roughly simulate some of the effects of changing pickup
placement and where on the string it's plucked. It still sounds a lot like Pluck and not
very much like a guitar, so I stuck some distortion on it to hide my mistakes a bit. That's
how guitar pedals work, right? (jk I think effects pedals are instruments in their own right)

Starting with the pick, I used Hasher.ar to provide the same initial noise for each pick,
but replacing that line with WhiteNoise.ar works fine. This then goes through the first
comb filter, which mutes certain frequencies based on pickPos. This is the pick position
from the bridge at 0 to the fret of the note being played at 1.

Next up is Pluck.ar, which makes the string sound, as well as a way of "muting" that string.
This is just a simple sustain-release envelope with a user-determined sustain time and a very
short release time, controlling a low pass filter for a slightly more natural-sounding cutoff.
I found it helpful in the demo, because two notes can't be played on the same string at once.
Setting a note to mute just before the next on plays seems convincing enough.

After this comes the pickup section. This guitar has only one pickup, and you can add more
if you like. First is another comb filter to mimic how pickup placement cuts some frequencies
and emphasizes others. Instead of pickupPos going from the bridge at 0 to the fretted note at
1, it goes to the nut of the guitar at 1, meaning openStringFreq plays a very small role in
the timbre of a note. Next is a resonant HPF and a steeper resonant LPF to mimic the frequency
response of a generalized pickup.

Finally, there's the distortion I mentioned above. It's got an HPF before the distortion and
an LPF after it, as is generally common in a lot of guitar distortion pedals.

By Josh Mitchell August 2020
*/

SynthDef(\\distortedGuitar, {
	arg
	//Standard Values
	out = 0, pan = 0, amp = 0.1, freq = 220, rel = 4, crv = -3,
	// String and Plucking Hand Controls
	coef = 0.75, openStringFreq = 110, pickPos = 0.5, muteSus = 0.5,
	// Pickup Controls
	pickupPos = 0.17, pickupResfreq = 8000, pickupResrq = 0.5, pickupHPF = 250, pickupHPFrq = 0.8,
	// Distortion Controls
	preDistHPF = 600, postDistLPF = 2000, gain = 75;

	var mute, snd;

	// The Pick
	snd = Hasher.ar(Sweep.ar(Impulse.ar(0)));
	snd = snd - DelayN.ar(
		in: snd,
		maxdelaytime: pickPos.clip(0, 1)/freq,
		delaytime: pickPos.clip(0, 1)/freq);

	// The String
	snd = Pluck.ar(
		in: snd,
		trig: Impulse.ar(0),
		maxdelaytime: 1/freq,
		delaytime: 1/freq,
		decaytime: rel,
		coef: coef.clip(-1, 1));
	snd = LeakDC.ar(snd);

	// An Envelope for Muting the String
	mute = Env.new(
		levels: [1, 1, 0, 0],
		times: [muteSus, 0.075, 0.025]).ar(doneAction: 2);

	// Mute the String
	snd = snd * mute;
	snd = HPF.ar(
		in: snd,
		freq: LinExp.ar(
			in: mute,
			srclo: 0, srchi: 1,
			dstlo: 100, dsthi: 20));
	snd = LPF.ar(
		in: snd,
		freq: LinExp.ar(
			in: mute,
			srclo: 0, srchi: 1,
			dstlo: 20, dsthi: 10000));

	// The Pickup
	snd = snd - DelayN.ar(
		in: snd,
		maxdelaytime: pickupPos.clip(0, 1)/openStringFreq,
		delaytime: pickupPos.clip(0, 1)/openStringFreq);
	snd = RHPF.ar(
		in: snd,
		freq: pickupHPF,
		rq: pickupHPFrq);
	snd = BLowPass4.ar(
		in: snd,
		freq: pickupResfreq,
		rq: pickupResrq);

	snd = LeakDC.ar(snd);

	// The Distortion
	snd = HPF.ar(
		in: snd,
		freq: preDistHPF);
	snd = snd * gain;
	snd = snd.tanh;
	snd = LPF.ar(
		in: snd,
		freq: postDistLPF);

	// Output Stuff
	snd = snd * amp;
	snd = Limiter.ar(snd);

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Josh Mitchell",
	category: \\guitar,
	tags: [\\pitched]
	)
).add;
`,
  },
  {
    name: 'modalElectricGuitar',
    category: 'Guitar',
    credit: 'by Josh Mitchell',
    tags: ['pitched', 'modal'],
    source: `/*
This SynthDef is especially cool to me, because working on effects for guitars is what ended
up getting me into supercollider in the first place, and now in a continuation of that weird
chain of events, I've come full circle to making a clean guitar sound in supercollider!

This model can be broken into separate sections based on the parts of an electric guitar: It
starts with a plucked string made using modal synthesis, and that goes into a single pickup.
The pickup's position is modeled in the modal synthesis portion, and the electronic components
of the pickup (as well as the volume and tone controls) are modeled afterwards with filters.

The frequencies of each mode on the vibrating guitar string are determined by a standard stiff
string model in freqArray, where 0.00001 is a constant stretching these frequencies a tiny bit
from the harmonic series. Similarly, the decay times of each mode are found by decArray, where
decayCoef and dampCoef (which is best left low) control the apparent brightness of each note.

In ampArray, the first line works like an anti-aliasing filter, and the second line models the
string being plucked at different locations, from the bridge at pickPos = 0 to the nut at
pickPos = 1. Everything else inside ampArray, as well as the line after it, model a pickup
with a certain width (parallel to the string) and position, once again from the brigde at
pickupPos = 0 to the nut at pickupPos = 1. The pickup width is not, however, a ratio from 0 to
1, but pickupWidth is instead measured in inches. This gets turned into a ratio by dividing it
by the scale length of the guitar, which I set to 25.5 inches. This isn't a variable control
because the main effects it has on a real guitar are on the ratios for each of the parameters
I just mentioned, making it redundant to control. Lastly, the open frequency of a string (the
note it's tuned to, as in e-a-d-g-b-e) has some effect when it interacts with the position of
the pickup. Looking at the demo, you'll see I used that to write in what string a note is
being played on.

After all the complicated modal stuff, it's kind of interesting that the circuitry of a guitar
from the pickups to any passive controls to a cable and output load can all be modeled pretty
well with a resonant low pass filter. Rather than figure out a bunch of variables for the
number of turns in the pickup windings, the pickup's capacitance, and everything else inside a
guitar, all you get are the filter's resonant frequency and rq. There's another low pass filter
for you that I labeled tone after a guitar control. I set it a bit lower than the resonant
filter to roughly match an experimentally-determined filter curve I found.

After that is a quick way of approximating muting a vibrating string with one hand. You can
control when that happens with muteSus. If it's longer than rel, you'll let the string ring
out. You'll see in the demo that I mute a string just before playing a new note on it, which
helps with the realism, just like waving pickPos around slightly. What helps the most, however,
is starting the demo with an add9 chord, as every guitar demo should start.

By Josh Mitchell August 2020.
*/

SynthDef(\\modalElectricGuitar, {
	arg
	// Standard values
	out = 0, pan = 0, freq = 440, amp = 0.3, rel = 5,
	// String controls (pickPos goes from 0 to 1)
	decayCoef = 0.125, dampCoef = 0.0002, pickPos = 0.414, openFreq = 82.5, muteSus = 5.5,
	// Pickup Controls (pickupPos goes from 0 to 1)
	pickupPos = 0.17, pickupWidth = 0.75, resFreq = 4000, rq = 0.5, toneFreq = 3250;

	var exciter, freqArray, ampArray, decArray, constant, mute, snd;

	// Make a Constant from pickupWidth for ampArray
	constant = pickupWidth/25.5; // The scale length is set to 25.5 inches
	constant = constant * pi/2;
	constant = constant/openFreq;

	// Stiff String Model for Frequencies
	freqArray = Array.fill(50, {
		arg i;
		(i + 1) * sqrt(1 + ((i + 1).pow(2) * 0.00001))
	});
	freqArray = freqArray/freqArray[0];

	// Decay Times
	decArray = Array.fill(50, {
		arg i;
		exp(
			(-1 * i)/
			(
				(1/decayCoef) +
				((dampCoef/10) * freq.pow(2)) +
				(dampCoef * freqArray[i].pow(2))
		    )
		)
	});
	decArray = decArray/decArray[0];

	// Rescale freqArray for ampArray and Klank
	freqArray = freqArray * freq;

	// Effects of Pick Position and Pickup Placement
	ampArray = Array.fill(50, {
		arg i;
		((1 - ((freqArray[i] - 19000)/1000).tanh)/2) *
		sin(((i + 1) * pi) * pickPos) *
		(
			sin(pi * pickupPos * freqArray[i]/openFreq) *
			(
			    (
					sin(constant * freqArray[i])/
					(constant * freqArray[i])
				) - cos(constant * freqArray[i])
			)
		)/(freqArray[i].pow(2))
	});
	ampArray = ampArray * 2/(constant.pow(2));

	// The Pick
	exciter = Impulse.ar(0) * 0.1;

	// The String
	snd = Klank.ar(
		specificationsArrayRef:
		    Ref.new([freqArray, ampArray, decArray]),
		input: exciter,
		decayscale: rel
	);

	snd = Mix.ar(snd);

	// The Pickup
	snd = RLPF.ar(
		in: snd,
		freq: resFreq,
		rq: rq);

	snd = LPF.ar(
		in: snd,
		freq: toneFreq);

	// An Envelope for Muting the String
	mute = Env.new(
		levels: [1, 1, 0, 0],
		times: [muteSus, 0.05, 0.01]).ar(doneAction: 2);

	// Mute the String
	snd = LPF.ar(
		in: snd,
		freq: LinExp.ar(
			in: mute,
			srclo: 0, srchi: 1,
			dstlo: 20, dsthi: 20000));

	// Output Stuff
	snd = snd * amp;
	snd = Limiter.ar(snd);

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "by Josh Mitchell",
	category: \\guitar,
	tags: [\\pitched, \\modal]
)
).add;`,
  },
  {
    name: 'pluck',
    category: 'Guitar',
    credit: '',
    tags: [],
    source: `SynthDef("pluck", {arg amp = 0.1, freq = 440, decay = 5, coef = 0.1, pan = 0;
	var env, snd;
	env = EnvGen.kr(Env.linen(0, decay, 0), doneAction: 2);
	snd = Pluck.ar(
		in: WhiteNoise.ar(amp),
		trig: Impulse.kr(0),
		maxdelaytime: 0.1,
		delaytime: freq.reciprocal,
		decaytime: decay,
		coef: coef);
	snd = Pan2.ar(snd, pan);
	Out.ar(0, [snd, snd]);
}).add;`,
  },
  {
    name: 'FMRhodes1',
    category: 'Keys',
    credit: 'Nathan Ho',
    tags: ['pitched', 'piano', 'fm'],
    source: `  /*
Retrieved from: http://sccode.org/1-522

FM Rhodes Synthesizer

by Nathan Ho (snappizz)

Native SuperCollider port of STK's Rhodey. This should be preferred over the StkInst version because:

- It uses much less CPU.
- It is easier to modify.
- It doesn't require sc3-plugins or a correct setting of StkGlobals.
- It's beginner-friendly because it uses only basic UGens: SinOsc, EnvGen, Mix, Pan2, Out.

Modified by Josh Mitchell and Bruno Ruviaro in July 2019.

*/

SynthDef(\\FMRhodes1, {
    arg
    // standard meanings
    out = 0, freq = 440, gate = 1, pan = 0, amp = 0.1, att = 0.001, rel = 1, lfoSpeed = 4.8, inputLevel = 0.2,
    // all of these range from 0 to 1
    modIndex = 0.2, mix = 0.2, lfoDepth = 0.1;

    var env1, env2, env3, env4;
    var osc1, osc2, osc3, osc4, snd;

    env1 = Env.perc(att, rel * 1.25, inputLevel, curve: \\lin).kr;
    env2 = Env.perc(att, rel, inputLevel, curve: \\lin).kr;
    env3 = Env.perc(att, rel * 1.5, inputLevel, curve: \\lin).kr;
    env4 = Env.perc(att, rel * 1.5, inputLevel, curve: \\lin).kr;

    osc4 = SinOsc.ar(freq) * 6.7341546494171 * modIndex * env4;
    osc3 = SinOsc.ar(freq * 2, osc4) * env3;
    osc2 = SinOsc.ar(freq * 30) * 0.683729941 * env2;
    osc1 = SinOsc.ar(freq * 2, osc2) * env1;
    snd = Mix((osc3 * (1 - mix)) + (osc1 * mix));
  	snd = snd * (SinOsc.ar(lfoSpeed).range((1 - lfoDepth), 1));

    snd = snd * Env.asr(0, 1, 0.1).kr(gate: gate, doneAction: 2);
    snd = Pan2.ar(snd, pan, amp);

    Out.ar(out, snd);
},
metadata: (
	credit: "Nathan Ho",
	category: \\keyboards,
	tags: [\\pitched, \\piano, \\fm]
)
).add;

`,
  },
  {
    name: 'FMRhodes2',
    category: 'Keys',
    credit: '',
    tags: [],
    source: `  /*
Retrieved from: http://sccode.org/1-522

FM Rhodes Synthesizer

Native SuperCollider port of STK's Rhodey. This should be preferred over the StkInst version because:

- It uses much less CPU.
- It is easier to modify.
- It doesn't require sc3-plugins or a correct setting of StkGlobals.
- It's beginner-friendly because it uses only basic UGens: SinOsc, EnvGen, Mix, Pan2, Out.

Modified by Josh Mitchell and Bruno Ruviaro in July 2019
added more lfo controls, and fmHarmonic arg

*/
SynthDef(\\FMRhodes2, {
    arg
    // standard meanings
    out = 0, freq = 440, gate = 1, pan = 0, amp = 0.1, att = 0.001, rel = 1,
	//controls
	lfoSpeed = 2.4, inputLevel = 0.2, modIndex = 2, fmHarmonic = 30,
    // all of these range from 0 to 1
    mix = 0.2, lfoDepth = 0.75, lfoBottom = 0.15, lfoRange = 0.3;

    var env1, env2, env3, env4, range, bottom;
    var osc1, osc2, osc3, osc4, snd;

	bottom = lfoBottom.linlin(0, 1, 100, 12000);
	range = lfoRange.linlin(0, 1, bottom, 16000);

    env1 = Env.perc(att, rel * 1.25, inputLevel, curve: \\lin).kr;
    env2 = Env.perc(att, rel, inputLevel, curve: \\lin).kr;
    env3 = Env.perc(att, rel * 1.5, inputLevel, curve: \\lin).kr;
    env4 = Env.perc(att, rel * 1.5, inputLevel, curve: \\lin).kr;

    osc4 = SinOsc.ar(freq) * 6.7341546494171 * modIndex * env4;
    osc3 = SinOsc.ar(freq * 2, osc4) * env3;
    osc2 = SinOsc.ar(freq * fmHarmonic) * 0.683729941 * env2;
    osc1 = SinOsc.ar(freq * 2, osc2) * env1;

    snd = Mix((osc3 * (1 - mix)) + (osc1 * mix));
	snd = LPF.ar(snd, SinOsc.kr(lfoSpeed).range(bottom, range), lfoDepth) + (snd * (1 - lfoDepth));
    snd = snd * Env.asr(0, 1, 0.1).kr(gate: gate, doneAction: 2);
    snd = Pan2.ar(snd, pan, amp);

    Out.ar(out, snd);
}).add;
`,
  },
  {
    name: 'cheapPiano1',
    category: 'Keys',
    credit: 'based on something posted 2008-06-17 by jeff, based on an old example by james mcc',
    tags: ['casio', 'piano', 'pitched'],
    source: `/* Retrieved from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/cheappiano.scd

based on something posted 2008-06-17 by jeff, based on an old example by james mcc

Modified by Josh Mithell and Bruno Ruviaro July 2019
*/

SynthDef(\\cheapPiano1, {
	arg
	//Standard values
	out = 0, freq = 440, amp = 0.1, att = 0.001, rel = 1, pan = 0,
	//These range from 0 to 1
	tone = 0.25, hollowness = 0;

	var hammer, snd, delay, tonefreq, env;

	env = Env.perc(att, rel, amp * 4, -1).ar(doneAction: 2);

	// Delay line times: freq, freq - 4 cents, freq + 3 cents. In the original this was done by converting freq to midi.
	delay = (1 / (freq * [2.pow(-0.04/12), 1, 2.pow(0.03/12)]));
	tonefreq = tone.linlin(0, 1, 1000, 5000);

	hammer = Decay2.ar(
		in: Impulse.ar(0.001),
		attackTime: 0.008,
		decayTime: 0.04,
		mul: LFNoise2.ar(freq: amp.linlin(0, 1, tonefreq, 2 * tonefreq), mul: 0.25)
	); //Try LFNoise1, LFNoise0, or even LFClipNoise above for a slightly grainier sound.

	snd = CombL.ar(hammer, delay, delay, 50 * amp);
	snd = HPF.ar(snd, hollowness.linlin(0, 1, 50, 1000));
	snd = snd * env;
	snd = Limiter.ar(snd);
	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "based on something posted 2008-06-17 by jeff, based on an old example by james mcc",
	category: \\keyboards,
	tags: [\\casio, \\piano, \\pitched]
	)
).add;`,
  },
  {
    name: 'cs80leadMH',
    category: 'Keys',
    credit: 'Mike Hairston',
    tags: ['lead', 'modulation', 'analog', 'cs80', 'vangelis', 'bladerunner'],
    source: `/* Recieved from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/cs80lead_mh.scd

Vangelis/Blade Runner lead sound, based on tutorial by meastempo @ http://www.youtube.com/watch?v=Fne0oIEv-WI

Original by Mike Hairston

Pbindef notes copied from https://alijamieson.co.uk/2016/01/08/replicating-blade-runner-soundtrack

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("cs80leadMH", {
	arg
	//Standard Values
	freq = 440, amp = 0.5, gate = 1.0, pan = 0, out = 0,
	//Amplitude Controls
	att = 0.75, dec = 0.5, sus = 0.8, rel = 1.0,
	//Filter Controls
	fatt = 0.75, fdec = 0.5, fsus = 0.8, frel = 1.0, cutoff = 200,
	//Pitch Controls
	dtune = 0.002, vibspeed = 4, vibdepth = 0.015, ratio = 0.8, glide = 0.15;

	var env, fenv, vib, ffreq, snd;


	//Envelopes for amplitude and frequency:
	env = Env.adsr(att, dec, sus, rel).kr(gate: gate, doneAction: 2);
	fenv = Env.adsr(fatt, fdec, fsus, frel, curve:2).kr(gate: gate);

	//Giving the input freq vibrato:
	vib = SinOsc.kr(vibspeed).range(1 / (1 + vibdepth), (1 + vibdepth));
	freq = Line.kr(start: freq * ratio, end: freq, dur: glide);
	freq = freq * vib;

	//See beatings.scd for help with dtune
	snd = Saw.ar([freq, freq * (1 + dtune)], mul: env * amp);
	snd = Mix.ar(snd);

	//Sending it through an LPF: (Keep ffreq below nyquist!!)
	ffreq = max(fenv * freq * 12, cutoff) + 100;
	snd = LPF.ar(snd, ffreq);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Mike Hairston",
	category: \\keyboards,
	tags: [\\lead, \\modulation, \\analog, \\cs80, \\vangelis, \\bladerunner]
	)
).add;`,
  },
  {
    name: 'defaultB',
    category: 'Keys',
    credit: 'default SuperCollider synth, modified',
    tags: ['piano', 'pitched'],
    source: `/* The default Supercollider synth, with some minor improvements for increased control and understandability.

Modified by Josh Mithell and Bruno Ruviaro July 2019.
*/

SynthDef("defaultB", {
	arg
	//Standard values
	out=0, freq=440, amp=0.1, att = 0.01, rel = 0.3, pan=0, gate=1,
	// Extra controls
	beatingsRatio = 1.0009, sawWidth = 0.3, filterMax = 5000, filterMin = 4000, filterRatio = 0.63;

    var snd, freqarray, filterfreq;

	freqarray = [1, Rand(abs(2 - beatingsRatio), 1.0), Rand(beatingsRatio, 1.0)];
	filterfreq = XLine.kr(
			        start: Rand(filterMin, filterMax),
		            //With default values, end is within +/- 50hz of the original.
			        end: Rand(filterMin * filterRatio, filterMax * filterRatio),
			        dur: 3 * rel
		    );

	// The original adds the array [0, Rand(-0.4, 0.0), Rand(0.0, 0.4)] to freq instead.
    snd = VarSaw.ar(freq: freq * freqarray, width: sawWidth);
	snd = LPF.ar(
		            in: snd,
		            freq: filterfreq
	        );
	snd = snd * Env.asr(
		            attackTime: att,
		            //Use amp/5 to roughly match the amp of the original.
		            sustainLevel: amp/5,
		            releaseTime: rel,
		            curve: \\lin
	        ).kr(gate: gate, doneAction: 2);
	snd = Mix.ar(snd);

	//The original uses OffsetOut instead.
    Out.ar(out, Pan2.ar(snd, pan))
},
metadata: (
	credit: "default SuperCollider synth, modified",
	category: \\keyboards,
	tags: [\\piano, \\pitched]
)
).add;`,
  },
  {
    name: 'everythingRhodes',
    category: 'Keys',
    credit: 'Nick Collins, from Mitchell Sigman, 2011. http://www.sussex.ac.uk/Users/nc81/index.html',
    tags: ['rhodes', 'piano', 'pitched'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

By Nick Collins, from Mitchell Sigman (2011) Steal this Sound
http://www.sussex.ac.uk/Users/nc81/index.html

Modified by Josh Mitchell and Bruno Ruviaro 8/19.
*/

SynthDef("everythingRhodes", {
	arg
	//Standard Definitions
	out = 0, freq = 440, amp = 0.1, att = 0.001, rel = 3, pan = 0,
	//Other Controls
	filterRange = 2000, rq = 0.5, harmonic = 2.pow(33.5/12),
	//These Range from 0 to 1
	width = 0.2, mix = 0.7;

    //Electric Piano
	var snd, env, lfo;

	env = Env.perc(att, rel).kr(doneAction: 2); //Original used an ADSR envelope.

	snd = Pulse.ar(
	        	freq: freq * [1, harmonic], //Original used 33.5.midiratio here, which is just below the 7th harmonic.
	        	width: [width, width/2],
		        mul: [mix, (1 - mix)]
            );
	snd  = BLowPass4.ar(
		        in: snd,
		        freq: (filterRange * env) + (2 * freq),
		        rq: rq
		    );
    snd = Mix.ar(snd) * env * amp;

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Nick Collins, from Mitchell Sigman, 2011. http://www.sussex.ac.uk/Users/nc81/index.html",
	category: \\keyboards,
	tags: [\\rhodes, \\piano, \\pitched]
	)
).add`,
  },
  {
    name: 'harpsichord1',
    category: 'Keys',
    credit: 'unknown',
    tags: ['pitched', 'harpsichord'],
    source: `SynthDef("harpsichord1", { arg out = 0, freq = 440, amp = 0.1, pan = 0;
    var env, snd;
	env = Env.perc(level: amp).kr(doneAction: 2);
	snd = Pulse.ar(freq, 0.25, 0.75);
	snd = snd * env;
	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "unknown",
	category: \\keyboards,
	tags: [\\pitched, \\harpsichord]
)
).add;`,
  },
  {
    name: 'harpsichord2',
    category: 'Keys',
    credit: 'Zé Craum',
    tags: ['pitched'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Harpsichord based on Pluck Ugen
Original by Zé Craum

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\harpsichord2, {
	arg
	//Standard Values
	out = 0, amp = 0.1, freq = 440, pan = 0, rel = 5,
	//Pluck arguments (blend goes from 0 to 1)
	trig = 1, coef = 0.1, blend = 0.6;

	var exciter, root, octave, snd;

        // You can use white noise here, but Pink is more realistic
	exciter = PinkNoise.ar(amp);

	// Fundamental
        root = Pluck.ar(
	        in: exciter,
	        trig: trig,
	        maxdelaytime: 1/freq,
	        delaytime: 1/freq,
	        decaytime: rel,
	        coef: coef,
	        mul: blend
        );

	// Octave Above
	octave = Pluck.ar(
	        in: exciter,
	        trig: trig,
	        maxdelaytime: 1/(2 * freq),
	        delaytime: 1/(2 * freq),
	        decaytime: rel,
	        coef: coef,
	        mul: (1 - blend)
        );

	// Output Stuff
	snd = Mix.ar(root + octave);
	snd = Limiter.ar(snd);

    DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Zé Craum",
	category: \\keyboards,
	tags: [\\pitched]
	)
).add;
`,
  },
  {
    name: 'beating',
    category: 'Misc',
    credit: 'Bruno Ruviaro',
    tags: ['pitched'],
    source: `/*
A SynthDef by Bruno Ruviaro built around beats, an acoustic phenomenon created when
two oscillators at slightly different frequencies are combined. We hear the beating
frequency as the difference between these two frequencies.

For example, 455hz - 440hz = 15 beats per second.

Slightly modified by Josh Mitchell 8/19.
*/

SynthDef("beating", {
	arg freq = 440, amp = 0.1, out = 0, pan = 0, att = 0.01, dec = 1, curve = -4, beatFreq = 15;

	var env, snd, oscillator1, oscillator2;

	env = Env.perc(att, dec, amp, curve).kr(doneAction: 2);

	oscillator1 = SinOsc.ar(freq); //Try other waveforms for the oscillators! Mix and match, collect them all!
	oscillator2 = SinOsc.ar(Line.kr(freq + beatFreq, freq, dec));

	snd = Mix([oscillator1, oscillator2]);
	snd = snd * env;

	Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Bruno Ruviaro",
	category: \\misc,
	tags: [\\pitched]
	)
).add`,
  },
  {
    name: 'blip1',
    category: 'Misc',
    credit: 'unknown',
    tags: ['pitched'],
    source: `SynthDef("blip1", {arg out = 0, freq = 25, numharm = 10, att = 0.01, rel = 1, amp = 0.1, pan = 0;
	var snd, env;
	env = Env.perc(att, rel, amp).kr(doneAction: 2);
	snd = Blip.ar(
		freq: freq * [1, 1.01],
		numharm: numharm,
		mul: env
	);
	snd = LeakDC.ar(snd);
	snd = Mix.ar(snd);
	snd = Pan2.ar(snd, pan);
	Out.ar(out, snd);
},

metadata: (
	credit: "unknown",
	category: \\pads,
	tags: [\\pitched]
)
).add;




`,
  },
  {
    name: 'chaoscillator',
    category: 'Misc',
    credit: 'Josh Mitchell',
    tags: ['pitched', 'noisy'],
    source: `/*
I made a fun sound that replaces parts of a triangle wave with noise!

The noise is made with Hasher.ar and nyquist aliasing to make it sound
less whispery and more clangy.

Start with the default values and watch the waveform in Stethoscope.ar
to see what each control does, or just randomize 'em all.

By Josh Mitchell 9/19.
*/

SynthDef("chaoscillator", {
    arg
	//Standard Values
	out = 0, pan = 0, freq = 40, amp = 0.5, gate = 1, att = 0.01, rel = 1.5, curve = -4,
    //Other controls
	chaosUpStart = 0, chaosUpEnd = 0.5, chaosUpTime = 1,
	chaosDownStart = 0, chaosDownEnd = 0, chaosDownTime = 1,
	cutoff = 20000, reHashesPerCycle = 1, hashRate = 1, nyquist = 5000;

	var env, chaosRise, chaosFall, noisefunction, noise, switcha, switchb, shapea, shapeb, snd;

	//Envelopes for the signal and amount of noise on each half of the waveform
	env = Env.perc(attackTime: att, releaseTime: rel, level: amp, curve: curve).kr;
	chaosRise = Line.kr(start:  chaosUpStart,  end:  chaosUpEnd,  dur:  chaosUpTime );
	chaosFall = Line.kr(start: chaosDownStart, end: chaosDownEnd, dur: chaosDownTime);

	//Switches to decide whether section a or b gets played:
	switcha = LFPulse.ar(freq: freq, iphase:  0 );
	switchb = LFPulse.ar(freq: freq, iphase: 0.5);

	//Creating repeating loops of noise with Hasher.ar:
	noisefunction = Impulse.ar(freq: freq * reHashesPerCycle, mul: 2, add: -1);
	noisefunction = Sweep.ar(trig: noisefunction);
	noise = Hasher.ar(in: noisefunction);
	noise = LPF.ar(in: noise, freq: nyquist);
	noise = Latch.ar(noise, Impulse.ar(nyquist * 2));
	noise = LPF.ar(in: noise, freq: nyquist);

	//Adjusting amplitudes for each section:
	noise = noise * LFTri.ar(freq: freq, iphase: 0);
	shapea = noise * switcha * chaosRise;
	shapeb = noise * switchb * chaosFall;

	//Mixing the two sections together to create a triangle-ish wave:
	shapea = LFSaw.ar(freq: freq, iphase: 1, mul:    switcha,   add: shapea);
	shapeb = LFSaw.ar(freq: freq, iphase: 1, mul: -1 * switchb, add: shapeb);

	//Output stuff:
	snd = Mix.ar(shapea + shapeb);
	snd = LeakDC.ar(snd);
	snd = LPF.ar(in: snd, freq: cutoff, mul: env);
	snd = FreeVerb.ar(in: snd, mix: 0.2, room: 0.7, damp: 1);

	DetectSilence.ar(in: snd, doneAction: 2);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Josh Mitchell",
	category: \\misc,
	tags: [\\pitched, \\noisy]
	)
).add;		`,
  },
  {
    name: 'crossoverDistortion',
    category: 'Misc',
    credit: 'Josh Mitchell',
    tags: ['pitched', 'noisy'],
    source: `/*
Crossover distortion is a type of distortion present in class B amplifiers.
Here, the nonlinearity (a fancy word for distortion) is largest near the x axis,
as opposed to near the peaks of a waveform in regular distortion.
(wikipedia has lots more cool info if you're interested in this stuff)

This SynthDef combines crossover and regular distortion for a sputtery, gated,
almost metallic sound, something seen in a couple fuzz pedals.

For cleaner sounds, set preamp and nonlinearity low, and amp higher than normal.

By Josh Mitchell Jan 2020
*/

SynthDef("crossoverDistortion", {
    arg
	//Standard Values
	out = 0, pan = 0, freq = 160, amp = 1, att = 0.001, rel = 1, crv = -2,
    //Other controls, nonlinearity ranges from 0 to 1
	preamp = 1, nonlinearity = 0.75;

	var env, osc, snda, sndb, snd, nl;

	// Scales the nonlinearity control exponentially, making it more intuitive
	nl = 2.pow((nonlinearity.wrap(0, 1.0001)).range(-5, 5));

	// Simple envelope
	env = Env.perc(
		attackTime: att,
		releaseTime: rel,
		curve: crv).ar(doneAction: 2);

	// This is the signal going through the distortion section. Experiment here!
	osc = LFTri.ar(freq: freq, mul: env);

	// Split the signal into two sections to prep it for the distortion section
	snda = (Clip.ar(osc, 0, 1) * 2) - 1;
	sndb = (Clip.ar((-1 * osc), 0, 1) * 2) - 1;

	// Set the amplitude of the signal going into the transfer function
	snda = snda * preamp;
	sndb = sndb * preamp;

	// The transfer function:
	snda = 1/(1+(nl * snda * -1).exp);
	sndb = 1/(1+(nl * sndb * -1).exp);

	// Output stuff:
	snd = snda - sndb;
	snd = Mix.ar(snd) * amp;
	snd = Limiter.ar(snd);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Josh Mitchell",
	category: \\misc,
	tags: [\\pitched, \\noisy]
	)
).add;
`,
  },
  {
    name: 'decimator',
    category: 'Misc',
    credit: 'Josh Mitchell',
    tags: ['pitched', 'noisy'],
    source: `/*
This is a synthDef that's inspired by (and tries to replicate) the Decimator quark.

The decimator quark allows you to change the sample rate and bit depth of a signal,
independently of the sample rate and bit depth supercollider is currently running at.
These changes are done in this SynthDef through Latch.ar (a sample-and-hold) and .round,
respectively.

I've also added a pair of low pass filters at the beginning and end of these sections,
as a very basic simulation of an analog-to-digital-to-analog converter. The filters can
be switched on or off (listen to the demo), and they're currently set to half of the new
sample rate (the nyquist frequency). This is because, looking at the frequency domain,
sounds above the nyquist frequency get mirrored around it. Therefore, filtering out the
stuff above the nyquist frequency makes the resulting sound a bit cleaner.

Funnily enough, because of the weird things that happen above the nyquist frequency, my
sample rate clock is only able to go up to the nyquist frequency related to supercollider's
sampling rate without itself being aliased. I set a limit on my decimator's sample rate
because of this, but you can remove it if you want.

Lastly, the preamp control pushes the input signal above a hard clipping threshold to
simulate a signal that's too loud going into an adc. If you don't want this effect, set
the preamp control to 1.

By Josh Mitchell June 2020
*/

SynthDef("decimator", {
    arg
	//Standard Values
	out = 0, pan = 0, freq = 440, amp = 0.1, gate = 1,
	att = 0.001, dec = 0.1, sus = 0.9, rel = 1, crv = -2,
        //Other controls, filterswitch is 0 or 1
	preamp = 1, bitdepth = 16, samplerate = 10000, filterswitch = 0, filtermult = 0.5;

	var rate, env, snd, clock, remainder;

	//Set up the sample rate (Weird things happen above half of supercollider's sample rate)
    rate = samplerate.clip(20, SampleRate.ir/2);

	//Simple adsr envelope
	env = Env.adsr(
		attackTime: att,
		decayTime: dec,
		sustainLevel: sus,
		releaseTime: rel,
		curve: crv).ar(gate: gate, doneAction: 2);

	// Fix the input signal range
	snd = SinOsc.ar(freq: freq, mul: 0.5 * preamp, add: 0.5);
	snd = snd * env;

	//Input filtering to simulate a very cheap adc
	snd = Select.ar(
		which: filterswitch,
		array: [snd, LPF.ar(in: snd, freq: rate * filtermult)]);

	//Sampe Rate Reduction
	clock = LFPulse.ar(freq: rate, width: 0.001) - 0.5;
	snd = Latch.ar(snd, clock);

	//Bit Depth Reduction
	remainder = 2.pow(bitdepth).mod(1);
	snd = Clip.ar(
		in: snd,
		lo: 0,
		hi: 1);
	snd = XFade2.ar(
		inA: snd.round(1/(2.pow(bitdepth).floor)),
		inB: snd.round(1/(2.pow(bitdepth).ceil)),
		pan: (remainder * 2) - 1);

	//Output filtering to simulate a very cheap dac (and other output stuff)
	snd = Mix.ar(((snd * 2) - 1)) * amp;
	snd = Select.ar(
		which: filterswitch,
		array: [snd, LPF.ar(in: snd, freq: rate * filtermult)]);
	snd = LeakDC.ar(snd);
	snd = Limiter.ar(snd);

	Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Josh Mitchell",
	category: \\misc,
	tags: [\\pitched, \\noisy]
	)
).add;
`,
  },
  {
    name: 'laserbeam',
    category: 'Misc',
    credit: '',
    tags: [],
    source: `/*
Mitchell Sigman (2011) Steal this Sound. Milwaukee, WI: Hal Leonard Books

Adapted for SuperCollider and elaborated by Nick Collins
http://www.sussex.ac.uk/Users/nc81/index.html
under GNU GPL 3 as per SuperCollider license

Minor modifications by Bruno Ruviaro, June 2015.
*/

SynthDef("laserbeam", {
	arg out = 0, pan = 0.0, freq = 440, amp = 0.1, att = 0.01;
	var snd, freqenv, ampenv;
	// frequency envelope
	freqenv = EnvGen.ar(Env([4, 0.5, 1, 1], [att, 0.01, 1.0]));
	// amplitude envelope
	// no gate: fixed-time envelope, self-terminating.
	ampenv = EnvGen.ar(
		envelope: Env([0, 1, 0.5, 0.0], [0.02, 0.2, 0.1]),
		levelScale: amp,
		doneAction: 2);
	snd = LFTri.ar(freq: freq * freqenv, mul: ampenv);
	Out.ar(out, Pan2.ar(snd, pan));
}).add;`,
  },
  {
    name: 'moreHarmonics',
    category: 'Misc',
    credit: 'Josh Mitchell',
    tags: ['pitched'],
    source: `/*
moreHarmonics does exactly what it says: it gives an input more harmonics.

It uses a few methods for doing so (but not every possible method):
-two methods for saturation (.softclip and .tanh, which is more distorted),
-two methods for wavefolding, one smooth (SinOsc.ar) and one sharp (.fold),
-a way of wrapping waves around from 1 to -1, like the sides in pacman (.wrap),
-and a sort of square-wave-ifier using a Schmitt trigger.

You can mix between them with blend, select, and focus. Blend goes from 0 to 1,
and determines the amount of square-wave-ification. Select goes from 0 to 4, and
chooses between the other 5 methods in the order I listed them. Focus blends in
adjacent methods from that list.

Preamp sets the gain of the sine wave going into all this stuff, and determines
the timbre of the sound. Threshold is the threshold of the Schmitt trigger.

By Josh Mitchell June 2020.
*/

SynthDef("moreHarmonics", {
    arg
	// Standard Values
	out = 0, pan = 0, freq = 160, amp = 1, gate = 1,
	att = 0.05, dec = 0.1, sus = 0.6, rel = 0.7, crv = -2,
	// Other controls
	preamp = 15, blend = 0, select = 2, focus = 0, threshold = 0.1;

	var env, snd, thresh;

	// Envelope:
	env = Env.adsr(
		attackTime: att,
		decayTime: dec,
		sustainLevel: sus,
		releaseTime: rel,
		curve: crv).ar(gate: gate, doneAction: 2);
	env = env * preamp;

	// The sound being sent through everything:
	snd = SinOsc.ar(freq: freq, mul: env);

	// The list of tricks:
	snd = [
		snd.softclip,
		snd.tanh,
		SinOsc.ar(freq: 0, phase: (snd * pi/2).mod(2pi)),
		snd.fold(-1, 1),
		snd.wrap(-1, 1)
	];

	// Schmitt trigger
	thresh = threshold.clip(0, 0.9999);
	snd = (Schmidt.ar(snd, -1 * thresh, thresh) * blend) + (snd * (1 - blend));

	// Mixing it all together
	snd = SelectXFocus.ar(
		which: select.clip(0, 4),
		array: snd,
		focus: 1 - focus.clip(0, 1).sqrt,
		wrap: false);

	// Output Stuff:
	snd = Mix.ar(snd) * amp;
	snd = Limiter.ar(snd);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Josh Mitchell",
	category: \\misc,
	tags: [\\pitched]
	)
).add;`,
  },
  {
    name: 'musicBox',
    category: 'Misc',
    credit: 'by Josh Mitchell',
    tags: ['pitched', 'modal'],
    source: `/*
This SynthDef is a haunted music box, done with modal synthesis. If you're interested,
check out modalmarimba.scd. Essentially, everything in the "Modal Stuff" section is
modeling a physical beam that's clamped at one end and hit at the other (just like the
tines in a real music box!)

The decay coefficient (decCoef) does a lot to determine the timbre, position simulates
the position on the beam in which it's hit (0.5 is the middle), and slope is the db/oct
slope of a filter with a constant slope across the audio range.

The solutions to the dynamic beam equation (look up Euler-Bernoulli beam theory if you're
interested) are from Nathan Ho, as well as some of the methods I used for amparray.

Other Stuff: After the modal synthesis portion, There's a high pass filter to help the
music box sound more empty and haunted, an expander to alter the curve of the note
decay a bit, and freeverb, because a) it's metallic sounding, and b) reverb is spooky.

By Josh Mitchell June 2020.
*/

SynthDef(\\musicBox, {
	arg
	// Standard values
	out = 0, freq = 1000, amp = 0.1, att = 0, dec = 1, rel = 3, pan = 0,
	// Other controls
	decCoef = 0.25, ampSlope = 3, filterfreq = 4000, expRatio = 2,
	// These controls go from 0 to 1
	position = 0.1, thresh = 0.75, mix = 0.1, size = 0.6, revdamp = 0;

	var freqarray, amparray, decarray, exciter, snd;

// Modal Stuff:
	// Array of frequencies, determined by solutions to the dynamic beam equation
	freqarray = Array.fill(30, { arg i; i + 0.5});
        freqarray[0] = 0.59686416;
	    freqarray[1] = 1.49417561;
	    freqarray[2] = 2.50024695;
	    freqarray = freqarray/0.59686416; // Normalize to freqarray[0] = 1

	// Array of amplitudes
	amparray = Array.fill(30, { arg i;
		if (freqarray[i] > 20000)
		    { 0 }
		    {
			    sin(((i + 1) * pi) * position) *
		        (ampSlope * (freqarray[i]).log2).dbamp
		    }
	});

	// Array of Decay times
	decarray = Array.fill(30, { arg i;
		exp(-1 * i * decCoef)
	});
	decarray = decarray/decarray[0];

	// Hit the object
	exciter = Decay2.ar(
		in: Impulse.ar(0),
		attackTime: att,
		decayTime: dec, 
		mul: 0.1);

	// Bank of resonators
	snd = Klank.ar(
		specificationsArrayRef: Ref.new([freqarray, amparray, decarray]),
		input: exciter,
		freqscale: freq,
		decayscale: rel);

// Other stuff:
	snd = Mix.ar(snd);
	// High pass filter to make it more lofi
	snd = HPF.ar(
		in: snd,
		freq: filterfreq);
	// Expander to cheaply alter the overall decay curve
	snd = CompanderD.ar(
		in: snd,
		thresh: thresh,
		slopeBelow: 1,
		slopeAbove: expRatio);
	// Reverb for a more haunted, metalic sound
	snd = FreeVerb.ar(
		in: snd,
		mix: mix,
		room: size,
		damp: revdamp);
	snd = Limiter.ar(snd * amp);

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "by Josh Mitchell",
	category: \\misc,
	tags: [\\pitched, \\modal]
)).add;
`,
  },
  {
    name: 'noisy',
    category: 'Misc',
    credit: '',
    tags: [],
    source: `SynthDef("noisy", {arg out = 0, freq = 440, amp = 0.2, pan = 0.5;
	var snd, env;
	env = Env.perc(0.02, 0.1).kr(doneAction: 2);
	snd = Mix(LFPulse.ar(
		freq: freq * [1, 5/2],
		iphase: 0.0,
		width: 0.5,
		mul: amp));
	snd = snd * env ;
	Out.ar(out, Pan2.ar(snd, pan));
}).add;`,
  },
  {
    name: 'phazer',
    category: 'Misc',
    credit: 'Josh Mitchell',
    tags: ['pitched', 'effects'],
    source: `/*
Phasers are cool, here's a supercollider one:

By Josh Mitchell 11/19.
*/

SynthDef("phazer", {
    arg
	//Standard Values
	out = 0, pan = 0, freq = 440, amp = 0.5, gate = 1,
	att = 1, dec = 3, sus = 0, rel = 1.5, crv = -4,
    //Other controls
    rq = 0.5, rate = 1, minfreq = 100, maxfreq = 16000,
	drylevel = 1.5, fmdepth = 1.5, fmfreq = 432;

	var env, lfo, input, snd;

	env = Env.adsr(
		    attackTime: att,
	    	decayTime: dec,
    		sustainLevel: sus,
		    releaseTime: rel,
	    	curve: crv
	    ).ar(doneAction: 2);

	//Controls the all pass freq; try an envelope here as well!
	lfo = LinExp.ar(LFTri.ar(rate), -1, 1, minfreq, maxfreq/8);
	//lfo = LinExp.ar(env, 0, 1, minfreq, maxfreq/8);

	//The input sound (Dense frequency content is better)
	input = LFSaw.ar(freq: SinOsc.ar(fmfreq).range(1, fmdepth) * freq, mul: env * amp);

	//All pass filter + dry sound = P H A Z E R
	snd = BAllPass.ar(input, [1, 2, 4, 8] * lfo, rq);
	snd = Mix.ar(snd);
	snd = snd + (input * -1 * drylevel);
	snd = Mix.ar(snd);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Josh Mitchell",
	category: \\misc,
	tags: [\\pitched, \\effects]
	)
).add;`,
  },
  {
    name: 'ping_mh',
    category: 'Misc',
    credit: 'Author Unknown',
    tags: ['percussive', 'ping', 'default', 'simple', 'stereo', 'detuned', 'tuned'],
    source: `/* Received from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/ping_mh.scd

Note from the author:

Your basic percussive synth instrument, a good default sound for testing patterns, etc.

Modified By Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\ping_mh,{

	arg freq = 440, amp = 0.2, dur = 1, att = 0.001, curve = -4, pan = 0, out = 0, rate = 4, depth = 0.03;

	var snd, lfo, env;

	lfo = LFNoise2.ar(rate).range(1 / (1 + depth), (1 + depth));

	env = Env.perc(attackTime: att, releaseTime: dur, level: amp, curve: curve).kr(doneAction:2);

	snd = SinOsc.ar(freq: [freq, freq * lfo], mul: env);

	Out.ar(out, Pan2.ar(snd, pan))
},
metadata: (
	credit: "Author Unknown",
	category: \\misc,
	tags: [\\percussive, \\ping, \\default, \\simple, \\stereo, \\detuned, \\tuned]
	)
).add;`,
  },
  {
    name: 'saturatingWavefolder',
    category: 'Misc',
    credit: 'Josh Mitchell',
    tags: ['pitched'],
    source: `/*
Wavefolding is really fun. It's been a kinda big part of the history of west
coast synthesis, and you can make some nice, strange, alien tube noises with
it. It's very simple, too; it's pretty much just turning a waveform back
around when it hits a positive or negative edge.

This means it's simple enough to overdo a bit. I'm certainly guilty of that.
A saturating wavefolder can help fix that, though! All the "saturating" part
means is that you can set a limit so that the wave makes small turns back and
forth at the positive and negative edges of the wavefolder, instead of making
big turns across the entire area between these two edges.

Preamp affects the timbre of the sound, and limit is the limit I mentioned
above. Positive and negative values give slightly different results, and 0
turns the wavefolder into a regular old distortion like guitarists use.

I learned about saturating wavefolders at this helpful site:
https://ccrma.stanford.edu/~jatin/ComplexNonlinearities/Wavefolder.html

By Josh Mitchell June 2020.
*/

SynthDef("saturatingWavefolder", {
    arg
	// Standard Values
	out = 0, pan = 0, freq = 160, amp = 1, att = 0.001, rel = 0.7, crv = -2,
	// Other controls
	preamp = 20, limit = -0.2;

	var env, in, snd;

	// Envelope:
	env = Env.perc(
		attackTime: att,
		releaseTime: rel,
		level: preamp * pi/2,
		curve: crv).ar;

	// The sound being sent through everything:
	in = SinOsc.ar(freq: freq, mul: env);

	// The wavefolder:
	snd = SinOsc.ar(freq: 0, phase: in.mod(2pi)) * limit;
	snd = snd + in.tanh;

	// Output Stuff:
	snd = snd * 1/(1 + abs(limit)); //fix the volume
	snd = Mix.ar(snd) * amp;
	snd = Limiter.ar(snd);

	DetectSilence.ar(in: snd, doneAction: 2);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Josh Mitchell",
	category: \\misc,
	tags: [\\pitched]
	)
).add;
`,
  },
  {
    name: 'sillyVoice',
    category: 'Misc',
    credit: 'Bruno Ruviaro?',
    tags: ['pitched', 'vocal'],
    source: `/*
I believe the original is by Bruno Ruviaro?

Modified by Josh Mitchell 8/19.
*/

SynthDef("sillyVoice", { arg
	out = 0, pan = 0, freq = 220, amp = 0.5, vibSpeed = 6, vibDepth = 0.04, vowel = 0, att = 0.05, rel = 0.1, lag = 1, gate = 1, curve = -4, kAmp = 0.05, kRel = 1;

	var vibrato, env, kEnv, in, va, ve, vi, vo, vu, snd;

	vibrato = SinOsc.kr(freq: vibSpeed).range(1 / (1 + vibDepth), (1 + vibDepth));

	env = Env.asr(
		attackTime: att,
		sustainLevel: amp,
		releaseTime: rel,
		curve: curve).kr(gate: gate, doneAction: 2);

	kEnv = Env.perc(attackTime: att, releaseTime: kRel, level: kAmp, curve: curve).kr;

	in = Saw.ar(freq: Lag.kr(in: freq, lagTime: lag) * vibrato, mul: env);

	in = in + WhiteNoise.ar(kEnv);

	va = BBandPass.ar(
		in: in,
		freq: [ 600,  1040,   2250,   2450,   2750  ],
		bw:   [ 0.1,  0.067,  0.049,  0.049,  0.047 ],
		mul:  [ 1,    0.447,  0.355,  0.355,  0.1   ]);

	ve = BBandPass.ar(
		in: in,
		freq: [ 400,  1620,   2400,   2800,   3100  ],
		bw:   [ 0.1,  0.049,  0.042,  0.043,  0.039 ],
		mul:  [ 1,    0.251,  0.355,  0.251,  0.126 ]);

	vi = BBandPass.ar(
		in: in,
		freq: [ 250,   1750,   2600,   3050,   3340  ],
		bw:   [ 0.24,  0.051,  0.038,  0.039,  0.036 ],
		mul:  [ 1,     0.032,  0.158,  0.079,  0.04  ] );

	vo = BBandPass.ar(
		in: in,
		freq: [ 400,  750,    2400,   2600,   2900  ],
		bw:   [ 0.1,  0.107,  0.042,  0.046,  0.041 ],
		mul:  [ 1,    0.282,  0.089,  0.1,    0.01  ]);

	vu = BBandPass.ar(
		in: in,
		freq: [ 350,    600,    2400,   2675,   2950  ],
		bw:   [ 0.114,  0.133,  0.042,  0.045,  0.041 ],
		mul:  [ 1,      0.1,    0.025,  0.04,   0.016 ]);

	snd = SelectX.ar(which: Lag.kr(in: vowel, lagTime: lag), array: [va, ve, vi, vo, vu]);

	snd = Mix.ar(snd);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Bruno Ruviaro?",
	category: \\misc,
	tags: [\\pitched, \\vocal]
	)
).add;`,
  },
  {
    name: 'sputter',
    category: 'Misc',
    credit: 'Josh Mitchell',
    tags: ['pitched', 'stereo'],
    source: `/*
This SynthDef started with an idea for a "1-bit resonator." One method for creating a
regular resonator is to send a sound through a very short delay and add that back to
the original, with some amounnt of feedback. In my one bit version, that sound was to
be a single square wave from 0 to 1, (hence one bit) that got combined with a delay
line that had no feedback, using logic gates for a one bit, 1-or-0 output.

I decided I wanted volume control, so I added an envelope, and shifted from using logic
gates to using math that works kinda like those logic gates, but that responds to and
outputs a continuous range of numbers, not just a 1 or 0. I have five options that you
can select between, by setting the method control to 0, 1, 2, 3, or 4 (values in between
and outside get rounded). Each one gives a slightly different sound.

I also added some pulse width modulation on the initial square wave, with controls for
rate, depth, and the default center pulse width value. Turning pwmRate up past 20hz starts
to make some cool noises.

Next I decided to make the SynthDef stereo. Now each delay line has a different frequency
(1/delay time) that both ramp from resStartFreq. I also added a stereo width contrl from
0 (the sounds get mixed down to mono) to 1 (the sounds are hard-panned opposite to each
other). If you use negative numbers for stereoWidth, the left and right channels get
swapped.

After all this I decided that the SynthDef was missing a sputtery end to all its notes.
Really old videogames have unique note decays because of their relatively low bit depths.
Sometimes when the volume of a note decays to between on and off, it'll get rounded weird,
and "sputter" a bit because the note fluctuates between getting rounded up and rounded
down to silence. At least, that's my understanding. I replicated and amplified this effect
using Schmidt.ar and a bit of noise, which combine to replicate the process I described.
You can control the threshold of the gate that's deciding when to round up or down with
gateThresh; this alters the release time of the note. You can also turn it off by setting
the gateSwitch to 0.

By Josh Mitchell August 2020
*/

SynthDef(\\sputter, {
	arg
	//Standard Values
	out = 0, pan = 0, amp = 0.05, freq = 330, att = 0.005, rel = 3.5, crv = -6,
	// Modulation Controls
	pw = 0.5, noiseDepth = 0.05, pwmRate = 12, pwmDepth = 0.15,
	// Resonator controls
	resStartFreq = 2000, resFreqL = 500, resFreqR = 5000, resAtt = 0.5,
	// Other Controls (all go from 0 to 1, except for method from 0 to 4)
	method = 0, gateSwitch = 1, gateThresh = 0.5, stereoWidth = 0.75;

	var env, envNoise, resControl, pwm, snd, res;

	// Make an Envelope
	env = Env.perc(
		attackTime: att,
		releaseTime: rel,
		curve: crv
	).ar;

	// Add a Little Noise to the Envelope
	envNoise = [
		LFClipNoise.ar(
			freq: freq).range(0, noiseDepth),
		LFClipNoise.ar(
			freq: freq).range(0, noiseDepth)
	];
	envNoise = Schmidt.ar(
		in: env,
		lo: 0.0001,
		hi: 0.0001
	) * envNoise;
	env = env + envNoise;

	// Make an LFO for the Pulse Width
	pwm = LFTri.ar(
		freq: pwmRate,
		mul: pwmDepth
	);
	pwm = (pwm + pw).clip(0, 1);

	// Make a Square Wave
	snd = LFPulse.ar(
		freq: freq,
		width: pwm,
		mul: env
	);
	// Make a Noise Gate
	snd = snd * Schmidt.ar(
		in: snd,
		lo: gateThresh * gateSwitch,
		hi: gateThresh
	);

	//Make a Resonator for the Square
	resControl = Line.ar(
		start: resStartFreq,
		end: [resFreqL, resFreqR],
		dur: resAtt
	);
	res = DelayC.ar(
		in: snd,
		maxdelaytime: [
			(1/resStartFreq).max(1/resFreqL),
			(1/resStartFreq).max(1/resFreqR)],
		delaytime: 1/resControl
	);

	// Choose how to Combine the Square and Resonator
	snd = Select.ar(
		which: method.clip(0, 4).round(1),
		array: [
			(snd + res).clip(0, 1),         // kinda like "snd or res"
			(snd + res).wrap(0, 1),         // kinda like "snd or res"
			snd * res,                      // kinda like "snd and res"
			(1 - snd) * res,                // kinda like "not-snd and res"
			((1 - snd) * res) + ((1 - res) * snd) // like "snd xor res"
	]);
	snd = LeakDC.ar(snd);

	// Set the Stereo Width
	snd = XFade2.ar(
		inA: [snd[1], snd[0]],
		inB: [snd[0], snd[1]],
		pan: stereoWidth
	);

	// Output Stuff
	snd = HPF.ar(
		in: snd,
		freq: freq/2
	);
	snd = snd * amp;
	snd = Limiter.ar(snd);

	DetectSilence.ar(in: Mix.ar(snd), doneAction: 2);

	// Stereo Version of Pan2.ar
	snd = Balance2.ar(
		left: snd[0],
		right: snd[1],
		pos: pan
	);

	Out.ar(out, snd);
},
metadata: (
	credit: "Josh Mitchell",
	category: \\misc,
	tags: [\\pitched, \\stereo]
	)
).add;`,
  },
  {
    name: 'triangleWaveBells',
    category: 'Misc',
    credit: '',
    tags: [],
    source: `/*
Mitchell Sigman (2011) Steal this Sound. Milwaukee, WI: Hal Leonard Books
pp. 10-11

Adapted for SuperCollider and elaborated by Nick Collins
http://www.sussex.ac.uk/Users/nc81/index.html
under GNU GPL 3 as per SuperCollider license

Minor modifications by Bruno Ruviaro, June 2015.
*/

SynthDef("triangleWaveBells",{
	arg out = 0, pan = 0.0, freq = 440, amp = 1.0, gate = 1, att = 0.01, dec = 0.1, sus = 1, rel = 0.5, lforate = 10, lfowidth = 0.0, cutoff = 100, rq = 0.5;

	var osc1, osc2, vibrato, filter, env;
	vibrato = SinOsc.ar(lforate, Rand(0, 2.0));
	osc1 = Saw.ar(freq * (1.0 + (lfowidth * vibrato)), 0.75);
	osc2 = Mix(LFTri.ar((freq.cpsmidi + [11.9, 12.1]).midicps));
	filter = RHPF.ar((osc1 + (osc2 * 0.5)) * 0.5, cutoff, rq);
	env = EnvGen.ar(
		envelope: Env.adsr(att, dec, sus, rel, amp),
		gate: gate,
		doneAction: 2);
	Out.ar(out, Pan2.ar(filter * env, pan));
}).add;`,
  },
  {
    name: 'trig_demo',
    category: 'Misc',
    credit: 'Unknown',
    tags: ['pitched'],
    source: `/*
Original author unknown, original used SinOsc.ar instead of Pulse.ar

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("trig_demo", {
	arg out = 0, pan = 0, freq = 440, gate = 1, t_trig = 1, att = 0.01, sus = 1, rel = 0.25;

    var env, snd;

	env = Decay2.kr(in: t_trig, attackTime: att, decayTime: rel);

	env = env * Linen.kr(gate: gate, attackTime: att, susLevel: sus, releaseTime: rel, doneAction: 2);

    snd = Pulse.ar(freq: freq, mul: env);

	Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Unknown",
	category: \\misc,
	tags: [\\pitched]
	)
).add;`,
  },
  {
    name: 'vintageSine',
    category: 'Misc',
    credit: 'Zé Craum; Josh Mitchell',
    tags: ['vintage', 'pitched'],
    source: `/* Retrieved from
http://sccode.org/1-5aD
Original by Zé Craum

Crude simulation of old sinusoidal generators - with random vibrato and a high noise floor.

50hz mains hum emulation and slightly distorted sine (a clipped triangle wave) added by Josh Mitchell.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\vintageSine, {
	arg
	//Standard Definitions
	amp = 0.2, freq = 440, pan = 0, att = 0.001, sus = 1, rel = 0.5, gate = 1, out = 0,
	//Noise Arguments (mainsDepth is 0 to 1)
	noiseAmp = 0.06, mainsDepth = 0.1, mainsHz = 50,
	//Sine Arguments
	vrate = 2, vdepth = 0.005, sineClip = 0.825;

	var noise, env, snd, vibrato;

	env = Env.asr(att, amp, rel, curve: \\lin).kr(gate: gate, doneAction: 2);

	noise = PinkNoise.ar(noiseAmp * LFPar.ar(mainsHz * 2).range((1 - mainsDepth), 1));
	noise = noise + LFPar.ar(freq: mainsHz, mul: noiseAmp/8);

	vibrato = freq * LFNoise2.ar(vrate).range(1/(1 + vdepth), (1 + vdepth));

	snd = Clip.ar(LFTri.ar(vibrato), -1 * sineClip, sineClip).softclip;
	snd = ((snd * amp) + noise) * env;
	Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Zé Craum; Josh Mitchell",
	category: \\misc,
	tags: [\\vintage, \\pitched]
	)
).add;`,
  },
  {
    name: 'werkit',
    category: 'Misc',
    credit: '',
    tags: [],
    source: `/*
Mitchell Sigman (2011) Steal this Sound. Milwaukee, WI: Hal Leonard Books
pp. 14-15

Adapted for SuperCollider and elaborated by Nick Collins
http://www.sussex.ac.uk/Users/nc81/index.html
under GNU GPL 3 as per SuperCollider license

Minor modifications by Bruno Ruviaro, June 2015.
*/

SynthDef("werkit", {
	arg out = 0, pan = 0.0, freq = 440, amp = 0.1, gate = 1, cutoff = 100, rq = 0.1, att = 0.01, dec = 0, sus = 1, rel = 1, delay = 0.3;

	var source, filter, env, snd, delayEnv;
	source = WhiteNoise.ar;
	filter = BLowPass4.ar(source, freq, rq) * 0.3;
	env = EnvGen.ar(
		envelope: Env.adsr(att, dec, sus, rel, amp),
		gate: gate,
		doneAction: 2);
	snd = (0.7 * filter + (0.3 * filter.distort)) * env;
	Out.ar(out, Pan2.ar(snd, pan));
}).add;`,
  },
  {
    name: 'werkit2',
    category: 'Misc',
    credit: '',
    tags: [],
    source: `/*
Mitchell Sigman (2011) Steal this Sound. Milwaukee, WI: Hal Leonard Books
pp. 14-15

Adapted for SuperCollider and elaborated by Nick Collins
http://www.sussex.ac.uk/Users/nc81/index.html
under GNU GPL 3 as per SuperCollider license

Minor modifications by Bruno Ruviaro, June 2015.
*/

SynthDef("werkit2", {
	arg out = 0, freq = 440, amp = 0.1, gate = 1, cutoff = 100, rq = 0.1, att = 0.01, dec = 0, sus = 1, rel = 0.1;

	var source, filter, env, snd;
	source = LFSaw.ar(Array.fill(16, { Rand(100, 200) }));
	filter = BLowPass4.ar(source, freq, rq) * 0.1;
	env = EnvGen.ar(
		envelope: Env.adsr(att, dec, sus, rel, amp),
		gate: gate,
		doneAction: 2);
	snd = (0.7 * filter + (0.3 * filter.distort)) * env;
	snd = HPF.ar(snd, 100);
	snd = Splay.ar(snd);
	Out.ar(out, snd);
}).add;`,
  },
  {
    name: 'organDonor',
    category: 'Organ',
    credit: '',
    tags: [],
    source: `/*
Mitchell Sigman (2011) Steal this Sound. Milwaukee, WI: Hal Leonard Books
pp. 12-13

Adapted for SuperCollider and elaborated by Nick Collins
http://www.sussex.ac.uk/Users/nc81/index.html
under GNU GPL 3 as per SuperCollider license

Minor SynthDef Smodifications by Bruno Ruviaro, June 2015.
*/

// Essentially, Pulse waveforms in multiple octaves; I've refined the patch to add freq*[1,2,3] which gives octave and octave + fifth over fundamental [Nick Collins]


SynthDef("organDonor",{
	arg out = 0, pan = 0.0, freq = 440, amp = 0.1, gate = 1, att = 0.01, dec = 0.5, sus = 1, rel = 0.5, lforate = 10, lfowidth = 0.01, cutoff = 100, rq = 0.5;

	var vibrato, pulse, filter, env;
	vibrato = SinOsc.ar(lforate, Rand(0, 2.0));
	// up octave, detune by 4 cents
	// 11.96.midiratio = 1.9953843530485
	// up octave and a half, detune up by 10 cents
	// 19.10.midiratio = 3.0139733629359
	freq = freq * [1, 1.9953843530485, 3.0139733629359];
	freq = freq * (1.0 + (lfowidth * vibrato));
	pulse = VarSaw.ar(
		freq: freq,
		iphase: Rand(0.0, 1.0) ! 3,
		width: Rand(0.3, 0.5) ! 3,
		mul: [1.0,0.7,0.3]);
	pulse = Mix(pulse);
	filter = RLPF.ar(pulse, cutoff, rq);
	env = EnvGen.ar(
		envelope: Env.adsr(att, dec, sus, rel, amp),
		gate: gate,
		doneAction: 2);
	Out.ar(out, Pan2.ar(filter * env, pan));
}).add;`,
  },
  {
    name: 'organReed',
    category: 'Organ',
    credit: 'Nathan Ho aka Snappizz',
    tags: ['pitched', 'tom', 'sos'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Reed Organ Simulation
Original by Nathan Ho aka Snappizz
http://sccode.org/1-51m

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("organReed", {
    arg
	//Standard Values
	out = 0, pan = 0, freq = 440, amp = 0.3, gate = 1, att = 0.3, rel = 0.3,
	//Depth and Rate Controls (pwmDepth and amDepth range from 0 to 1)
	ranDepth = 0.04, pwmRate = 0.06, pwmDepth = 0.1, amDepth = 0.05, amRate = 5,
	//Other Controls
	nyquist = 18000, fHarmonic = 0.82, fFreq = 2442, rq = 0.3, hiFreq = 1200, hirs = 1, hidb = 1;

    var snd, env;

	// The same envelope controls both the resonant freq and the amplitude
    env = Env.asr(
		attackTime: att,
		sustainLevel: amp,
		releaseTime: rel).ar(gate: gate, doneAction: 2);

    // pulse with modulating width
	snd = Pulse.ar(
		freq: TRand.ar(lo: 2.pow(-1 * ranDepth), hi: 2.pow(ranDepth), trig: gate) * freq,
		width: LFNoise1.kr(freq: pwmRate, mul: pwmDepth).range(0, 1),
		mul: 0.0625);  //Incereasing this lessens the impact of the BPF

    // add a little "grit" to the reed
    //original used snd = Disintegrator.ar(snd, 0.5, 0.7);
	snd = Latch.ar(snd, Impulse.ar(nyquist * 2));

    // a little ebb and flow in volume
	snd = snd * LFNoise2.kr(freq: amRate).range((1 - amDepth), 1);

	//Filtering (BHiShelf intensifies the buzzing)
	snd = snd + BPF.ar(in: snd, freq: env.linexp(0, amp, fFreq * fHarmonic, fFreq), rq: rq);
    snd = BHiShelf.ar(in: snd, freq: hiFreq, rs: hirs, db: hidb);

	//Output
	snd = Mix.ar(snd * env);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Nathan Ho aka Snappizz",
	category: \\organ,
	tags: [\\pitched, \\tom, \\sos]
	)
).add;`,
  },
  {
    name: 'organTonewheel0',
    category: 'Organ',
    credit: 'Zé Craum',
    tags: ['pitched'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Additive tonewheel organ with low CPU usage.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("organTonewheel0", {

	arg
    // Standard Values
	out = 0, freq = 440, amp = 0.7, att = 0.001, rel = 0.01, pan = 0, crv = -4, gate = 1,
	//organ voices (drawbars) amplitudes
	bass = 1, quint = 1, fundamental = 1, oct = 1, nazard = 1, blockFlute = 1, tierce = 1,
	larigot = 1, sifflute = 1,
	 //vibrato arguments
    vrate = 3, vdepth = 0.008;

	var snd, env, vibrato;

	vibrato = SinOsc.kr(vrate).range((1 / (1 + vdepth)), (1 + vdepth));

	env = Env.asr(
		attackTime: att,
		sustainLevel: amp,
		releaseTime: rel,
		curve: crv).ar(gate: gate);

	vibrato = DynKlang.ar(
		specificationsArrayRef: Ref.new([
			[1/12,  1/7, 1, 12, 19, 24, 28, 31, 36].midiratio,
			[bass, quint, fundamental, oct, nazard, blockFlute, tierce, larigot, sifflute].normalizeSum
		      ]),
		freqscale: vibrato * freq);

	// Output Stuff
	snd = vibrato * env;
	snd = Mix.ar(snd);
	snd = Limiter.ar(snd);

	DetectSilence.ar(in: snd, doneAction: 2);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Zé Craum",
	category: \\organ,
	tags: [\\pitched]
	)
).add;
`,
  },
  {
    name: 'organTonewheel1',
    category: 'Organ',
    credit: 'Zé Craum',
    tags: ['pitched'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Additive tonewheel organ with more CPU usage.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("organTonewheel1", {

	arg
    //Standard Values
	out = 0, freq = 440, amp = 0.7, att = 0.001, rel = 0.01, pan = 0, curve = -4, gate = 1,
	//organ voices (drawbars) amplitudes
	bass = 1, quint = 1, fundamental = 1, oct = 1, nazard = 1, blockFlute = 1, tierce = 1, larigot = 1, sifflute = 1,
	//vibrato arguments
    vrate = 3, vdepth = 0.008, vdelay = 0.1, vonset = 0, vrateVariation = 0.1, vdepthVariation = 0.1;

	var snd, env, vibrato;

	vibrato = Vibrato.kr(
		            freq: freq,
		            rate: vrate,
		            depth: vdepth,
	            	delay: vdelay,
	             	onset: vonset,
	             	rateVariation: vrateVariation,
	              	depthVariation: vdepthVariation,
	            );

	env = Env.asr(
		attackTime: att,
		sustainLevel: amp,
		releaseTime: rel,
		curve: curve).ar(gate: gate);

	snd = DynKlang.ar(
		specificationsArrayRef: Ref.new([
			[1/12,  1/7, 1, 12, 19, 24, 28, 31, 36].midiratio,
			[bass, quint, fundamental, oct, nazard, blockFlute, tierce, larigot, sifflute].normalizeSum,
			    ]),
		freqscale: vibrato);

	// Output Stuff
	snd = snd * env;
	snd = Mix.ar(snd);
	snd = Limiter.ar(snd);

	DetectSilence.ar(in: snd, doneAction: 2);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Zé Craum",
	category: \\organ,
	tags: [\\pitched]
	)
).add;
`,
  },
  {
    name: 'organTonewheel2',
    category: 'Organ',
    credit: 'Zé Craum',
    tags: ['pitched'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Subtractive tonewheel organ with cheap CPU usage.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\organTonewheel2, {
	arg
	//Standard Values
	out = 0, pan = 0, freq = 440, amp = 0.45, att = 0.001, rel = 0.1, gate = 1,
	//Other controls (blend goes from 0 to 1)
	vibRate = 6.0, vibHarmonic = 1.017, filterHarmonic = 5.04, rq = 1, blend = 0.83;

	var snd, env, vibrato;

	env = Env.asr(attackTime: att, sustainLevel: amp, releaseTime: rel).kr(gate: gate, doneAction: 2);

	vibrato = SinOsc.ar(freq: vibRate).range(freq, freq * vibHarmonic);

	snd = LFPulse.ar(freq: freq, width: 0.5, mul: 1 - blend) + LFPulse.ar(freq: freq + vibrato, width: 0.18, mul: blend);

	snd = RLPF.ar(in: snd, freq: filterHarmonic * freq, rq: rq, mul: env);

    snd = LeakDC.ar(snd);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Zé Craum",
	category: \\organ,
	tags: [\\pitched]
	)
).add;`,
  },
  {
    name: 'organTonewheel3',
    category: 'Organ',
    credit: 'Zé Craum',
    tags: ['pitched'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Subtractive tonewheel organ with cheap CPU usage.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\organTonewheel3, {
	arg
	//Standard Values
	out = 0, pan = 0, freq = 440, amp = 0.45, att = 0.001, rel = 0.1, gate = 1,
	//Vibrato Controls
	vrate = 6, vdepth = 0.02, vdelay = 0.1, vonset = 0, vrateVariation = 0.1, vdepthVariation = 0.1,
	//Other controls (blend goes from 0 to 1)
	filterHarmonic = 5.04, rq = 1, blend = 0.83;

	var snd, env, vibrato;

	env = Env.asr(attackTime: att, sustainLevel: amp, releaseTime: rel).kr(gate: gate, doneAction: 2);

		vibrato = Vibrato.kr(
		            freq: freq,
		            rate: vrate,
		            depth: vdepth,
	            	delay: vdelay,
	             	onset: vonset,
	             	rateVariation: vrateVariation,
	              	depthVariation: vdepthVariation,
	            );

	snd = LFPulse.ar(freq: freq, width: 0.5, mul: 1 - blend) + LFPulse.ar(freq: freq + vibrato, width: 0.18, mul: blend);

	snd = BLowPass4.ar(in: snd, freq: filterHarmonic * freq, rq: rq, mul: env);

    snd = LeakDC.ar(snd);

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Zé Craum",
	category: \\organ,
	tags: [\\pitched]
	)
).add;`,
  },
  {
    name: 'organTonewheel4',
    category: 'Organ',
    credit: 'Nick Collins',
    tags: ['pitched'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Original by Nick Collins, from Mitchell Sigman (2011) Steal this Sound
http://www.sussex.ac.uk/Users/nc81/index.html

Subtractive tonewheel organ from Steal this Sound example.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\organTonewheel4,{
	arg
	//Standard Values
	out = 0, pan = 0, freq = 440, amp = 0.1, gate = 1, att = 0.0, dec = 0.0, sus = 1, rel = 0.1,
	//Other controls (blend goes from 0 to 1)
	lforate = 4.85, lfodepth = 0.006, cutoff = 5000, rq = 0.25, parfreq = 500, parrq = 1, pardb = 3, blend = 0.6;

	var lfo, pulse, filter, env, snd;

	lfo = LFTri.kr(freq: lforate * [1, 1.01], iphase: Rand(0, 2.0) ! 2).range(1 / (1 + lfodepth), (1 + lfodepth));

	pulse = Pulse.ar(freq: freq * [1, 3] * lfo, width: [0.5, 0.51], mul: [(1 - blend), blend]);

	env = Env.adsr(attackTime: att, decayTime: dec, sustainLevel: sus * amp, releaseTime: rel).kr(gate: gate, doneAction: 2);

	filter = BLowPass4.ar(in: pulse, freq: cutoff, rq: rq);

	filter = BPeakEQ.ar(in: filter, freq: parfreq, rq: parrq, db: pardb);

	snd = Mix.ar(filter) * env;

    Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Nick Collins",
	category: \\organ,
	tags: [\\pitched]
	)
).add;`,
  },
  {
    name: 'apadMH',
    category: 'Pads',
    credit: 'Mike Hairston',
    tags: ['pad', 'vibrato', 'sustained'],
    source: `/*Retrieved from
https://github.com/supercollider-quarks/SynthDefPool/blob/master/pool/apad_mh.scd

"A simple sustained sound with vibrato" --Mike Hairston

FreeVerb.ar added by Josh Mitchell.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\apadMH, {
	arg
	//Standard Values:
	out = 0, pan = 0, freq = 880, amp = 0.5, att = 0.4, dec = 0.5, sus = 0.8, rel = 1.0, gate = 1,
	//Other Controls:
	vibratoRate = 4, vibratoDepth = 0.015, tremoloRate = 5,
	//These controls go from 0 to 1:
	tremoloDepth = 0.5, reverbMix = 0.5, roomSize = 1, damp = 0.5;

	var env, snd, vibrato, tremolo, mod2, mod3;

	env = Env.adsr(att, dec, sus, rel).kr(gate: gate);
	vibrato = SinOsc.kr(vibratoRate).range(freq * (1 - vibratoDepth), freq * (1 + vibratoDepth));
	tremolo = LFNoise2.kr(1).range(0.2, 1) * SinOsc.kr(tremoloRate).range((1 - tremoloDepth), 1);

	snd = SinOsc.ar(freq: [freq, vibrato], mul:(env * tremolo * amp)).distort;
	snd = Mix.ar([snd]);
	snd = FreeVerb.ar(snd, reverbMix, roomSize, damp);

	DetectSilence.ar(snd, 0.0001, 0.2, doneAction: 2);
	Out.ar(out, Pan2.ar(snd, pan));
},
metadata:(
	credit: "Mike Hairston",
	tags: [\\pad, \\vibrato, \\sustained]
	)
).add`,
  },
  {
    name: 'arpoctave',
    category: 'Pads',
    credit: 'Josh Mitchell',
    tags: ['pitched'],
    source: `/*
The core of this is an octave arppegiator based around
modulo (.mod) and Select.ar, both of which are pretty fun.

The rest of the stuff is to make a nice ambient pad-type sound.

Notes:
    Try LFNoise2 with 2 rates for the chorus
    Try other waveforms for the arp and dry sections
    Try new foods
    Try controlling the filter cutoff with envarp
    Try all the things

Made by Josh Mitchell 2/20.
*/

SynthDef("arpoctave", {
	arg
	//Standard Controls:
	out = 0, amp = 0.1, freq = 220, pan = 0, gate = 1, att = 0.3, rel = 1, crv = 0,
	//Arp Controls: (mix goes from 0 to 1)
	arprate = 10, arpatt = 0.7, arprel = 0.6, arpmix = 0.35,
	//Chorus and Pitch Bend Controls:
	chorusrate = 0.5, chorusdepth = 0.015, div = 0.25, glide = 0.15,
	//Filter and Delay Controls:
	rq = 0.75, cutoff = 8000, delayt = 0.25, decay = 2, delamp = 0.5;

	var freqk, freqarp, chorus, bend, env, dry, envarp, arp, snd;

//LFOs and Envelopes for Amps, Freqs, and the Filter Cutoff:

	//Envelopes for the arp and dry signals (dry also controls the filter freq):
	env = Env.asr(
		        attackTime: att,
		        releaseTime: rel,
		        curve: crv).ar(gate: gate);
	envarp = Env.asr(
		        attackTime: arpatt,
		        releaseTime: arprel,
		        curve: crv).ar(gate: gate);

	//A chorus-ish sound made by two freq LFOs perfectly out of phase:
	chorus = SinOsc.ar(
		        freq: chorusrate,
		        phase: [0, pi]).range((1 - chorusdepth), (1 + chorusdepth));

	//A bit of portamento at the start of the dry signal:
	bend = Line.ar(start: div, end: 1, dur: glide);

//The Arp and Dry Signals:

	//This makes an aray of all octaves above and below the note being played:
	freqk = ((freq * 2.pow(2/3)).cpsmidi.mod(12) + 16).midicps;
	freqk = freqk * Array.fill(6, {arg i; 2.pow(i)}); // try 2 to 9 instead of 6

	//This randomly jumps between those octaves:
	freqarp = Select.kr(LFNoise0.ar(arprate).range(0, freqk.size), freqk);

	//Arp: Experiment with waveforms!
	arp = LFPulse.ar(freq: freqarp * chorus, mul: envarp);
	arp = Mix.ar(arp);

	//Dry: Experiment with waveforms!
	dry = LFTri.ar(freq: freq * chorus * bend, mul: env);
	dry = Mix.ar(dry);

//Output Stuff:

	//Mixer:
	snd = XFade2.ar(dry, arp, ((arpmix * 2) - 1), amp);

	//Low Pass Filter for mellowness:
	snd = RLPF.ar(
		        in: snd,
		        freq: LinExp.ar(
			                in: env,
			                dstlo: freq,
			                dsthi: cutoff),
                rq: rq);

	//Delay for Space:
	snd = snd + CombN.ar(
		            in: snd,
		            maxdelaytime: delayt,
		            delaytime: delayt,
		            decaytime: decay,
		            mul: delamp);

	//Don't hurt your ears and equipment!
	snd = Limiter.ar(LeakDC.ar(snd));

	DetectSilence.ar(in: snd, doneAction: 2);
	Out.ar(out, Pan2.ar(snd));
},
metadata: (
	credit: "Josh Mitchell",
	category: \\pads,
	tags: [\\pitched]
	)
).add;`,
  },
  {
    name: 'feedbackPad1',
    category: 'Pads',
    credit: 'Josh Mitchell',
    tags: ['pitched'],
    source: `/*
A pad SynthDef that generates tons of dense harmonic content simply by feeding a
sine wave's output back into its phase input. It's almost exactly what SinOscFB does,
only with a user-controlled delay time between when the output of the sine wave is
measured and when that gets fed back into the phase argument.

Because there are only really three parameters to the sound besides its pitch (amplitude,
feedback, and delay time), each one is controlled by an adsr envelope. For the delay and
feedback envelopes, the adsr envelopes don't have to look "right-side-up" (the typical
rise - drop - sustain - drop more shape). You can think of it like this: the parameter
(delay or feedback) starts at a certain value "StartStop". As the note starts it moves to
a new value "Peak", and then a third value "Sus", over the attack and decay times,
respectively. As the note ends, the parameter then returns to its initial value over the
release time.

As the feedback amplitude approaches and goes beyond 1, the feedback causes chaotic
oscillation, which sounds sort of like adding some sort of noise until it overpowers
the original signal. If you're interested in creating musical chaos from really
simple initial rules like this feedback one, Supercollider has lots of Ugens for that!
Running    ChaosGen.allSubclasses;    provides a long list of them for you.

By Josh Mitchell July 2020.
*/

SynthDef(\\feedbackPad1, {
	arg
	// Standard Values
	out = 0, amp = 1, gate = 1, freq = 75, pan = 0,
	// Controls for ampEnv
	att = 2, dec = 1, sus = 1, rel = 4, crv = 0,
	// Controls for fbEnv
	fbStartStop = 0, fbAtt = 3, fbPeak = 0.8, fbDec = 2, fbSus = 0.67, fbRel = 5,
	// Confrols for delEnv
	delStartStop = 0.55, delAtt = 1, delPeak = 0, delDec = 2, delSus = 0.25, delRel = 3.5;

	var snd, fbIn, fbOut, ampEnv, fbEnv, delEnv;

	// Set up the Envelopes
	ampEnv = Env.adsr(
		attackTime: att,
		decayTime: dec,
		sustainLevel: sus,
		releaseTime: rel,
		curve: crv).ar(gate: gate);

	fbEnv = Env.adsr(
		attackTime: fbAtt,
		decayTime: fbDec,
		sustainLevel: fbSus,
		releaseTime: fbRel,
		peakLevel: fbPeak,
		curve: \\lin,
		bias: fbStartStop).ar(gate: gate);

	delEnv = Env.adsr(
		attackTime: delAtt,
		decayTime: delDec,
		sustainLevel: delSus,
		releaseTime: delRel,
		peakLevel: delPeak,
		curve: \\lin,
		bias: delStartStop).ar(gate: gate);

	// Receive the feedback
	fbIn = LocalIn.ar;

	// The Sound (yup, that's all it is)
	snd = SinOsc.ar(
		freq: freq,
		phase: fbIn * pi);

	// Delay the feedback
	fbOut = DelayC.ar(
		in: snd,
		maxdelaytime: delStartStop.max(delPeak.max(delSus)),
		delaytime: delEnv,
		mul: fbEnv);

	// Send the feedback
	LocalOut.ar(fbOut);

	// Output Stuff
	snd = Mix.ar(snd) * ampEnv * amp;
	snd = Limiter.ar(snd);

    DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Josh Mitchell",
	category: \\pads,
	tags: [\\pitched]
	)
).add;
`,
  },
  {
    name: 'feedbackPad2',
    category: 'Pads',
    credit: 'Josh Mitchell',
    tags: ['pitched'],
    source: `/*
Here's a continuation of what I did with feedbackPad1. The core of the sound is a triangle
this time, and the feedback from it is used in different ways. While feedbackPad1 uses
phase modulation, feedbackPad2 uses frequency modulation. These two methods are pretty
similar, and which one I used boils down to which one's easier to use for that particular
UGen.

On top of the little bit of delayed self-FM this triangle wave receives, it also has
its polarity modulated by a squared-off version of the same delayed feedback. Polarity is
always either 1 or -1 when it reaches the mul argument of LFTri, which produces the sort
of arpeggio-sounding motion you hear at the output. The delay time, del, seems to affect
how fast this moves, with smaller delay times corresponding to faster wobbles. When the
polFlip switch is 0, a positive value on the feedback wave causes a polarity of 1, and a
negative value causes a polarity of -1. When polFlip is 1, the polarity of the feedback is
flipped, meaning this relationship is reversed. It doesn't usually seem to cause a huge
difference in the final sound. Finally, thresh is the threshold of the Schmitt trigger
that squares off the feedback for polarity. It changes the wobble pattern a bit.

There's also a low pass filter inside the feedback loop, and the output from that is what
gets sent to the output of the SynthDef. When I wrote it, I accidentally flipped the hi
and lo filter frequencies, so that the filter starts open, and closes as the note gets
louder. This sounded cooler than what I intended, so I left it the way it was.

By Josh Mitchell July 2020.
*/

SynthDef(\\feedbackPad2, {
	arg
	// Standard Values
	out = 0, amp = 0.1, gate = 1, freq = 100, pan = 0,
	// Controls for ampEnv
	att = 1.5, dec = 0.1, sus = 1, rel = 1.75, crv = 0,
	// Controls for fbEnv
	fmStartStop = 0, fmAtt = 1, fmPeak = 5, fmDec = 0.5, fmSus = 2, fmRel = 1,
	// Other Controls (thresh goes from 0 to 1, polFlip is 0 or 1)
	thresh = 0.0075, polFlip = 1, del = 0.1, rq = 0.9, filterLo = 1500, filterHi = 5000;

	var snd, fbIn, polarity, fbOut, ampEnv, fmEnv;

	// Set up the Envelopes
	ampEnv = Env.adsr(
		attackTime: att,
		decayTime: dec,
		sustainLevel: sus,
		releaseTime: rel,
		peakLevel: amp,
		curve: crv).ar(gate: gate, doneAction: 2);

	fmEnv = Env.adsr(
		attackTime: fmAtt,
		decayTime: fmDec,
		sustainLevel: fmSus,
		releaseTime: fmRel,
		peakLevel: fmPeak,
		curve: \\lin,
		bias: fmStartStop).ar(gate: gate);

	// Receive the feedback
	fbIn = LocalIn.ar;
	polarity = Schmidt.ar(
		in: fbIn,
		lo: -1 * thresh,
		hi: thresh) ;
	polarity = (polarity * 2) - 1;
	polarity = polarity * ((polFlip * -2) + 1);

	// Make The Sound
	snd = LFTri.ar(
		freq: Clip.ar(
			in: freq + (fbIn * fmEnv),
			lo: 30,
			hi: SampleRate.ir/2),
		mul: polarity
	);

	// Filter the Sound
	snd = RLPF.ar(
		in: snd,
		freq: LinExp.ar(
			in: ampEnv,
			srclo: 0, srchi: amp,
			dstlo: filterHi, dsthi: filterLo),
		rq: rq);

	// Delay the feedback
	fbOut = DelayC.ar(
		in: snd,
		maxdelaytime: del,
		delaytime: del,
		mul: 1);

	// Feedback the Sound
	LocalOut.ar(fbOut);

	// Output Stuff
	snd = Mix.ar(snd) * ampEnv;
	snd = Limiter.ar(snd);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Josh Mitchell",
	category: \\pads,
	tags: [\\pitched]
	)
).add;`,
  },
  {
    name: 'feedbackPad3',
    category: 'Pads',
    credit: 'Josh Mitchell',
    tags: ['pitched'],
    source: `/*
There's an inherent delay that's large enough to matter any time you use LocalIn
and LocalOut for feedback, which I've forgotten about and then been reminded of
by unexpected noises quite a few times. Rather than get annoyed by this, I tried
gaining inspiration from it. For this SynthDef, I leaned into the discrete nature
of digital audio that causes those effects a bit more. This time,the feedback is
first downsampled by Latch.ar, at a frequency of sampleRate, then scaled and
rounded to a number of notes, all a specific number of semitones apart. This gets
put back into the frequency argument of the initial triangle wave, so that it's
generating an arpeggio from itself.   Whoa, that's deep.

The notes control is the number of notes in the arpeggio aside from the fundamental,
and if it's negative or not a whole number, it gets rounded into a positive whole
number. Interval is the equal distance between each note in semitones, but this
doesn't need to be a whole number.

After the feedback loop, the sound goes through some reverb to blend things together,
then a bit of filtering. First there's an HPF fixed at the fundamental frequency to
cut low frequency noise and slightly emphasise the fundamental. If you turn up the
resonance much more than where it's at, it can get ugly. Next, there's a few LPFs
that make a constant-enough dB/oct slope to take out some more high frequencies from
the sound.

By Josh Mitchell July 2020.
*/

SynthDef(\\feedbackPad3, {
	arg
	// Standard Values
	out = 0, amp = 0.15, gate = 1, freq = 100, pan = 0,
	// Envelope Controls
	att = 3, dec = 1, sus = 1, rel = 5, crv = 0,
	// Reverb Controls (all go from 0 to 1)
	reverbMix = 0.75, roomSize = 0.9, damp = 0.5,
	// Other Controls (interval is in semitones)
	sampleRate = 20, notes = 6, interval = 7;

	var env, fbIn, snd;

	// Set up the Envelopes
	env = Env.adsr(
		attackTime: att,
		decayTime: dec,
		sustainLevel: sus,
		releaseTime: rel,
		curve: crv).ar(gate: gate);

	// Receive and Sample the feedback
	fbIn = Latch.ar(
		in: (LocalIn.ar + 1)/2,
		trig: Impulse.ar(
			freq: sampleRate));
	fbIn = (fbIn * notes.abs * env).round(1);
	fbIn = (fbIn * interval).midiratio;

	// Make The Sound
	snd = LFTri.ar(
		freq: freq * fbIn,
		mul: env);

	// Feedback the Sound
	LocalOut.ar(snd);

	// Reverb the Sound
	snd = FreeVerb.ar(
		in:  snd,
		mix: reverbMix,
		room: roomSize,
		damp: damp);

	//Filter the Sound
	snd = RHPF.ar(
		in: snd,
		freq: freq,
		rq: 0.5);
	snd = LPF.ar(
		in: snd,
		freq: [62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
		mul: 1/9);

	// Output Stuff
	snd = Mix.ar(snd) * amp;
	snd = Limiter.ar(snd);

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Josh Mitchell",
	category: \\pads,
	tags: [\\pitched]
	)
).add;`,
  },
  {
    name: 'line',
    category: 'Pads',
    credit: 'by Josh Mitchell',
    tags: ['pitched'],
    source: `/*
This Synthdef is centered around a challenge I gave myself: use as little blue text
as possible. (Which I guess translates to using as few UGens as possible). It's a
fun thing to do and you should try it out.

Here, everything is being controlled by a single line with a slope of one/second.
(It gets multiplied into three lines, but I'll get into why that is later.) If you
take the sine of something that continually increases at a rate of 1 per second,
you get a sine wave with a period of 2pi (or a freq of 1/(2pi)). To scale the wave,
I multiplied the input line by (2pi * lfoRate) so that it's new frequency is lfoRate.
The .mod(1) in the LFOs resets the input line to 0 at the start of each LFO cycle,
like how 2pi radians is the same as 0 radians. This .mod(1) can also be used on its
own to make a sawtooth wave, which is what I did, once again multiplying the input
line by freq inside the .mod(1) to scale it to the frequencies you want.

The envelope starts off with an upwards slope determined by the attack time, then
gets clipped at 1. The next section that gets subtracted from this is 0 until the
input line goes above a threshold corresponding to the attack time plus the sustain
time (written as "hold" here to differentiate from the sus level in an adsr envelope),
after which it rises to 1 with a slopedetermined by the decay time, after which
doneAction: 2 kicks in. The final result of all this is a linear asr envelope with
set attack, sustain, and release times. To give the envelope a curve like lots of
other SynthDefs in this collection, I raised the envelope to a power determined by
crv. The sustain level stays at one because of this, but the attack and release slopes
get bent in (if the power is > 1, meaning negative crv values) or out (if the power is
a positive fraction, meaning positive crv values).

All this phase shift business that comes next is inspired by a doepfer synth module.
This module takes in a sawtooth wave and outputs a sum of phase shifted copies of that
wave, using an analog version of the math here. Essentially, the input saw gets turned
into a pulse wave with the same frequency as the saw, but a pulseWidth determined by
the LFOs. Adding this to the original saw wave creates a saw with the same frequency,
a new phase, and a DC offset that gets subtracted out. The musical effect of all this
is a subtle chorus-y pwm-y sort of modulation.

Now let's talk about the two other slightly delayed input lines. They create two
slightly delayed copies of the final sound, and I've averaged all three copies together
at the end of the SynthDef. This creates a very simple low-pass-like filter. It's not
a true LPF, but it does lower the high frequency content of the sound just enough for
my ears to handle. Next is .softclip sort of doing the job of a limiter to protect your
ears, and a line emulating Pan2.ar. Pan2 is an equal power panner, so the sin and cos
are there to match that effect.

By Josh Mitchell, July 2020
*/

SynthDef(\\line, {
	arg
	// Standard values
	out = 0, freq = 1000, pan = 0, amp = 0.1, att = 0.001, hold = 0.25, rel = 2, crv = -2,
	// lfo controls
	lfoARate = 5, lfoADepth = 0.25, phaseACenter = 0.35,
	lfoBRate = 2.7, lfoBDepth = 0.5, phaseBCenter = 0.5,
	// Other Controls (pSwitch is 0 or 1)
	pSwitch = 0, filterDelay1 = 0.00025, filterDelay2 = 0.00015;

	var input, lfoA, lfoB, phaseShiftA, phaseShiftB, env, saw,
	polarity, phaseA, phaseB, phase, snd;

	// Makes three lines with a slope of 1/second
	input = Line.ar(
		start: 0 ,
		end: att + hold + rel,
		dur: att + hold + rel,
		doneAction: 2);
	input = input - [0, filterDelay1, filterDelay2];

	// Make two sine LFOs with freq "lfoRate" and amplitude "lfoDepth"
	lfoA = sin(2pi * (lfoARate * input).mod(1)) * lfoADepth;
	lfoB = sin(2pi * (lfoBRate * input).mod(1)) * lfoBDepth;

	// Use the LFOs to determine a phase parameter from 0 to 1 cycles
	phaseShiftA = (phaseACenter + lfoA).wrap(0, 1);
	phaseShiftB = (phaseBCenter + lfoB).wrap(0, 1);

	// Make an asr envelope with a fixed sustain time
	env = (input/att).clip(0, 1);
	env = env - ((input - (att + hold))/rel).clip(0, 1);
	env = env.pow(exp(-1 * crv));

	// Make a sawtooth wave with freq "freq"
	saw = (input * freq).mod(1);
	polarity = 1 - (2 * pSwitch);

	// Make a pulse wave from the sawtooth wave
	phaseA = sign(sign(phaseShiftA - saw) + 0.5);
	phaseA = (phaseA - 1)/2 - phaseShiftA + 0.5;
	// Add it to the saw to get a phase-shifted saw
	phaseA = saw + phaseA;

	// Rinse and repeat
	phaseB = sign(sign(phaseShiftB - saw) + 0.5);
	phaseB = (phaseB - 1)/2 - phaseShiftB + 0.5;
	phaseB = saw + phaseB;

	// Add it all together
	snd = ((polarity * (saw - 0.5)) + phaseA + phaseB)/2;
	snd = snd * env;

	// Filter the sound a tiny bit
	snd = (snd[0] + snd[1] + snd[2])/3 * amp;

	// Output Stuff
	snd = snd.softclip;
	snd = [snd * cos((pan + 1) * pi/4), snd * sin((pan + 1) * pi/4)];

	Out.ar(out, snd);
},
metadata: (
	credit: "by Josh Mitchell",
	category: \\pads,
	tags: [\\pitched]
)
).add;`,
  },
  {
    name: 'midSideSaw',
    category: 'Pads',
    credit: 'Josh Mitchell',
    tags: ['pitched'],
    source: `/*
Here's a simple way to do mid/side processing in a SynthDef format. Mid/side
processing splits a stereo signal into two new pieces; instead of a left and
right channel, you now have a channel full of the same parts between the left
and right (mid), and a channel full of the different parts (sides). You can
then do whatever you want to these mid/side channels before converting them
back to left and right channels.

Mid/side processing is often used for subtle polishing in music production,
but you can get some interesting sounds if you're creative with it. I like
how it adds a sort of "mirrored" stereo image; to me it makes a sound seem
like it's wrapped a little bit closer around my ears.

Here the initial sound is a sort-of-chorused stereo saw, made with two saw
waves with vibrato LFOs that are perfectly out of phase with each other.
Then, there's an envelope filter on the mid and side channels, with a little
distortion after each.

Finally, I've added a balance control that pans from only sending the mid
at 0 to only sending the sides at 1. monoSwitch outputs only a mono channel
if it's set to 1, so that you can clearly hear what's in the mid channel and
what's in the side channel without any stereo shenanigans.

By Josh Mitchell July 2020.
*/

SynthDef(\\midSideSaw, {
	arg
	// Standard Values
	out = 0, amp = 1, gate = 1, freq = 100, pan = 0, att = 0.25, rel = 3, crv = 0,
	// Filter and Distortion Controls
	filterLo = 100, filterHi = 2000, rq = 0.3, sidePreamp = 2, midPreamp = 1,
	// Chorus and Mid/Side Controls (balance is 0 to 1 and monoSwitch is 0 or 1)
	lfoFreq = 0.1, lfoDepth = 0.015, balance = 0.5, monoSwitch = 0;

	var env, lfo, leftIn, rightIn, mid, side, leftOut, rightOut, snd;

	// Envelope and LFO
	env = Env.perc(
		attackTime: att,
		releaseTime: rel,
		curve: crv).ar(doneAction: 2);

	lfo = SinOsc.ar(
		freq: lfoFreq,
		phase: [0, pi]);
	lfo = lfo.range(1 - lfoDepth, 1 + lfoDepth);

	//Stereo signal with beatings
	leftIn = LFSaw.ar(freq: freq * lfo[0]);
	rightIn = LFSaw.ar(freq: freq * lfo[1]);

	// L/R to M/S conversion
	mid = (leftIn + rightIn)/2;
	side = (leftIn - rightIn)/2;

	// FX on the M/S signal
	mid = RLPF.ar(
		in: mid,
		freq: LinExp.ar(
			in: env,
			srclo: 0, srchi: 1,
			dstlo: filterLo, dsthi: filterHi),
		rq: rq,
		mul: midPreamp);
	mid = mid.softclip/midPreamp.softclip;
	mid = mid * (1 - balance).clip(0, 1) * env;

	side = RLPF.ar(
		in: side,
		freq: LinExp.ar(
			in: env,
			srclo: 0, srchi: 1,
			dstlo: filterHi, dsthi: filterLo),
		rq: rq,
		mul: sidePreamp);
	side = side.softclip/sidePreamp.softclip;
	side = side * balance.clip(0, 1) * env;

	// Output Stuff and Converting Back to L/R
	leftOut = mid + side;
	rightOut = mid - side;
	snd = Select.ar(
		which: monoSwitch,
		array: [
			[leftOut, rightOut],
			Pan2.ar(leftOut, pan)]);
	snd = snd * amp;
	snd = Limiter.ar(snd);

	Out.ar(out, snd);
},
metadata: (
	credit: "Josh Mitchell",
	category: \\pads,
	tags: [\\pitched]
	)
).add;
`,
  },
  {
    name: 'sawSynth',
    category: 'Pads',
    credit: '',
    tags: [],
    source: `/* Retrieved from
http://sccode.org/1-5aD
*/

SynthDef("sawSynth", { arg freq = 440, amp = 0.1, att = 0.1, rel = 2, lofreq = 1000, hifreq = 3000, pan = 0;
    var env, snd;
    env = Env.perc(
		attackTime: att,
		releaseTime: rel,
		level: amp
	).kr(doneAction: 2);
    snd = Saw.ar(freq: freq * [0.99, 1, 1.001, 1.008], mul: env);
	snd = LPF.ar(
		in: snd,
		freq: LFNoise2.kr(1).range(lofreq, hifreq)
	);
    snd = Mix.ar(snd);
	snd = Pan2.ar(snd, pan);
    Out.ar(0, snd);
// Basic saw synth
//By Bruno Ruviaro
//http://sccode.org/1-54H
}).add;
`,
  },
  {
    name: 'superSaw',
    category: 'Pads',
    credit: 'Josh Mitchell',
    tags: ['pitched'],
    source: `/*
This SynthDef is loosely based on the famous "supersaw" from the Roland JP-80x0
synths. The supersaw sound is very common in 2000s-or-so EDM, and in the case of
the Roland supersaw, it's built around 7 detuned saw waves with (as far as I know)
randomly determined phases. Just like in most other supersaws, you can choose how
detuned the saws are, where abs(freq - (detuneRatio * freq)) is the max detuning
in hertz. Here, detuneRatio = 1 gives no detuning.

This SynthDef isn't an exact copy of the Roland supersaw, but it is arguably a lot
more flexible, a superdupersaw, if you will. First of all, it allows you to select
any number of saws from 1 to 100, not just 7, using numOscs. Second, it lets you
determine the stereo spread of these saws with the spread control, and third, it
replaces Roland's blend control between a fundamental saw and its six detuned copies
with a detuneFade control. When detuneFade is 0, all copies have the same volume,
and as it gets higher the most detuned saws fade out more and more, for a more
natural sound (in my opinion).

This SynthDef also has the same envelope filter as midSideSaw.scd, that makes the
sound just a bit grittier. The .softclip after the filter is to vaguely emulate
certain filter circuits that, by nature of their design, distort a signal a tiny
bit as they filter it. If you don't want this, just set the preamp to below 1 but
above 0, as the distortion kicks in at around preamp = 1.

By Josh Mitchell August 2020
*/

SynthDef(\\superSaw, {
	arg
	//Standard Values
	out = 0, pan = 0, gate = 1, amp = 0.5, freq = 40,
	att = 0.1, dec = 0.2, sus = 0.9, rel = 5, crv = 0,
	// Detune Controls (spread goes from 0 to 1)
	detuneRatio = 1.025, numberOscs = 100, spread = 1, detuneFade = 0.25,
	// Filter Controls (preamp > 0)
	filterLo = 80, filterHi = 8000, rq = 0.8, preamp = 2,
	fAtt = 3, fDec = 3, fSus = 0.8, fRel = 5;

	var detuneHz, stepSize, faArray, freqArray, ampArray, phaseArray, env, fEnv, snd;

	// Scale detuneRatio and numberOscs
	detuneHz = (detuneRatio - 1) * freq;
	stepSize = (2 * detuneHz)/(numberOscs - 1);

	// An Array used for freqArray and ampArray
	faArray = Array.fill2D(100, 2, {
		arg i, j;
		if (j == 1)
		{ (numberOscs - i).tanh.clip(0, 1).sign }
		{ ((stepSize * i) + (freq - detuneHz)).clip(20, 20000) }
	});
	faArray = faArray.scramble.flop;

	// Generate the Frequencies of all the Saws
	freqArray = faArray[0];

	// Generate the Amplitudes of all the Saws
	ampArray = abs(freq - freqArray);
	ampArray = (detuneHz - ampArray)/detuneHz;
	ampArray = ampArray.pow(detuneFade) * 0.1;
	ampArray = ampArray * faArray[1];

	// Generate the Phases of all the Saws
	phaseArray = {TRand.ar(
		lo: 0.000,
		hi: 2.000,
		trig: Impulse.ar(0))}.dup(100);

	// Envelopes for Volume and LPF
	env = Env.adsr(
		attackTime: att,
		decayTime: dec,
		sustainLevel: sus,
		releaseTime: rel,
		curve: crv).ar(doneAction: 2, gate: gate);
	fEnv = Env.adsr(
		attackTime: fAtt,
		decayTime: fDec,
		sustainLevel: fSus,
		releaseTime: fRel,
		curve: crv).ar(gate: gate);

	// Make the Saws
	snd = LFSaw.ar(
		freq: freqArray,
		iphase: phaseArray,
		mul: ampArray);
	snd = HPF.ar(
		in: snd,
		freq: freqArray);

	//Mix the Saws down to Stereo
	snd = Splay.ar(inArray: snd, spread: spread);
	snd = Normalizer.ar(
		in: snd,
		level: 1,
		dur: 0.02);

	// Filter the Saws
	snd = RLPF.ar(
		in: snd,
		freq: LinExp.ar(
			in: fEnv,
			srclo: 0, srchi: 1,
			dstlo: filterLo, dsthi: filterHi),
		rq: rq,
		mul: (preamp/2).clip(0.0001, inf));
	snd = snd.softclip;
	snd = snd/((preamp/2).clip(0.0001, inf).softclip);

	// Output Stuff
	snd = snd * amp * env;
	snd = Limiter.ar(snd);
	snd = Balance2.ar(
		left: snd[0],
		right: snd[1],
		pos: pan);

	Out.ar(out, snd);
},
metadata: (
	credit: "Josh Mitchell",
	category: \\pads,
	tags: [\\pitched]
	)
).add;
`,
  },
  {
    name: 'abstractDrum',
    category: 'Percussion',
    credit: 'by Josh Mitchell',
    tags: ['pitched', 'modal'],
    source: `/*
This is a SynthDef cobbled together from some other modal percussion SynthDefs
I've worked on recently. The frequencies come from a model for a square-shaped
membrane clamped at the edges (see squareDrum for more on that). However, for
the amplitudes and decay times, some pieces of a model for a plucked string get
added in. That's why it's an abstract drum, it's a terrifying jumble of shapes
just like abstract art!

Position (where on the "string" from 0 to 1 at either end it's plucked) and
decCoef determine the timbre of each note, along with hiFreqSus, which makes
the sound's high frequencies sustain longer as it increases from 0. At really
high values, all the values in decArray are essentially the same. This makes
the sound seem more metallic in a way that reminds me of fm synthesis.

As you can see from the demo, there's tons of different sounds you can get out
of changing these three values!

By Josh Mitchell July 2020.
*/

SynthDef(\\abstractDrum, {
	arg
	// Standard values
	out = 0, freq = 140, amp = 1, pan = 0, att = 0.001, dec = 0.01, rel = 1,
	// Other Controls (position goes from 0 to 1)
	position = 0.5, ampSlope = 3, decCoef = 0.15, hiFreqSus = 0;

	var freqarray, amparray, decarray, exciter, snd;

	// Setting up arrays for Klank
	freqarray = Array.fill(8, {
		arg i = 1;
		(
			Array.fill((i + 1), {
				arg j;
				(j + 1).pow(2)
			}) +
			(i + 1).pow(2)
		).sqrt

	});
	freqarray = freqarray.flatten/(2.sqrt);

	amparray = Array.fill(36, {
		arg i;
		if (freqarray[i] > 20000)
			{ 0 }
			{
			    sin(((i + 1) * pi) * position) *
		        (ampSlope * (freqarray[i]).log2).dbamp
		    }
	});
	amparray = amparray/ampSlope;

	decarray = Array.fill(36, {
		arg i;
		exp(-1 * i * decCoef) + hiFreqSus
	});
	decarray = decarray/decarray[0];

	// Exciter
	exciter = Decay2.ar(
		in: Impulse.ar(0),
		attackTime: att,
		decayTime: dec,
		mul: 0.005); // This keeps the volume at a sane level

	// The actual sound-makey part
	snd = Klank.ar(
		specificationsArrayRef:
		    Ref.new([freqarray, amparray, decarray]),
		input: exciter,
		freqscale: freq,
		decayscale: rel);

	// Output Stuff
	snd = Mix.ar(snd * amp * 2);
	snd = Limiter.ar(snd);

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "by Josh Mitchell",
	category: \\percussion,
	tags: [\\pitched, \\modal]
)
).add;
`,
  },
  {
    name: 'frameDrum',
    category: 'Percussion',
    credit: 'by Josh Mitchell',
    tags: ['unpitched', 'modal'],
    source: `/*
Frame drums are one of the world's oldest instruments, if not THE oldest. Tons of
different kinds of frame drums show up around the world, and they're pretty simple
in terms of what they're made of. They consist of a (usually) circular membrane, held
tight by a thin frame. Sometimes they have jingly-janglies on them (like a tambourine,
which is a type of frame drum), but this one doesn't.

This SynthDef is literally just a modal model for a vibrating circular membrane, and it
gets very close to the sounds of some frame drums. The massive list of numbers in
freqArray just comes from MATLAB's solutions to bessel functions, which describe how fast
a circle wobbles when you hit it. It's harder to model the amplitudes of a circular
membrane, so I just made a rough estimate for those, based on the nodes for each mode,
where the amplitude of that mode will always be 0. The nodes look like a superposition
of a number of rings on the circle and a number of diameter-slices through the circle,
depending on the number of the mode.

Using that information, it's possible to get a rough estimate of how the timbre of the
drum changes depending on how far from the center of the circle you hit it. This is
controlled by position, where 0 is the center of the drum and 1 is the edge. This is
very key to making the drum sound more realistic in my demo.

On a real drum, the fundamental isn't usually the first frequency mode. This is because
the shape of the first mode causes it to decay faster than the others, so it's not as
noticeable. I've seen the sound from the first mode referred to as a "thump", so I added
thumpAmp and thumpDec to provide some control over this sound.

Another thing in this SynthDef is exBlend, which blends from an impulse at -1 to a short
burst of brown noise at 1. Mixing the two together sounds more like a hand hitting the
drum in my opinion, but that's pretty subjective. Play around with it!

By Josh Mitchell, July 2020
*/

SynthDef(\\frameDrum, {
	arg
	// Standard values
	out = 0, pan = 0, freq = 170, amp = 0.5, att = 0.0025, dec = 0.0025, rel = 5, crv = 0,
	// Other controls (position goes from 0 to 1, blend from -1 to 1)
	decCoef = 0.225, position = 0.8, thumpAmp = 0.5, thumpDec = 0.2, exBlend = 0;

	var exciter, freqArray, ampRowArray, ampArray, decArray, snd;

	// An Array of bessel function solutions, normalized to 1 at the fundamental
	freqArray = [
		[ 0.6276, 1, 1.3403, 1.6651, 1.9804, 2.2892, 2.5931, 2.8933,
		  3.1905, 3.4852, 3.7778, 4.0686, 4.3579, 4.6458, 4.9325, 5.2182 ],
		[ 1.4406, 1.8309, 2.1967, 2.5474, 2.8877, 3.2201, 3.5465, 3.8681,
		  4.1855, 4.4996, 4.8108, 5.1194, 5.4258, 5.7301, 6.0328, 6.3338 ],
		[ 2.2585, 2.6551, 3.0326, 3.3967, 3.7509, 4.0974, 4.4377, 4.7727,
		  5.1033, 5.4302, 5.7538, 6.0745, 6.3927, 6.7085, 7.0223, 7.3342 ],
		[ 3.0774, 3.4772, 3.8615, 4.234, 4.5974, 4.9534, 5.3033, 5.648,
		  5.9882, 6.3246, 6.6575, 6.9873, 7.3144, 7.6391, 7.9615, 8.2818 ],
		[ 3.8967, 4.2985, 4.6872, 5.0655, 5.4354, 5.7984, 6.1555, 6.5075,
          6.8551, 7.1988, 7.539, 7.8761, 8.2104, 8.5422, 8.8716, 9.1988 ],
		[ 4.7162, 5.1194, 5.5111, 5.8936, 6.2685, 6.6368, 6.9995, 7.3573,
		  7.7108, 8.0605, 8.4067, 8.7497, 9.0899, 9.4276, 9.7628, 10.0958 ],
		[ 5.5358, 5.9399, 6.334, 6.7198, 7.0984, 7.471, 7.8382, 8.2007,
		  8.5591, 8.9136, 9.2648, 9.6128, 9.9581, 10.3007, 10.6409, 10.9789 ],
		[ 6.3555, 6.7603, 7.1562, 7.5445, 7.9262, 8.3022, 8.6732, 9.0396,
          9.402, 9.7607, 10.1161, 10.4684, 10.8179, 11.1649, 11.5094, 11.8517 ],
		[ 7.1753, 7.5807, 7.978, 8.3683, 8.7525, 9.1314, 9.5054, 9.8752,
		  10.241, 10.6033, 10.9623, 11.3183, 11.6715, 12.0222, 12.3706, 12.7167 ],
		[ 7.995, 8.4009, 8.7993, 9.1914, 9.5777, 9.959, 10.3357, 10.7082,
          11.077, 11.4424, 11.8046, 12.1638, 12.5203, 12.8744, 13.226, 13.5755 ],
		[ 8.8148, 9.221, 9.6205, 10.0139, 10.4021, 10.7854, 11.1643, 11.5394,
          11.9107, 12.2788, 12.6438, 13.0059, 13.3653, 13.7223, 14.0769, 14.4294 ],
		[ 9.6346, 10.0412, 10.4414, 10.8361, 11.2257, 11.6108, 11.9918, 12.3689,
		  12.7426, 13.113, 13.4805, 13.8451, 14.2072, 14.5668, 14.9241, 15.2793 ],
		[ 10.4545, 10.8612, 11.2622, 11.6579, 12.0489, 12.4356, 12.8183, 13.1973,
		  13.573, 13.9455, 14.3152, 14.6821, 15.0465, 15.4085, 15.7683, 16.1259 ],
		[ 11.2743, 11.6813, 12.0829, 12.4795, 12.8716, 13.2597, 13.6439, 14.0246,
		  14.4021, 14.7766, 15.1482, 15.5172, 15.8837, 16.2479, 16.6099, 16.9697 ],
		[ 12.0941, 12.5013, 12.9034, 13.3009, 13.694, 14.0833, 14.4689, 14.8512,
		  15.2303, 15.6064, 15.9799, 16.3507, 16.7192, 17.0853, 17.4493, 17.8112 ],
		[ 12.914, 13.3214, 13.7239, 14.1221, 14.5162, 14.9065, 15.2933, 15.677,
		  16.0575, 16.4353, 16.8103, 17.1829, 17.5531, 17.921, 18.2869, 18.6507 ],
	];

	// Amplitudes corresponding to nodes that look like slices
	ampRowArray = Array.fill(16, {
		arg i;
		if (i == 0)
			{ thumpAmp }
			{
			    (
				    ((3pi).pow(2) - (24pi * i * sin((pi/2)/i))) *
		            (
			        	((4 * i) * sin((pi/2)/i)).pow(2)/(3 * pi) -
		                ((4 * i) * sin((pi/2)/i))
		            ).pow(-2)
	            ) *
		        (
			        position.pow(3) - position +
			        (
			        	(position - position.pow(2)) *
					    ((16/3 * (i * sin((pi/2)/i)).pow(2)) - pi.pow(2))/
					    ((8pi/3 * i * sin((pi/2)/i)) - pi.pow(2))
			        )
		        )
		    }
	});

	// Amplitudes corresponding to nodes that have rings
	ampArray = Array.fill2D(16, 16, {
		arg i, j;
		(if (freqArray[i][j] > 20000)
	    	{ 0 }
		    {
				cos(position * ((i * pi) + pi/2)) * ampRowArray[j]
		    }
		)
	});

	// Decay times
	decArray = Array.fill2D(16, 16, {
		arg i, j;
		(
			if (j == 0)
		        { thumpDec }
		        { 1 }
		) *
		exp(-1 * (i + j) * decCoef)
	});

	// Exciter
	exciter = Env.perc(
		attackTime: att,
		releaseTime: dec,
		level: 0.05,
		curve: crv).ar;
	exciter = XFade2.ar(
		inA: exciter,
		inB: BrownNoise.ar(exciter),
		pan: exBlend);

	// Bank of resonators
	snd = Array.fill(16, {
		arg i;
			Klank.ar(
		        specificationsArrayRef:
		    	    Ref.new([freqArray[i], ampArray[i], decArray[i]]),
		        input: exciter,
		        freqscale: freq,
		        decayscale: rel
	        )
	});

	// Output stuff
	snd = Mix.ar(snd) * amp;
	snd = Limiter.ar(snd);

	DetectSilence.ar(in: snd, amp: 0.00025, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "by Josh Mitchell",
	category: \\percussion,
	tags: [\\unpitched, \\modal]
)
).add;
`,
  },
  {
    name: 'kalimba',
    category: 'Percussion',
    credit: 'by Nathan Ho aka Snappizz',
    tags: ['pitched', 'kalimba'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

By Nathan Ho aka Snappizz
http://sccode.org/1-51l

This kalimba is based on a bank of resonators:
The basic tone is a SinOsc, whose release is randomized a little to add variation.
The "clicking" sounds are modeled with a bank of resonators excited by a short burst of noise.
There are two high resonant freqs, and one quiet "bass" freq to give it some depth.
These resonant freqs are randomized a little to add variation.

Modified By Josh Mitchell and Bruno Ruviaro July 2019.
*/

SynthDef(\\kalimba, {
	arg
	// Standard values
	out = 0, freq = 440, amp = 0.1, att = 0.001, rel = 3, pan = 0, crv = -8,
	// Other controls (mix control goes from 0 to 1)
	mix = 0.1, clickRel = 0.01;

	var note, env, body, snd;

	env = Env.perc(
		attackTime:att * 3, releaseTime: rel,
		curve: crv).kr(doneAction: 2);

	note = SinOsc.ar(freq) * env;

	body = DynKlank.ar(
		specificationsArrayRef:
		Ref.new([
			[240 * ExpRand(0.9, 1.1), 2020 * ExpRand(0.9, 1.1), 3151 * ExpRand(0.9, 1.1)],
			[-7, 0, 3].dbamp, // same as 10.pow([-7, 0, 3] / 20),
			[0.75, 0.04, 0.06] + clickRel
		]),
		input:
		// Try BrownNoise, GrayNoise, etc. here, but you may need to change ring times above
		(PinkNoise.ar * Env.perc(att, clickRel).kr)
	);

	snd = (note * (1 - mix)) + (body * mix) * amp;

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "by Nathan Ho aka Snappizz",
	category: \\percussion,
	tags: [\\pitched, \\kalimba]
)
).add;
`,
  },
  {
    name: 'marimba1',
    category: 'Percussion',
    credit: 'unknown',
    tags: ['percussion', 'marimba', 'pitched', 'keyboard'],
    source: `/*
This SynthDef uses BPF in a manner similar to DynKlank.
BPF gets hit with an impulse (Saw.ar(0)), and outputs a sine wave
with a sharp attack, and a decay and amplitude both determined by rq.

Modified by Bruno Ruviaro and Josh Mitchell July 2019 and June 2020.
*/

SynthDef(\\marimba1, {
	arg
	// Standard values
	freq = 440, out = 0, amp = 0.4, pan = 0, rq = 0.02,
        // Controls for BLowShelf
	shelffreq = 220, rs = 0.81, shelfamp = 2;

	var snd;

	snd = BPF.ar(
		in: Saw.ar(0),
		freq: freq,
		rq: rq);

	snd = BLowShelf.ar(
		in: snd,
		freq: shelffreq,
		rs: rs,
		db: shelfamp.ampdb);

	snd = Limiter.ar(snd) * amp;

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "unknown",
	category: \\percussion,
	tags: [\\percussion, \\marimba, \\pitched, \\keyboard]
)
).add;
`,
  },
  {
    name: 'metalPlate',
    category: 'Percussion',
    credit: 'by Josh Mitchell',
    tags: ['pitched', 'modal'],
    source: `/*
This SynthDef is a modal model for a rectangular plate held fixed at all edges,
or "clamped." I think it sounds very metallic in general, so it'd probably make
a nice strange cymbal.

The timbre of the plate is mostly determined by ratio and decCoef. A higher value
for decCoef makes the decay times of longer notes shorter, so you don't hear them
as well beyond the initial attack of the note. Meanwhile, ratio controlls the
relative shape of the rectangular plate, from narrow near 0 to square at 1. It's
called ratio because it's the ratio of the short side to the long one. Values of
ratio greater than 1 are probably okay, but they could be very out of tune or have
mangled low notes. Changing ratio from note to note gives an FM-like effect.

Where on the plate it's hit is determined by xpos and ypos, using the same 1d
"position" argument in two different dimensions. As far as I can tell, xpos is
along the short side and ypos is along the long side.

Finally, I added thumpDec to control the decay time of a harmonic we percieve to
be below the fundamental "pitch" of the plate, for a bit of controllable
percussive emphasis. Finally, there's a cheaply done filter with a roughly
constant, positive db/oct slope to emphasise higher harmonics a bit more, which
helps highlight some of the metallic parts of the SynthDef.

By Josh Mitchell August 2020.
*/

SynthDef(\\metalPlate, {
	arg
	// Standard values
	out = 0, freq = 3000, amp = 0.5, rel = 2, pan = 0, crv = 0,
	// Other controls (ratio goes from >0 to 1)
	ratio = 1, decCoef = 0.31, xpos = 0.5, ypos = 0.5, thumpDec = 0.75;

	var exciter, freqArray, ampArray, decArray, snd;

	// Frequencies
	freqArray = Array.fill2D(16, 16, {
		arg i, j;
		(i + 1).pow(2) + (ratio * (j + 1)).pow(2)
	});
	freqArray = freqArray/(freqArray[0][1]);
	freqArray = freqArray * freq;

	// Amplitudes
	ampArray = Array.fill2D(16, 16, {
		arg i, j;
		((1 - ((freqArray[i][j] - 19000)/1000).tanh)/2) *
		sin(((i + 1) * pi) * xpos) *
		sin(((j + 1) * pi) * ypos)
	});

	// Decay Times
	decArray = Array.fill2D(16, 16, {
		arg i, j;
		(
			if (j == 0)
		        { thumpDec }
		        { 1 }
		) *
		exp(-1 * (i + j) * decCoef)
	});

	// Hit the plate
	exciter = Impulse.ar(0);

	// The Plate
	snd = Klank.ar(
		specificationsArrayRef:
		    Ref.new([freqArray.flatten, ampArray.flatten, decArray.flatten]),
		input: exciter,
		decayscale: rel);

	// Output Stuff
	snd = HPF.ar(
		in: snd,
		freq: [freq, freq * 2, freq * 4, freq * 8, freq * 16, freq * 32, freq * 64]);
	snd = Mix.ar(snd/7) * amp;
	snd = Limiter.ar(snd);

	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "by Josh Mitchell",
	category: \\percussion,
	tags: [\\pitched, \\modal]
)
).add;`,
  },
  {
    name: 'modalMarimba',
    category: 'Percussion',
    credit: 'by Josh Mitchell',
    tags: ['pitched', 'modal'],
    source: `/*
The work here is done through modal synthesis. The focus with modal synthesis is that any
object will vibrate at certain frequencies (modes), with certain amplitudes, and certain
decay times in a case where there's a damping force, for each of these modes. Here most of
the math for those modes is done in arrays, then plugged into Klank, along with a short
burst meant to simulate the object being hit.

The title of this synthdef says it's a marimba, but it can also be used to simulate a lot
of other idiophones, because it works on a very abstract model. Essentially, the harmonics
of the SynthDef have been determined by the harmonics of a vibrating beam (say, a long
rectangular prism), when it's hit by something. I find some of the math shortcuts pretty
funny; this particular beam is totally ignoring gravity, for example.

The decay coefficient (decCoef) does a lot to determine the timbre, position simulates
the position on the beam in which it's hit (0.5 is the middle), and slope is the db/oct
slope of a filter with a constant slope across the audio range.

The solutions to the dynamic beam equation (look up Euler-Bernoulli beam theory if you're
interested) were given by Nathan Ho, as well as some of the methods I used for amparray.

By Josh Mitchell June 2020.
*/

SynthDef(\\modalMarimba, {
	arg
	// Standard values
	out = 0, freq = 440, amp = 0.1, att = 0.001, dec = 0.1, rel = 0.5, pan = 0,
	// Other controls, position goes from 0 to 1
	decCoef = 2, position = 0.414, ampSlope = 3;

	var freqarray, amparray, decarray, mallet, snd;

	// Array of frequencies, determined by solutions to the dynamic beam equation
	freqarray = Array.fill(30, { arg i; i + 1.5});
        freqarray[0] = 1.50561873;
	    freqarray[1] = 2.49975267;
	    freqarray = freqarray/1.50561873; // Normalize to freqarray[0] = 1

	// Array of amplitudes
	amparray = Array.fill(30, { arg i;
		if (freqarray[i] > 20000)
		    { 0 }
		    {
		        sin(((i + 1) * pi) * position) *
		        (ampSlope * (freqarray[i]).log2).dbamp
		    }
	});

	// Array of Decay times
	decarray = Array.fill(30, { arg i;
		exp(-1 * i * decCoef)
	}); // The decay times are dropping off exponentially

	// Hit the object
	mallet = Decay2.ar(
		in: Impulse.ar(0),
		attackTime: att,
		decayTime: dec, 
		mul: 0.1);

	// Bank of resonators
	snd = Klank.ar(
		specificationsArrayRef: Ref.new([freqarray, amparray, decarray]),
		input: mallet,
		freqscale: freq,
		decayscale: rel);

	// Output stuff
	snd = Mix.ar(snd) * amp;
	snd = Limiter.ar(snd);
	
	DetectSilence.ar(in: snd, doneAction: 2);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "by Josh Mitchell",
	category: \\percussion,
	tags: [\\pitched, \\modal]
)).add;
`,
  },
  {
    name: 'pmCrotales',
    category: 'Percussion',
    credit: 'Author Unknown',
    tags: ['pitched', 'bell'],
    source: `/*
Author Unknown

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef("pmCrotales", {
	arg out = 0, freq = 261, tone = 3, att = 0, rel = 2, curve = -6, amp = 0.8, pan = 0, modLo = 5.25, modHi = 5.5;

	var env, snd, mod;

	env = Env.perc(attackTime: 0, releaseTime: rel, curve: curve).kr(doneAction: 2);

	mod = Rand(modLo, modHi);

	snd = PMOsc.ar(
	    	carfreq: freq,
	    	modfreq: mod * freq,
	    	pmindex: env * tone,
	    	mul: env * amp
	    );

	snd = HPF.ar(snd, freq / 2);

	snd = Mix.ar(snd) * 0.1;

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Author Unknown",
	category: \\percussion,
	tags: [\\pitched, \\bell]
	)
).add;`,
  },
  {
    name: 'steelDrum',
    category: 'Percussion',
    credit: 'Josh Mitchell',
    tags: ['pitched', 'steelDrum', 'steelPan'],
    source: `/*
A SynthDef by Josh Mitchell, August 2019.
SCLOrk, Santa Clara University
*/

SynthDef("steelDrum", {
	arg freq = 440, amp = 0.1, out = 0, pan = 0, att = 0.01, dec = 1.5, curve = -6, filterHarmonic = 6;

	var resFreqArray, resAmpArray, resDecArray, enva, envb, envc, snda, sndb, sndc, snd;

	//Arrays for the bank of resonators, mostly harmonics near 5ths and 9ths, and random amplitudes:
	resFreqArray = [2, 2.98, 4.75, 6.21, 9, 9.15, 11.87];
	resAmpArray = [0.35, 0.23, 0.10, 0.06, 0.07, 0.05, 0.01];
	resDecArray = [0.86, 0.72, 0.37, 0.55, 0.32, 0.21, 0.16];

	//Custom envelope shapes attempting to capture the aparrent "bloom" of a note:
	enva = Env.pairs([[0, 0], [att, 1], [(att + dec), 0]], curve).kr;
	envb = Env.pairs([[0, 0], [(att * 5), 0.25], [(att * 6), 0.75], [((att * 6) + (dec / 2)), 0]], curve).kr;
	envc = Env.pairs([[0, 0], [(att * 5), 0.1], [(att * 8), 0.5], [((att * 8) + (dec / 3)), 0]], curve).kr;

	//Fundamental, octave up, and a bank of enharmonic resonators excited by a metalic sound:
	snda = SinOsc.ar(freq: freq, mul: enva);
	sndb = SinOsc.ar(freq: freq * 2.015, mul: envb);
	sndc = DynKlank.ar(
		specificationsArrayRef:
		    Ref.new([
		    	resFreqArray * freq,
		    	resAmpArray,
			    resDecArray * dec
		    ]),
		input:
		LPF.ar(HPF.ar(CombN.ar(PinkNoise.ar(1), 1/freq, 1/freq, -1, envc), freq * 2), freq * filterHarmonic)
	);

	//Output stages with a tiny bit of compression to smooth things out:

	snd = Mix.ar([snda, sndb, sndc]) * (amp / 3);
	snd = Limiter.ar(snd, amp);
	DetectSilence.ar(in: snd, amp: 0.0001, time: 0.5, doneAction: 2);
	Out.ar(out, Pan2.ar(snd, pan));

},
metadata: (
	credit: "Josh Mitchell",
	category: \\percussion,
	tags: [\\pitched, \\steelDrum, \\steelPan]
	)
).add
`,
  },
  {
    name: 'xylophone',
    category: 'Percussion',
    credit: 'nicolaariutti and Ze Craum',
    tags: ['pitched'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Glockenspiel, xylophone, and tubularBell are all based on a very similar structure.
By nicolaariutti and edited by Zé Craum
http://sccode.org/1-5ay#c835

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\xylophone, {
	arg freq = 440, amp = 0.01, pan = 0, out = 0, att = 0.001, rel = 2, exciterRel = 0.05;

	var exciter, snd;

	exciter = Impulse.ar(0);

	snd = DynKlank.ar(
		specificationsArrayRef:
	        	Ref.new([
	        		[1, 3, 3.971, 5.024, 5.903, 7.13, 8.91],   // harmonics
			        [1, 0.95, 0.0891, 0.65, 0.794, 0.53, 0.1], // amplitudes
		        	[1, 0.593, 0.19, 0.16, 0.26, 0.02, 0.05]     // ring times
		        ]),
		input: exciter,
		freqscale: freq,
		decayscale: rel
	);

	DetectSilence.ar(
		        in: snd,
		        amp: 0.001,
		        time: 0.5,
		        doneAction: 2
		    );

	Out.ar(out, Pan2.ar(snd, pan, amp));
},
metadata: (
	credit: "nicolaariutti and Ze Craum",
	category: \\bells,
	tags: [\\pitched]
	)
).add;
`,
  },
  {
    name: 'prophet5pwmStrings',
    category: 'Strings',
    credit: '',
    tags: [],
    source: `/*
Mitchell Sigman (2011) Steal this Sound. Milwaukee, WI: Hal Leonard Books
pp. 2-3

Adapted for SuperCollider and elaborated by Nick Collins
http://www.sussex.ac.uk/Users/nc81/index.html
under GNU GPL 3 as per SuperCollider license

Minor modifications by Bruno Ruviaro, June 2015.
*/

SynthDef("prophet5pwmStrings", {
	arg out = 0, pan = 0.0, freq = 440, amp = 1.0, gate = 1, att = 0.01, rel = 0, sus = 1, dec = 0.5, lforate = 10, lfowidth = 0.5, cutoff = 12000, rq = 0.5;

	var lfo, pulse, filter, env;
	lfo = LFTri.kr(lforate * [1, 1.01], Rand(0, 2.0) ! 2);
	pulse = Pulse.ar(freq * [1, 1.01], lfo * lfowidth + 0.5);
	filter = RLPF.ar(pulse, cutoff, rq);
	env = EnvGen.ar(
		envelope: Env.adsr(att, dec, sus, rel, amp),
		gate: gate,
		doneAction: 2);
	Out.ar(out, Pan2.ar(
		in: Mix(filter) * env * 0.5,
		pos: pan)
	);
}).add;`,
  },
  {
    name: 'strings',
    category: 'Strings',
    credit: 'Original from Julian Rohrhuber, 2007',
    tags: ['pitched'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

Original from SC Examples Folder some small pieces, Julian Rohrhuber, 2007

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\strings, {
	arg
	//Standard Definitions
	out = 0, freq = 440, amp = 1, gate = 1, pan = 0, freqLag = 0.2, att = 0.001, dec = 0.1, sus = 0.75, rel = 0.3,
	//Other Controls (mix ranges from 0 - 1)
	rq = 0.001, combHarmonic = 4, sawHarmonic = 1.5, mix = 0.33;

	var env, snd, combFreq;

	combFreq = 1 / (Lag.kr(in: freq, lagTime: freqLag / 2) * combHarmonic);

	env = Env.adsr(att, dec, sus, rel, amp).kr(gate: gate, doneAction: 2);

	snd = SyncSaw.ar(syncFreq: freq * WhiteNoise.kr().range(1/1.025, 1.025), sawFreq: freq * sawHarmonic, mul: 8);
	snd = (snd * (1 - mix)) + PinkNoise.ar(180 * mix);
	snd = CombL.ar(snd, combFreq, combFreq, -1); //Try positive 1 for decay time as well.
	snd = Resonz.ar(snd, Lag.kr(in: freq, lagTime: freqLag), rq).abs;
	snd = snd * env;
	snd = Limiter.ar(snd, amp);

	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Original from Julian Rohrhuber, 2007",
	category: \\strings,
	tags: [\\pitched]
	)
).add;`,
  },
  {
    name: 'violin',
    category: 'Strings',
    credit: 'Original by nicolaariutti, modified by Josh Mitchell',
    tags: ['bowed', 'pitched', 'violin'],
    source: `/* Retrieved from
http://sccode.org/1-5aD

by nicolaariutti
http://sccode.org/1-5as

Modifications from the original include:

-Added Vibrato.ar, to better simulate left hand movement alongside the pre-existing pwm.
-Changed ASR envelope to ADSR and "scratch" envelopes, to simulate the attack of a bow.
-Added filters, to simulate tone brightening from the bridge and back of the instrument.

Modified by Bruno Ruviaro and Josh Mitchell 8/19.
*/

SynthDef(\\violin, {
	arg
	//Standard Definitions
	freq = 440, gate = 1, amp = 1, pan = 0, out = 0, att = 0.1, dec = 0.1, sus = 0.5, rel = 0.1,
	//Vibrato Controls
	vRate = 4.6, vDepth = 0.02, vAtt = 0.15, vRateVar = 0.25, vDepthVar = 0.05,
	//PWM Controls (pwmMax and pwmMin are 0 - 1)
	pwmVarRate = 2, pwmMin = 0.7, pwmMax = 0.8, pwmRate = 5,
	//Other Controls
	bridgeFreq = 2500, scratchDepth = 0.15;

	var scratch, env, pwm, snd;

	scratch = 1.015 + Env.perc(att, dec * 1.25, scratchDepth).kr;

	env = Env.adsr(att, dec, sus, rel).kr(gate: gate, doneAction: 2);

	freq = Vibrato.kr(
		            freq: freq,
		            rate: vRate,
		            depth: vDepth,
	            	delay: (att + dec),
		            onset: vAtt,
		            rateVariation: vRateVar,
		            depthVariation: vDepthVar
            	);

	pwm = SinOsc.kr(freq: pwmRate, phase: Rand(0.0, 1.0)).range(pwmMin, pwmMax);
	pwm = pwm * LFNoise2.kr(pwmVarRate).range(0.2, 0.8);

	snd = VarSaw.ar(
		freq: Lag.kr(freq) * LFPulse.ar(freq * 1.5).range(1/scratch, scratch),
		width: pwm,
		mul: amp
	);

	snd = (snd * 0.7) + BPF.ar(snd, bridgeFreq, 2, 2);
	snd = snd + HPF.ar(snd, bridgeFreq * 2);
	snd = snd * env;
	Out.ar(out, Pan2.ar(snd, pan));
},
metadata: (
	credit: "Original by nicolaariutti, modified by Josh Mitchell",
	category: \\strings,
	tags: [\\bowed, \\pitched, \\violin]
	)
).add;`,
  },
  {
    name: 'waveguideFlute',
    category: 'Winds',
    credit: '',
    tags: [],
    source: `// Originally found at http://ecmc.rochester.edu/ecmc/docs/supercollider/scbook/Ch21_Interface_Investigations/ixi%20SC%20tutorial/ixi_SC_tutorial_10.html

SynthDef("waveguideFlute", { arg scl = 0.2, freq = 440, ipress = 0.9, ibreath = 0.09, ifeedbk1 = 0.4, ifeedbk2 = 0.4, dur = 1, gate = 1, amp = 2;

	var kenv1, kenv2, kenvibr, kvibr, sr, cr, block;
	var poly, signalOut, ifqc;
	var aflow1, asum1, asum2, afqc, atemp1, ax, apoly, asum3, avalue, atemp2, aflute1;
	var fdbckArray;

	sr = SampleRate.ir;
	cr = ControlRate.ir;
	block = cr.reciprocal;

	ifqc = freq;

	// noise envelope
	kenv1 = EnvGen.kr(Env.new(
		[ 0.0, 1.1 * ipress, ipress, ipress, 0.0 ], [ 0.06, 0.2, dur - 0.46, 0.2 ], 'linear' )
	);
	// overall envelope
	kenv2 = EnvGen.kr(Env.new(
		[ 0.0, amp, amp, 0.0 ], [ 0.1, dur - 0.02, 0.1 ], 'linear' ), doneAction: 2
	);
	// vibrato envelope
	kenvibr = EnvGen.kr(Env.new( [ 0.0, 0.0, 1, 1, 0.0 ], [ 0.5, 0.5, dur - 1.5, 0.5 ], 'linear') );

	// create air flow and vibrato
	aflow1 = LFClipNoise.ar( sr, kenv1 );
	kvibr = SinOsc.ar( 5, 0, 0.1 * kenvibr );

	asum1 = ( ibreath * aflow1 ) + kenv1 + kvibr;
	afqc = ifqc.reciprocal - ( asum1/20000 ) - ( 9/sr ) + ( ifqc/12000000 ) - block;

	fdbckArray = LocalIn.ar( 1 );

	aflute1 = fdbckArray;
	asum2 = asum1 + ( aflute1 * ifeedbk1 );

	//ax = DelayL.ar( asum2, ifqc.reciprocal * 0.5, afqc * 0.5 );
	ax = DelayC.ar( asum2, ifqc.reciprocal - block * 0.5, afqc * 0.5 - ( asum1/ifqc/cr ) + 0.001 );

	apoly = ax - ( ax.cubed );
	asum3 = apoly + ( aflute1 * ifeedbk2 );
	avalue = LPF.ar( asum3, 2000 );

	aflute1 = DelayC.ar( avalue, ifqc.reciprocal - block, afqc );

	fdbckArray = [ aflute1 ];

	LocalOut.ar( fdbckArray );

	signalOut = avalue;

	OffsetOut.ar( 0, [ signalOut * kenv2, signalOut * kenv2 ] );

}).add;

`,
  },
];
