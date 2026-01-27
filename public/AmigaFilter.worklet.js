/**
 * AmigaFilterProcessor - 1:1 Amiga Audio Filter Emulation
 * 
 * Ported from pt2-clone (pt2_rcfilters.c)
 */

class AmigaFilterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    this.ledEnabled = true;
    
    // Coefficients (will be updated on initialization)
    this.hp_a1 = 0;
    this.hp_a2 = 0;
    this.lp1_a1 = 0;
    this.lp1_a2 = 0;
    this.lp2_a1 = 0;
    this.lp2_a2 = 0;
    this.lp2_b1 = 0;
    this.lp2_b2 = 0;

    // Filter states
    this.tmpL_hp = 0;
    this.tmpR_hp = 0;
    this.tmpL_lp1 = 0;
    this.tmpR_lp1 = 0;
    this.tmpL_lp2 = [0, 0, 0, 0]; // [x1, x2, y1, y2]
    this.tmpR_lp2 = [0, 0, 0, 0];

    this.port.onmessage = (event) => {
      if (event.data.type === 'INIT') {
        const { hp, lp1, lp2 } = event.data.coeffs;
        this.hp_a1 = hp.a1;
        this.hp_a2 = hp.a2;
        this.lp1_a1 = lp1.a1;
        this.lp1_a2 = lp1.a2;
        this.lp2_a1 = lp2.a1;
        this.lp2_a2 = lp2.a2;
        this.lp2_b1 = lp2.b1;
        this.lp2_b2 = lp2.b2;
      } else if (event.data.type === 'SET_LED') {
        this.ledEnabled = event.data.enabled;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0]) return true;

    const channelCount = input.length;
    const sampleCount = input[0].length;

    for (let s = 0; sampleCount > s; s++) {
      for (let c = 0; channelCount > c; c++) {
        let sample = input[c][s];

        // 1. Fixed A500 Low-pass (~4.4kHz)
        if (c === 0) {
          this.tmpL_lp1 = (sample * this.lp1_a1) + (this.tmpL_lp1 * this.lp1_a2);
          sample = this.tmpL_lp1;
        } else {
          this.tmpR_lp1 = (sample * this.lp1_a1) + (this.tmpR_lp1 * this.lp1_a2);
          sample = this.tmpR_lp1;
        }

        // 2. Switchable LED Filter (~3.1kHz)
        if (this.ledEnabled) {
          if (c === 0) {
            const y = (sample * this.lp2_a1) + (this.tmpL_lp2[0] * this.lp2_a2) + (this.tmpL_lp2[1] * this.lp2_a1) - (this.tmpL_lp2[2] * this.lp2_b1) - (this.tmpL_lp2[3] * this.lp2_b2);
            this.tmpL_lp2[1] = this.tmpL_lp2[0];
            this.tmpL_lp2[0] = sample;
            this.tmpL_lp2[3] = this.tmpL_lp2[2];
            this.tmpL_lp2[2] = y;
            sample = y;
          } else {
            const y = (sample * this.lp2_a1) + (this.tmpR_lp2[0] * this.lp2_a2) + (this.tmpR_lp2[1] * this.lp2_a1) - (this.tmpR_lp2[2] * this.lp2_b1) - (this.tmpR_lp2[3] * this.lp2_b2);
            this.tmpR_lp2[1] = this.tmpR_lp2[0];
            this.tmpR_lp2[0] = sample;
            this.tmpR_lp2[3] = this.tmpR_lp2[2];
            this.tmpR_lp2[2] = y;
            sample = y;
          }
        }

        // 3. Fixed High-pass (~5Hz)
        if (c === 0) {
          this.tmpL_hp = (sample * this.hp_a1) + (this.tmpL_hp * this.hp_a2);
          sample = sample - this.tmpL_hp;
        } else {
          this.tmpR_hp = (sample * this.hp_a1) + (this.tmpR_hp * this.hp_a2);
          sample = sample - this.tmpR_hp;
        }

        output[c][s] = sample;
      }
    }

    return true;
  }
}

registerProcessor('amiga-filter-processor', AmigaFilterProcessor);
