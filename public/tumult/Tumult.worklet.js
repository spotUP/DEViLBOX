// public/tumult/Tumult.worklet.js
// Tumult noise/ambience generator — DSP ported 1:1 from:
//   noise.cpp (Faust 2.74.5, LGPL/MIT)
//   svf_hp/lp/peak/ls/hs.cpp (Faust 2.74.5, MIT)
//   hardSoftClipper.h (SNEX)
// Reference: Reference Code/Tumult-master/DspNetworks/ThirdParty/src/

// ---------------------------------------------------------------------------
// TumultNoise — 1:1 port of noise.cpp (Faust 2.74.5, noises.lib/colored_noise)
//
// Modes:
//   0 = White
//   1 = Pink   (no.pink_noise * 10)
//   2 = Brown  (colored_noise(12, -1.6))
//   3 = Velvet (colored_noise(12,  0.5))
//   4 = Crushed (lfnoiseN(0, SR/100))
// ---------------------------------------------------------------------------
class TumultNoise {
  constructor() {
    // LCG / white noise state
    this.iVec0 = 0; // previous iVec0 (1-sample delay)
    this.iRec0 = 0; // int accumulator (32-bit signed wrapping)

    // fVec1 — DC blocker delay (previous raw LCG float)
    this.fVec1 = 0.0;

    // fRec1[4] — pink noise 4-tap IIR state (indices 0..3, 0=current)
    this.fRec1 = [0.0, 0.0, 0.0, 0.0];

    // fRec14 — DC blocker output (shared by brown and velvet chains)
    // Only _1 (previous value) is needed as state; _0 is a local each tick.
    this.fRec14_1 = 0.0;

    // Brown chain: fRec13 .. fRec2  (12 stages, _1 = previous sample)
    this.fRec13_1 = 0.0;
    this.fRec12_1 = 0.0;
    this.fRec11_1 = 0.0;
    this.fRec10_1 = 0.0;
    this.fRec9_1  = 0.0;
    this.fRec8_1  = 0.0;
    this.fRec7_1  = 0.0;
    this.fRec6_1  = 0.0;
    this.fRec5_1  = 0.0;
    this.fRec4_1  = 0.0;
    this.fRec3_1  = 0.0;
    this.fRec2_1  = 0.0;

    // Velvet chain: fRec26 .. fRec15  (12 stages, _1 = previous sample)
    this.fRec26_1 = 0.0;
    this.fRec25_1 = 0.0;
    this.fRec24_1 = 0.0;
    this.fRec23_1 = 0.0;
    this.fRec22_1 = 0.0;
    this.fRec21_1 = 0.0;
    this.fRec20_1 = 0.0;
    this.fRec19_1 = 0.0;
    this.fRec18_1 = 0.0;
    this.fRec17_1 = 0.0;
    this.fRec16_1 = 0.0;
    this.fRec15_1 = 0.0;

    // Crushed noise: NLF2 oscillator + sample-and-hold (_1 = previous sample)
    this.fRec28_1 = 0.0;
    this.fRec29_1 = 0.0;
    this.fRec27_1 = 0.0;

    // Pre-computed constants (set by init())
    this.fConst0  = 0.0;
    this.fConst1  = 0.0;
    this.fConst2  = 0.0;
    this.fConst3  = 0.0;
    this.fConst4  = 0.0;
    this.fConst5  = 0.0;
    this.fConst6  = 0.0;
    this.fConst7  = 0.0;
    this.fConst8  = 0.0;
    this.fConst9  = 0.0;
    this.fConst10 = 0.0;
    this.fConst11 = 0.0;
    this.fConst12 = 0.0;
    this.fConst13 = 0.0;
    this.fConst14 = 0.0;
    this.fConst15 = 0.0;
    this.fConst16 = 0.0;
    this.fConst17 = 0.0;
    this.fConst18 = 0.0;
    this.fConst19 = 0.0;
    this.fConst20 = 0.0;
    this.fConst21 = 0.0;
    this.fConst22 = 0.0;
    this.fConst23 = 0.0;
    this.fConst24 = 0.0;
    this.fConst25 = 0.0;
    this.fConst26 = 0.0;
    this.fConst27 = 0.0;
    this.fConst28 = 0.0;
    this.fConst29 = 0.0;
    this.fConst30 = 0.0;
    this.fConst31 = 0.0;
    this.fConst32 = 0.0;
    this.fConst33 = 0.0;
    this.fConst34 = 0.0;
    this.fConst35 = 0.0;
    this.fConst36 = 0.0;
    this.fConst37 = 0.0;
    this.fConst38 = 0.0;
    this.fConst39 = 0.0;
    this.fConst40 = 0.0;
    this.fConst41 = 0.0;
    this.fConst42 = 0.0;
    this.fConst43 = 0.0;
    this.fConst44 = 0.0;
    this.fConst45 = 0.0;
    this.fConst46 = 0.0;
    this.fConst47 = 0.0;
    this.fConst48 = 0.0;
    this.fConst49 = 0.0;
    this.fConst50 = 0.0;
    this.fConst51 = 0.0;
    this.fConst52 = 0.0;
    this.fConst53 = 0.0;
    this.fConst54 = 0.0;
    this.fConst55 = 0.0;
    this.fConst56 = 0.0;
    this.fConst57 = 0.0;
    this.fConst58 = 0.0;
    this.fConst59 = 0.0;
    this.fConst60 = 0.0;
    this.fConst61 = 0.0;
    this.fConst62 = 0.0;
    this.fConst63 = 0.0;
    this.fConst64 = 0.0;
    this.fConst65 = 0.0;
    this.fConst66 = 0.0;
    this.fConst67 = 0.0;
    this.fConst68 = 0.0;
    this.fConst69 = 0.0;
    this.fConst70 = 0.0;
    this.fConst71 = 0.0;
    this.fConst72 = 0.0;
    this.fConst73 = 0.0;
    this.fConst74 = 0.0;
    this.fConst75 = 0.0;
    this.fConst76 = 0.0;
    this.fConst77 = 0.0;
    this.fConst78 = 0.0;
    this.fConst79 = 0.0;
    this.fConst80 = 0.0;
    this.fConst81 = 0.0;
    this.fConst82 = 0.0;
    this.fConst83 = 0.0;
    this.fConst84 = 0.0;
    this.fConst85 = 0.0;
    this.fConst86 = 0.0;
    this.fConst87 = 0.0;
    this.fConst88 = 0.0;
    this.fConst89 = 0.0;
    this.fConst90 = 0.0;
    this.fConst91 = 0.0;
    this.fConst92 = 0.0;
    this.fConst93 = 0.0;
    this.fConst94 = 0.0;
    this.fConst95 = 0.0;
    this.fConst96 = 0.0;
    this.fConst97 = 0.0;
    this.fConst98 = 0.0;
    this.fConst99 = 0.0;
    this.fConst100 = 0.0;
    this.fConst101 = 0.0;
    this.fConst102 = 0.0;
    this.fConst103 = 0.0;
    this.fConst104 = 0.0;
    this.fConst105 = 0.0;
    this.fConst106 = 0.0;
    this.fConst107 = 0.0;
    this.fConst108 = 0.0;
    this.fConst109 = 0.0;
    this.fConst110 = 0.0;
    this.fConst111 = 0.0;
    this.fConst112 = 0.0;
    this.fConst113 = 0.0;
    this.fConst114 = 0.0;
    this.fConst115 = 0.0;
    this.fConst116 = 0.0;
    this.fConst117 = 0.0;
    this.fConst118 = 0.0;
    this.fConst119 = 0.0;
    this.fConst120 = 0.0;
    this.fConst121 = 0.0;
    this.fConst122 = 0.0;
    this.fConst123 = 0.0;
    this.fConst124 = 0.0;
    this.fConst125 = 0.0;
    this.fConst126 = 0.0;
    this.fConst127 = 0.0;
    this.fConst128 = 0.0;
    this.fConst129 = 0.0;
    this.fConst130 = 0.0;
    this.fConst131 = 0.0;
    this.fConst132 = 0.0;
    this.fConst133 = 0.0;
    this.fConst134 = 0.0;
    this.fConst135 = 0.0;
    this.fConst136 = 0.0;
    this.fConst137 = 0.0;
    this.fConst138 = 0.0;
    this.fConst139 = 0.0;
    this.fConst140 = 0.0;
    this.fConst141 = 0.0;
    this.fConst142 = 0.0;
    this.fConst143 = 0.0;
    this.fConst144 = 0.0;
    this.fConst145 = 0.0;
    this.fConst146 = 0.0;
    this.fConst147 = 0.0;
    this.fConst148 = 0.0;
    this.fConst149 = 0.0;
    this.fConst150 = 0.0;
    this.fConst151 = 0.0;
    this.fConst152 = 0.0;
    this.fConst153 = 0.0;
    this.fConst154 = 0.0;
    this.fConst155 = 0.0;
    this.fConst156 = 0.0;
    this.fConst157 = 0.0;
    this.fConst158 = 0.0;
    this.fConst159 = 0.0;
    this.fConst160 = 0.0;
    this.fConst161 = 0.0;
    this.fConst162 = 0.0;
    this.fConst163 = 0.0;
    this.fConst164 = 0.0;
    this.fConst165 = 0.0;
    this.fConst166 = 0.0;
    this.fConst167 = 0.0;
    this.fConst168 = 0.0;

    this.sampleRate = 44100;
  }

