import { type ComplianceTestCase } from '../ComplianceRunner';

export const itCases: ComplianceTestCase[] = [

  {

    name: 'Note Cut (SCx)',

    format: 'IT',

    initialState: { volume: 64 },

    steps: [

      { row: 0, effect: 'SC3', expected: [{ tick: 3, volume: 0 }] }

    ]

  },

  {

    name: 'Note Delay (SDx)',

    format: 'IT',

    steps: [

      { row: 0, note: 'C-3', effect: 'SD3', expected: [{ tick: 3, triggerNote: true }] }

    ]

  },

  {

    name: 'Pattern Delay + Note Delay Retrig',

    format: 'IT',

    steps: [

      { 

        row: 0, 

        note: 'C-3', 

        effect: 'SE1', 

        expected: [{ tick: 0, triggerNote: true }]

      }

    ]

  },

      {

        name: 'Resonant Filter (Zxx)',

        format: 'IT',

        steps: [

          { row: 0, effect: 'Z7F', expected: [{ tick: 0, filterCutoff: 255 }] }, // Bypass

          { row: 1, effect: 'Z40', expected: [{ tick: 0, filterCutoff: 0x40 }] }, // Mid cutoff

          { row: 2, effect: 'Z8F', expected: [{ tick: 0, filterResonance: 0x0F << 3 }] } // Max resonance

        ]

      },

                                                {

                                                  name: 'IT Auto-Vibrato Sweep',

                                                  format: 'IT',

                                                  initialState: { 

                                                    // Note: A-3 in IT hardware terms (Octave 3, Note 9) is Period 127

                                                    // Frequency = 26633830 / 127 = 209715.2 Hz (High-clock mode)

                                                    frequency: 209715.2,

                                                    activeInstrument: {

                                                      autoVibrato: {

                                                        type: 'square',

                                                        sweep: 64,

                                                        depth: 10, // 10%

                                                        rate: 32

                                                      }

                                                    }

                                                  },

                                                          steps: [

                                                            { 

                                                              row: 0, 

                                                              note: 'A-3',

                                                              expected: [

                                                                { tick: 0, frequency: 209715.2 },

                                                                // Delta = 1 * (10/200) * (64/255) * 209715.2 = 2631.7

                                                                { tick: 1, frequency: 212346.9 }

                                                              ]

                                                            }

                                                          ]

                                                  

                                                }

                              

                        

                  

            

      

    ];
