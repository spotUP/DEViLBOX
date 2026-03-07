#pragma once

#define scalefreq (1)
#define MAXCHANS (8)

/*****************************************************************************
 * Musicline Editor Structures                    * Conny Cyréus - Musicline *
 *****************************************************************************/

/***** TUNE *****/

#define tune_Title 0
#define tune_Tempo 32
#define tune_Speed 34
#define tune_Groove 35
#define tune_Volume 36
#define tune_PlayMode 38
#define tune_Channels 39
#define tune_Ch1Ptr 40
#define tune_Ch2Ptr 44
#define tune_Ch3Ptr 48
#define tune_Ch4Ptr 52
#define tune_Ch5Ptr 56
#define tune_Ch6Ptr 60
#define tune_Ch7Ptr 64
#define tune_Ch8Ptr 68
#define tune_SIZEOF 72

#define tune_LOADSIZE (tune_Ch1Ptr - tune_Title)
#define tune_ChPtrs (tune_Ch1Ptr - tune_Title)

/***** VOICE *****/

#define chnl_Data 0
#define chnl_SIZEOF (2 * 256)

/***** PART *****/

#define part_Data 0
#define part_SIZEOF (12 * 128)

/***** ARPEGGIO *****/

#define arpg_Data 0
#define arpg_SIZEOF (6 * 128)

/***** SAMPLE *****/

#define smpl_Title 0
#define smpl_PadByte2 32
#define smpl_Type 33
#define smpl_Pointer 34
#define smpl_Length 38
#define smpl_RepPointer 40
#define smpl_RepLength 44
#define smpl_FineTune 46
#define smpl_SemiTone 48
#define smpl_SampleData 50

#define smpl_SIZEOF (smpl_SampleData - smpl_Title)

/***** INSTRUMENT *****/

#define inst_Title 0
#define inst_SmplNumber 32
#define inst_SmplType 33
#define inst_SmplPointer 34
#define inst_SmplLength 38
#define inst_SmplRepPointer 40
#define inst_SmplRepLength 44
#define inst_FineTune 46
#define inst_SemiTone 48
#define inst_SmplStart 50
#define inst_SmplEnd 52
#define inst_SmplRepStart 54
#define inst_SmplRepLen 56
#define inst_Volume 58
#define inst_Transpose 60
#define inst_SlideSpeed 61
#define inst_Effects1 62
#define inst_Effects2 63

#define WSLOOP 7 // Effects1

/** EnvelopeGenerator **/
#define ADSR 0            // Effects1
#define ADSRHOLDSUSTAIN 0 // inst_EnvTraPhaFilBits

#define inst_EnvAttLen 64
#define inst_EnvDecLen 66
#define inst_EnvSusLen 68
#define inst_EnvRelLen 70
#define inst_EnvAttSpd 72
#define inst_EnvDecSpd 74
#define inst_EnvSusSpd 76
#define inst_EnvRelSpd 78
#define inst_EnvAttVol 80
#define inst_EnvDecVol 82
#define inst_EnvSusVol 84
#define inst_EnvRelVol 86

/** Vibrato **/

#define VIBRATO 1 // Effects1

#define inst_VibDir 88
#define inst_VibWaveNum 89
#define inst_VibSpeed 90
#define inst_VibDelay 92
#define inst_VibAtkSpd 94
#define inst_VibAttack 96
#define inst_VibDepth 98

/** Tremolo **/

#define TREMOLO 2 // Effects1

#define inst_TreDir 100
#define inst_TreWaveNum 101
#define inst_TreSpeed 102
#define inst_TreDelay 104
#define inst_TreAtkSpd 106
#define inst_TreAttack 108
#define inst_TreDepth 110

/** Arpeggio **/

#define ARPEGGIO 3 // Effects1

#define inst_ArpTable 112
#define inst_ArpSpeed 114
#define inst_ArpGroove 115

/** Transform **/

#define TRANSFORM 0     // Effects2
#define TRANSFORMINIT 1 // inst_EnvTraPhaFilBits
#define TRANSFORMSTEP 2 // inst_EnvTraPhaFilBits

#define inst_EnvTraPhaFilBits 116
#define inst_TraWaveNums 117
#define inst_TraStart 122
#define inst_TraRepeat 124
#define inst_TraRepEnd 126
#define inst_TraSpeed 128
#define inst_TraTurns 130
#define inst_TraDelay 132

/** Phase **/

#define PHASE 1     // Effects2
#define PHASEINIT 3 // inst_EnvTraPhaFilBits
#define PHASESTEP 4 // inst_EnvTraPhaFilBits
#define PHASEFILL 5 // inst_EnvTraPhaFilBits

#define inst_PhaStart 134
#define inst_PhaRepeat 136
#define inst_PhaRepEnd 138
#define inst_PhaSpeed 140
#define inst_PhaTurns 142
#define inst_PhaDelay 144
#define inst_PhaType 146

/** Mix **/

#define MIX 2        // Effects2
#define MIXINIT 0    // inst_MixResLooBits
#define MIXSTEP 1    // inst_MixResLooBits
#define MIXBUFF 2    // inst_MixResLooBits
#define MIXCOUNTER 3 // inst_MixResLooBits

#define inst_MixResLooBits 148
#define inst_MixWaveNum 149
#define inst_MixStart 150
#define inst_MixRepeat 152
#define inst_MixRepEnd 154
#define inst_MixSpeed 156
#define inst_MixTurns 158
#define inst_MixDelay 160

/** Resonance **/

#define RESONANCE 3     // Effects2
#define RESONANCEINIT 4 // inst_MixResLooBits
#define RESONANCESTEP 5 // inst_MixResLooBits

#define inst_ResStart 162
#define inst_ResRepeat 164
#define inst_ResRepEnd 166
#define inst_ResSpeed 168
#define inst_ResTurns 170
#define inst_ResDelay 172
#define inst_MixResFilBoost 174
#define inst_ResAmp 175

/** Filter **/

#define FILTER 4     // Effects2
#define FILTERINIT 6 // inst_EnvTraPhaFilBits
#define FILTERSTEP 7 // inst_EnvTraPhaFilBits

#define inst_FilStart 176
#define inst_FilRepeat 178
#define inst_FilRepEnd 180
#define inst_FilSpeed 182
#define inst_FilTurns 184
#define inst_FilDelay 186
#define inst_FilPadByte 188
#define inst_FilType 189

/** Loop **/

#define LOOP 4     // Effects1
#define LOOPSTOP 5 // Effects1
#define LOOPINIT 6 // inst_MixResLooBits
#define LOOPSTEP 7 // inst_MixResLooBits

#define inst_LooStart 190
#define inst_LooRepeat 192
#define inst_LooRepEnd 194
#define inst_LooLength 196
#define inst_LooLpStep 198
#define inst_LooWait 200
#define inst_LooDelay 202
#define inst_LooTurns 204

#define inst_SIZEOF 206

void InitRoutine(void);
void SizerTab(unsigned char* sizetab, unsigned short* offstab, unsigned short size);
unsigned long DeltaDePacker(unsigned char* source, char command, char* dest, unsigned long size);
// void CheckInst( MLModule *data,  Channel *chan,int);
// void PlayPartFx( MLModule *data,  Channel *chan,int);
// void PlayArpg( MLModule *data,  Channel *chan);

#define ML_PI 3.1415926535897932384626433832795f