  // -------------------------------------------------------------------------
  // instanceConstants — mirrors noise.cpp lines 320–491 exactly.
  // All tan() arguments match the C++ source; fConst0 clamps SR to [1, 192000].
  // -------------------------------------------------------------------------
  init(sampleRate) {
    this.sampleRate = sampleRate;

    // fConst0 = clamp(SR, 1, 192000)
    const fConst0 = Math.min(192000.0, Math.max(1.0, sampleRate));
    this.fConst0 = fConst0;

    // fConst1 = 1 / tan(0.5 / SR)
    const fConst1 = 1.0 / Math.tan(0.5 / fConst0);
    this.fConst1 = fConst1;

    // fConst2 = tan(62.831852 / SR)
    const fConst2 = Math.tan(62.831852 / fConst0);
    this.fConst2 = fConst2;

    // fConst3 = tan(171.61037 / SR)
    const fConst3 = Math.tan(171.61037 / fConst0);
    this.fConst3 = fConst3;

    // fConst4 = 125.663704 * (tan(171.61037/SR) / tan(62.831852/SR))
    const fConst4 = 125.663704 * (fConst3 / fConst2);
    this.fConst4 = fConst4;

    const fConst5 = fConst4 - fConst1;
    this.fConst5 = fConst5;
    const fConst6 = fConst1 + fConst4;
    this.fConst6 = fConst6;
    const fConst7 = 125.663704 - fConst1;
    this.fConst7 = fConst7;
    const fConst8 = 1.0 / (fConst1 + 125.663704);
    this.fConst8 = fConst8;

    const fConst9 = Math.tan(321.5665 / fConst0);
    this.fConst9 = fConst9;
    const fConst10 = 125.663704 * (fConst9 / fConst2);
    this.fConst10 = fConst10;
    const fConst11 = fConst10 - fConst1;
    this.fConst11 = fConst11;
    const fConst12 = fConst1 + fConst10;
    this.fConst12 = fConst12;
    const fConst13 = fConst2 / fConst3;
    this.fConst13 = fConst13;

    const fConst14 = Math.tan(117.73542 / fConst0);
    this.fConst14 = fConst14;
    const fConst15 = 125.663704 * (fConst14 / fConst2);
    this.fConst15 = fConst15;
    const fConst16 = fConst15 - fConst1;
    this.fConst16 = fConst16;
    const fConst17 = 1.0 / (fConst1 + fConst15);
    this.fConst17 = fConst17;

    const fConst18 = Math.tan(602.5569 / fConst0);
    this.fConst18 = fConst18;
    const fConst19 = 125.663704 * (fConst18 / fConst2);
    this.fConst19 = fConst19;
    const fConst20 = fConst19 - fConst1;
    this.fConst20 = fConst20;
    const fConst21 = fConst1 + fConst19;
    this.fConst21 = fConst21;
    const fConst22 = fConst14 / fConst9;
    this.fConst22 = fConst22;

    const fConst23 = Math.tan(220.61469 / fConst0);
    this.fConst23 = fConst23;
    const fConst24 = 125.663704 * (fConst23 / fConst2);
    this.fConst24 = fConst24;
    const fConst25 = fConst24 - fConst1;
    this.fConst25 = fConst25;
    const fConst26 = 1.0 / (fConst1 + fConst24);
    this.fConst26 = fConst26;

    const fConst27 = Math.tan(1129.0815 / fConst0);
    this.fConst27 = fConst27;
    const fConst28 = 125.663704 * (fConst27 / fConst2);
    this.fConst28 = fConst28;
    const fConst29 = fConst28 - fConst1;
    this.fConst29 = fConst29;
    const fConst30 = fConst1 + fConst28;
    this.fConst30 = fConst30;
    const fConst31 = fConst23 / fConst18;
    this.fConst31 = fConst31;

    const fConst32 = Math.tan(413.39163 / fConst0);
    this.fConst32 = fConst32;
    const fConst33 = 125.663704 * (fConst32 / fConst2);
    this.fConst33 = fConst33;
    const fConst34 = fConst33 - fConst1;
    this.fConst34 = fConst34;
    const fConst35 = 1.0 / (fConst1 + fConst33);
    this.fConst35 = fConst35;

    const fConst36 = Math.tan(2115.6926 / fConst0);
    this.fConst36 = fConst36;
    const fConst37 = 125.663704 * (fConst36 / fConst2);
    this.fConst37 = fConst37;
    const fConst38 = fConst37 - fConst1;
    this.fConst38 = fConst38;
    const fConst39 = fConst1 + fConst37;
    this.fConst39 = fConst39;
    const fConst40 = fConst32 / fConst27;
    this.fConst40 = fConst40;

    const fConst41 = Math.tan(774.6204 / fConst0);
    this.fConst41 = fConst41;
    const fConst42 = 125.663704 * (fConst41 / fConst2);
    this.fConst42 = fConst42;
    const fConst43 = fConst42 - fConst1;
    this.fConst43 = fConst43;
    const fConst44 = 1.0 / (fConst1 + fConst42);
    this.fConst44 = fConst44;

    const fConst45 = Math.tan(3964.4219 / fConst0);
    this.fConst45 = fConst45;
    const fConst46 = 125.663704 * (fConst45 / fConst2);
    this.fConst46 = fConst46;
    const fConst47 = fConst46 - fConst1;
    this.fConst47 = fConst47;
    const fConst48 = fConst1 + fConst46;
    this.fConst48 = fConst48;
    const fConst49 = fConst41 / fConst36;
    this.fConst49 = fConst49;

    const fConst50 = Math.tan(1451.4973 / fConst0);
    this.fConst50 = fConst50;
    const fConst51 = 125.663704 * (fConst50 / fConst2);
    this.fConst51 = fConst51;
    const fConst52 = fConst51 - fConst1;
    this.fConst52 = fConst52;
    const fConst53 = 1.0 / (fConst1 + fConst51);
    this.fConst53 = fConst53;

    const fConst54 = Math.tan(7428.603 / fConst0);
    this.fConst54 = fConst54;
    const fConst55 = 125.663704 * (fConst54 / fConst2);
    this.fConst55 = fConst55;
    const fConst56 = fConst55 - fConst1;
    this.fConst56 = fConst56;
    const fConst57 = fConst1 + fConst55;
    this.fConst57 = fConst57;
    const fConst58 = fConst50 / fConst45;
    this.fConst58 = fConst58;

    const fConst59 = Math.tan(2719.8408 / fConst0);
    this.fConst59 = fConst59;
    const fConst60 = 125.663704 * (fConst59 / fConst2);
    this.fConst60 = fConst60;
    const fConst61 = fConst60 - fConst1;
    this.fConst61 = fConst61;
    const fConst62 = 1.0 / (fConst1 + fConst60);
    this.fConst62 = fConst62;

    const fConst63 = Math.tan(13919.846 / fConst0);
    this.fConst63 = fConst63;
    const fConst64 = 125.663704 * (fConst63 / fConst2);
    this.fConst64 = fConst64;
    const fConst65 = fConst64 - fConst1;
    this.fConst65 = fConst65;
    const fConst66 = fConst1 + fConst64;
    this.fConst66 = fConst66;
    const fConst67 = fConst59 / fConst54;
    this.fConst67 = fConst67;

    const fConst68 = Math.tan(5096.4854 / fConst0);
    this.fConst68 = fConst68;
    const fConst69 = 125.663704 * (fConst68 / fConst2);
    this.fConst69 = fConst69;
    const fConst70 = fConst69 - fConst1;
    this.fConst70 = fConst70;
    const fConst71 = 1.0 / (fConst1 + fConst69);
    this.fConst71 = fConst71;

    const fConst72 = Math.tan(26083.248 / fConst0);
    this.fConst72 = fConst72;
    const fConst73 = 125.663704 * (fConst72 / fConst2);
    this.fConst73 = fConst73;
    const fConst74 = fConst73 - fConst1;
    this.fConst74 = fConst74;
    const fConst75 = fConst1 + fConst73;
    this.fConst75 = fConst75;
    const fConst76 = fConst68 / fConst63;
    this.fConst76 = fConst76;

    const fConst77 = Math.tan(9549.883 / fConst0);
    this.fConst77 = fConst77;
    const fConst78 = 125.663704 * (fConst77 / fConst2);
    this.fConst78 = fConst78;
    const fConst79 = fConst78 - fConst1;
    this.fConst79 = fConst79;
    const fConst80 = 1.0 / (fConst1 + fConst78);
    this.fConst80 = fConst80;

    const fConst81 = Math.tan(48875.246 / fConst0);
    this.fConst81 = fConst81;
    const fConst82 = 125.663704 * (fConst81 / fConst2);
    this.fConst82 = fConst82;
    const fConst83 = fConst82 - fConst1;
    this.fConst83 = fConst83;
    const fConst84 = fConst1 + fConst82;
    this.fConst84 = fConst84;
    const fConst85 = fConst77 / fConst72;
    this.fConst85 = fConst85;

    const fConst86 = Math.tan(17894.736 / fConst0);
    this.fConst86 = fConst86;
    const fConst87 = 125.663704 * (fConst86 / fConst2);
    this.fConst87 = fConst87;
    const fConst88 = fConst87 - fConst1;
    this.fConst88 = fConst88;
    const fConst89 = 1.0 / (fConst1 + fConst87);
    this.fConst89 = fConst89;

    const fConst90 = Math.tan(91583.29 / fConst0);
    this.fConst90 = fConst90;
    const fConst91 = 125.663704 * (fConst90 / fConst2);
    this.fConst91 = fConst91;
    const fConst92 = fConst91 - fConst1;
    this.fConst92 = fConst92;
    const fConst93 = fConst1 + fConst91;
    this.fConst93 = fConst93;
    const fConst94 = fConst86 / fConst81;
    this.fConst94 = fConst94;

    const fConst95 = Math.tan(33531.47 / fConst0);
    this.fConst95 = fConst95;
    const fConst96 = 125.663704 * (fConst95 / fConst2);
    this.fConst96 = fConst96;
    const fConst97 = fConst96 - fConst1;
    this.fConst97 = fConst97;
    const fConst98 = 1.0 / (fConst1 + fConst96);
    this.fConst98 = fConst98;

    const fConst99 = Math.tan(171610.36 / fConst0);
    this.fConst99 = fConst99;
    const fConst100 = 125.663704 * (fConst99 / fConst2);
    this.fConst100 = fConst100;
    const fConst101 = fConst100 - fConst1;
    this.fConst101 = fConst101;
    const fConst102 = fConst1 + fConst100;
    this.fConst102 = fConst102;
    const fConst103 = fConst95 / fConst90;
    this.fConst103 = fConst103;

    const fConst104 = Math.tan(62831.85 / fConst0);
    this.fConst104 = fConst104;
    const fConst105 = 125.663704 * (fConst104 / fConst2);
    this.fConst105 = fConst105;
    const fConst106 = fConst105 - fConst1;
    this.fConst106 = fConst106;
    const fConst107 = 1.0 / (fConst1 + fConst105);
    this.fConst107 = fConst107;

    // fConst108 = 49.96747 * (tan(62831.85/SR) / tan(171610.36/SR))
    const fConst108 = 49.96747 * (fConst104 / fConst99);
    this.fConst108 = fConst108;

    // --- Velvet chain constants ---

    const fConst109 = Math.tan(45.900375 / fConst0);
    this.fConst109 = fConst109;
    const fConst110 = 125.663704 * (fConst109 / fConst2);
    this.fConst110 = fConst110;
    const fConst111 = fConst110 - fConst1;
    this.fConst111 = fConst111;
    const fConst112 = fConst1 + fConst110;
    this.fConst112 = fConst112;

    const fConst113 = Math.tan(86.00892 / fConst0);
    this.fConst113 = fConst113;
    const fConst114 = 125.663704 * (fConst113 / fConst2);
    this.fConst114 = fConst114;
    const fConst115 = fConst114 - fConst1;
    this.fConst115 = fConst115;
    const fConst116 = fConst1 + fConst114;
    this.fConst116 = fConst116;
    const fConst117 = fConst2 / fConst109;
    this.fConst117 = fConst117;

    const fConst118 = Math.tan(161.16502 / fConst0);
    this.fConst118 = fConst118;
    const fConst119 = 125.663704 * (fConst118 / fConst2);
    this.fConst119 = fConst119;
    const fConst120 = fConst119 - fConst1;
    this.fConst120 = fConst120;
    const fConst121 = fConst1 + fConst119;
    this.fConst121 = fConst121;
    const fConst122 = fConst14 / fConst113;
    this.fConst122 = fConst122;

    const fConst123 = Math.tan(301.9938 / fConst0);
    this.fConst123 = fConst123;
    const fConst124 = 125.663704 * (fConst123 / fConst2);
    this.fConst124 = fConst124;
    const fConst125 = fConst124 - fConst1;
    this.fConst125 = fConst125;
    const fConst126 = fConst1 + fConst124;
    this.fConst126 = fConst126;
    const fConst127 = fConst23 / fConst118;
    this.fConst127 = fConst127;

    const fConst128 = Math.tan(565.8813 / fConst0);
    this.fConst128 = fConst128;
    const fConst129 = 125.663704 * (fConst128 / fConst2);
    this.fConst129 = fConst129;
    const fConst130 = fConst129 - fConst1;
    this.fConst130 = fConst130;
    const fConst131 = fConst1 + fConst129;
    this.fConst131 = fConst131;
    const fConst132 = fConst32 / fConst123;
    this.fConst132 = fConst132;

    const fConst133 = Math.tan(1060.3582 / fConst0);
    this.fConst133 = fConst133;
    const fConst134 = 125.663704 * (fConst133 / fConst2);
    this.fConst134 = fConst134;
    const fConst135 = fConst134 - fConst1;
    this.fConst135 = fConst135;
    const fConst136 = fConst1 + fConst134;
    this.fConst136 = fConst136;
    const fConst137 = fConst41 / fConst128;
    this.fConst137 = fConst137;

    const fConst138 = Math.tan(1986.9176 / fConst0);
    this.fConst138 = fConst138;
    const fConst139 = 125.663704 * (fConst138 / fConst2);
    this.fConst139 = fConst139;
    const fConst140 = fConst139 - fConst1;
    this.fConst140 = fConst140;
    const fConst141 = fConst1 + fConst139;
    this.fConst141 = fConst141;
    const fConst142 = fConst50 / fConst133;
    this.fConst142 = fConst142;

    const fConst143 = Math.tan(3723.1208 / fConst0);
    this.fConst143 = fConst143;
    const fConst144 = 125.663704 * (fConst143 / fConst2);
    this.fConst144 = fConst144;
    const fConst145 = fConst144 - fConst1;
    this.fConst145 = fConst145;
    const fConst146 = fConst1 + fConst144;
    this.fConst146 = fConst146;
    const fConst147 = fConst59 / fConst138;
    this.fConst147 = fConst147;

    const fConst148 = Math.tan(6976.4487 / fConst0);
    this.fConst148 = fConst148;
    const fConst149 = 125.663704 * (fConst148 / fConst2);
    this.fConst149 = fConst149;
    const fConst150 = fConst149 - fConst1;
    this.fConst150 = fConst150;
    const fConst151 = fConst1 + fConst149;
    this.fConst151 = fConst151;
    const fConst152 = fConst68 / fConst143;
    this.fConst152 = fConst152;

    const fConst153 = Math.tan(13072.592 / fConst0);
    this.fConst153 = fConst153;
    const fConst154 = 125.663704 * (fConst153 / fConst2);
    this.fConst154 = fConst154;
    const fConst155 = fConst154 - fConst1;
    this.fConst155 = fConst155;
    const fConst156 = fConst1 + fConst154;
    this.fConst156 = fConst156;
    const fConst157 = fConst77 / fConst148;
    this.fConst157 = fConst157;

    const fConst158 = Math.tan(24495.65 / fConst0);
    this.fConst158 = fConst158;
    const fConst159 = 125.663704 * (fConst158 / fConst2);
    this.fConst159 = fConst159;
    const fConst160 = fConst159 - fConst1;
    this.fConst160 = fConst160;
    const fConst161 = fConst1 + fConst159;
    this.fConst161 = fConst161;
    const fConst162 = fConst86 / fConst153;
    this.fConst162 = fConst162;

    const fConst163 = Math.tan(45900.375 / fConst0);
    this.fConst163 = fConst163;
    const fConst164 = 125.663704 * (fConst163 / fConst2);
    this.fConst164 = fConst164;
    const fConst165 = fConst164 - fConst1;
    this.fConst165 = fConst165;
    const fConst166 = fConst1 + fConst164;
    this.fConst166 = fConst166;
    const fConst167 = fConst95 / fConst158;
    this.fConst167 = fConst167;

    // fConst168 = 0.013842662 * (tan(62831.85/SR) / tan(45900.375/SR))
    const fConst168 = 0.013842662 * (fConst104 / fConst163);
    this.fConst168 = fConst168;

    // Reset all state
    this._clear();
  }

