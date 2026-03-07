#pragma once

enum FX_Table {
    /*·····            Pitch                             ·····*/
    fx_SlideUp = 0x01,                  // xy = 00-FF
    fx_SlideDown = 0x02,                // xy = 00-FF
    fx_Portamento = 0x03,               // xy = 00-FF
    fx_InitInstrumentPortamento = 0x04, // xy = --
    fx_PitchUp = 0x05,                  // xy = 00-FF
    fx_PitchDown = 0x06,                // xy = 00-FF
    fx_VibratoSpeed = 0x07,             // xy = 00-FF
    fx_VibratoUp = 0x08,                // xy = 00-40  Init Vibrato
    fx_VibratoDown = 0x09,              // xy = 00-40  Init Vibrato
    fx_VibratoWave = 0x0A,              // xy = 00-03  00=Sinus
                                        // 				01=Down Ramp
                                        // 				02=Saw Tooth
                                        // 				03=Square
    fx_SetFinetune = 0x0B,              // xy = E1-1F

    /*·····            Instrument Volume                 ·····*/
    fx_Volume = 0x10,              // xy = 00-40
    fx_VolumeSlideUp = 0x11,       // xy = 00-FF
    fx_VolumeSlideDown = 0x12,     // xy = 00-FF
    fx_VolumeSlideToVolSet = 0x13, // xy = 00-40
    fx_VolumeSlideToVol = 0x14,    // xy = 00-FF
    fx_VolumeAdd = 0x15,           // xy = 00-40
    fx_VolumeSub = 0x16,           // xy = 00-40
    fx_TremoloSpeed = 0x17,        // xy = 00-FF
    fx_TremoloUp = 0x18,           // xy = 00-40  Init Tremolo
    fx_TremoloDown = 0x19,         // xy = 00-40  Init Tremolo
    fx_TremoloWave = 0x1A,         // xy = 00-03  00=Sinus
                                   // 				01=Down Ramp
                                   // 				02=Saw Tooth
                                   //					03=Square
    fx_SetSurround = 0x1e,         // xy = Special Volume
    fx_SpecialVolume = 0x1f,       // xy = Special Volume

    /*·····            Channel Volume                    ·····*/
    fx_ChannelVol = 0x20,              // xy = 00-40
    fx_ChannelVolSlideUp = 0x21,       // xy = 00-FF
    fx_ChannelVolSlideDown = 0x22,     // xy = 00-FF
    fx_ChannelVolSlideToVolSet = 0x23, // xy = 00-40
    fx_ChannelVolSlideToVol = 0x24,    // xy = 00-FF
    fx_ChannelVolAdd = 0x25,           // xy = 00-40
    fx_ChannelVolSub = 0x26,           // xy = 00-40
    fx_AllChannelVol = 0x27,           // xy = 00-40

    /*·····            Master Volume                     ·····*/
    fx_MasterVol = 0x30,              // xy = 00-40
    fx_MasterVolSlideUp = 0x31,       // xy = 00-FF
    fx_MasterVolSlideDown = 0x32,     // xy = 00-FF
    fx_MasterVolSlideToVolSet = 0x33, // xy = 00-40
    fx_MasterVolSlideToVol = 0x34,    // xy = 00-FF
    fx_MasterVolAdd = 0x35,           // xy = 00-40
    fx_MasterVolSub = 0x36,           // xy = 00-40

    /*·····            Other                             ·····*/
    fx_SpeedPart = 0x40,           // xy = 00-1F
    fx_GroovePart = 0x41,          // xy = 00-1F
    fx_SpeedAll = 0x42,            // xy = 00-FF  00-1F=Speed
                                   // 				20-FF=Tempo
    fx_GrooveAll = 0x43,           // xy = 00-1F
    fx_ArpeggioList = 0x44,        // xy = 00-FF
    fx_ArpeggioListOneStep = 0x45, // xy = 00-FF
    fx_HoldSustain = 0x46,         // xy = 00-01  00=ReleaseSustain
                                   // 				01=HoldSustain
    fx_Filter = 0x47,              // xy = 00-01  00=Off
                                   // 				01=On
    fx_SampleOffset = 0x48,        // xy = 00-FF  SampleOffset<<8 (21=2100)
    fx_RestartNoVolume = 0x49,     // xy = --     Restarts Instrument without volume update
    fx_WaveSample = 0x4A,          // xy = 00-FF  WaveSample Select
    fx_InitInstrument = 0x4B,      // xy = --     Restarts all Instrument effects

    fx_NumPoly = 0x4F, // xy = --     Restarts all Instrument effects

    fx_ReverbOn = 0x50,
    fx_ReverbAmp = 0x51,
    fx_ReverbSize = 0x52,

    fx_EchoOn = 0x58,
    fx_EchoAmp = 0x59,

    fx_Pan = 0x60,
    fx_PanAdd = 0x61,
    fx_PanSize = 0x62,

    fx_Chord = 0x70,

    fx_SetResoCounter = 0x80,
    fx_SetResoAmp = 0x81,
    fx_SetFiltCounter = 0x88,

    /*·····            Protracker Pitch                  ·····*/
    fx_PTSlideUp = 0xE1,       // 1xx : upspeed
    fx_PTSlideDown = 0xE2,     // 2xx : downspeed
    fx_PTPortamento = 0xE3,    // 3xx : up/down speed
    fx_PTFineSlideUp = 0xE4,   // E1x : value
    fx_PTFineSlideDown = 0xE5, // E2x : value
    fx_PTVolSlideUp = 0xE6,    //
    fx_PTVolSlideDown = 0xE7,  //
    fx_PTTremolo = 0xE8,       //
    fx_PTTremoloWave = 0xE9,   // E4x : 0-sine, 1-ramp down, 2-square
    fx_PTVibrato = 0xEA,       // 4xy : x-speed,   y-depth
    fx_PTVibratoWave = 0xEB,   // E4x : 0-sine, 1-ramp down, 2-square

    /*·····            UserCommand                       ·····*/
    fx_UserCommand0 = 0xF0, // xy = 00-FF
    fx_UserCommand1 = 0xF1,
    fx_UserCommand2 = 0xF2,
    fx_UserCommand3 = 0xF3,
    fx_UserCommand4 = 0xF4,
    fx_UserCommand5 = 0xF5,
    fx_UserCommand6 = 0xF6,
    fx_UserCommand7 = 0xF7,
    fx_UserCommand8 = 0xF8,
    fx_UserCommand9 = 0xF9,
    fx_UserCommandA = 0xFA,
    fx_UserCommandB = 0xFB,
    fx_UserCommandC = 0xFC,
    fx_UserCommandD = 0xFD,
    fx_UserCommandE = 0xFE,
    fx_UserCommandF = 0xFF,
};

enum {
    inst_ADSR = 0,
    inst_VIBRATO,
    inst_TREMOLO,
    inst_ARPEGGIO,
    inst_LOOP,
    inst_LOOPSTOP,
    inst_HOLDSUSTAIN,
    inst_WSLOOP,
    inst_TRANSFORM,
    inst_PHASE,
    inst_MIX,
    inst_RESONANCE,
    inst_FILTER,
    inst_numOf,
};
