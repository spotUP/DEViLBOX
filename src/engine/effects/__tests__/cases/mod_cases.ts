import { type ComplianceTestCase } from '../ComplianceRunner';

export const modCases: ComplianceTestCase[] = [

  {

    name: 'Dxx Pattern Break BCD',

    format: 'MOD',

    steps: [

      { row: 0, effect: 'D10', expected: [{ tick: 0, period: 0 }] }, // Resets at end of row, but handler returns it

    ]

  },

  {

    name: 'Dxx Pattern Break Invalid BCD',

    format: 'MOD',

    steps: [

      { row: 0, effect: 'D65', expected: [{ tick: 0, period: 0 }] } // Should clamp to 0

    ]

  },

    {

      name: '7xy Tremolo scaling',

      format: 'MOD',

      initialState: { volume: 32, tremoloPos: 16, tremoloSpeed: 0, tremoloDepth: 4 },

      steps: [

        { row: 0, effect: '704', expected: [{ tick: 0, volume: 32 + ((255 * 4) >> 6) }] } // Sine(16)=255, Delta=(255*4)/64 = 15. 32+15=47

      ]

    },

    {

      name: 'F00 Stop Song',

      format: 'MOD',

      steps: [

        { row: 0, effect: 'F00', expected: [{ tick: 0, stopSong: true }] }

      ]

    },

    {

      name: 'Arp Wraparound',

      format: 'MOD',

      initialState: { period: 113, finetune: 0 }, // B-3 (Note 35)

      steps: [

        { 

          row: 0, 

          effect: '010', 

          expected: [{ tick: 1, period: 0 }] // B-3 + 1 semitone = C-4 (Note 36) = period 0

        },

        {

          row: 1,

          effect: '020',

          expected: [{ tick: 1, period: 856 }] // B-3 + 2 semitones = C#4 -> wrapped to C-1 = period 856

        }

      ]

    },

    {

      name: 'Delay Break (EEx + Dxx)',

      format: 'MOD',

      steps: [

        { 

          row: 0, 

          effect: 'EE1', // Row delay 1 (total 2 repetitions)

          expected: [{ tick: 0, period: 0 }] 

        },

        {

          row: 0,

          effect: 'D01', // Pattern Break to Row 1

          expected: [{ tick: 0, period: 0 }] // On a row delay, Dxx skips the target row

        }

      ]

    },

        {

          name: 'Note Delay Next Row (EDx where x >= speed)',

          format: 'MOD',

          steps: [

            { 

              row: 0, 

              note: 'C-1',

              effect: 'ED9', // Delay 9 ticks (Speed is 6)

              expected: [{ tick: 0, triggerNote: false }] // Should NOT trigger on current row

            }

          ]

        },

        {

          name: 'Vibrato Reset (Tick 0)',

          format: 'MOD',

          initialState: { period: 428, vibratoPos: 16, vibratoSpeed: 0, vibratoDepth: 4 },

          steps: [

            { 

              row: 0, 

              effect: '404', 

              expected: [{ tick: 0, period: 428 }] // VibratoReset.mod: Tick 0 offset is 0

            },

    

        {

          row: 0,

          effect: '404',

          expected: [{ tick: 1, period: 428 + ((255 * 4) >> 7) }] // Tick 1: (255*4)>>7 = 7. 428+7=435

        }

      ]

    },

  {

    name: 'Lone Instrument (PTInstrSwap.mod)',

    format: 'MOD',

    initialState: {

      activeInstrument: {

        defaultVolume: 64,

        finetune: 0

      }

    },

            steps: [

              {

                row: 0,

                note: 'C-1',

                instrument: 1,

                expected: [{ tick: 0, triggerNote: true, volume: 64, period: 428 }]

              },

              {

                row: 1,

                instrument: 2, // Lone instrument with finetune +7

                initialState: {

                  activeInstrument: {

                    defaultVolume: 32,

                    finetune: 7

                  }

                },

                expected: [{ 

                  tick: 0, 

                  triggerNote: false, 

                  volume: 32, 

                  period: 407 // C-1 with finetune +7 is period 407

                }]

              }

            ]

        

    

  },

  {

    name: 'Buggy Offset (ptoffset.mod)',

    format: 'MOD',

    steps: [

      { 

        row: 0, 

        instrument: 1,

        effect: '901', 

        expected: [{ tick: 0, sampleOffset: 512 }] // 256 * 2

      }

    ]

  },

  {

    name: 'Offset Retrigger (PTOffsetRetrigger.mod)',

    format: 'MOD',

    initialState: { lastSampleOffset: 1 },

    steps: [

      { 

        row: 0, 

        effect: 'E93', 

        expected: [{ tick: 3, sampleOffset: 256 }]

      }

    ]

  }

];