  _clear() {
    this.iVec0 = 0;
    this.iRec0 = 0;
    this.fVec1 = 0.0;
    this.fRec1 = [0.0, 0.0, 0.0, 0.0];
    // DC blocker
    this.fRec14_1 = 0.0;
    // Brown chain
    this.fRec13_1 = 0.0;
    this.fRec12_1 = 0.0;
    this.fRec11_1 = 0.0;
    this.fRec10_1 = 0.0;
    this.fRec9_1  = 0.0;
    this.fRec8_1  = 0.0;
    this.fRec7_1  = 0.0;
    this.fRec6_1  = 0.0;
    this.fRec5_1  = 0.0;
    this.fRec4_1  = 0.0;
    this.fRec3_1  = 0.0;
    this.fRec2_1  = 0.0;
    // Velvet chain
    this.fRec26_1 = 0.0;
    this.fRec25_1 = 0.0;
    this.fRec24_1 = 0.0;
    this.fRec23_1 = 0.0;
    this.fRec22_1 = 0.0;
    this.fRec21_1 = 0.0;
    this.fRec20_1 = 0.0;
    this.fRec19_1 = 0.0;
    this.fRec18_1 = 0.0;
    this.fRec17_1 = 0.0;
    this.fRec16_1 = 0.0;
    this.fRec15_1 = 0.0;
    // Crushed noise
    this.fRec28_1 = 0.0;
    this.fRec29_1 = 0.0;
    this.fRec27_1 = 0.0;
  }

  // -------------------------------------------------------------------------
  // tick(mode) — single-sample compute, mirrors noise.cpp compute() loop body.
  //
  // mode: integer 0–4
  //   0 = white, 1 = pink, 2 = brown, 3 = velvet, 4 = crushed
  //
  // All branches compute in parallel every sample (Faust semantics), so the
  // full filter chains always run regardless of the selected mode.
  // State updates happen AFTER output computation (at end of function).
  // -------------------------------------------------------------------------
  tick(mode) {
    // Clamp mode to [0, 4]
    const iMode = Math.max(0, Math.min(4, mode | 0));

    // iSlow flags derived from mode value (mirrors Faust iSlow1..4)
    const iSlow4 = iMode >= 4 ? 1 : 0; // crushed
    const iSlow1 = iMode >= 3 ? 1 : 0; // velvet or crushed
    const iSlow2 = iMode >= 2 ? 1 : 0; // brown, velvet, or crushed
    const iSlow3 = iMode >= 1 ? 1 : 0; // pink, brown, velvet, or crushed

    // ------------------------------------------------------------------
    // LCG — ANSI C rand(), 32-bit signed overflow via Math.imul
    // noise.cpp line 631:
    //   iRec0[0] = 1103515245 * iRec0[1] + 12345
    // ------------------------------------------------------------------
    const iRec0_new = (Math.imul(1103515245, this.iRec0) + 12345) | 0;

    // fTemp0 = float(iRec0[0])
    const fTemp0 = iRec0_new;

    // fTemp1 = 4.656613e-10 * float(iRec0[0])  (white noise, line 634)
    const fTemp1 = 4.656613e-10 * fTemp0;

    // ------------------------------------------------------------------
    // Mode 1 — Pink noise  (noise.cpp line 635)
    // fRec1[0] = 0.5221894*fRec1[3] + fTemp1 + 2.494956*fRec1[1] - 2.0172658*fRec1[2]
    // Output: 10 * (0.049922034*fRec1[0] + 0.0506127*fRec1[2]
    //              - 0.095993534*fRec1[1] - 0.004408786*fRec1[3])
    //
    // Index mapping (before state shift):
    //   C++ fRec1[1] = JS this.fRec1[0]  (1 sample old)
    //   C++ fRec1[2] = JS this.fRec1[1]  (2 samples old)
    //   C++ fRec1[3] = JS this.fRec1[2]  (3 samples old)
    // ------------------------------------------------------------------
    const fRec1_0_new = 0.5221894  * this.fRec1[2]   // fRec1[3]
                      + fTemp1
                      + 2.494956   * this.fRec1[0]   // fRec1[1]
                      - 2.0172658  * this.fRec1[1];  // fRec1[2]

    // ------------------------------------------------------------------
    // DC blocker — shared by brown and velvet chains (noise.cpp line 636)
    // fRec14[0] = 0.995*fRec14[1] + 4.656613e-10*(fTemp0 - fVec1[1])
    // fVec1[1] is the PREVIOUS sample's fTemp0
    // ------------------------------------------------------------------
    const fRec14_0_new = 0.995 * this.fRec14_1
                       + 4.656613e-10 * (fTemp0 - this.fVec1);

    // ------------------------------------------------------------------
    // Mode 2 — Brown noise chain (colored_noise(12,-1.6))
    // 12-stage spectral tilt, noise.cpp lines 637–648
    // Each stage: -(fConstN_denom * (fConstN_fb * prev - fConstN_ratio * (fConstN_add * input + fConstN_sub * input_prev)))
    // ------------------------------------------------------------------

    // Stage 1: fRec13 — input: fRec14
    const fRec13_0_new = -(this.fConst8 * (
      this.fConst7 * this.fRec13_1
      - (this.fConst6 * fRec14_0_new + this.fConst5 * this.fRec14_1)
    ));

    // Stage 2: fRec12 — input: fRec13
    const fRec12_0_new = -(this.fConst17 * (
      this.fConst16 * this.fRec12_1
      - this.fConst13 * (this.fConst12 * fRec13_0_new + this.fConst11 * this.fRec13_1)
    ));

    // Stage 3: fRec11 — input: fRec12
    const fRec11_0_new = -(this.fConst26 * (
      this.fConst25 * this.fRec11_1
      - this.fConst22 * (this.fConst21 * fRec12_0_new + this.fConst20 * this.fRec12_1)
    ));

    // Stage 4: fRec10 — input: fRec11
    const fRec10_0_new = -(this.fConst35 * (
      this.fConst34 * this.fRec10_1
      - this.fConst31 * (this.fConst30 * fRec11_0_new + this.fConst29 * this.fRec11_1)
    ));

    // Stage 5: fRec9 — input: fRec10
    const fRec9_0_new = -(this.fConst44 * (
      this.fConst43 * this.fRec9_1
      - this.fConst40 * (this.fConst39 * fRec10_0_new + this.fConst38 * this.fRec10_1)
    ));

    // Stage 6: fRec8 — input: fRec9
    const fRec8_0_new = -(this.fConst53 * (
      this.fConst52 * this.fRec8_1
      - this.fConst49 * (this.fConst48 * fRec9_0_new + this.fConst47 * this.fRec9_1)
    ));

    // Stage 7: fRec7 — input: fRec8
    const fRec7_0_new = -(this.fConst62 * (
      this.fConst61 * this.fRec7_1
      - this.fConst58 * (this.fConst57 * fRec8_0_new + this.fConst56 * this.fRec8_1)
    ));

    // Stage 8: fRec6 — input: fRec7
    const fRec6_0_new = -(this.fConst71 * (
      this.fConst70 * this.fRec6_1
      - this.fConst67 * (this.fConst66 * fRec7_0_new + this.fConst65 * this.fRec7_1)
    ));

    // Stage 9: fRec5 — input: fRec6
    const fRec5_0_new = -(this.fConst80 * (
      this.fConst79 * this.fRec5_1
      - this.fConst76 * (this.fConst75 * fRec6_0_new + this.fConst74 * this.fRec6_1)
    ));

    // Stage 10: fRec4 — input: fRec5
    const fRec4_0_new = -(this.fConst89 * (
      this.fConst88 * this.fRec4_1
      - this.fConst85 * (this.fConst84 * fRec5_0_new + this.fConst83 * this.fRec5_1)
    ));

    // Stage 11: fRec3 — input: fRec4
    const fRec3_0_new = -(this.fConst98 * (
      this.fConst97 * this.fRec3_1
      - this.fConst94 * (this.fConst93 * fRec4_0_new + this.fConst92 * this.fRec4_1)
    ));

    // Stage 12: fRec2 — input: fRec3
    const fRec2_0_new = -(this.fConst107 * (
      this.fConst106 * this.fRec2_1
      - this.fConst103 * (this.fConst102 * fRec3_0_new + this.fConst101 * this.fRec3_1)
    ));

    // ------------------------------------------------------------------
    // Mode 3 — Velvet noise chain (colored_noise(12,0.5))
    // 12-stage spectral tilt, noise.cpp lines 649–660
    // First stage uses fConst112/fConst111 (not fConst6/fConst5)
    // as input coefficients; same denominator (fConst8/fConst7).
    // ------------------------------------------------------------------

    // Stage 1: fRec26 — input: fRec14
    const fRec26_0_new = -(this.fConst8 * (
      this.fConst7 * this.fRec26_1
      - (this.fConst112 * fRec14_0_new + this.fConst111 * this.fRec14_1)
    ));

    // Stage 2: fRec25 — input: fRec26
    const fRec25_0_new = -(this.fConst17 * (
      this.fConst16 * this.fRec25_1
      - this.fConst117 * (this.fConst116 * fRec26_0_new + this.fConst115 * this.fRec26_1)
    ));

    // Stage 3: fRec24 — input: fRec25
    const fRec24_0_new = -(this.fConst26 * (
      this.fConst25 * this.fRec24_1
      - this.fConst122 * (this.fConst121 * fRec25_0_new + this.fConst120 * this.fRec25_1)
    ));

    // Stage 4: fRec23 — input: fRec24
    const fRec23_0_new = -(this.fConst35 * (
      this.fConst34 * this.fRec23_1
      - this.fConst127 * (this.fConst126 * fRec24_0_new + this.fConst125 * this.fRec24_1)
    ));

    // Stage 5: fRec22 — input: fRec23
    const fRec22_0_new = -(this.fConst44 * (
      this.fConst43 * this.fRec22_1
      - this.fConst132 * (this.fConst131 * fRec23_0_new + this.fConst130 * this.fRec23_1)
    ));

    // Stage 6: fRec21 — input: fRec22
    const fRec21_0_new = -(this.fConst53 * (
      this.fConst52 * this.fRec21_1
      - this.fConst137 * (this.fConst136 * fRec22_0_new + this.fConst135 * this.fRec22_1)
    ));

    // Stage 7: fRec20 — input: fRec21
    const fRec20_0_new = -(this.fConst62 * (
      this.fConst61 * this.fRec20_1
      - this.fConst142 * (this.fConst141 * fRec21_0_new + this.fConst140 * this.fRec21_1)
    ));

    // Stage 8: fRec19 — input: fRec20
    const fRec19_0_new = -(this.fConst71 * (
      this.fConst70 * this.fRec19_1
      - this.fConst147 * (this.fConst146 * fRec20_0_new + this.fConst145 * this.fRec20_1)
    ));

    // Stage 9: fRec18 — input: fRec19
    const fRec18_0_new = -(this.fConst80 * (
      this.fConst79 * this.fRec18_1
      - this.fConst152 * (this.fConst151 * fRec19_0_new + this.fConst150 * this.fRec19_1)
    ));

    // Stage 10: fRec17 — input: fRec18
    const fRec17_0_new = -(this.fConst89 * (
      this.fConst88 * this.fRec17_1
      - this.fConst157 * (this.fConst156 * fRec18_0_new + this.fConst155 * this.fRec18_1)
    ));

    // Stage 11: fRec16 — input: fRec17
    const fRec16_0_new = -(this.fConst98 * (
      this.fConst97 * this.fRec16_1
      - this.fConst162 * (this.fConst161 * fRec17_0_new + this.fConst160 * this.fRec17_1)
    ));

    // Stage 12: fRec15 — input: fRec16
    const fRec15_0_new = -(this.fConst107 * (
      this.fConst106 * this.fRec15_1
      - this.fConst167 * (this.fConst166 * fRec16_0_new + this.fConst165 * this.fRec16_1)
    ));

    // ------------------------------------------------------------------
    // Mode 4 — Crushed noise  (lfnoiseN(0, SR/100))
    // NLF2 oscillator + sample-and-hold  (noise.cpp lines 661–664)
    //
    // fRec28[0] = 0.06279052*fRec29[1] + 0.9980267*fRec28[1]
    // fRec29[0] = float(1 - iVec0[1]) + 0.9980267*fRec29[1] - 0.06279052*fRec28[1]
    //
    // iVec0[1] is the PREVIOUS sample's iVec0 (always 1 after first sample,
    // so float(1 - iVec0[1]) is only 1.0 on the very first sample).
    //
    // trigger = (fRec28[1] <= 0) && (fRec28[0] > 0)
    // fRec27[0] = fRec27[1]*(1-trigger) + 4.656613e-10*fTemp0*trigger
    // ------------------------------------------------------------------
    const fRec28_0_new = 0.06279052 * this.fRec29_1 + 0.9980267 * this.fRec28_1;
    const fRec29_0_new = (1 - this.iVec0) + 0.9980267 * this.fRec29_1 - 0.06279052 * this.fRec28_1;

    // trigger: previous fRec28 was <= 0, and new fRec28 > 0
    const iTemp2 = ((this.fRec28_1 <= 0.0) && (fRec28_0_new > 0.0)) ? 1 : 0;

    // Sample-and-hold: latch white noise on trigger
    const fRec27_0_new = this.fRec27_1 * (1 - iTemp2) + 4.656613e-10 * fTemp0 * iTemp2;

    // ------------------------------------------------------------------
    // Output selection — mirrors noise.cpp line 665:
    //   iSlow1 ? (iSlow4 ? crushed : clamp(fConst168*fRec15[0]))
    //          : (iSlow2 ? clamp(fConst108*fRec2[0])
    //                    : (iSlow3 ? 10*pink : white))
    // ------------------------------------------------------------------
    let output;
    if (iSlow1) {
      if (iSlow4) {
        // Mode 4: crushed
        output = fRec27_0_new;
      } else {
        // Mode 3: velvet — clamp(fConst168 * fRec15[0], -1, 1)
        output = Math.min(1.0, Math.max(-1.0, this.fConst168 * fRec15_0_new));
      }
    } else if (iSlow2) {
      // Mode 2: brown — clamp(fConst108 * fRec2[0], -1, 1)
      output = Math.min(1.0, Math.max(-1.0, this.fConst108 * fRec2_0_new));
    } else if (iSlow3) {
      // Mode 1: pink — 10 * (0.049922034*fRec1[0] + 0.0506127*fRec1[2]
      //                       - 0.095993534*fRec1[1] - 0.004408786*fRec1[3])
      // Index mapping (before state shift):
      //   C++ fRec1[0] = fRec1_0_new       (current)
      //   C++ fRec1[1] = this.fRec1[0]     (1 sample old)
      //   C++ fRec1[2] = this.fRec1[1]     (2 samples old)
      //   C++ fRec1[3] = this.fRec1[2]     (3 samples old)
      output = 10.0 * (
        0.049922034  * fRec1_0_new
        + 0.0506127  * this.fRec1[1]   // fRec1[2]
        - 0.095993534 * this.fRec1[0]  // fRec1[1]
        - 0.004408786 * this.fRec1[2]  // fRec1[3]
      );
    } else {
      // Mode 0: white
      output = fTemp1;
    }

    // ------------------------------------------------------------------
    // State updates — all happen AFTER output computation (end of loop body)
    // Mirrors noise.cpp lines 668–701
    // ------------------------------------------------------------------

    // iVec0[1] = iVec0[0]  — iVec0[0] is always 1 inside the loop
    this.iVec0 = 1;

    // iRec0[1] = iRec0[0]
    this.iRec0 = iRec0_new;

    // fVec1[1] = fVec1[0]  — stores the raw LCG float for next DC blocker computation
    this.fVec1 = fTemp0;

    // fRec1 shift: j0 = 3..1: fRec1[j0] = fRec1[j0-1]
    this.fRec1[3] = this.fRec1[2];
    this.fRec1[2] = this.fRec1[1];
    this.fRec1[1] = this.fRec1[0];
    this.fRec1[0] = fRec1_0_new;

    // DC blocker
    this.fRec14_1 = fRec14_0_new;

    // Brown chain
    this.fRec13_1 = fRec13_0_new;
    this.fRec12_1 = fRec12_0_new;
    this.fRec11_1 = fRec11_0_new;
    this.fRec10_1 = fRec10_0_new;
    this.fRec9_1  = fRec9_0_new;
    this.fRec8_1  = fRec8_0_new;
    this.fRec7_1  = fRec7_0_new;
    this.fRec6_1  = fRec6_0_new;
    this.fRec5_1  = fRec5_0_new;
    this.fRec4_1  = fRec4_0_new;
    this.fRec3_1  = fRec3_0_new;
    this.fRec2_1  = fRec2_0_new;

    // Velvet chain
    this.fRec26_1 = fRec26_0_new;
    this.fRec25_1 = fRec25_0_new;
    this.fRec24_1 = fRec24_0_new;
    this.fRec23_1 = fRec23_0_new;
    this.fRec22_1 = fRec22_0_new;
    this.fRec21_1 = fRec21_0_new;
    this.fRec20_1 = fRec20_0_new;
    this.fRec19_1 = fRec19_0_new;
    this.fRec18_1 = fRec18_0_new;
    this.fRec17_1 = fRec17_0_new;
    this.fRec16_1 = fRec16_0_new;
    this.fRec15_1 = fRec15_0_new;

    // Crushed noise
    this.fRec28_1 = fRec28_0_new;
    this.fRec29_1 = fRec29_0_new;
    this.fRec27_1 = fRec27_0_new;

    return output;
  }
}

// ─── SVF Band (1:1 from svf_lp/hp/peak/ls/hs.cpp — Faust 2.74.5) ─────────────
// All 5 filter types share the same TPT state variable topology.
// Smoothing: one-pole IIR at 10 Hz (44.1/SR alpha), matching Faust fConst1/fConst2.
class SVFBand {
  constructor(sr) {
    // Smoothing constants (from svf_lp.cpp instanceConstants):
    // fConst1 = 44.1/SR, fConst2 = 1 - 44.1/SR, fConst3 = π/SR
    this.alpha  = 44.1 / sr;        // fConst1
    this.oneMA  = 1 - 44.1 / sr;   // fConst2
    this.piOverSr = Math.PI / sr;   // fConst3

    // Smoothed parameter states (freq, Q, gain)
    this.freqS = 1000;   // fRec3 (or fRec5)
    this.qS    = 0.7;    // fRec4 (or fRec0/fRec1/fRec6)
    this.gainS = 0;      // fRec0 (peak/shelf only)

    // Filter state: two integrators, stereo (L and R)
    this.s1L = 0; this.s2L = 0;  // fRec0[2], fRec1[2] for L
    this.s1R = 0; this.s2R = 0;  // fRec5[2], fRec6[2] for R

    // Target values (set by setParams)
    this.freqTarget = 1000;
    this.qTarget    = 0.7;
    this.gainTarget = 0;
    this.type = 'lp';  // 'lp' | 'hp' | 'peak' | 'ls' | 'hs'
    this.enabled = false;
  }

  setParams(type, freq, q, gainDb, enabled) {
    this.type        = type;
    this.freqTarget  = Math.max(20, Math.min(20000, freq));
    this.qTarget     = Math.max(0.7, Math.min(10, q));
    this.gainTarget  = Math.max(-24, Math.min(24, gainDb ?? 0));
    this.enabled     = enabled;
  }

  // Process one stereo sample pair. Returns [outL, outR].
  // Ported verbatim from each svf_*.cpp compute() loop body.
  tick(inL, inR) {
    if (!this.enabled) return [inL, inR];

    // ── Smooth parameters (one-pole IIR, matching Faust fConst1/fConst2) ──
    // fSlow = alpha * target
    // fRec = fSlow + oneMA * fRec_prev
    this.freqS = this.alpha * this.freqTarget + this.oneMA * this.freqS;
    this.qS    = this.alpha * this.qTarget    + this.oneMA * this.qS;
    this.gainS = this.alpha * this.gainTarget + this.oneMA * this.gainS;

    const g = Math.tan(this.piOverSr * this.freqS);

    let outL, outR;

    if (this.type === 'lp') {
      // svf_lp.cpp lines 165–183
      const den = g * (g + 1 / this.qS) + 1;
      // L:
      const t3L  = this.s1L + g * (inL - this.s2L);
      const v1L  = t3L / den;
      this.s1L   = 2 * v1L - this.s1L;
      const t5L  = this.s2L + g * t3L / den;
      this.s2L   = 2 * t5L - this.s2L;
      outL = t5L;
      // R:
      const t3R  = this.s1R + g * (inR - this.s2R);
      const v1R  = t3R / den;
      this.s1R   = 2 * v1R - this.s1R;
      const t5R  = this.s2R + g * t3R / den;
      this.s2R   = 2 * t5R - this.s2R;
      outR = t5R;

    } else if (this.type === 'hp') {
      // svf_hp.cpp lines 163–185
      // Note: Q is smoothed as fRec0, freq as fRec5 (order swapped vs LP)
      const den = g * (g + 1 / this.qS) + 1;
      // L:
      const t3L  = this.s1L + g * (inL - this.s2L);
      const v1L  = t3L / den;
      this.s1L   = 2 * v1L - this.s1L;
      const t5L  = this.s2L + g * t3L / den;
      this.s2L   = 2 * t5L - this.s2L;
      outL = inL - (t5L + v1L / this.qS);
      // R:
      const t3R  = this.s1R + g * (inR - this.s2R);
      const v1R  = t3R / den;
      this.s1R   = 2 * v1R - this.s1R;
      const t5R  = this.s2R + g * t3R / den;
      this.s2R   = 2 * t5R - this.s2R;
      outR = inR - (t5R + v1R / this.qS);

    } else if (this.type === 'peak') {
      // svf_peak.cpp lines 174–205
      // A = 10^(gain/40) = 10^(0.025*gain)
      const A   = Math.pow(10, 0.025 * this.gainS);
      const Aq  = this.qS * A;              // fTemp1 = Q*A
      const A2m1 = A * A - 1;               // fTemp2 = A²-1
      const den = g * (g + 1 / Aq) + 1;
      // L:
      const t6L  = this.s1L + g * (inL - this.s2L);
      const v1L  = t6L / den;               // fRec4 = fTemp7
      this.s1L   = 2 * v1L - this.s1L;
      const t8L  = this.s2L + g * t6L / den;
      this.s2L   = 2 * t8L - this.s2L;
      outL = inL + v1L * A2m1 / Aq;
      // R:
      const t6R  = this.s1R + g * (inR - this.s2R);
      const v1R  = t6R / den;
      this.s1R   = 2 * v1R - this.s1R;
      const t8R  = this.s2R + g * t6R / den;
      this.s2R   = 2 * t8R - this.s2R;
      outR = inR + v1R * A2m1 / Aq;

    } else if (this.type === 'ls') {
      // svf_ls.cpp lines 174–206
      const A    = Math.pow(10, 0.025 * this.gainS);
      const sqA  = Math.sqrt(A);
      const A2m1 = A * A - 1;               // fTemp1
      const Am1  = A - 1;                   // fTemp10
      // Modified denominator using g/sqrt(A) (svf_ls.cpp line 182)
      const den  = g * (1 / this.qS + g / sqA) / sqA + 1;
      const gden = sqA * den;
      // L:
      const t6L  = this.s1L + g * (inL - this.s2L) / sqA;
      const v1L  = t6L / den;
      this.s1L   = 2 * v1L - this.s1L;
      const t9L  = this.s2L + g * t6L / gden;
      this.s2L   = 2 * t9L - this.s2L;
      outL = inL + v1L * Am1 / this.qS + t9L * A2m1;
      // R:
      const t6R  = this.s1R + g * (inR - this.s2R) / sqA;
      const v1R  = t6R / den;
      this.s1R   = 2 * v1R - this.s1R;
      const t9R  = this.s2R + g * t6R / gden;
      this.s2R   = 2 * t9R - this.s2R;
      outR = inR + v1R * Am1 / this.qS + t9R * A2m1;

    } else {
      // svf_hs.cpp lines 174–206
      const A    = Math.pow(10, 0.025 * this.gainS);
      const sqA  = Math.sqrt(A);
      const A2m1 = 1 - A * A;               // fTemp1 = 1-A²
      const Am1  = 1 - A;                   // fTemp8 = 1-A
      // Modified g: tan * sqrt(A) (svf_hs.cpp line 179)
      const gmod = g * sqA;
      const den  = gmod * (gmod + 1 / this.qS) + 1;
      // L:
      const t5L  = this.s1L + gmod * (inL - this.s2L);
      const v1L  = t5L / den;
      this.s1L   = 2 * v1L - this.s1L;
      const t7L  = this.s2L + gmod * t5L / den;
      this.s2L   = 2 * t7L - this.s2L;
      outL = A * (inL * A + v1L * Am1 / this.qS) + t7L * A2m1;
      // R:
      const t5R  = this.s1R + gmod * (inR - this.s2R);
      const v1R  = t5R / den;
      this.s1R   = 2 * v1R - this.s1R;
      const t7R  = this.s2R + gmod * t5R / den;
      this.s2R   = 2 * t7R - this.s2R;
      outR = A * (inR * A + v1R * Am1 / this.qS) + t7R * A2m1;
    }

    return [outL, outR];
  }
}
