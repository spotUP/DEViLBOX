#include "paula_soft.h"
#include <stdint.h>

/* Register file */
static uint32_t d0,d1,d2,d3,d4,d5,d6,d7;
static uint32_t a0,a1,a2,a3,a4,a5,a6,sp,pc;
static int flag_z=0, flag_n=0, flag_c=0, flag_v=0, flag_x=0;

/* Size helpers */
#define W(r)  (*((uint16_t*)&(r)))
#define B(r)  (*((uint8_t*)&(r)))

/* Memory access */
#define READ8(addr)   (*((const uint8_t*)(uintptr_t)(addr)))
#define READ16(addr)  (*((const uint16_t*)(uintptr_t)(addr)))
#define READ32(addr)  (*((const uint32_t*)(uintptr_t)(addr)))
#define WRITE8(addr,v)  (*((uint8_t*)(uintptr_t)(addr)) = (uint8_t)(v))
#define WRITE16(addr,v) (*((uint16_t*)(uintptr_t)(addr)) = (uint16_t)(v))
#define WRITE32(addr,v) (*((uint32_t*)(uintptr_t)(addr)) = (uint32_t)(v))
#define READ8_POST(r)   ({ uint32_t _r=(r); (r)+=1; READ8(_r); })
#define READ16_POST(r)  ({ uint32_t _r=(r); (r)+=2; READ16(_r); })
#define READ32_POST(r)  ({ uint32_t _r=(r); (r)+=4; READ32(_r); })
#define READ8_PRE(r)    ({ (r)-=1; READ8(r); })
#define READ16_PRE(r)   ({ (r)-=2; READ16(r); })
#define READ32_PRE(r)   ({ (r)-=4; READ32(r); })
#define WRITE8_POST(r,v)  ({ WRITE8(r,v);  (r)+=1; })
#define WRITE16_POST(r,v) ({ WRITE16(r,v); (r)+=2; })
#define WRITE32_POST(r,v) ({ WRITE32(r,v); (r)+=4; })
#define WRITE8_PRE(r,v)   ({ (r)-=1; WRITE8(r,v); })
#define WRITE16_PRE(r,v)  ({ (r)-=2; WRITE16(r,v); })
#define WRITE32_PRE(r,v)  ({ (r)-=4; WRITE32(r,v); })

/* Rotation helpers */
#define ROL32(v,n)  (((v)<<(n))|((v)>>(32-(n))))
#define ROR32(v,n)  (((v)>>(n))|((v)<<(32-(n))))

/* EQU constants */
#define CalcSize 4
#define LoadSize 12
#define Samples 20
#define Voices 28
#define SamplesSize 36
#define SongSize 44
#define SynthSamples 52
#define Prefix 60
#define SongName 68

/* Unresolved symbol stubs — from include files not available to transpiler */
#ifndef DTP_PlayerVersion
#define DTP_PlayerVersion 0 /* unresolved */
#endif
#ifndef EP_PlayerVersion
#define EP_PlayerVersion 0 /* unresolved */
#endif
#ifndef DTP_RequestDTVersion
#define DTP_RequestDTVersion 0 /* unresolved */
#endif
#ifndef WT
#define WT 0 /* unresolved */
#endif
#ifndef DTP_PlayerName
#define DTP_PlayerName 0 /* unresolved */
#endif
#ifndef DTP_Creator
#define DTP_Creator 0 /* unresolved */
#endif
#ifndef DTP_Check2
#define DTP_Check2 0 /* unresolved */
#endif
#ifndef DTP_Interrupt
#define DTP_Interrupt 0 /* unresolved */
#endif
#ifndef DTP_InitPlayer
#define DTP_InitPlayer 0 /* unresolved */
#endif
#ifndef DTP_EndPlayer
#define DTP_EndPlayer 0 /* unresolved */
#endif
#ifndef DTP_InitSound
#define DTP_InitSound 0 /* unresolved */
#endif
#ifndef DTP_EndSound
#define DTP_EndSound 0 /* unresolved */
#endif
#ifndef EP_NewModuleInfo
#define EP_NewModuleInfo 0 /* unresolved */
#endif
#ifndef DTP_ExtLoad
#define DTP_ExtLoad 0 /* unresolved */
#endif
#ifndef DTP_Volume
#define DTP_Volume 0 /* unresolved */
#endif
#ifndef DTP_Balance
#define DTP_Balance 0 /* unresolved */
#endif
#ifndef EP_Voices
#define EP_Voices 0 /* unresolved */
#endif
#ifndef EP_StructInit
#define EP_StructInit 0 /* unresolved */
#endif
#ifndef EP_Flags
#define EP_Flags 0 /* unresolved */
#endif
#ifndef EPB_Volume
#define EPB_Volume 0 /* unresolved */
#endif
#ifndef EPB_Balance
#define EPB_Balance 0 /* unresolved */
#endif
#ifndef EPB_ModuleInfo
#define EPB_ModuleInfo 0 /* unresolved */
#endif
#ifndef EPB_Voices
#define EPB_Voices 0 /* unresolved */
#endif
#ifndef EPB_Songend
#define EPB_Songend 0 /* unresolved */
#endif
#ifndef EPB_Analyzer
#define EPB_Analyzer 0 /* unresolved */
#endif
#ifndef EPB_Packable
#define EPB_Packable 0 /* unresolved */
#endif
#ifndef EPB_Restart
#define EPB_Restart 0 /* unresolved */
#endif
#ifndef EPB_LoadFast
#define EPB_LoadFast 0 /* unresolved */
#endif
#ifndef TAG_DONE
#define TAG_DONE 0 /* unresolved */
#endif
#ifndef UPS_SizeOF
#define UPS_SizeOF 0 /* unresolved */
#endif
#ifndef dtg_SndLBal
#define dtg_SndLBal 0 /* unresolved */
#endif
#ifndef dtg_SndVol
#define dtg_SndVol 0 /* unresolved */
#endif
#ifndef dtg_SndRBal
#define dtg_SndRBal 0 /* unresolved */
#endif
#ifndef UPS_Voice1Vol
#define UPS_Voice1Vol 0 /* unresolved */
#endif
#ifndef UPS_Voice2Vol
#define UPS_Voice2Vol 0 /* unresolved */
#endif
#ifndef UPS_Voice3Vol
#define UPS_Voice3Vol 0 /* unresolved */
#endif
#ifndef UPS_Voice4Vol
#define UPS_Voice4Vol 0 /* unresolved */
#endif
#ifndef UPS_Voice1Adr
#define UPS_Voice1Adr 0 /* unresolved */
#endif
#ifndef UPS_Voice2Adr
#define UPS_Voice2Adr 0 /* unresolved */
#endif
#ifndef UPS_Voice3Adr
#define UPS_Voice3Adr 0 /* unresolved */
#endif
#ifndef UPS_Voice4Adr
#define UPS_Voice4Adr 0 /* unresolved */
#endif
#ifndef UPS_Voice1Len
#define UPS_Voice1Len 0 /* unresolved */
#endif
#ifndef UPS_Voice2Len
#define UPS_Voice2Len 0 /* unresolved */
#endif
#ifndef UPS_Voice3Len
#define UPS_Voice3Len 0 /* unresolved */
#endif
#ifndef UPS_Voice4Len
#define UPS_Voice4Len 0 /* unresolved */
#endif
#ifndef UPS_Voice1Per
#define UPS_Voice1Per 0 /* unresolved */
#endif
#ifndef UPS_Voice2Per
#define UPS_Voice2Per 0 /* unresolved */
#endif
#ifndef UPS_Voice3Per
#define UPS_Voice3Per 0 /* unresolved */
#endif
#ifndef UPS_Voice4Per
#define UPS_Voice4Per 0 /* unresolved */
#endif
#ifndef EQU
#define EQU 0 /* unresolved */
#endif
#ifndef setzen
#define setzen 0 /* unresolved */
#endif
#ifndef UPS_DMACon
#define UPS_DMACon 0 /* unresolved */
#endif
#ifndef dtg_ChkData
#define dtg_ChkData 0 /* unresolved */
#endif
#ifndef dtg_PathArrayPtr
#define dtg_PathArrayPtr 0 /* unresolved */
#endif
#ifndef dtg_CopyDir
#define dtg_CopyDir 0 /* unresolved */
#endif
#ifndef dtg_LoadFile
#define dtg_LoadFile 0 /* unresolved */
#endif
#ifndef dtg_ChkSize
#define dtg_ChkSize 0 /* unresolved */
#endif
#ifndef MI_Calcsize
#define MI_Calcsize 0 /* unresolved */
#endif
#ifndef MI_LoadSize
#define MI_LoadSize 0 /* unresolved */
#endif
#ifndef MI_Samples
#define MI_Samples 0 /* unresolved */
#endif
#ifndef MI_Voices
#define MI_Voices 0 /* unresolved */
#endif
#ifndef MI_SamplesSize
#define MI_SamplesSize 0 /* unresolved */
#endif
#ifndef MI_Songsize
#define MI_Songsize 0 /* unresolved */
#endif
#ifndef MI_SynthSamples
#define MI_SynthSamples 0 /* unresolved */
#endif
#ifndef MI_Prefix
#define MI_Prefix 0 /* unresolved */
#endif
#ifndef MI_SongName
#define MI_SongName 0 /* unresolved */
#endif
#ifndef MI_MaxVoices
#define MI_MaxVoices 0 /* unresolved */
#endif
#ifndef MI_MaxSamples
#define MI_MaxSamples 0 /* unresolved */
#endif
#ifndef dtg_GetListData
#define dtg_GetListData 0 /* unresolved */
#endif
#ifndef _LVOAllocMem
#define _LVOAllocMem 0 /* unresolved */
#endif
#ifndef dtg_AudioAlloc
#define dtg_AudioAlloc 0 /* unresolved */
#endif
#ifndef EPR_CorruptModule
#define EPR_CorruptModule 0 /* unresolved */
#endif
#ifndef EPR_ModuleTooShort
#define EPR_ModuleTooShort 0 /* unresolved */
#endif
#ifndef EPR_ErrorExtLoad
#define EPR_ErrorExtLoad 0 /* unresolved */
#endif
#ifndef EPR_NotEnoughMem
#define EPR_NotEnoughMem 0 /* unresolved */
#endif
#ifndef EPR_ErrorInFile
#define EPR_ErrorInFile 0 /* unresolved */
#endif
#ifndef dtg_DOSBase
#define dtg_DOSBase 0 /* unresolved */
#endif
#ifndef MODE_OLDFILE
#define MODE_OLDFILE 0 /* unresolved */
#endif
#ifndef _LVOOpen
#define _LVOOpen 0 /* unresolved */
#endif
#ifndef OFFSET_END
#define OFFSET_END 0 /* unresolved */
#endif
#ifndef _LVOSeek
#define _LVOSeek 0 /* unresolved */
#endif
#ifndef OFFSET_BEGINNING
#define OFFSET_BEGINNING 0 /* unresolved */
#endif
#ifndef _LVOClose
#define _LVOClose 0 /* unresolved */
#endif
#ifndef _LVORead
#define _LVORead 0 /* unresolved */
#endif
#ifndef _LVOFreeMem
#define _LVOFreeMem 0 /* unresolved */
#endif
#ifndef dtg_AudioFree
#define dtg_AudioFree 0 /* unresolved */
#endif
#ifndef UPS_Enabled
#define UPS_Enabled 0 /* unresolved */
#endif
#ifndef UPSB_Adr
#define UPSB_Adr 0 /* unresolved */
#endif
#ifndef UPSB_Len
#define UPSB_Len 0 /* unresolved */
#endif
#ifndef UPSB_Per
#define UPSB_Per 0 /* unresolved */
#endif
#ifndef UPSB_Vol
#define UPSB_Vol 0 /* unresolved */
#endif
#ifndef UPS_Flags
#define UPS_Flags 0 /* unresolved */
#endif
#ifndef dtg_SongEnd
#define dtg_SongEnd 0 /* unresolved */
#endif
#ifndef dtg_Timer
#define dtg_Timer 0 /* unresolved */
#endif
#ifndef dtg_SetTimer
#define dtg_SetTimer 0 /* unresolved */
#endif

/* Data forward declarations */
static const uint32_t Tags[];
static const uint8_t PlayerName[];
static const uint8_t Creator[];
static const uint8_t Prefix1[];
static const uint8_t Prefix2[];
static const uint8_t Prefix3[];
static const uint8_t Suffix[];
static const uint8_t Suffix2[];
static const uint8_t SamplesPath[];
static const uint32_t Temp2[];
static const uint32_t ModulePtr[];
static const uint32_t LoadSong[];
static const uint32_t EagleBase[];
static const uint32_t Temp[];
static const uint8_t Format[];
static const uint8_t FormatNow[];
static const uint8_t Sizes[];
static const uint8_t ShortName[];
static const uint32_t ChipPtr[];
static const uint32_t ChipLength[];
static const uint32_t FastPtr[];
static const uint32_t FastLength[];
static const uint32_t Clock[];
static const uint16_t RightVolume[];
static const uint16_t LeftVolume[];
static const uint16_t Voice1[];
static const uint16_t Voice2[];
static const uint16_t Voice3[];
static const uint16_t Voice4[];
static const uint16_t OldVoice1[];
static const uint16_t OldVoice2[];
static const uint16_t OldVoice3[];
static const uint16_t OldVoice4[];
static const uint8_t StructAdr[];
static const uint32_t InfoBuffer[];
static const uint8_t RealSamples[];
static const uint16_t lbW01E3B2[];
static const uint16_t lbW01F0FE[];
static const uint32_t Sonix[];
static const uint16_t lbW0007C2[];
static const uint16_t lbW000C94[];
static const uint16_t lbW000CAE[];
static const uint8_t Buffer[];
static const uint8_t Buffer2[];
static const uint8_t Chip[];
static const uint8_t Empty[];

/* Forward declarations */
static void ChangeVolume(void);
static void LoadFile(void);
static void CopyName(void);
static void SetSampleName(void);
static void GetSize(void);
static void LoadSCORE(void);
static void InitScore(void);
static void ReadFile(void);
static void INITINSTRUMENT(void);
static void InstallToReal(void);
static void SetFilter(void);
static void InstallIFF(void);
static void InstallAIFF(void);
static void PlayTINY(void);
static void PlaySMUS(void);
static void PlaySNX(void);
static void PlaySCORE(void);
static void PLAYSCORE(void);
static void PlayScore(void);
static void StopNote(void);
static void lbC01E388(void);
static void lbC01EA46(void);
static void SetAdr(void);
static void SetLen(void);
static void SetPer(void);
static void StopScore(void);
static void lbC01E632(void);
static void lbC01E6E2(void);
static void RampVolume(void);
static void ReleaseNote(void);
static void lbC01EAB8(void);
static void lbC01EB14(void);
static void lbC01E7DA(void);
static void lbC01E996(void);
static void lbC01E798(void);
static void SongEnd(void);
static void StartNote(void);
static void DMAWait(void);
static void ResumeTrack(void);
static void lbC01E328(void);
static void lbC01E308(void);
static void lbC01E2C0(void);
static void lbC01E35C(void);
static void lbC01F726(void);
static void lbC01F708(void);
static void lbC01F7E8(void);
static void lbC01F902(void);
static void lbC01F8CE(void);
static void SETFILTER(void);
static void STOPSCORE(void);
static void lbC00CF7A(void);
static void lbC00CFEC(void);
static void RAMPVOLUME(void);
static void RELEASENOTE(void);
static void lbC00D430(void);
static void lbC00D070(void);
static void lbC00D1DE(void);
static void STARTNOTE(void);
static void STOPNOTE(void);
static void lbC00CF50(void);
static void lbC00D28E(void);
static void lbC000562(void);
static void lbC000576(void);
static void lbC00056C(void);
static void StopSCORE(void);
static void lbC0006E4(void);
static void lbC000754(void);
static void RampVOLUME(void);
static void ReleaseNOTE(void);
static void lbC000C12(void);
static void lbC000846(void);
static void lbC0009B0(void);
static void lbC0007F2(void);
static void StartNOTE(void);
static void StopNOTE(void);
static void lbC0006BA(void);
static void lbC000A60(void);
static void _SetVoice(void);
static void No_Voice1(void);
static void No_Voice2(void);
static void No_Voice3(void);
static void No_Voice4(void);
static void SmusLoad(void);
static void TinyLoad(void);
static void Dodaj(void);
static void ExtError1(void);
static void LoadNext(void);
static void NoSamp(void);
static void ExtError2(void);
static void LoadNext2(void);
static void ExtError3(void);
static void SmusCheck(void);
static void TinyCheck(void);
static void fault(void);
static void NextPos(void);
static void OK1(void);
static void SecPass(void);
static void OK2(void);
static void NextPos2(void);
static void found(void);
static void MoreIns(void);
static void Corrupt(void);
static void NoTiny(void);
static void No1(void);
static void Jump1(void);
static void No2(void);
static void InFile(void);
static void Jump2(void);
static void FileOK(void);
static void NoHead(void);
static void NoSS(void);
static void ErrorExt(void);
static void EvenSize(void);
static void NoSynth(void);
static void NoForm(void);
static void AV(void);
static void FormOK(void);
static void NextFile(void);
static void NoAllocChip(void);
static void NoMemory(void);
static void NoAllocFast(void);
static void ClearBuf(void);
static void InstallSNX(void);
static void InstallTINY(void);
static void Short(void);
static void VoicesOK(void);
static void Jump4(void);
static void VoiceOff(void);
static void NextVoice(void);
static void FindEnd(void);
static void Jump3(void);
static void Find0(void);
static void Son(void);
static void SkipSon(void);
static void NoTin(void);
static void NoInst(void);
static void No01(void);
static void InitInst(void);
static void Skip1(void);
static void NoHead2(void);
static void NoSS2(void);
static void NoS1(void);
static void SkipS1(void);
static void NoSynth2(void);
static void NoS2(void);
static void SkipS2(void);
static void AV2(void);
static void NoS3(void);
static void SkipS3(void);
static void NextFile2(void);
static void lbC01E286(void);
static void lbC01F604(void);
static void lbC01F6B4(void);
static void lbC01F6A6(void);
static void lbC01F638(void);
static void lbC01F67A(void);
static void lbC01F674(void);
static void lbC01F6EC(void);
static void lbC01F65E(void);
static void lbC01F6E8(void);
static void lbC01F944(void);
static void lbC01FA6A(void);
static void lbC01FA60(void);
static void lbC01F9E4(void);
static void lbC01F9E6(void);
static void lbC01F982(void);
static void lbC01F9B0(void);
static void lbC01F98E(void);
static void lbC01F9AC(void);
static void lbC01F960(void);
static void lbC01FAEA(void);
static void lbC01F9BE(void);
static void lbC01F9B4(void);
static void lbC01F9CE(void);
static void lbC01F996(void);
static void lbC01FA12(void);
static void lbC01FA2C(void);
static void lbC01FAB2(void);
static void lbC01FAD6(void);
static void lbC01FACC(void);
static void OneFilter(void);
static void SSTech(void);
static void SStech(void);
static void SyntTech(void);
static void Synttech(void);
static void IFFTech(void);
static void IFFtech(void);
static void AIFFTech(void);
static void lbW01EB58(void);
static void SSTECH(void);
static void lbW00D4CC(void);
static void lbW00D4B2(void);

/* ***************************************************** */
/* *** Sonix Music Driver replayer for EaglePlayer, **** */
/* ***	     all adaptions by Wanted Team	  **** */
/* ***     DeliTracker 2.32 compatible version	  **** */
/* ***************************************************** */

static void _anon0(void) {
  /* UNIMPLEMENTED: INCDIR */
}

/* SECTION Player */

static void _anon1(void) {
  /* UNIMPLEMENTED: PLAYERHEADER */
}
static const uint8_t _data_17[] = { "$VER: Sonix Music Driver player module V1.0 (9 June 2004)", 0x0 };
static const uint32_t Tags[] = { DTP_PlayerVersion, 0x1 };
static const uint32_t _data_21[] = { EP_PlayerVersion, 0x9 };
static const uint32_t _data_22[] = { DTP_RequestDTVersion, WT };
static const uint32_t _data_23[] = { DTP_PlayerName, 0 /* PlayerName */ };
static const uint32_t _data_24[] = { DTP_Creator, 0 /* Creator */ };
static const uint32_t _data_25[] = { DTP_Check2, 0 /* Check2 */ };
static const uint32_t _data_26[] = { DTP_Interrupt, 0 /* Interrupt */ };
static const uint32_t _data_27[] = { DTP_InitPlayer, 0 /* InitPlayer */ };
static const uint32_t _data_28[] = { DTP_EndPlayer, 0 /* EndPlayer */ };
static const uint32_t _data_29[] = { DTP_InitSound, 0 /* InitSound */ };
static const uint32_t _data_30[] = { DTP_EndSound, 0 /* EndSound */ };
static const uint32_t _data_31[] = { EP_NewModuleInfo, 0 /* NewModuleInfo */ };
static const uint32_t _data_32[] = { DTP_ExtLoad, 0 /* ExtLoad */ };
static const uint32_t _data_33[] = { DTP_Volume, 0 /* SetVolume */ };
static const uint32_t _data_34[] = { DTP_Balance, 0 /* SetBalance */ };
static const uint32_t _data_35[] = { EP_Voices, 0 /* SetVoices */ };
static const uint32_t _data_36[] = { EP_StructInit, 0 /* StructInit */ };
static const uint32_t _data_37[] = { EP_Flags, EPB_Volume, EPB_Balance, EPB_ModuleInfo, EPB_Voices, EPB_Songend, EPB_Analyzer, EPB_Packable, EPB_Restart, EPB_LoadFast };
static const uint32_t _data_38[] = { TAG_DONE };
static const uint8_t PlayerName[] = { "Sonix Music Driver", 0x0 };
static const uint8_t Creator[] = { "(c) 1987-91 by Mark Riley,", 0xa };
static const uint8_t _data_43[] = { "adapted by Wanted Team", 0x0 };
static const uint8_t Prefix1[] = { "SMUS.", 0x0 };
static const uint8_t Prefix2[] = { "TINY.", 0x0 };
static const uint8_t Prefix3[] = { "SNX.", 0x0 };
static const uint8_t Suffix[] = { ".instr", 0x0 };
static const uint8_t Suffix2[] = { ".ss", 0x0 };
static const uint8_t SamplesPath[] = { "Instruments/", 0x0 };
static const uint32_t Temp2[] = { 0x0 };
static const uint32_t ModulePtr[] = { 0x0 };
static const uint32_t LoadSong[] = { 0x0 };
static const uint32_t EagleBase[] = { 0x0 };
static const uint32_t Temp[] = { 0x0 };
static const uint8_t Format[] = { 0x0 };
static const uint8_t FormatNow[] = { 0x0 };
static const uint8_t Sizes[] = { 0x40, 0x4 };
static const uint8_t ShortName[] = { 0x6 };
static const uint32_t ChipPtr[] = { 0x0 };
static const uint32_t ChipLength[] = { 0x0 };
static const uint32_t FastPtr[] = { 0x0 };
static const uint32_t FastLength[] = { 0x0 };
static const uint32_t Clock[] = { 0x0 };
static const uint16_t RightVolume[] = { 0x40 };
static const uint16_t LeftVolume[] = { 0x40 };
static const uint16_t Voice1[] = { 0x1 };
static const uint16_t Voice2[] = { 0x1 };
static const uint16_t Voice3[] = { 0x1 };
static const uint16_t Voice4[] = { 0x1 };
static const uint16_t OldVoice1[] = { 0x0 };
static const uint16_t OldVoice2[] = { 0x0 };
static const uint16_t OldVoice3[] = { 0x0 };
static const uint16_t OldVoice4[] = { 0x0 };
static const uint8_t StructAdr[] = { UPS_SizeOF };
/* ************************************************************************** */
/* ************************ DTP_Volume, DTP_Balance ************************* */
/* ************************************************************************** */
/* Copy Volume and Balance Data to internal buffer */

static void SetVolume(void) {
SetBalance:
  W(d0) = (uint16_t)(READ16(a5 + (intptr_t)dtg_SndLBal));
  d0 = (uint32_t)((uint16_t)READ16(a5 + (intptr_t)dtg_SndVol) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 6);
  /* write unknown */ (void)(d0);
  W(d0) = (uint16_t)(READ16(a5 + (intptr_t)dtg_SndRBal));
  d0 = (uint32_t)((uint16_t)READ16(a5 + (intptr_t)dtg_SndVol) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 6);
  /* write unknown */ (void)(d0);
  a1 = (uint32_t)(uintptr_t)&OldVoice1;
  d1 = (uint32_t)(int32_t)(int8_t)(3);
  a2 = (uint32_t)0xDFF0A0;
SetNew:
  W(d0) = (uint16_t)(READ16_POST(a1));
  ChangeVolume();
  a2 = (uint32_t)(a2 + 16);
  if ((int16_t)(--d1) >= 0) goto SetNew;
  return;
}

static void ChangeVolume(void) {
  WRITE32_PRE(sp, a4);
  a4 = (uint32_t)(uintptr_t)&StructAdr;
  W(d0) &= (uint16_t)(0x7F);
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0A0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0A0); }
  if (!flag_z) goto NoVoice1;
  /* write unknown */ (void)(d0);
  flag_z=(Voice1==0); flag_n=((int32_t)Voice1<0); flag_c=0; flag_v=0;
  if (!flag_z) goto Voice1On;
  d0 = (uint32_t)(int32_t)(int8_t)(0);
Voice1On:
  d0 = (uint32_t)((uint16_t)LeftVolume * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 6);
  WRITE16(a2 + 8, d0);
  WRITE16(a4 + (intptr_t)UPS_Voice1Vol, d0);
  goto SetIt;
NoVoice1:
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0B0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0B0); }
  if (!flag_z) goto NoVoice2;
  /* write unknown */ (void)(d0);
  flag_z=(Voice2==0); flag_n=((int32_t)Voice2<0); flag_c=0; flag_v=0;
  if (!flag_z) goto Voice2On;
  d0 = (uint32_t)(int32_t)(int8_t)(0);
Voice2On:
  d0 = (uint32_t)((uint16_t)RightVolume * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 6);
  WRITE16(a2 + 8, d0);
  WRITE16(a4 + (intptr_t)UPS_Voice2Vol, d0);
  goto SetIt;
NoVoice2:
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0C0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0C0); }
  if (!flag_z) goto NoVoice3;
  /* write unknown */ (void)(d0);
  flag_z=(Voice3==0); flag_n=((int32_t)Voice3<0); flag_c=0; flag_v=0;
  if (!flag_z) goto Voice3On;
  d0 = (uint32_t)(int32_t)(int8_t)(0);
Voice3On:
  d0 = (uint32_t)((uint16_t)RightVolume * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 6);
  WRITE16(a2 + 8, d0);
  WRITE16(a4 + (intptr_t)UPS_Voice3Vol, d0);
  goto SetIt;
NoVoice3:
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0D0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0D0); }
  if (!flag_z) goto SetIt;
  /* write unknown */ (void)(d0);
  flag_z=(Voice4==0); flag_n=((int32_t)Voice4<0); flag_c=0; flag_v=0;
  if (!flag_z) goto Voice4On;
  d0 = (uint32_t)(int32_t)(int8_t)(0);
Voice4On:
  d0 = (uint32_t)((uint16_t)LeftVolume * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 6);
  WRITE16(a2 + 8, d0);
  WRITE16(a4 + (intptr_t)UPS_Voice4Vol, d0);
SetIt:
  a4 = READ32_POST(sp);
  return;
  /* ------------------------------- Set Adr -------------------------------* */
}

static void SetAdr(void) {
  WRITE32_PRE(sp, a1);
  a1 = (uint32_t)((uintptr_t)StructAdr + UPS_Voice1Adr);
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0A0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0A0); }
  if (flag_z) { _SetVoice(); return; }
  a1 = (uint32_t)((uintptr_t)StructAdr + UPS_Voice2Adr);
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0B0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0B0); }
  if (flag_z) { _SetVoice(); return; }
  a1 = (uint32_t)((uintptr_t)StructAdr + UPS_Voice3Adr);
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0C0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0C0); }
  if (flag_z) { _SetVoice(); return; }
  a1 = (uint32_t)((uintptr_t)StructAdr + UPS_Voice4Adr);
}

static void _SetVoice(void) {
  WRITE32(a1, d0);
  a1 = READ32_POST(sp);
  return;
  /* ------------------------------- Set Len -------------------------------* */
}

static void SetLen(void) {
  WRITE32_PRE(sp, a1);
  a1 = (uint32_t)((uintptr_t)StructAdr + UPS_Voice1Len);
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0A0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0A0); }
  if (flag_z) { _SetVoice(); return; }
  a1 = (uint32_t)((uintptr_t)StructAdr + UPS_Voice2Len);
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0B0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0B0); }
  if (flag_z) { _SetVoice(); return; }
  a1 = (uint32_t)((uintptr_t)StructAdr + UPS_Voice3Len);
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0C0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0C0); }
  if (flag_z) { _SetVoice(); return; }
  a1 = (uint32_t)((uintptr_t)StructAdr + UPS_Voice4Len);
}

static void _SetVoice(void) {
  WRITE16(a1, d0);
  a1 = READ32_POST(sp);
  return;
  /* ------------------------------- Set Per -------------------------------* */
}

static void SetPer(void) {
  WRITE32_PRE(sp, a1);
  a1 = (uint32_t)((uintptr_t)StructAdr + UPS_Voice1Per);
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0A0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0A0); }
  if (flag_z) { _SetVoice(); return; }
  a1 = (uint32_t)((uintptr_t)StructAdr + UPS_Voice2Per);
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0B0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0B0); }
  if (flag_z) { _SetVoice(); return; }
  a1 = (uint32_t)((uintptr_t)StructAdr + UPS_Voice3Per);
  { int32_t _cmp=(int32_t)a2-(int32_t)0xDFF0C0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)0xDFF0C0); }
  if (flag_z) { _SetVoice(); return; }
  a1 = (uint32_t)((uintptr_t)StructAdr + UPS_Voice4Per);
}

static void _SetVoice(void) {
  WRITE16(a1, d0);
  a1 = READ32_POST(sp);
  return;
  /* ************************************************************************** */
  /* *************************** EP_Voices ************************************ */
  /* ************************************************************************** */
SetVoices:
  a0 = (uint32_t)(uintptr_t)&Voice1;
  a1 = (uint32_t)(uintptr_t)&StructAdr;
  d1 = (uint32_t)(int32_t)(int8_t)(1);
  WRITE16_POST(a0, d1);
  flag_z = ((d0 & (1u << (0 & 31))) == 0);
  if (!flag_z) { No_Voice1(); return; }
  WRITE16(a0 + -2, 0);
  paula_set_volume(0, (uint8_t)(0));
  WRITE16(a1 + (intptr_t)UPS_Voice1Vol, 0);
}

static void No_Voice1(void) {
  WRITE16_POST(a0, d1);
  flag_z = ((d0 & (1u << (1 & 31))) == 0);
  if (!flag_z) { No_Voice2(); return; }
  WRITE16(a0 + -2, 0);
  paula_set_volume(1, (uint8_t)(0));
  WRITE16(a1 + (intptr_t)UPS_Voice2Vol, 0);
}

static void No_Voice2(void) {
  WRITE16_POST(a0, d1);
  flag_z = ((d0 & (1u << (2 & 31))) == 0);
  if (!flag_z) { No_Voice3(); return; }
  WRITE16(a0 + -2, 0);
  paula_set_volume(2, (uint8_t)(0));
  WRITE16(a1 + (intptr_t)UPS_Voice3Vol, 0);
}

static void No_Voice3(void) {
  WRITE16_POST(a0, d1);
  flag_z = ((d0 & (1u << (3 & 31))) == 0);
  if (!flag_z) { No_Voice4(); return; }
  WRITE16(a0 + -2, 0);
  paula_set_volume(3, (uint8_t)(0));
  WRITE16(a1 + (intptr_t)UPS_Voice4Vol, 0);
}

static void No_Voice4(void) {
  WRITE16(a1 + (intptr_t)UPS_DMACon, d0);
  /* Bit 0 = Kanal 1 usw. */
  d0 = (uint32_t)(int32_t)(int8_t)(0);
  return;
  /* ************************************************************************** */
  /* ****************************** EP_StructInit ***************************** */
  /* ************************************************************************** */
StructInit:
  a0 = (uint32_t)(uintptr_t)&StructAdr;
  return;
  /* ************************************************************************** */
  /* ****************************** DTP_ExtLoad ******************************* */
  /* ************************************************************************** */
ExtLoad:
  a4 = (uint32_t)(uintptr_t)&Temp;
  a3 = READ32(a4 + -16);
  WRITE32(a4, 0);
  flag_z=(READ8(a4 + 4)==0); flag_n=((int32_t)READ8(a4 + 4)<0); flag_c=0; flag_v=0;
  if (flag_n) { SmusLoad(); return; }
  a0 = READ32(a5 + (intptr_t)dtg_ChkData);
  { int32_t _cmp=(int32_t)READ8(a4 + 4)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a4 + 4)<(uint32_t)1); }
  if (flag_z) { TinyLoad(); return; }
  a2 = (uint32_t)(a0 + 20);
  d1 = (uint32_t)(int32_t)(int8_t)(3);
}

static void Dodaj(void) {
  a2 += READ32_POST(a0);
  if ((int16_t)(--d1) >= 0) { Dodaj(); return; }
}

static void LoadNext(void) {
  LoadFile();
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (!flag_z) { ExtError1(); return; }
  WRITE32(a4, READ32(a4) + 1);
  flag_z=(READ8(a2)==0); flag_n=((int32_t)READ8(a2)<0); flag_c=0; flag_v=0;
  if (!flag_z) { LoadNext(); return; }
}

static void ExtError1(void) {
  return;
}

static void LoadFile(void) {
  a0 = READ32(a5 + (intptr_t)dtg_PathArrayPtr);
  WRITE8(a0, 0);
  a0 = READ32(a5 + (intptr_t)dtg_CopyDir);
  ((void(*)(void))(uintptr_t)(READ32(a0)))();
  CopyName();
  a0 = READ32(a5 + (intptr_t)dtg_LoadFile);
  ((void(*)(void))(uintptr_t)a0)(); return;
}

static void CopyName(void) {
  a0 = READ32(a5 + (intptr_t)dtg_PathArrayPtr);
loop1:
  flag_z=(READ8_POST(a0)==0); flag_n=((int32_t)READ8_POST(a0)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto loop1;
  a0 -= 1;
  a1 = (uint32_t)(uintptr_t)&SamplesPath;
smp1:
  WRITE8_POST(a0, READ8_POST(a1));
  if (!flag_z) goto smp1;
  a0 -= 1;
smp2:
  WRITE8_POST(a0, READ8_POST(a2));
  if (!flag_z) goto smp2;
  a0 -= 1;
  a1 = (uint32_t)(uintptr_t)&Suffix;
smp3:
  WRITE8_POST(a0, READ8_POST(a1));
  if (!flag_z) goto smp3;
  return;
}

static void TinyLoad(void) {
  a3 = (uint32_t)(a0 + 64);
  d2 = (uint32_t)(int32_t)(int8_t)(63);
}

static void LoadNext2(void) {
  a2 = (uint32_t)(uintptr_t)&ShortName;
  WRITE32(a2, READ32_POST(a3));
  if (flag_z) { NoSamp(); return; }
  LoadFile();
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (!flag_z) { ExtError2(); return; }
  WRITE32(a4, READ32(a4) + 1);
}

static void NoSamp(void) {
  if ((int16_t)(--d2) >= 0) { LoadNext2(); return; }
}

static void ExtError2(void) {
  return;
}

static void SmusLoad(void) {
  a3 += 4;
  d1 = READ32_POST(a3);
  a2 = (uint32_t)(a3 + 4);
  d1 += 1;
  d1 = d1 & ~(1u << (0 & 31));
  a3 += d1;
  WRITE8(a3, 0);
  LoadFile();
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (!flag_z) { ExtError3(); return; }
  WRITE8(a3, 0x49);
  WRITE32(a4, READ32(a4) + 1);
  { int32_t _cmp=(int32_t)READ16(a3 + 2)-(int32_t)0x414b; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a3 + 2)<(uint32_t)0x414b); }
  if (!flag_z) { SmusLoad(); return; }
  WRITE8(a3, 0x54);
}

static void ExtError3(void) {
  return;
  /* ************************************************************************** */
  /* ******************************* DTP_Check2 ******************************* */
  /* ************************************************************************** */
Check2:
  a0 = READ32(a5 + (intptr_t)dtg_ChkData);
  d0 = (uint32_t)(int32_t)(int8_t)(-1);
  a3 = (uint32_t)(uintptr_t)&Format;
  d4 = READ32(a5 + (intptr_t)dtg_ChkSize);
  a1 = a0;
  { int32_t _cmp=(int32_t)READ32(a0)-(int32_t)0x464f524d; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0)<(uint32_t)0x464f524d); }
  if (flag_z) { SmusCheck(); return; }
  W(d1) = (uint16_t)(READ16(a0));
  W(d1) &= (uint16_t)(0x00F0);
  if (!flag_z) { TinyCheck(); return; }
  d3 = (uint32_t)(int32_t)(int8_t)(20);
  d1 = (uint32_t)(int32_t)(int8_t)(3);
}

static void NextPos(void) {
  d2 = READ32_POST(a0);
  if (flag_z) { fault(); return; }
  if (flag_n) { fault(); return; }
  flag_z = ((d2 & (1u << (0 & 31))) == 0);
  if (!flag_z) { fault(); return; }
  d3 += d2;
  if ((int16_t)(--d1) >= 0) { NextPos(); return; }
  { int32_t _cmp=(int32_t)d3-(int32_t)d4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d3<(uint32_t)d4); }
  if (flag_n==flag_v) { fault(); return; }
  a0 += 4;
  d1 = (uint32_t)(int32_t)(int8_t)(3);
}

static void SecPass(void) {
  flag_z=(READ8(a0)==0); flag_n=((int32_t)READ8(a0)<0); flag_c=0; flag_v=0;
  if (!flag_n) { fault(); return; }
  { int32_t _cmp=(int32_t)READ16(a0)-(int32_t)-1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a0)<(uint32_t)-1); }
  if (flag_z) { OK1(); return; }
  { int32_t _cmp=(int32_t)READ8(a0)-(int32_t)0x84; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a0)<(uint32_t)0x84); }
  if (!flag_c&&!flag_z) { fault(); return; }
}

static void OK1(void) {
  a0 += READ32_POST(a1);
  if ((int16_t)(--d1) >= 0) { SecPass(); return; }
  flag_z=(READ8(a0)==0); flag_n=((int32_t)READ8(a0)<0); flag_c=0; flag_v=0;
  if (flag_z) { fault(); return; }
  WRITE8(a3, 0);
}

static void found(void) {
  d0 = (uint32_t)(int32_t)(int8_t)(0);
}

static void fault(void) {
  return;
}

static void TinyCheck(void) {
  { int32_t _cmp=(int32_t)d4-(int32_t)332; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d4<(uint32_t)332); }
  if (flag_z||(flag_n!=flag_v)) { fault(); return; }
  a1 = (uint32_t)(a0 + 48);
  { int32_t _cmp=(int32_t)READ32_POST(a1)-(int32_t)0x140; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32_POST(a1)<(uint32_t)0x140); }
  if (!flag_z) { fault(); return; }
  d1 = (uint32_t)(int32_t)(int8_t)(2);
}

static void NextPos2(void) {
  d2 = READ32_POST(a1);
  if (flag_z) { fault(); return; }
  if (flag_n) { fault(); return; }
  flag_z = ((d2 & (1u << (0 & 31))) == 0);
  if (!flag_z) { fault(); return; }
  { int32_t _cmp=(int32_t)d4-(int32_t)d2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d4<(uint32_t)d2); }
  if (flag_z||(flag_n!=flag_v)) { fault(); return; }
  a2 = (uint32_t)(uintptr_t)(READ32(a0));
  { int32_t _cmp=(int32_t)READ16(a2)-(int32_t)-1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a2)<(uint32_t)-1); }
  if (flag_z) { OK2(); return; }
  flag_z=(READ32_POST(a2)==0); flag_n=((int32_t)READ32_POST(a2)<0); flag_c=0; flag_v=0;
  if (!flag_z) { fault(); return; }
  flag_z=(READ16_POST(a2)==0); flag_n=((int32_t)READ16_POST(a2)<0); flag_c=0; flag_v=0;
  if (!flag_z) { fault(); return; }
  flag_z=(READ8(a2)==0); flag_n=((int32_t)READ8(a2)<0); flag_c=0; flag_v=0;
  if (!flag_n) { fault(); return; }
  { int32_t _cmp=(int32_t)READ8(a2)-(int32_t)0x82; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a2)<(uint32_t)0x82); }
  if (!flag_c&&!flag_z) { fault(); return; }
}

static void OK2(void) {
  if ((int16_t)(--d1) >= 0) { NextPos2(); return; }
  WRITE8(a3, 1);
  found(); return;
}

static void SmusCheck(void) {
  { int32_t _cmp=(int32_t)READ32(a0 + 8)-(int32_t)0x534d5553; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0 + 8)<(uint32_t)0x534d5553); }
  if (!flag_z) { fault(); return; }
  { int32_t _cmp=(int32_t)READ32(a0 + 12)-(int32_t)0x53484452; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0 + 12)<(uint32_t)0x53484452); }
  flag_z=(READ8(a0 + 23)==0); flag_n=((int32_t)READ8(a0 + 23)<0); flag_c=0; flag_v=0;
  if (flag_z) { fault(); return; }
  a1 = (uint32_t)(a0 + 24);
  { int32_t _cmp=(int32_t)READ32_POST(a1)-(int32_t)0x4e414d45; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32_POST(a1)<(uint32_t)0x4e414d45); }
  if (!flag_z) { fault(); return; }
  d1 = READ32_POST(a1);
  if (flag_n) { fault(); return; }
  d1 += 1;
  d1 = d1 & ~(1u << (0 & 31));
  a1 += d1;
  { int32_t _cmp=(int32_t)READ32_POST(a1)-(int32_t)0x534e5831; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32_POST(a1)<(uint32_t)0x534e5831); }
  if (!flag_z) { fault(); return; }
  d1 = READ32_POST(a1);
  if (flag_n) { fault(); return; }
  d1 += 1;
  d1 = d1 & ~(1u << (0 & 31));
  a1 += d1;
  WRITE32(a3 + -20, a1);
  a2 = (uint32_t)(uintptr_t)&RealSamples;
}

static void MoreIns(void) {
  { int32_t _cmp=(int32_t)READ32_POST(a1)-(int32_t)0x494e5331; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32_POST(a1)<(uint32_t)0x494e5331); }
  if (!flag_z) { fault(); return; }
  d1 = READ32_POST(a1);
  if (flag_n) { fault(); return; }
  d1 += 1;
  d1 = d1 & ~(1u << (0 & 31));
  { int32_t _cmp=(int32_t)READ8(a1)-(int32_t)63; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1)<(uint32_t)63); }
  if (!flag_c&&!flag_z) { fault(); return; }
  flag_z=(READ8(a1 + 1)==0); flag_n=((int32_t)READ8(a1 + 1)<0); flag_c=0; flag_v=0;
  if (!flag_z) { fault(); return; }
  WRITE8_POST(a2, READ8(a1));
  a1 += d1;
  { int32_t _cmp=(int32_t)READ32(a1)-(int32_t)0x5452414b; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a1)<(uint32_t)0x5452414b); }
  if (!flag_z) { MoreIns(); return; }
  /* UNIMPLEMENTED: ST */
  found(); return;
  /* ************************************************************************** */
  /* ***************************** EP_NewModuleInfo *************************** */
  /* ************************************************************************** */
}
static const uint32_t InfoBuffer[] = { MI_Calcsize, 0x0 };
static const uint32_t _data_534[] = { MI_LoadSize, 0x0 };
static const uint32_t _data_535[] = { MI_Samples, 0x0 };
static const uint32_t _data_536[] = { MI_Voices, 0x0 };
static const uint32_t _data_537[] = { MI_SamplesSize, 0x0 };
static const uint32_t _data_538[] = { MI_Songsize, 0x0 };
static const uint32_t _data_539[] = { MI_SynthSamples, 0x0 };
static const uint32_t _data_540[] = { MI_Prefix, 0x0 };
static const uint32_t _data_541[] = { MI_SongName, 0x0 };
static const uint32_t _data_542[] = { MI_MaxVoices, 0x4 };
static const uint32_t _data_543[] = { MI_MaxSamples, 0x40 };
static const uint32_t _data_544[] = { 0x0 };
/* ************************************************************************** */
/* **************************** DTP_InitPlayer ****************************** */
/* ************************************************************************** */

static void InitPlayer(void) {
  d0 = (uint32_t)(int32_t)(int8_t)(0);
  a0 = READ32(a5 + (intptr_t)dtg_GetListData);
  ((void(*)(void))(uintptr_t)(READ32(a0)))();
  a3 = (uint32_t)(uintptr_t)&ModulePtr;
  WRITE32_POST(a3, a0);
  WRITE32_POST(a3, d0);
  WRITE32_POST(a3, a5);
  a1 = (uint32_t)(uintptr_t)&ChipLength;
  WRITE32(a1, 0);
  WRITE32(a1 + 8, 0);
  a4 = (uint32_t)(uintptr_t)&InfoBuffer;
  WRITE32(a4 + (intptr_t)LoadSize, d0);
  WRITE32(a4 + (intptr_t)SamplesSize, 0);
  WRITE32(a4 + (intptr_t)SongName, 0);
  d7 = READ32_POST(a3);
  if (flag_z) { Corrupt(); return; }
  d1 = (uint32_t)(int32_t)(int8_t)(64);
  { int32_t _cmp=(int32_t)d7-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)d1); }
  if (!flag_z && (flag_n==flag_v)) { Corrupt(); return; }
  WRITE8_POST(a3, READ8_POST(a3));
  a2 = (uint32_t)(a3 + -1);
  WRITE32(a4 + (intptr_t)Samples, d7);
  d5 = (uint32_t)(int32_t)(int8_t)(0);
  d4 = (uint32_t)(int32_t)(int8_t)(0);
  d6 = (uint32_t)(int32_t)(int8_t)(1);
}

static void NextFile(void) {
  d0 = d6;
  a0 = READ32(a5 + (intptr_t)dtg_GetListData);
  ((void(*)(void))(uintptr_t)(READ32(a0)))();
  { int32_t _cmp=(int32_t)READ8(a2)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a2)<(uint32_t)1); }
  if (!flag_z) { NoTiny(); return; }
  { int32_t _cmp=(int32_t)READ32(a0)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0)<(uint32_t)1); }
  if (!flag_z) { No1(); return; }
  { int32_t _cmp=(int32_t)d0-(int32_t)442; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)442); }
  if (!flag_z) { Corrupt(); return; }
  Jump1(); return;
}

static void No1(void) {
  { int32_t _cmp=(int32_t)READ32(a0)-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0)<(uint32_t)2); }
  if (!flag_z) { No2(); return; }
  d2 = (uint32_t)(int32_t)(int8_t)(32);
  { int32_t _cmp=(int32_t)d0-(int32_t)d2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d2); }
  if (!flag_z) { Corrupt(); return; }
  a6 = (uint32_t)(uintptr_t)&ShortName;
  WRITE32(a6, READ32(a0 + 4));
  if (flag_z) { InFile(); return; }
  Jump2(); return;
}

static void No2(void) {
  { int32_t _cmp=(int32_t)READ32(a0)-(int32_t)3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0)<(uint32_t)3); }
  if (!flag_z) { Corrupt(); return; }
  FileOK(); return;
}

static void NoTiny(void) {
  flag_z=(READ8(a0)==0); flag_n=((int32_t)READ8(a0)<0); flag_c=0; flag_v=0;
  if (flag_z) { NoHead(); return; }
  { int32_t _cmp=(int32_t)READ32(a0)-(int32_t)0x53616d70; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0)<(uint32_t)0x53616d70); }
  if (!flag_z) { NoSS(); return; }
  { int32_t _cmp=(int32_t)READ32(a0 + 4)-(int32_t)0x6c656453; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0 + 4)<(uint32_t)0x6c656453); }
  if (!flag_z) { Corrupt(); return; }
  { int32_t _cmp=(int32_t)READ32(a0 + 8)-(int32_t)0x6f756e64; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0 + 8)<(uint32_t)0x6f756e64); }
  if (!flag_z) { Corrupt(); return; }
  { int32_t _cmp=(int32_t)d0-(int32_t)128; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)128); }
  if (!flag_z) { Corrupt(); return; }
  a6 = (uint32_t)(a0 + 68);
}

static void Jump2(void) {
  SetSampleName();
  GetSize();
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (flag_n) { ErrorExt(); return; }
  /* MOVEQ invalid dst (8) */
  { int32_t _cmp=(int32_t)d0-(int32_t)d2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d2); }
  if (flag_n!=flag_v) { Corrupt(); return; }
  flag_z = ((d0 & (1u << (0 & 31))) == 0);
  if (flag_z) { EvenSize(); return; }
  d0 += 1;
}

static void EvenSize(void) {
  d4 += d0;
  WRITE32_POST(a3, d0);
  d0 += 128;
  { int32_t _cmp=(int32_t)READ8(a2)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a2)<(uint32_t)1); }
  if (!flag_z) { FileOK(); return; }
  d2 = (uint32_t)(int32_t)(int8_t)(96);
  d0 -= d2;
  FileOK(); return;
}

static void NoSS(void) {
  { int32_t _cmp=(int32_t)READ32(a0)-(int32_t)0x53796e74; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0)<(uint32_t)0x53796e74); }
  if (!flag_z) { NoSynth(); return; }
  { int32_t _cmp=(int32_t)READ32(a0 + 4)-(int32_t)0x68657369; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0 + 4)<(uint32_t)0x68657369); }
  if (!flag_z) { Corrupt(); return; }
  { int32_t _cmp=(int32_t)READ16(a0 + 8)-(int32_t)0x7300; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a0 + 8)<(uint32_t)0x7300); }
  if (!flag_z) { Corrupt(); return; }
}

static void NoHead(void) {
  { int32_t _cmp=(int32_t)d0-(int32_t)502; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)502); }
  if (!flag_z) { Corrupt(); return; }
}

static void Jump1(void) {
  d5 += 8192;
  FileOK(); return;
}

static void NoSynth(void) {
  { int32_t _cmp=(int32_t)READ32(a0)-(int32_t)0x464f524d; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0)<(uint32_t)0x464f524d); }
  if (!flag_z) { NoForm(); return; }
  { int32_t _cmp=(int32_t)READ32(a0 + 8)-(int32_t)0x41494646; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0 + 8)<(uint32_t)0x41494646); }
  if (flag_z) { AV(); return; }
  { int32_t _cmp=(int32_t)READ32(a0 + 8)-(int32_t)0x38535658; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0 + 8)<(uint32_t)0x38535658); }
  if (!flag_z) { Corrupt(); return; }
  { int32_t _cmp=(int32_t)READ32(a0 + 12)-(int32_t)0x56484452; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0 + 12)<(uint32_t)0x56484452); }
  if (!flag_z) { Corrupt(); return; }
  d2 = (uint32_t)(int32_t)(int8_t)(62);
  FormOK(); return;
}

static void NoForm(void) {
  { int32_t _cmp=(int32_t)READ32(a0)-(int32_t)0x4c495354; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0)<(uint32_t)0x4c495354); }
  if (!flag_z) { Corrupt(); return; }
}

static void AV(void) {
  flag_z=(READ8(a2)==0); flag_n=((int32_t)READ8(a2)<0); flag_c=0; flag_v=0;
  if (flag_n) { Corrupt(); return; }
  d2 = (uint32_t)(int32_t)(int8_t)(44);
}

static void FormOK(void) {
  d5 += d2;
  d1 = (uint32_t)(int32_t)(int8_t)(8);
  d1 += READ32(a0 + 4);
  { int32_t _cmp=(int32_t)d0-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d1); }
  if (!flag_z) { Corrupt(); return; }
}

static void FileOK(void) {
  WRITE32(a4 + (intptr_t)SamplesSize, READ32(a4 + (intptr_t)SamplesSize) + d0);
  WRITE32(a4 + (intptr_t)LoadSize, READ32(a4 + (intptr_t)LoadSize) + d0);
  d6 += 1;
  d7 -= 1;
  if (!flag_z) { NextFile(); return; }
  /* write unknown */ (void)(4);
  d0 = d4;
  if (flag_z) { NoAllocChip(); return; }
  d1 = 0x10002;
  ((void(*)(void))(uintptr_t)(READ32(a6 + (intptr_t)_LVOAllocMem)))();
  a3 = (uint32_t)(uintptr_t)&ChipPtr;
  WRITE32_POST(a3, d0);
  if (flag_z) { NoMemory(); return; }
  WRITE32(a3, d4);
  d4 = d0;
}

static void NoAllocChip(void) {
  d0 = d5;
  if (flag_z) { NoAllocFast(); return; }
  d1 = 0x10001;
  ((void(*)(void))(uintptr_t)(READ32(a6 + (intptr_t)_LVOAllocMem)))();
  a3 = (uint32_t)(uintptr_t)&FastPtr;
  WRITE32_POST(a3, d0);
  if (flag_z) { NoMemory(); return; }
  WRITE32(a3, d5);
  d5 = d0;
}

static void NoAllocFast(void) {
  a0 = (uint32_t)(uintptr_t)Sonix;
  a3 = a0;
  a1 = (uint32_t)((uintptr_t)Buffer2 + 132);
}

static void ClearBuf(void) {
  WRITE16_POST(a0, 0);
  { int32_t _cmp=(int32_t)a1-(int32_t)a0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a1<(uint32_t)a0); }
  if (!flag_z) { ClearBuf(); return; }
  a1 = (uint32_t)(uintptr_t)&Chip;
  a0 = (uint32_t)(uintptr_t)ModulePtr;
  flag_z=(READ8(a2)==0); flag_n=((int32_t)READ8(a2)<0); flag_c=0; flag_v=0;
  if (flag_z) { InstallSNX(); return; }
  if (!flag_n) { InstallTINY(); return; }
  WRITE32(a3 + 666, a1);
  WRITE16(a3 + 458, 0x3F);
  WRITE16(a3, 0xFF);
  WRITE32(a3 + 2, 0x00800080);
  a1 = (uint32_t)(uintptr_t)&Prefix1;
  WRITE32(a4 + (intptr_t)Prefix, a1);
  d0 = (uint32_t)(uintptr_t)LoadSong;
  d1 = (uint32_t)(int32_t)(int8_t)(8);
  d1 += READ32(a0 + 4);
  { int32_t _cmp=(int32_t)d0-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d1); }
  if (flag_n!=flag_v) { Short(); return; }
  a1 = d1;
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  B(d1) = (uint8_t)(READ8(a0 + 23));
  { int32_t _cmp=(int32_t)d1-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)4); }
  if (flag_z||(flag_n!=flag_v)) { VoicesOK(); return; }
  d1 = (uint32_t)(int32_t)(int8_t)(4);
}

static void VoicesOK(void) {
  LoadSCORE();
  a0 = (uint32_t)(a0 + 28);
  d0 = READ32_POST(a0);
  WRITE32(a4 + (intptr_t)SongName, a0);
  a0 += d0;
  WRITE8(a0, 0);
  Jump4(); return;
}

static void InstallTINY(void) {
  WRITE32(a3 + 262, a1);
  WRITE16(a3 + 34, 0x8000);
  WRITE16(a3 + 54, 0x3F);
  a1 = (uint32_t)(uintptr_t)&Prefix2;
  WRITE32(a4 + (intptr_t)Prefix, a1);
  a3 = (uint32_t)(a0 + 48);
  d0 = (uint32_t)(int32_t)(int8_t)(0);
  d1 = (uint32_t)(int32_t)(int8_t)(3);
}

static void NextVoice(void) {
  d2 = READ32_POST(a3);
  a1 = (uint32_t)(uintptr_t)(READ32(a0));
  { int32_t _cmp=(int32_t)READ16(a1)-(int32_t)-1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a1)<(uint32_t)-1); }
  if (flag_z) { VoiceOff(); return; }
  d0 += 1;
}

static void VoiceOff(void) {
  if ((int16_t)(--d1) >= 0) { NextVoice(); return; }
  d1 = d0;
  d0 = (uint32_t)(uintptr_t)LoadSong;
  d0 = d0 & ~(1u << (0 & 31));
  a3 = (uint32_t)(uintptr_t)(READ32(a0));
}

static void FindEnd(void) {
  { int32_t _cmp=(int32_t)a3-(int32_t)a1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a3<(uint32_t)a1); }
  if (flag_z||(flag_n!=flag_v)) { Short(); return; }
  { int32_t _cmp=(int32_t)READ16_POST(a1)-(int32_t)-1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16_POST(a1)<(uint32_t)-1); }
  if (!flag_z) { FindEnd(); return; }
  Jump3(); return;
}

static void InstallSNX(void) {
  WRITE32(a3, 0x00780080);
  WRITE32(a3 + 994, a1);
  a1 = (uint32_t)(uintptr_t)&Prefix3;
  WRITE32(a4 + (intptr_t)Prefix, a1);
  InitScore();
  a1 = d0;
}

static void Find0(void) {
  flag_z=(READ8_POST(a1)==0); flag_n=((int32_t)READ8_POST(a1)<0); flag_c=0; flag_v=0;
  if (!flag_z) { Find0(); return; }
  flag_z=(READ8_POST(a1)==0); flag_n=((int32_t)READ8_POST(a1)<0); flag_c=0; flag_v=0;
  if (!flag_z) { Find0(); return; }
}

static void Jump3(void) {
  a1 -= a0;
}

static void Jump4(void) {
  WRITE32(a4 + (intptr_t)SongSize, a1);
  WRITE32(a4 + (intptr_t)CalcSize, READ32(a4 + (intptr_t)SamplesSize));
  d0 = a1;
  WRITE32(a4 + (intptr_t)CalcSize, READ32(a4 + (intptr_t)CalcSize) + d0);
  WRITE32(a4 + (intptr_t)Voices, d1);
  d7 = READ32(a4 + (intptr_t)Samples);
  d0 = (uint32_t)(uintptr_t)FastLength;
  d1 = (uint32_t)(int32_t)(int8_t)(13);
  d0 >>= d1;
  WRITE32(a4 + (intptr_t)SynthSamples, d0);
  WRITE32(a4 + (intptr_t)Samples, READ32(a4 + (intptr_t)Samples) - d0);
  B(d3) = (uint8_t)(READ8(a2));
  if (flag_z) { Son(); return; }
  a2 = (uint32_t)(a0 + 64);
  SkipSon(); return;
}

static void Son(void) {
  a4 = (uint32_t)((uintptr_t)Buffer + 138);
  a2 = (uint32_t)((uintptr_t)Buffer2 + 42);
}

static void SkipSon(void) {
  a3 = (uint32_t)(uintptr_t)&Sizes;
  d6 = (uint32_t)(int32_t)(int8_t)(1);
}

static void NextFile2(void) {
  d0 = d6;
  a0 = READ32(a5 + (intptr_t)dtg_GetListData);
  ((void(*)(void))(uintptr_t)(READ32(a0)))();
  { int32_t _cmp=(int32_t)d3-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d3<(uint32_t)1); }
  if (!flag_z) { NoTin(); return; }
}

static void NoInst(void) {
  flag_z=(READ32_POST(a2)==0); flag_n=((int32_t)READ32_POST(a2)<0); flag_c=0; flag_v=0;
  if (flag_z) { NoInst(); return; }
  a2 -= 4;
  { int32_t _cmp=(int32_t)READ32(a0)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0)<(uint32_t)1); }
  if (!flag_z) { No01(); return; }
  a1 = d5;
  WRITE8(a1, 128);
  d5 += 8192;
  InitInst(); return;
}

static void No01(void) {
  { int32_t _cmp=(int32_t)READ32(a0)-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0)<(uint32_t)2); }
  if (!flag_z) { InitInst(); return; }
  a6 = (uint32_t)(uintptr_t)&ShortName;
  WRITE32(a6, READ32(a0 + 4));
  WRITE32_PRE(sp, a0);
  SetSampleName();
  ReadFile();
  a0 = READ32_POST(sp);
  a1 = d4;
  d4 += READ32_POST(a3);
}

static void InitInst(void) {
  WRITE32_POST(a2, a0);
  INITINSTRUMENT();
  Skip1(); return;
}

static void NoTin(void) {
  flag_z=(READ8(a0)==0); flag_n=((int32_t)READ8(a0)<0); flag_c=0; flag_v=0;
  if (flag_z) { NoHead2(); return; }
  { int32_t _cmp=(int32_t)READ16(a0)-(int32_t)0x5361; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a0)<(uint32_t)0x5361); }
  if (!flag_z) { NoSS2(); return; }
  a6 = (uint32_t)(a0 + 68);
  WRITE32_PRE(sp, a0);
  SetSampleName();
  ReadFile();
  a0 = READ32_POST(sp);
  a0 = (uint32_t)(a0 + 32);
  a1 = (uint32_t)(uintptr_t)&SSTech;
  flag_z=(d3==0); flag_n=((int32_t)d3<0); flag_c=0; flag_v=0;
  if (!flag_n) { NoS1(); return; }
  a1 = (uint32_t)(uintptr_t)&SStech;
  InstallToReal();
  SkipS1(); return;
}

static void NoS1(void) {
  WRITE8_POST(a2, d6);
}

static void SkipS1(void) {
  WRITE32(a0, a1);
  a1 = d4;
  WRITE16(a1 + 30, 1);
  WRITE32(a0 + 68, a1);
  WRITE32_POST(a4, a0);
  WRITE16_POST(a4, 1);
  d4 += READ32_POST(a3);
  Skip1(); return;
}

static void NoSS2(void) {
  { int32_t _cmp=(int32_t)READ16(a0)-(int32_t)0x5379; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a0)<(uint32_t)0x5379); }
  if (!flag_z) { NoSynth2(); return; }
}

static void NoHead2(void) {
  a0 = (uint32_t)(a0 + 32);
  a1 = (uint32_t)(uintptr_t)&SyntTech;
  flag_z=(d3==0); flag_n=((int32_t)d3<0); flag_c=0; flag_v=0;
  if (!flag_n) { NoS2(); return; }
  a1 = (uint32_t)(uintptr_t)&Synttech;
  InstallToReal();
  SkipS2(); return;
}

static void NoS2(void) {
  WRITE8_POST(a2, d6);
}

static void SkipS2(void) {
  WRITE32(a0, a1);
  WRITE32(a0 + -4, d5);
  WRITE32_POST(a4, a0);
  WRITE16_POST(a4, 1);
  a0 = (uint32_t)(a0 + 36);
  a1 = d5;
  SetFilter();
  d5 += 8192;
  Skip1(); return;
}

static void NoSynth2(void) {
  { int32_t _cmp=(int32_t)READ16(a0)-(int32_t)0x464f; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a0)<(uint32_t)0x464f); }
  if (!flag_z) { AV2(); return; }
  { int32_t _cmp=(int32_t)READ16(a0 + 8)-(int32_t)0x4149; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a0 + 8)<(uint32_t)0x4149); }
  if (flag_z) { AV2(); return; }
  InstallIFF();
  a0 = d5;
  d2 = (uint32_t)(int32_t)(int8_t)(62);
  a1 = (uint32_t)(uintptr_t)&IFFTech;
  flag_z=(d3==0); flag_n=((int32_t)d3<0); flag_c=0; flag_v=0;
  if (!flag_n) { NoS3(); return; }
  a1 = (uint32_t)(uintptr_t)&IFFtech;
  InstallToReal();
  SkipS3(); return;
}

static void AV2(void) {
  InstallAIFF();
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (flag_n) { Corrupt(); return; }
  a0 = d5;
  a1 = (uint32_t)(uintptr_t)&AIFFTech;
  d2 = (uint32_t)(int32_t)(int8_t)(44);
}

static void NoS3(void) {
  WRITE8_POST(a2, d6);
}

static void SkipS3(void) {
  WRITE32(a0, a1);
  WRITE32_POST(a4, a0);
  WRITE16_POST(a4, 1);
  d5 += d2;
}

static void Skip1(void) {
  d6 += 1;
  d7 -= 1;
  if (!flag_z) { NextFile2(); return; }
  a0 = READ32(a5 + (intptr_t)dtg_AudioAlloc);
  ((void(*)(void))(uintptr_t)a0)(); return;
}

static void Corrupt(void) {
  d0 = (uint32_t)(int32_t)(int8_t)(EPR_CorruptModule);
  return;
}

static void Short(void) {
  d0 = (uint32_t)(int32_t)(int8_t)(EPR_ModuleTooShort);
  return;
}

static void ErrorExt(void) {
  d0 = (uint32_t)(int32_t)(int8_t)(EPR_ErrorExtLoad);
  return;
}

static void NoMemory(void) {
  d0 = (uint32_t)(int32_t)(int8_t)(EPR_NotEnoughMem);
  return;
}

static void InFile(void) {
  d0 = (uint32_t)(int32_t)(int8_t)(EPR_ErrorInFile);
  return;
}

static void InstallToReal(void) {
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  WRITE8(pc + -1, (uint32_t)(uintptr_t)RealSamples);
  a4 = (uint32_t)((uintptr_t)Buffer + 74);
  a2 = (uint32_t)((uintptr_t)Buffer2 + 64);
  W(a2) = (uint16_t)(a2 + d1);
  WRITE8(a2, d1);
  WRITE8(a2, READ8(a2) + 1);
  d1 = (uint32_t)((uint16_t)6 * (uint16_t)d1);
  W(a4) = (uint16_t)(a4 + d1);
  return;
}
static const uint8_t RealSamples[] = { 0x40 };

static void SetSampleName(void) {
  a0 = READ32(a5 + (intptr_t)dtg_PathArrayPtr);
  WRITE8(a0, 0);
  a0 = READ32(a5 + (intptr_t)dtg_CopyDir);
  ((void(*)(void))(uintptr_t)(READ32(a0)))();
  a0 = READ32(a5 + (intptr_t)dtg_PathArrayPtr);
  d1 = a0;
NoZero:
  flag_z=(READ8_POST(a0)==0); flag_n=((int32_t)READ8_POST(a0)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto NoZero;
  a0 -= 1;
  a1 = (uint32_t)(uintptr_t)&SamplesPath;
CopyPath:
  WRITE8_POST(a0, READ8_POST(a1));
  if (!flag_z) goto CopyPath;
  a0 -= 1;
CopyName1:
  WRITE8_POST(a0, READ8_POST(a6));
  if (!flag_z) goto CopyName1;
  a6 = (uint32_t)(uintptr_t)&Suffix2;
  a0 -= 1;
CopyName2:
  WRITE8_POST(a0, READ8_POST(a6));
  if (!flag_z) goto CopyName2;
  return;
}

static void GetSize(void) {
  a6 = READ32(a5 + (intptr_t)dtg_DOSBase);
  d2 = MODE_OLDFILE;
  ((void(*)(void))(uintptr_t)(READ32(a6 + (intptr_t)_LVOOpen)))();
  d1 = d0;
  if (flag_z) goto Err;
  d2 = (uint32_t)(int32_t)(int8_t)(0);
  d3 = (uint32_t)(int32_t)(int8_t)(OFFSET_END);
  WRITE32_PRE(sp, d1);
  ((void(*)(void))(uintptr_t)(READ32(a6 + (intptr_t)_LVOSeek)))();
  d3 = (uint32_t)(int32_t)(int8_t)(OFFSET_BEGINNING);
  d1 = READ32(sp);
  ((void(*)(void))(uintptr_t)(READ32(a6 + (intptr_t)_LVOSeek)))();
  d1 = READ32_POST(sp);
  WRITE32_PRE(sp, d0);
  ((void(*)(void))(uintptr_t)(READ32(a6 + (intptr_t)_LVOClose)))();
  d0 = READ32_POST(sp);
  return;
Err:
  d0 = (uint32_t)(int32_t)(int8_t)(-1);
  return;
}

static void ReadFile(void) {
  a6 = READ32(a5 + (intptr_t)dtg_DOSBase);
  d2 = MODE_OLDFILE;
  ((void(*)(void))(uintptr_t)(READ32(a6 + (intptr_t)_LVOOpen)))();
  d1 = d0;
  /* MOVEM.L d0,d3,? */
  d2 = d4;
  d3 = READ32(a3);
  ((void(*)(void))(uintptr_t)(READ32(a6 + (intptr_t)_LVORead)))();
  /* MOVEM.L ?,d1,d3 */
  ((void(*)(void))(uintptr_t)(READ32(a6 + (intptr_t)_LVOClose)))();
  return;
  /* ************************************************************************** */
  /* **************************** DTP_EndPlayer ******************************* */
  /* ************************************************************************** */
EndPlayer:
  /* write unknown */ (void)(4);
  d0 = (uint32_t)(uintptr_t)ChipLength;
  if (flag_z) goto SkipChip;
  a1 = (uint32_t)(uintptr_t)ChipPtr;
  ((void(*)(void))(uintptr_t)(READ32(a6 + (intptr_t)_LVOFreeMem)))();
SkipChip:
  d0 = (uint32_t)(uintptr_t)FastLength;
  if (flag_z) goto SkipFast;
  a1 = (uint32_t)(uintptr_t)FastPtr;
  ((void(*)(void))(uintptr_t)(READ32(a6 + (intptr_t)_LVOFreeMem)))();
SkipFast:
  a0 = READ32(a5 + (intptr_t)dtg_AudioFree);
  ((void(*)(void))(uintptr_t)a0)(); return;
  /* ************************************************************************** */
  /* **************************** DTP_Intterrupt ****************************** */
  /* ************************************************************************** */
Interrupt:
  /* MOVEM.L d1,a6,? */
  a0 = (uint32_t)(uintptr_t)&StructAdr;
  /* UNIMPLEMENTED: ST */
  /* write unknown */ (void)(UPSB_Adr);
  WRITE16(a0 + (intptr_t)UPS_Voice1Per, 0);
  WRITE16(a0 + (intptr_t)UPS_Voice2Per, 0);
  WRITE16(a0 + (intptr_t)UPS_Voice3Per, 0);
  WRITE16(a0 + (intptr_t)UPS_Voice4Per, 0);
  a6 = (uint32_t)(uintptr_t)Sonix;
  B(d1) = (uint8_t)((uint32_t)(uintptr_t)FormatNow);
  if (flag_z) goto Play_SNX;
  if (flag_n) goto Play_SMUS;
  PlayTINY();
  goto SkipPlay;
Play_SMUS:
  PlaySMUS();
  goto SkipPlay;
Play_SNX:
  PlaySNX();
SkipPlay:
  a0 = (uint32_t)(uintptr_t)&StructAdr;
  WRITE16(a0 + (intptr_t)UPS_Enabled, 0);
  /* MOVEM.L ?,d1,a6 */
  d0 = (uint32_t)(int32_t)(int8_t)(0);
  return;
}

static void SongEnd(void) {
  /* MOVEM.L a1,a5,? */
  a5 = (uint32_t)(uintptr_t)EagleBase;
  a1 = READ32(a5 + (intptr_t)dtg_SongEnd);
  ((void(*)(void))(uintptr_t)(READ32(a1)))();
  /* MOVEM.L ?,a1,a5 */
  return;
}

static void DMAWait(void) {
  /* MOVEM.L d0,d1,? */
  d0 = (uint32_t)(int32_t)(int8_t)(8);
_dma1:
  B(d1) = (uint8_t)(READ8(0xDFF006));
_dma2:
  { int32_t _cmp=(int32_t)d1-(int32_t)READ8(0xDFF006); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)READ8(0xDFF006)); }
  if (flag_z) goto _dma2;
  if (!flag_z && (int16_t)(--d0) >= 0) goto _dma1;
  /* MOVEM.L ?,d0,d1 */
  return;
  /* ************************************************************************** */
  /* **************************** DTP_InitSound ******************************* */
  /* ************************************************************************** */
InitSound:
  a0 = (uint32_t)(uintptr_t)&StructAdr;
  a1 = (uint32_t)(a0 + (intptr_t)UPS_SizeOF);
ClearUPS:
  WRITE16_POST(a0, 0);
  { int32_t _cmp=(int32_t)a1-(int32_t)a0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a1<(uint32_t)a0); }
  if (!flag_z) goto ClearUPS;
  a0 = (uint32_t)(uintptr_t)&OldVoice1;
  WRITE32_POST(a0, 0);
  WRITE32(a0, 0);
  d7 = (uint32_t)(uintptr_t)Clock;
  if (!flag_z) goto Done;
  W(d7) = (uint16_t)(READ16(a5 + (intptr_t)dtg_Timer));
  d7 = (uint32_t)((uint16_t)125 * (uint16_t)d7);
  a0 = (uint32_t)(uintptr_t)&Clock;
  WRITE32(a0, d7);
Done:
  a6 = (uint32_t)(uintptr_t)Sonix;
  a0 = (uint32_t)(a6 + 1336);
  d0 = (uint32_t)(int32_t)(int8_t)(0);
  d1 = (uint32_t)(int32_t)(int8_t)(-1);
  d2 = (uint32_t)(int32_t)(int8_t)(-1);
  d3 = (uint32_t)(int32_t)(int8_t)(0);
  B(d6) = (uint8_t)((uint32_t)(uintptr_t)FormatNow);
  if (flag_z) goto InitSNX;
  if (!flag_n) goto InitTINY;
  PlaySCORE();
  goto SetTimer;
InitTINY:
  a0 = (uint32_t)(uintptr_t)ModulePtr;
  PLAYSCORE();
SetTimer:
  W(d0) = (uint16_t)(READ16(a6 + 2));
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  W(d0) = (uint16_t)(d0 << 1);
  a0 = (uint32_t)(uintptr_t)&lbW000CAE;
  W(d7) = (uint16_t)(READ16(a0 + 0));
  W(d2) = (uint16_t)d7;
  d0 = (uint32_t)(int32_t)(int8_t)(12);
  W(d2) = (uint16_t)((uint32_t)(d2) >> d0);
  W(d2) = (uint16_t)(d2 << d0);
  d7 = (d7 >> 16) | (d7 << 16);
  W(d7) = (uint16_t)(0);
  d7 >>= 1;
  { uint16_t q=(uint16_t)((uint32_t)d7/(uint16_t)d2); uint16_t r=(uint16_t)((uint32_t)d7%(uint16_t)d2); d7=((uint32_t)r<<16)|q; }
  d7 = (uint32_t)((uint16_t)0x2E9C * (uint16_t)d7);
  d0 = (uint32_t)(int32_t)(int8_t)(15);
  d7 >>= d0;
  goto PutTimer;
InitSNX:
  d4 = (uint32_t)(int32_t)(int8_t)(-1);
  PlayScore();
  a0 = (uint32_t)(uintptr_t)ModulePtr;
  { int32_t _cmp=(int32_t)READ8(a0 + 20)-(int32_t)0x82; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a0 + 20)<(uint32_t)0x82); }
  if (!flag_z) goto NoCom;
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  B(d1) = (uint8_t)(READ8(a0 + 21));
  goto Podziel;
NoCom:
  W(d1) = (uint16_t)(READ16(a6));
Podziel:
  { uint16_t q=(uint16_t)((uint32_t)d7/(uint16_t)d1); uint16_t r=(uint16_t)((uint32_t)d7%(uint16_t)d1); d7=((uint32_t)r<<16)|q; }
PutTimer:
  WRITE16(a5 + (intptr_t)dtg_Timer, d7);
  return;
  /* ************************************************************************** */
  /* **************************** DTP_EndSound ******************************** */
  /* ************************************************************************** */
EndSound:
  a0 = (uint32_t)0xDFF000;
  WRITE16(a0 + 150, 15);
  d0 = (uint32_t)(int32_t)(int8_t)(0);
  WRITE16(a0 + 168, d0);
  WRITE16(a0 + 184, d0);
  WRITE16(a0 + 200, d0);
  WRITE16(a0 + 216, d0);
  return;
  /* ************************************************************************** */
  /* *************** Sonix Music Driver v2.3c player (SNX format) ************* */
  /* ************************************************************************** */
  /* Player from game "Rise Of The Dragon" (c) 1991 by Dynamix */
  /* lbL01DEFC	dc.l	0			; ext. alloc mem */
  /* lbL01DF00	dc.l	0			; ext. free mem */
  /* lbC01DF04	MOVEM.L	D0/D1/A1-A3/A6,-(SP) */
  /* MOVEA.L	SONIX(PC),A6 */
  /* LEA	$3E6(A6),A3 */
  /* MOVE.L	A0,-(SP) */
  /* TST.L	(SP)+ */
  /* BEQ.S	lbC01DF32 */
  /* MOVEQ	#$3A,D0				; ":" */
  /* lbC01DF18	MOVE.B	D0,D1 */
  /* MOVE.B	(A0)+,D0 */
  /* MOVE.B	D0,(A3)+ */
  /* BNE.S	lbC01DF18 */
  /* SUBQ.L	#1,A3 */
  /* CMPI.B	#$3A,D1				; ":" */
  /* BEQ.S	lbC01DF32 */
  /* CMPI.B	#$2F,D1				; "/" */
  /* BEQ.S	lbC01DF32 */
  /* MOVE.B	#$2F,(A3)+			; "/" */
  /* lbC01DF32	MOVE.B	(A1)+,(A3)+ */
  /* BNE.S	lbC01DF32 */
  /* MOVE.L	A2,-(SP) */
  /* TST.L	(SP)+ */
  /* BEQ.S	lbC01DF42 */
  /* SUBQ.L	#1,A3 */
  /* lbC01DF3E	MOVE.B	(A2)+,(A3)+ */
  /* BNE.S	lbC01DF3E */
  /* lbC01DF42	LEA	$3E6(A6),A0 */
  /* MOVEM.L	(SP)+,D0/D1/A1-A3/A6 */
  /* RTS */
  /* lbC01DF4C	MOVEM.L	D1/D2/A0/A1/A6,-(SP) */
  /* MOVE.L	A0,D1 */
  /* MOVE.L	D0,D2 */
  /* MOVEA.L	SONIX(PC),A6 */
  /* MOVE.L	$16(A6),D0 */
  /* BNE.S	lbC01DF70 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	DOS_Base(PC),A6 */
  /* JSR	-$1E(A6)			; open file */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC01DF6A	MOVEM.L	(SP)+,D1/D2/A0/A1/A6 */
  /* RTS */
  /* lbC01DF70	MOVEA.L	D0,A0			; ext. open file */
  /* JSR	(A0) */
  /* BRA.S	lbC01DF6A */
  /* lbC01DF76	MOVEM.L	D1/A0/A1/A6,-(SP) */
  /* MOVE.L	D0,D1 */
  /* MOVEA.L	SONIX(PC),A6 */
  /* MOVE.L	$1A(A6),D0 */
  /* BNE.S	lbC01DF98 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	DOS_Base(PC),A6 */
  /* JSR	-$24(A6)			; close file */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC01DF92	MOVEM.L	(SP)+,D1/A0/A1/A6 */
  /* RTS */
  /* lbC01DF98	MOVEA.L	D0,A0			; ext. close file */
  /* JSR	(A0) */
  /* BRA.S	lbC01DF92 */
  /* lbC01DF9E	MOVEM.L	D1-D3/A0/A1/A6,-(SP) */
  /* MOVE.L	D1,D3 */
  /* MOVE.L	D0,D1 */
  /* MOVE.L	A0,D2 */
  /* MOVEA.L	SONIX(PC),A6 */
  /* MOVE.L	$1E(A6),D0 */
  /* BNE.S	lbC01DFC4 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	DOS_Base(PC),A6 */
  /* JSR	-$2A(A6)			; read file */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC01DFBE	MOVEM.L	(SP)+,D1-D3/A0/A1/A6 */
  /* RTS */
  /* lbC01DFC4	MOVEA.L	D0,A0			; ext. read file */
  /* JSR	(A0) */
  /* BRA.S	lbC01DFBE */
  /* lbC01DFCA	MOVEM.L	D1/A0/A1/A6,-(SP) */
  /* MOVEA.L	SONIX(PC),A6 */
  /* MOVE.L	$22(A6),D0 */
  /* BNE.S	lbC01DFEA */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	DOS_Base(PC),A6 */
  /* JSR	-$42(A6)			; seek file */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC01DFE4	MOVEM.L	(SP)+,D1/A0/A1/A6 */
  /* RTS */
  /* lbC01DFEA	MOVEA.L	D0,A0			; ext. seek file */
  /* JSR	(A0) */
  /* BRA.S	lbC01DFE4 */
  /* INITINSTRUMENT	MOVEM.L	D1-D7/A0-A6,-(SP) */
  /* MOVEA.L	A1,A4 */
  /* CLR.L	D2 */
  /* BCLR	#6,$56(A6) */
  /* LEA	$8A(A6),A5 */
  /* SUBA.L	A3,A3 */
  /* MOVEQ	#$3F,D7 */
  /* lbC01E006	MOVE.L	0(A5),D0 */
  /* BNE.S	lbC01E014 */
  /* MOVE.L	A3,D0 */
  /* BNE.S	lbC01E028 */
  /* MOVEA.L	A5,A3 */
  /* BRA.S	lbC01E028 */
  /* lbC01E014	MOVEA.L	D0,A2 */
  /* LEA	4(A2),A2 */
  /* MOVE.L	A0,-(SP) */
  /* MOVE.L	A2,-(SP) */
  /* BSR.L	lbC01FE44			; compare string */
  /* ADDQ.L	#8,SP */
  /* BEQ.L	lbC01E0C0 */
  /* lbC01E028	ADDQ.L	#6,A5 */
  /* DBRA	D7,lbC01E006 */
  /* MOVE.L	A3,D0 */
  /* BEQ.L	lbC01E0CE */
  /* MOVEA.L	D0,A5 */
  /* EXG	A0,A1 */
  /* LEA	instr.MSG(PC),A2 */
  /* MOVEA.L	A0,A3 */
  /* BSR.L	lbC01DF04			; copy string */
  /* MOVE.L	#$3ED,D0 */
  /* BSR.L	lbC01DF4C			; open file */
  /* MOVE.L	D0,D2 */
  /* BNE.S	lbC01E06E */
  /* SUBA.L	A0,A0 */
  /* BSR.L	lbC01DF04			; copy string */
  /* MOVE.L	#$3ED,D0 */
  /* BSR.L	lbC01DF4C			; open file */
  /* MOVE.L	D0,D2 */
  /* BNE.S	lbC01E06E */
  /* BSET	#6,$56(A6) */
  /* BRA.L	lbC01E0D4 */
  /* lbC01E06E	LEA	$472(A6),A0		; file ptr */
  /* MOVEQ	#$20,D1				; file size */
  /* BSR.L	lbC01DF9E			; read file */
  /* CMP.L	D1,D0 */
  /* BNE.L	lbC01E0D4			; read error */
  /* LEA	SYNTTECH(PC),A4 */
  /* TST.B	(A0) */
  /* BEQ.S	lbC01E0A2 */
  /* lbC01E086	MOVEA.L	A4,A2 */
  /* ADDA.W	2(A4),A2 */
  /* MOVE.L	A2,-(SP) */
  /* MOVE.L	A0,-(SP) */
  /* BSR.L	lbC01FE44			; compare string */
  /* ADDQ.L	#8,SP */
  /* BEQ.S	lbC01E0A2 */
  /* MOVE.W	0(A4),D0 */
  /* BEQ.S	lbC01E0D4 */
  /* ADDA.W	D0,A4 */
  /* BRA.S	lbC01E086 */
  /* lbC01E0A2	MOVEA.L	A3,A0 */
  /* MOVE.L	D2,D0 */
  /* JSR	4(A4) */
  /* MOVE.L	D0,D2 */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC01E0D4 */
  /* MOVE.L	A4,0(A0)			; put tech */
  /* LEA	4(A0),A2 */
  /* lbC01E0B8	MOVE.B	(A1)+,(A2)+		; copy sample name */
  /* BNE.S	lbC01E0B8 */
  /* MOVE.L	A0,0(A5)			; put info address */
  /* lbC01E0C0	ADDQ.W	#1,4(A5) */
  /* lbC01E0C4	MOVE.L	D2,D0 */
  /* BEQ.S	lbC01E0CC */
  /* BSR.L	lbC01DF76			; close file */
  /* lbC01E0CC	MOVE.L	A5,D0 */
  /* lbC01E0CE	MOVEM.L	(SP)+,D1-D7/A0-A6 */
  /* RTS */
  /* lbC01E0D4	SUBA.L	A5,A5 */
  /* BRA.S	lbC01E0C4 */
  /* remove instrument routine */
  /* lbC01E0D8	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* LEA	$8A(A6),A0 */
  /* MOVEQ	#$3F,D7 */
  /* lbC01E0E2	CLR.W	4(A0) */
  /* BSR.S	lbC01E0F4 */
  /* ADDQ.L	#6,A0 */
  /* DBRA	D7,lbC01E0E2 */
  /* MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* lbC01E0F4	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC01E120 */
  /* MOVEA.L	D0,A5 */
  /* SUBQ.W	#1,4(A5) */
  /* BGT.S	lbC01E120 */
  /* MOVE.L	0(A5),D0 */
  /* BEQ.S	lbC01E11C */
  /* MOVEA.L	D0,A0 */
  /* BSR.L	lbC01E126 */
  /* MOVEA.L	0(A0),A1 */
  /* JSR	8(A1) */
  /* CLR.L	0(A5) */
  /* lbC01E11C	CLR.W	4(A5) */
  /* lbC01E120	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* lbC01E126	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC01E152 */
  /* LEA	$20A(A6),A1 */
  /* CLR.B	D0 */
  /* lbC01E134	CMPI.B	#0,1(A1) */
  /* BEQ.S	lbC01E146 */
  /* CMPA.L	4(A1),A0 */
  /* BNE.S	lbC01E146 */
  /* BSR.L	STOPNOTE */
  /* lbC01E146	ADDA.W	#$54,A1 */
  /* ADDQ.B	#1,D0 */
  /* CMPI.B	#4,D0 */
  /* BNE.S	lbC01E134 */
  /* lbC01E152	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
}

static void StartNote(void) {
  /* MOVEM.L d0,d2,d4,a0,a3,? */
  d4 = a0;
  if (flag_z) goto lbC01E1BA;
  d4 = READ32(a0 + 0);
  if (flag_z) goto lbC01E1BA;
  a0 = d4;
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  W(d4) = (uint16_t)d0;
  d4 = (uint32_t)((uint16_t)0x54 * (uint16_t)d4);
  a1 = (uint32_t)(a6 + 522);
  W(a1) = (uint16_t)(a1 + d4);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC01E192;
  a2 = READ32(a0 + 0);
  a3 = READ32(a1 + 4);
  a3 = READ32(a3 + 0);
  { int32_t _cmp=(int32_t)a2-(int32_t)a3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)a3); }
  if (flag_z) goto lbC01E192;
  StopNote();
lbC01E192:
  WRITE32(a1 + 4, a0);
  WRITE16(a1 + 2, d1);
  W(d2) &= (uint16_t)(0xFF);
  WRITE16(a1 + 8, d2);
  WRITE8(a1 + 10, d3);
  W(d1) = (uint16_t)(0);
  lbC01E388();
  WRITE32(a1 + 28, 0xFFFFFFFF);
  WRITE8(a1 + 0, 1);
lbC01E1BA:
  /* MOVEM.L ?,d0,d2,d4,a0,a3 */
  return;
  /* RELEASESOUND	MOVE.L	D0,-(SP) */
  /* CLR.L	$4A4(A6) */
  /* CLR.W	8(A6) */
  /* MOVEQ	#3,D0 */
  /* lbC01E1CC	BSR.S	RELEASENOTE */
  /* DBRA	D0,lbC01E1CC */
  /* MOVE.L	(SP)+,D0 */
  /* RTS */
}

static void ReleaseNote(void) {
  /* MOVEM.L d0,a1,? */
  a1 = (uint32_t)(a6 + 522);
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  d0 = (uint32_t)((uint16_t)0x54 * (uint16_t)d0);
  W(a1) = (uint16_t)(a1 + d0);
  WRITE8(a1 + 0, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)1); }
  if (!flag_z) goto lbC01E1F8;
  WRITE8(a1 + 0, 2);
lbC01E1F8:
  /* MOVEM.L ?,d0,a1 */
  return;
  /* STOPSOUND	MOVE.L	D0,-(SP) */
  /* CLR.L	$4A4(A6) */
  /* CLR.W	8(A6) */
  /* MOVEQ	#3,D0 */
  /* lbC01E20A	BSR.S	STOPNOTE */
  /* DBRA	D0,lbC01E20A */
  /* MOVE.L	(SP)+,D0 */
  /* RTS */
}

static void StopNote(void) {
  /* MOVEM.L d0,d7,a0,a1,? */
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  W(d7) = (uint16_t)d0;
  a1 = (uint32_t)(a6 + 522);
  d0 = (uint32_t)((uint16_t)0x54 * (uint16_t)d0);
  W(a1) = (uint16_t)(a1 + d0);
  WRITE8(a1 + 0, 0);
  WRITE32(a1 + 28, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC01E240;
  WRITE8(a1 + 1, 0);
  lbC01EA46();
lbC01E240:
  /* MOVEM.L ?,d0,d7,a0,a1 */
  return;
  /* lbC01E246	BSR.L	StealTrack */
  /* BSET	D0,$57(A6) */
  /* BRA.L	StartNote */
  /* StealTrack	BSET	D0,$58(A6) */
  /* BRA.S	StopNote */
}

static void ResumeTrack(void) {
  WRITE32(a6 + 87, READ32(a6 + 87) & ~(1u << (d0 & 31)));
  return;
  /* lbC01E262	MOVEQ	#0,D0 */
  /* MOVE.B	$57(A6),D0 */
  /* ASL.B	#4,D0 */
  /* OR.B	$59(A6),D0 */
  /* RTS */
  /* lbC01E270	MOVE.L	A1,-(SP) */
  /* EXT.W	D0 */
  /* MULU.W	#$54,D0 */
  /* LEA	$20A(A6),A1 */
  /* ADDA.W	D0,A1 */
  /* MOVE.L	$1C(A1),D0 */
  /* MOVEA.L	(SP)+,A1 */
  /* RTS */
}

static void lbC01E286(void) {
  d0 = READ32(a1 + 12);
  if (flag_z) goto lbC01E29E;
  WRITE32(a1 + 12, 0);
  WRITE16(a2 + 4, READ16(a1 + 16));
  WRITE32(a2 + 0, d0);
  SetAdr();
  W(d0) = (uint16_t)(READ16(a1 + 16));
  SetLen();
  W(d0) = (uint16_t)(READ16(a1 + 24));
  SetPer();
  d6 = d6 | (1u << (d7 & 31));
  goto lbC01E2B2;
lbC01E29E:
  d1 = READ32(a1 + 18);
  if (flag_z) goto lbC01E2B2;
  WRITE32(a1 + 18, 0);
  WRITE16(a2 + 4, READ16(a1 + 22));
  WRITE32(a2 + 0, d1);
  /* move.l	D1,D0 */
  /* bsr.w	SetAdr */
  /* move.w	$16(A1),D0 */
  /* bsr.w	SetLen */
lbC01E2B2:
  WRITE16(a2 + 6, READ16(a1 + 24));
  /* MOVE.W	$1A(A1),8(A2)			; volume */
  /* move.w	$18(A1),D0 */
  /* bsr.w	SetPer */
  W(d0) = (uint16_t)(READ16(a1 + 26));
  ChangeVolume();
  return;
}

static void lbC01E2C0(void) {
  /* MOVEM.L d2,a2,? */
  a2 = a0;
  d2 = d0;
  d2 += d1;
  a0 += d0;
  d0 = d1;
  if (!flag_z) goto lbC01E2DA;
  a0 = READ32(a6 + 994);
  W(a0) = (uint16_t)(a0 + 0x400);
  d0 = (uint32_t)(int32_t)(int8_t)(8);
lbC01E2DA:
  if (flag_z) goto lbC01E2E6;
  a2 = a0;
  d2 = d0;
lbC01E2E6:
  flag_z=(d1==0); flag_n=((int32_t)d1<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC01E2EE;
  WRITE32(a1 + 28, d2);
lbC01E2EE:
  WRITE32(a1 + 12, a2);
  d2 >>= 1;
  WRITE16(a1 + 16, d2);
  WRITE32(a1 + 18, a0);
  d0 >>= 1;
  WRITE16(a1 + 22, d0);
  /* MOVEM.L ?,d2,a2 */
  return;
}

static void lbC01E308(void) {
  WRITE32_PRE(sp, d1);
  W(d0) = (uint16_t)d7;
  flag_z = ((READ32(a6 + 88) & (1u << (d7 & 31))) == 0);
  if (flag_z) goto lbC01E314;
  W(d0) = (uint16_t)(d0 + 4);
lbC01E314:
  W(d0) = (uint16_t)(d0 + d0);
  W(d0) = (uint16_t)(READ16(a6 + 90));
  W(d1) = (uint16_t)(READ16(a1 + 8));
  W(d1) = (uint16_t)(d1 + 1);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d0 = (d0 >> 16) | (d0 << 16);
  d1 = READ32_POST(sp);
  return;
}

static void lbC01E328(void) {
  /* MOVEM.L d1,d7,a0,? */
  W(d7) = (uint16_t)(d7 + d7);
  W(d7) = (uint16_t)(d7 + d7);
  W(d1) = (uint16_t)(READ16(a6 + 72));
  if (flag_z) goto lbC01E33A;
  W(d0) = (uint16_t)d1;
  goto lbC01E356;
lbC01E33A:
  W(d1) = (uint16_t)(READ16(a6 + 56));
  if (flag_z) goto lbC01E356;
  B(d1) = (uint8_t)(d1 + 0x80);
  W(d1) = (uint16_t)((uint32_t)(d1) >> 2);
  W(d1) = (uint16_t)(d1 + d1);
  a0 = (uint32_t)(uintptr_t)&lbW01E3B2;
  W(d1) = (uint16_t)(READ16(a0 + 0));
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d0 += d0;
  d0 = (d0 >> 16) | (d0 << 16);
lbC01E356:
  /* MOVEM.L ?,d1,d7,a0 */
  return;
}

static void lbC01E35C(void) {
  /* MOVEM.L d1,d2,? */
  d2 = READ32(a1 + 28);
  if (flag_z||(flag_n!=flag_v)) goto lbC01E382;
  d1 = 0xE90B;
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)d0); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)d0); d1=((uint32_t)r<<16)|q; }
  d1 = (uint32_t)((uint16_t)READ16(a6 + 50) * (uint16_t)d1);
  d1 += d1;
  W(d1) = (uint16_t)(0);
  d1 = (d1 >> 16) | (d1 << 16);
  d2 -= d1;
  if (flag_n==flag_v) goto lbC01E37E;
  d2 = (uint32_t)(int32_t)(int8_t)(0);
lbC01E37E:
  WRITE32(a1 + 28, d2);
lbC01E382:
  /* MOVEM.L ?,d1,d2 */
  return;
}

static void lbC01E388(void) {
  /* MOVEM.L d0,d2,? */
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  W(d0) = (uint16_t)(d0 + d0);
  W(d0) = (uint16_t)(d0 + d0);
  flag_z=(d1==0); flag_n=((int32_t)d1<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01E3A0;
  d2 = 0x369E99;
  { uint16_t q=(uint16_t)((uint32_t)d2/(uint16_t)d1); uint16_t r=(uint16_t)((uint32_t)d2%(uint16_t)d1); d2=((uint32_t)r<<16)|q; }
  W(d1) = (uint16_t)d2;
lbC01E3A0:
  WRITE16(a6 + 72, d1);
  /* MOVEM.L ?,d0,d2 */
  return;
  /* instr.MSG	dc.b	'.instr',0,0 */
}
static const uint16_t lbW01E3B2[] = { 0xc24d };
static const uint16_t _data_1644[] = { 0xbfc8 };
static const uint16_t _data_1645[] = { 0xbd4c };
static const uint16_t _data_1646[] = { 0xbad8 };
static const uint16_t _data_1647[] = { 0xb86c };
static const uint16_t _data_1648[] = { 0xb608 };
static const uint16_t _data_1649[] = { 0xb3ac };
static const uint16_t _data_1650[] = { 0xb158 };
static const uint16_t _data_1651[] = { 0xaf0c };
static const uint16_t _data_1652[] = { 0xacc7 };
static const uint16_t _data_1653[] = { 0xaa8a };
static const uint16_t _data_1654[] = { 0xa854 };
static const uint16_t _data_1655[] = { 0xa626 };
static const uint16_t _data_1656[] = { 0xa3ff };
static const uint16_t _data_1657[] = { 0xa1df };
static const uint16_t _data_1658[] = { 0x9fc6 };
static const uint16_t _data_1659[] = { 0x9db4 };
static const uint16_t _data_1660[] = { 0x9ba9 };
static const uint16_t _data_1661[] = { 0x99a4 };
static const uint16_t _data_1662[] = { 0x97a6 };
static const uint16_t _data_1663[] = { 0x95af };
static const uint16_t _data_1664[] = { 0x93bf };
static const uint16_t _data_1665[] = { 0x91d5 };
static const uint16_t _data_1666[] = { 0x8ff1 };
static const uint16_t _data_1667[] = { 0x8e13 };
static const uint16_t _data_1668[] = { 0x8c3c };
static const uint16_t _data_1669[] = { 0x8a6b };
static const uint16_t _data_1670[] = { 0x88a0 };
static const uint16_t _data_1671[] = { 0x86da };
static const uint16_t _data_1672[] = { 0x851b };
static const uint16_t _data_1673[] = { 0x8362 };
static const uint16_t _data_1674[] = { 0x81ae };
static const uint16_t _data_1675[] = { 0x8000 };
static const uint16_t _data_1676[] = { 0x7e57 };
static const uint16_t _data_1677[] = { 0x7cb4 };
static const uint16_t _data_1678[] = { 0x7b16 };
static const uint16_t _data_1679[] = { 0x797e };
static const uint16_t _data_1680[] = { 0x77eb };
static const uint16_t _data_1681[] = { 0x765d };
static const uint16_t _data_1682[] = { 0x74d4 };
static const uint16_t _data_1683[] = { 0x7351 };
static const uint16_t _data_1684[] = { 0x71d2 };
static const uint16_t _data_1685[] = { 0x7059 };
static const uint16_t _data_1686[] = { 0x6ee4 };
static const uint16_t _data_1687[] = { 0x6d74 };
static const uint16_t _data_1688[] = { 0x6c09 };
static const uint16_t _data_1689[] = { 0x6aa2 };
static const uint16_t _data_1690[] = { 0x6941 };
static const uint16_t _data_1691[] = { 0x67e4 };
static const uint16_t _data_1692[] = { 0x668b };
static const uint16_t _data_1693[] = { 0x6537 };
static const uint16_t _data_1694[] = { 0x63e7 };
static const uint16_t _data_1695[] = { 0x629c };
static const uint16_t _data_1696[] = { 0x6154 };
static const uint16_t _data_1697[] = { 0x6012 };
static const uint16_t _data_1698[] = { 0x5ed3 };
static const uint16_t _data_1699[] = { 0x5d98 };
static const uint16_t _data_1700[] = { 0x5c62 };
static const uint16_t _data_1701[] = { 0x5b2f };
static const uint16_t _data_1702[] = { 0x5a01 };
static const uint16_t _data_1703[] = { 0x58d6 };
static const uint16_t _data_1704[] = { 0x57b0 };
static const uint16_t _data_1705[] = { 0x568d };
static const uint16_t _data_1706[] = { 0x556e };

static void InitScore(void) {
  /* MOVEM.L	D1-D7/A0-A6,-(SP) */
  /* MOVE.L	SP,$496(A6) */
  /* SUBA.L	A5,A5 */
  /* ANDI.B	#$3F,$56(A6) */
  /* MOVE.L	A1,$492(A6) */
  /* MOVEA.L	A0,A1 */
  /* MOVE.L	#$72,D0 */
  /* MOVE.L	#$10001,D1 */
  /* BSR.L	lbC01FE82			; alloc mem */
  /* MOVE.L	A0,D0 */
  /* BEQ.L	lbC01E4F4 */
  /* MOVEA.L	A0,A5 */
  /* MOVEA.L	A1,A0 */
  /* MOVEQ	#1,D0 */
  /* BSR.L	lbC01FEDE			; get size + read */
  /* MOVE.L	A0,$6E(A5)			; song ptr */
  /* BEQ.L	lbC01E4F4 */
  /* MOVEM.L d2,a6,? */
  a5 = (uint32_t)(uintptr_t)&Buffer2;
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  a4 = a0;
  WRITE16(a5 + 0, READ16(a4 + 16));
  WRITE16(a5 + 2, READ16(a4 + 18));
  WRITE16(a5 + 4, 0x80);
  a0 = a5;
  a1 = (uint32_t)(a4 + 20);
  a2 = (uint32_t)(a4 + 0);
  d7 = (uint32_t)(int32_t)(int8_t)(3);
lbC01E490:
  WRITE32(a0 + 26, a1);
  { int32_t _cmp=(int32_t)READ16(a1)-(int32_t)-1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a1)<(uint32_t)-1); }
  if (flag_z) goto NoV;
  d1 += 1;
NoV:
  a1 += READ32_POST(a2);
  WRITE8(a0 + 13, 0xFF);
  a0 += 4;
  if ((int16_t)(--d7) >= 0) goto lbC01E490;
  d0 = a1;
  /* MOVEM.L ?,d2,a6 */
  /* MOVEA.L	A1,A2 */
  /* LEA	$2A(A5),A3			; sample number */
  /* lbC01E4A8	TST.B	(A2) */
  /* BEQ.S	lbC01E4DA */
  /* MOVEA.L	A2,A0 */
  /* MOVEA.L	$492(A6),A1 */
  /* BSR.L	INITINSTRUMENT			; load instrument */
  /* TST.L	D0 */
  /* BNE.S	lbC01E4C4			; load OK */
  /* BSET	#7,$56(A6) */
  /* BRA.L	lbC01E4FA */
  /* lbC01E4C4	LEA	$8A(A6),A0 */
  /* SUB.L	A0,D0 */
  /* DIVU.W	#6,D0 */
  /* ADDQ.B	#1,D0 */
  /* MOVE.B	D0,(A3) */
  /* lbC01E4D2	TST.B	(A2)+ */
  /* BNE.S	lbC01E4D2 */
  /* ADDQ.L	#1,A3 */
  /* BRA.S	lbC01E4A8 */
  /* lbC01E4DA	LEA	$4AC(A6),A0 */
  /* lbC01E4DE	MOVE.L	(A0),D0 */
  /* BEQ.S	lbC01E4EA */
  /* MOVEA.L	D0,A0 */
  /* LEA	$6A(A0),A0 */
  /* BRA.S	lbC01E4DE */
  /* lbC01E4EA	MOVE.L	A5,(A0) */
  /* lbC01E4EC	MOVE.L	A5,D0 */
  /* MOVEM.L	(SP)+,D1-D7/A0-A6 */
  /* RTS */
  /* lbC01E4F4	BSET	#6,$56(A6) */
  /* lbC01E4FA	MOVEA.L	$496(A6),SP */
  /* MOVEA.L	A5,A0 */
  /* BSR.L	lbC01E51E */
  /* SUBA.L	A5,A5 */
  /* BRA.S	lbC01E4EC */
  /* lbC01E508	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* lbC01E50C	MOVE.L	$4AC(A6),D0 */
  /* BEQ.S	lbC01E518 */
  /* MOVEA.L	D0,A0 */
  /* BSR.S	lbC01E51E */
  /* BRA.S	lbC01E50C */
  /* lbC01E518	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* lbC01E51E	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	A0,D0 */
  /* BEQ.L	lbC01E584 */
  /* MOVEA.L	D0,A5 */
  /* CMPA.L	4(A6),A5 */
  /* BNE.S	lbC01E53C */
  /* BSR.L	STOPSCORE */
  /* CLR.L	4(A6) */
  /* CLR.W	$2E(A6) */
  /* lbC01E53C	LEA	$2A(A5),A1 */
  /* MOVEQ	#$3F,D7 */
  /* lbC01E542	MOVE.B	(A1)+,D0 */
  /* BEQ.S	lbC01E558 */
  /* SUBQ.B	#1,D0 */
  /* LEA	$8A(A6),A0 */
  /* EXT.W	D0 */
  /* MULU.W	#6,D0 */
  /* ADDA.W	D0,A0 */
  /* BSR.L	lbC01E0F4 */
  /* lbC01E558	DBRA	D7,lbC01E542 */
  /* MOVEA.L	$6E(A5),A0 */
  /* BSR.L	lbC01FEB2			; free mem */
  /* MOVEA.L	$6A(A5),A1 */
  /* LEA	$4AC(A6),A0 */
  /* lbC01E56C	MOVE.L	(A0),D0 */
  /* BEQ.S	lbC01E57E */
  /* CMP.L	A5,D0 */
  /* BEQ.S	lbC01E57C */
  /* MOVEA.L	D0,A0 */
  /* LEA	$6A(A0),A0 */
  /* BRA.S	lbC01E56C */
  /* lbC01E57C	MOVE.L	A1,(A0) */
  /* lbC01E57E	MOVEA.L	A5,A0 */
  /* BSR.L	lbC01FEB2			; free mem */
  /* lbC01E584	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* RELEASESCORE	MOVEM.L	D0-D2,-(SP) */
  /* BSET	#0,$56(A6) */
  /* TST.W	D0 */
  /* BNE.S	lbC01E59A */
  /* MOVEQ	#1,D0 */
  /* lbC01E59A	CLR.W	D1 */
  /* MOVEQ	#15,D2 */
  /* BSR.L	RAMPVOLUME */
  /* MOVEM.L	(SP)+,D0-D2 */
  /* RTS */
}

static void PlayScore(void) {
  /* MOVEM.L d0,d7,a0,a6,? */
  W(d7) = (uint16_t)d2;
  StopScore();
  d5 = a0;
  if (flag_z) goto lbC01E5F4;
  a5 = d5;
  { int32_t _cmp=(int32_t)d1-(int32_t)d0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)d0); }
  if (flag_z) goto lbC01E5F4;
  if (flag_c) goto lbC01E5F4;
  WRITE32(a6 + 10, d0);
  WRITE32(a6 + 18, d1);
  WRITE16(a6 + 0, READ16(a5 + 2));
  a0 = a5;
  lbC01E632();
  lbC01E6E2();
  WRITE32(a6 + 4, a5);
  WRITE16(a6 + 46, 0);
  d2 = (uint32_t)(int32_t)(int8_t)(15);
  W(d0) = (uint16_t)(0);
  B(d1) = (uint8_t)(0);
  RampVolume();
  W(d0) = (uint16_t)d3;
  B(d1) = (uint8_t)d4;
  RampVolume();
  WRITE16(a6 + 8, d7);
lbC01E5F4:
  /* MOVEM.L ?,d0,d7,a0,a6 */
  return;
}

static void StopScore(void) {
  /* CLR.L	$4A4(A6) */
lbC01E5FE:
  /* MOVEM.L d0,a0,? */
  /* BCLR	#0,$56(A6) */
  flag_z=(READ16(a6 + 8)==0); flag_n=((int32_t)READ16(a6 + 8)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01E62C;
  WRITE16(a6 + 8, 0);
  d0 = (uint32_t)(int32_t)(int8_t)(0);
lbC01E614:
  if (!flag_z) goto lbC01E61E;
  ReleaseNote();
lbC01E61E:
  B(d0) = (uint8_t)(d0 + 1);
  { int32_t _cmp=(int32_t)d0-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)4); }
  if (!flag_z) goto lbC01E614;
  /* ANDI.B	#$F0,$59(A6) */
lbC01E62C:
  /* MOVEM.L ?,d0,a0 */
  return;
}

static void lbC01E632(void) {
  /* MOVEM.L d0,d7,a0,a6,? */
  WRITE16(a6 + 892, 0);
  WRITE8(a6 + 890, 15);
  a3 = a0;
  a1 = (uint32_t)(a6 + 890);
  d6 = d0;
  B(d7) = (uint8_t)(0);
lbC01E64A:
  WRITE16(a1 + 20, 0);
  WRITE8(a1 + 36, 0);
  WRITE8(a1 + 38, 0);
  WRITE8(a1 + 37, 0xFF);
  d0 = READ32(a0 + 26);
  if (flag_z) goto lbC01E6C6;
  a2 = d0;
  d5 = d6;
lbC01E666:
  WRITE32(a1 + 4, a2);
  W(d0) = (uint16_t)(READ16_POST(a2));
  { int32_t _cmp=(int32_t)d0-(int32_t)0xFFFF; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0xFFFF); }
  if (flag_z) goto lbC01E6C6;
  flag_z=(d5==0); flag_n=((int32_t)d5<0); flag_c=0; flag_v=0;
  if (flag_z||(flag_n!=flag_v)) goto lbC01E6CE;
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (!flag_n) goto lbC01E666;
  { int32_t _cmp=(int32_t)d0-(int32_t)0x8100; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x8100); }
  if (flag_c) goto lbC01E6AC;
  { int32_t _cmp=(int32_t)d0-(int32_t)0x8200; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x8200); }
  if (flag_c) goto lbC01E6B4;
  { int32_t _cmp=(int32_t)d0-(int32_t)0x8300; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x8300); }
  if (flag_c) goto lbC01E6BA;
  { int32_t _cmp=(int32_t)d0-(int32_t)0x8400; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x8400); }
  if (flag_c) goto lbC01E6C0;
  { int32_t _cmp=(int32_t)d0-(int32_t)0xC000; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0xC000); }
  if (flag_c) goto lbC01E666;
  d0 &= 0x3FFF;
  d5 -= d0;
  if (!flag_n) goto lbC01E666;
  W(d0) = (uint16_t)d5;
  W(d0) = (uint16_t)(-(int16_t)W(d0));
  WRITE16(a1 + 20, d0);
  goto lbC01E666;
lbC01E6AC:
  B(d0) = (uint8_t)(d0 + 1);
  WRITE8(a1 + 36, d0);
  goto lbC01E666;
lbC01E6B4:
  WRITE8(a1 + 37, d0);
  goto lbC01E666;
lbC01E6BA:
  WRITE8(a6 + 893, d0);
  goto lbC01E666;
lbC01E6C0:
  WRITE8(a1 + 38, d0);
  goto lbC01E666;
lbC01E6C6:
  WRITE32(a1 + 4, 0);
  WRITE32(a6 + 890, READ32(a6 + 890) & ~(1u << (d7 & 31)));
lbC01E6CE:
  a0 += 4;
  a1 += 4;
  B(d7) = (uint8_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC01E64A;
  /* MOVEM.L ?,d0,d7,a0,a6 */
  return;
}

static void lbC01E6E2(void) {
  /* MOVEM.L d0,d7,a0,a6,? */
  a2 = (uint32_t)(a6 + 890);
  a1 = (uint32_t)(a6 + 942);
  d7 = (uint32_t)(int32_t)(int8_t)(0x19);
lbC01E6F0:
  WRITE16_POST(a1, READ16_POST(a2));
  if ((int16_t)(--d7) >= 0) goto lbC01E6F0;
  W(d0) = (uint16_t)(READ16(a6 + 944));
  if (flag_z) goto lbC01E700;
  WRITE16(a6 + 0, d0);
lbC01E700:
  WRITE32(a6 + 14, READ32(a6 + 10));
  a1 = a0;
  a4 = a6;
  B(d7) = (uint8_t)(0);
lbC01E70C:
  if (!flag_z) goto lbC01E718;
  B(d0) = (uint8_t)d7;
  ReleaseNote();
lbC01E718:
  d0 = 0;
  W(d0) = (uint16_t)(READ16(a4 + 962));
  W(d0) = (uint16_t)(d0 + 1);
  WRITE32(a4 + 874, d0);
  d0 = 0;
  B(d0) = (uint8_t)(READ8(a4 + 978));
  if (flag_z) goto lbC01E744;
  B(d0) = (uint8_t)(B(d0) - (uint8_t)(1));
  a3 = (uint32_t)(a0 + 42);
  B(d0) = (uint8_t)(READ8(a3 + 0));
  if (flag_z) goto lbC01E744;
  B(d0) = (uint8_t)(B(d0) - (uint8_t)(1));
  d0 = (uint32_t)((uint16_t)6 * (uint16_t)d0);
  a3 = (uint32_t)(a6 + 138);
  d0 += a3;
lbC01E744:
  WRITE32(a4 + 858, d0);
  WRITE8(a1 + 13, READ8(a4 + 979));
  WRITE8(a4 + 57, READ8(a4 + 980));
  a1 += 4;
  a4 += 4;
  B(d7) = (uint8_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_c) goto lbC01E70C;
  /* MOVE.B	$3AE(A6),D0 */
  /* OR.B	D0,$59(A6) */
  /* MOVEM.L ?,d0,d7,a0,a6 */
  return;
  /* lbW01E76E	dc.w	$64 */
}

static void PlaySNX(void) {
  /* Interrupt	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVEA.L	Sonix(PC),A6 */
  /* MOVE.L	$2A(A6),D0 */
  /* BEQ.S	lbC01E782 */
  /* MOVEA.L	D0,A0 */
  /* JSR	(A0) */
lbC01E782:
  lbC01EAB8();
  lbC01EB14();
  lbC01E7DA();
  lbC01E996();
  /* MOVEM.L	(SP)+,D0-D7/A0-A6 */
  return;
}

static void lbC01E798(void) {
  /* MOVEM.L d1,a0,? */
  { int32_t _cmp=(int32_t)d0-(int32_t)READ16(a6 + 48); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)READ16(a6 + 48)); }
  if (flag_z) goto lbC01E7D4;
  WRITE16(a6 + 48, d0);
  /* MOVE.L	#$1B4F4D,D1			; for NTSC timer */
  d1 = (uint32_t)(uintptr_t)Clock;
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)d0); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)d0); d1=((uint32_t)r<<16)|q; }
  /* MOVEA.L	$52C(A6),A0 */
  /* MOVE.B	D1,(A0) */
  /* LSR.W	#8,D1 */
  /* MOVE.B	D1,$100(A0) */
  /* MOVEA.L	$530(A6),A0 */
  /* MOVE.B	#$11,(A0) */
  /* MOVEM.L a1,a5,? */
  a5 = (uint32_t)(uintptr_t)EagleBase;
  WRITE16(a5 + (intptr_t)dtg_Timer, d1);
  a1 = READ32(a5 + (intptr_t)dtg_SetTimer);
  ((void(*)(void))(uintptr_t)(READ32(a1)))();
  /* MOVEM.L ?,a1,a5 */
  d1 = 0x4B0000;
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)d0); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)d0); d1=((uint32_t)r<<16)|q; }
  WRITE16(a6 + 50, d1);
  WRITE16(a6 + 52, 1);
lbC01E7D4:
  /* MOVEM.L ?,d1,a0 */
  return;
}

static void lbC01E7DA(void) {
  flag_z=(READ16(a6 + 46)==0); flag_n=((int32_t)READ16(a6 + 46)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01E7E8;
  WRITE16(a6 + 46, READ16(a6 + 46) - 1);
  if (!flag_z) goto lbC01E8CC;
lbC01E7E8:
  W(d0) = (uint16_t)(READ16(a6 + 0));
  lbC01E798();
  WRITE16(a6 + 46, READ16(a6 + 52));
  flag_z=(READ16(a6 + 8)==0); flag_n=((int32_t)READ16(a6 + 8)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01E8CC;
  a2 = READ32(a6 + 4);
  W(d6) = (uint16_t)(0);
lbC01E802:
  a1 = a2;
  a5 = a6;
  a4 = (uint32_t)(a6 + 522);
  B(d7) = (uint8_t)(0);
lbC01E80C:
  flag_z=(READ32(a5 + 874)==0); flag_n=((int32_t)READ32(a5 + 874)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01E818;
  WRITE32(a5 + 874, READ32(a5 + 874) - 1);
  if (!flag_z) goto lbC01E874;
lbC01E818:
  d0 = READ32(a5 + 946);
  if (flag_z) goto lbC01E872;
  a0 = d0;
lbC01E820:
  W(d2) = (uint16_t)(READ16_POST(a0));
  if (flag_z) goto lbC01E820;
  { int32_t _cmp=(int32_t)d2-(int32_t)0xFFFF; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)0xFFFF); }
  if (flag_z) goto lbC01E866;
  WRITE32(a5 + 946, a0);
  { int32_t _cmp=(int32_t)d2-(int32_t)0xC000; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)0xC000); }
  if (!flag_c) goto lbC01E928;
  W(d3) = (uint16_t)d2;
  W(d2) = (uint16_t)((uint32_t)(d2) >> 8);
  W(d3) &= (uint16_t)(0xFF);
  flag_z=(d2==0); flag_n=((int32_t)d2<0); flag_c=0; flag_v=0;
  if (!flag_n) goto lbC01E8E2;
  { int32_t _cmp=(int32_t)d2-(int32_t)0x80; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)0x80); }
  if (flag_z) goto lbC01E938;
  { int32_t _cmp=(int32_t)d2-(int32_t)0x81; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)0x81); }
  if (flag_z) goto lbC01E958;
  { int32_t _cmp=(int32_t)d2-(int32_t)0x82; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)0x82); }
  if (flag_z) goto lbC01E960;
  { int32_t _cmp=(int32_t)d2-(int32_t)0x83; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)0x83); }
  if (flag_z) goto lbC01E96E;
  goto lbC01E820;
lbC01E866:
  WRITE32(a5 + 946, 0);
  /* BCLR	D7,$59(A6) */
  /* BSR.L	lbC01EB42 */
lbC01E872:
  W(d6) = (uint16_t)(d6 + 1);
lbC01E874:
  a1 += 4;
  a5 += 4;
  W(a4) = (uint16_t)(a4 + 0x54);
  B(d7) = (uint8_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC01E80C;
  d0 = READ32(a6 + 14);
  WRITE32(a6 + 14, READ32(a6 + 14) + 1);
  /* CMP.L	$4A8(A6),D0 */
  /* BNE.S	lbC01E896 */
  /* BSR.L	lbC01E976 */
lbC01E896:
  d1 = READ32(a6 + 18);
  if (!flag_n) goto lbC01E8A4;
  { int32_t _cmp=(int32_t)d6-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d6<(uint32_t)4); }
  if (!flag_z) goto lbC01E8CC;
  goto lbC01E8A8;
lbC01E8A4:
  { int32_t _cmp=(int32_t)d0-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d1); }
  if (!flag_z) goto lbC01E8CC;
lbC01E8A8:
  /* TST.W	8(A6) */
  /* BMI.S	lbC01E8C0 */
  /* SUBQ.W	#1,8(A6) */
  /* BNE.S	lbC01E8C0 */
  /* ANDI.B	#$F0,$59(A6) */
  /* BSR.L	lbC01EB42 */
  /* BRA.S	lbC01E8CC */
lbC01E8C0:
  SongEnd();
  a0 = a2;
  lbC01E6E2();
  W(d6) = (uint16_t)(d6 + 1);
  goto lbC01E802;
lbC01E8CC:
  /* TST.W	8(A6) */
  /* BNE.S	lbC01E8E0 */
  /* TST.L	$4A4(A6) */
  /* BEQ.S	lbC01E8E0 */
  /* BSR.L	lbC01E976 */
  /* CLR.L	$4A4(A6) */
lbC01E8E0:
lbC01E8E2:
  if (!flag_z) goto lbC01E8F2;
  B(d0) = (uint8_t)d7;
  flag_z=(d3==0); flag_n=((int32_t)d3<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC01E8F6;
  ReleaseNote();
lbC01E8F2:
  goto lbC01E820;
lbC01E8F6:
  d1 = READ32(a5 + 858);
  if (!flag_z) goto lbC01E902;
  d1 = READ32(a2 + 6);
  if (flag_z) goto lbC01E8F2;
lbC01E902:
  a0 = d1;
  W(d1) = (uint16_t)(READ16(a2 + 4));
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 4));
  W(d1) = (uint16_t)(W(d1) - (uint16_t)(8));
  W(d1) = (uint16_t)(d1 + d2);
  W(d2) = (uint16_t)(READ16(a1 + 12));
  W(d2) = (uint16_t)(d2 + 1);
  W(d3) = (uint16_t)(d3 + d3);
  W(d3) = (uint16_t)(d3 + 1);
  d2 = (uint32_t)((uint16_t)d3 * (uint16_t)d2);
  W(d2) = (uint16_t)((uint32_t)(d2) >> 8);
  d3 = (uint32_t)(int32_t)(int8_t)(0);
  StartNote();
  goto lbC01E818;
lbC01E928:
  W(d2) &= (uint16_t)(0x3FFF);
  if (flag_z) goto lbC01E820;
  WRITE16(a5 + 876, d2);
  goto lbC01E874;
lbC01E938:
  d0 = 0;
  a3 = (uint32_t)(a2 + 42);
  B(d0) = (uint8_t)(READ8(a3 + 0));
  if (flag_z) goto lbC01E950;
  B(d0) = (uint8_t)(B(d0) - (uint8_t)(1));
  d0 = (uint32_t)((uint16_t)6 * (uint16_t)d0);
  a3 = (uint32_t)(a6 + 138);
  d0 += a3;
lbC01E950:
  WRITE32(a5 + 858, d0);
  goto lbC01E820;
lbC01E958:
  WRITE8(a1 + 13, d3);
  goto lbC01E820;
lbC01E960:
  W(d0) = (uint16_t)d3;
  WRITE16(a6 + 0, d0);
  lbC01E798();
  goto lbC01E820;
lbC01E96E:
  WRITE8(a5 + 57, d3);
  goto lbC01E820;
  /* lbC01E976	MOVEM.L	D0/D1/A0/A1,-(SP) */
  /* MOVE.L	$4A4(A6),D0 */
  /* BEQ.S	lbC01E990 */
  /* MOVEA.L	$4A0(A6),A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$144(A6)			; signal */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC01E990	MOVEM.L	(SP)+,D0/D1/A0/A1 */
  /* RTS */
}

static void lbC01E996(void) {
  /* BCLR	#1,$56(A6) */
  a1 = (uint32_t)(a6 + 522);
  d7 = (uint32_t)(int32_t)(int8_t)(0);
lbC01E9A2:
  flag_z=(READ8(a1 + 0)==0); flag_n=((int32_t)READ8(a1 + 0)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC01E9B0;
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC01E9E4;
lbC01E9B0:
  d0 = READ32(a1 + 4);
  if (flag_z) goto lbC01E9DC;
  a4 = d0;
  a4 = READ32(a4 + 0);
  /* MOVEM.L d7,a1,a6,? */
  ((void(*)(void))(uintptr_t)(12))();
  /* MOVEM.L ?,d7,a1,a6 */
  d0 = (uint32_t)(int32_t)(int8_t)(1);
  { int32_t _cmp=(int32_t)READ8(a1 + 0)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 0)<(uint32_t)1); }
  if (flag_z) goto lbC01E9DC;
  d0 = (uint32_t)(int32_t)(int8_t)(2);
  { int32_t _cmp=(int32_t)READ8(a1 + 0)-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 0)<(uint32_t)2); }
  if (!flag_z) goto lbC01E9E0;
lbC01E9DC:
  WRITE8(a1 + 1, d0);
lbC01E9E0:
  WRITE8(a1 + 0, 0);
lbC01E9E4:
  W(a1) = (uint16_t)(a1 + 0x54);
  W(d7) = (uint16_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC01E9A2;
  /* BTST	#1,$56(A6) */
  /* BEQ.S	lbC01EA0A */
  /* MOVE.W	lbW01E76E(PC),D2 */
  /* MOVEA.L	$52C(A6),A0 */
  /* MOVE.B	(A0),D0 */
  /* lbC01EA02	MOVE.B	D0,D1 */
  /* SUB.B	(A0),D1 */
  /* CMP.B	D2,D1 */
  /* BCS.S	lbC01EA02 */
lbC01EA0A:
  a2 = (uint32_t)0xDFF0A0;
  W(d7) = (uint16_t)(0);
  W(d6) = (uint16_t)(0x8000);
lbC01EA1A:
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC01EA2E;
  a4 = READ32(a1 + 4);
  a4 = READ32(a4 + 0);
  ((void(*)(void))(uintptr_t)(0x10))();
lbC01EA2E:
  W(a2) = (uint16_t)(a2 + 0x10);
  W(a1) = (uint16_t)(a1 + 0x54);
  W(d7) = (uint16_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC01EA1A;
  DMAWait();
  paula_dma_write((uint16_t)(d6));
  return;
}

static void lbC01EA46(void) {
  W(d0) = (uint16_t)(0);
  d0 = d0 | (1u << (d7 & 31));
  paula_dma_write((uint16_t)(d0));
  W(d0) = (uint16_t)d7;
  W(d0) = (uint16_t)(d0 << 4);
  a0 = (uint32_t)0xDFF0A0;
  WRITE16(a0 + 6, 2);
  /* BSET	#1,$56(A6) */
  return;
  /* lbC01EA68	MOVEM.L	D0/D7/A0,-(SP) */
  /* MOVE.B	D0,D7 */
  /* EXT.W	D7 */
  /* BSR.S	lbC01EA46 */
  /* MOVEM.L	(SP)+,D0/D7/A0 */
  /* RTS */
}

static void RampVolume(void) {
  /* MOVEM.L d1,d3,a5,? */
  W(d1) = (uint16_t)(d1 << 8);
  a5 = a6;
lbC01EA80:
  flag_z=(d2==0); flag_n=((int32_t)d2<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01EAB2;
  B(d2) = (uint8_t)((uint32_t)(d2) >> 1);
  if (!flag_c) goto lbC01EAA8;
  d3 = (uint32_t)(int32_t)(int8_t)(0);
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01EAAC;
  WRITE16(a5 + 106, d1);
  W(d3) = (uint16_t)(READ16(a5 + 90));
  W(d3) = (uint16_t)(W(d3) - W(d1));
  if (!flag_c) goto lbC01EA9C;
  W(d3) = (uint16_t)(-(int16_t)W(d3));
lbC01EA9C:
  { uint16_t q=(uint16_t)((uint32_t)d3/(uint16_t)d0); uint16_t r=(uint16_t)((uint32_t)d3%(uint16_t)d0); d3=((uint32_t)r<<16)|q; }
  flag_z=(d3==0); flag_n=((int32_t)d3<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC01EAA4;
  d3 = (uint32_t)(int32_t)(int8_t)(1);
lbC01EAA4:
  WRITE16(a5 + 122, d3);
lbC01EAA8:
  a5 += 2;
  goto lbC01EA80;
lbC01EAAC:
  WRITE16(a5 + 90, d1);
  goto lbC01EAA4;
lbC01EAB2:
  /* MOVEM.L ?,d1,d3,a5 */
  return;
}

static void lbC01EAB8(void) {
  a5 = a6;
  d7 = (uint32_t)(int32_t)(int8_t)(7);
lbC01EABC:
  W(d0) = (uint16_t)(READ16(a5 + 122));
  if (flag_z) goto lbC01EAE8;
  W(d1) = (uint16_t)(READ16(a5 + 90));
  d0 = (uint32_t)((uint16_t)READ16(a6 + 50) * (uint16_t)d0);
  d0 += d0;
  if (flag_c) goto lbC01EB0A;
  d0 = (d0 >> 16) | (d0 << 16);
  W(d3) = (uint16_t)d0;
  W(d2) = (uint16_t)(READ16(a5 + 106));
  W(d2) = (uint16_t)(W(d2) - W(d1));
  if (!flag_c) goto lbC01EADE;
  W(d3) = (uint16_t)(-(int16_t)W(d3));
  W(d2) = (uint16_t)(-(int16_t)W(d2));
lbC01EADE:
  { int32_t _cmp=(int32_t)d0-(int32_t)d2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d2); }
  if (!flag_c) goto lbC01EB0A;
  W(d1) = (uint16_t)(d1 + d3);
lbC01EAE4:
  WRITE16(a5 + 90, d1);
lbC01EAE8:
  a5 += 2;
  if ((int16_t)(--d7) >= 0) goto lbC01EABC;
  /* BTST	#0,$56(A6) */
  /* BEQ.S	lbC01EB08 */
  /* LEA	$5A(A6),A0 */
  /* MOVE.L	(A0)+,D0 */
  /* OR.L	(A0)+,D0 */
  /* BNE.S	lbC01EB08 */
  /* BSR.L	lbC01E5FE */
  /* BSR.L	lbC01EB42 */
lbC01EB08:
lbC01EB0A:
  WRITE16(a5 + 122, 0);
  W(d1) = (uint16_t)(READ16(a5 + 106));
  goto lbC01EAE4;
}

static void lbC01EB14(void) {
  d7 = (uint32_t)(int32_t)(int8_t)(0);
lbC01EB1A:
  if (flag_z) goto lbC01EB34;
  flag_z=(READ32(a1 + 28)==0); flag_n=((int32_t)READ32(a1 + 28)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC01EB34;
  B(d0) = (uint8_t)d7;
  ReleaseNote();
  ResumeTrack();
  /* BSR.L	lbC01EB42 */
lbC01EB34:
  W(a1) = (uint16_t)(a1 + 0x54);
  B(d7) = (uint8_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC01EB1A;
  return;
  /* lbC01EB42	TST.L	$26(A6) */
  /* BEQ.S	lbC01EB56 */
  /* MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVEA.L	$26(A6),A0 */
  /* JSR	(A0) */
  /* MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* lbC01EB56	RTS */
  /* lbW01EB58	dc.w	$8000 */
  /* dc.w	$78D1 */
  /* dc.w	$7209 */
  /* dc.w	$6BA2 */
  /* dc.w	$6598 */
  /* dc.w	$5FE4 */
  /* dc.w	$5A82 */
  /* dc.w	$556E */
  /* dc.w	$50A3 */
  /* dc.w	$4C1C */
  /* dc.w	$47D6 */
  /* dc.w	$43CE */
  /* dc.w	$4000 */
SyntTech:
  /* dc.w	SSTech-SyntTech */
  /* dc.w	Synthesis.MSG-SyntTech */
  /* BRA.L	lbC01EB86 */
  /* BRA.L	lbC01EBC6 */
  goto lbC01EC0E;
  goto lbC01EBE8;
  /* lbC01EB86	MOVEM.L	D0-D7/A1-A6,-(SP) */
  /* MOVE.L	D0,D3 */
  /* MOVE.L	#$1DA,D0 */
  /* MOVE.L	#$10001,D1 */
  /* BSR.L	lbC01FE82			; alloc mem */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC01EBBA */
  /* MOVE.L	D3,D0 */
  /* MOVE.L	#$1D6,D1			; file size */
  /* BSR.L	lbC01DF9E			; read file */
  /* CMP.L	D1,D0 */
  /* BNE.S	lbC01EBC0 */
  /* BSR.L	SETFILTER */
  /* TST.L	$1D6(A0) */
  /* BEQ.S	lbC01EBC0 */
  /* lbC01EBBA	MOVEM.L	(SP)+,D0-D7/A1-A6 */
  /* RTS */
  /* lbC01EBC0	BSR.S	lbC01EBC6 */
  /* SUBA.L	A0,A0 */
  /* BRA.S	lbC01EBBA */
  /* lbC01EBC6	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	$1D6(A0),D0 */
  /* BSR.L	lbC01FEB2			; free mem */
  /* TST.L	D0 */
  /* BEQ.S	lbC01EBE2 */
  /* MOVEA.L	D0,A0 */
  /* SUBQ.W	#1,$2000(A0) */
  /* BNE.S	lbC01EBE2 */
  /* BSR.L	lbC01FEB2			; free mem */
  /* lbC01EBE2	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
lbC01EBE8:
  WRITE32(a2 + 0, READ32(a1 + 12));
  WRITE16(a2 + 4, READ16(a1 + 16));
  WRITE16(a2 + 6, READ16(a1 + 24));
  /* MOVE.W	$1A(A1),8(A2)			; volume */
  WRITE32_PRE(sp, d0);
  d0 = READ32(a1 + 12);
  SetAdr();
  W(d0) = (uint16_t)(READ16(a1 + 16));
  SetLen();
  W(d0) = (uint16_t)(READ16(a1 + 24));
  SetPer();
  W(d0) = (uint16_t)(READ16(a1 + 26));
  ChangeVolume();
  d0 = READ32_POST(sp);
  flag_z=(READ8(a1 + 10)==0); flag_n=((int32_t)READ8(a1 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01EC0C;
  WRITE8(a1 + 10, 0);
  d6 = d6 | (1u << (d7 & 31));
lbC01EC0C:
lbC01EC0E:
  a3 = READ32(a1 + 4);
  a2 = (uint32_t)(a1 + 32);
  B(d0) = (uint8_t)(READ8(a1 + 0));
  if (flag_z) goto lbC01ED26;
  { int32_t _cmp=(int32_t)d0-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)1); }
  if (!flag_z) goto lbC01ED1A;
  d1 = 0;
  W(d1) = (uint16_t)(READ16(a1 + 2));
  { int32_t _cmp=(int32_t)d1-(int32_t)0x24; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)0x24); }
  if (flag_n==flag_v) goto lbC01EC48;
lbC01EC32:
  WRITE8(a1 + 0, 0);
  WRITE32(a1 + 28, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC01EFEE;
  goto lbC01ED26;
lbC01EC48:
  { int32_t _cmp=(int32_t)d1-(int32_t)0x6C; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)0x6C); }
  if (flag_n==flag_v) goto lbC01EC32;
  W(d1) = (uint16_t)(W(d1) - (uint16_t)(0x24));
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (!flag_z) goto lbC01EC5E;
  WRITE32(a2 + 12, 0);
lbC01EC5E:
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)1); }
  if (flag_z) goto lbC01EC82;
  WRITE16(a2 + 10, 0);
  flag_z = ((READ32(a1 + 10) & (1u << (0 & 31))) == 0);
  if (flag_z) goto lbC01EC82;
  WRITE16(a2 + 10, 4);
  d0 = READ32(a3 + 458);
  W(d0) = (uint16_t)(0);
  WRITE32(a2 + 12, d0);
lbC01EC82:
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)12); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)12); d1=((uint32_t)r<<16)|q; }
  W(d2) = (uint16_t)d1;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)(d1 << 1);
  a0 = (uint32_t)(uintptr_t)&lbW01EB58;
  W(d0) = (uint16_t)(0xD5C8);
  d0 = (uint32_t)((uint16_t)READ16(a0 + 0) * (uint16_t)d0);
  W(d2) = (uint16_t)(d2 + 0x11);
  d0 >>= d2;
  flag_z=(READ16(a2 + 0)==0); flag_n=((int32_t)READ16(a2 + 0)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC01ECAA;
  WRITE16(a2 + 2, 0);
  goto lbC01ECD2;
lbC01ECAA:
  W(d1) = (uint16_t)d0;
  W(d1) = (uint16_t)(W(d1) - READ16(a2 + 0));
  d1 = (uint32_t)(int32_t)(int16_t)d1;
  W(d2) = (uint16_t)(READ16(a3 + 434));
  d2 = (d2 >> 16) | (d2 << 16);
  W(d2) = (uint16_t)(0);
  d2 >>= 1;
  { uint16_t q=(uint16_t)((uint32_t)d2/(uint16_t)READ16(a6 + 50)); uint16_t r=(uint16_t)((uint32_t)d2%(uint16_t)READ16(a6 + 50)); d2=((uint32_t)r<<16)|q; }
  W(d2) = (uint16_t)((uint32_t)(d2) >> 3);
  W(d2) = (uint16_t)(d2 + 1);
  WRITE16(a2 + 2, d2);
  { int16_t q=(int16_t)((int32_t)d1/(int16_t)d2); int16_t r=(int16_t)((int32_t)d1%(int16_t)d2); d1=((uint32_t)(uint16_t)r<<16)|(uint16_t)q; }
  WRITE16(a2 + 4, d1);
  d1 = (uint32_t)((uint16_t)d2 * (uint16_t)d1);
  W(d0) = (uint16_t)(W(d0) - W(d1));
lbC01ECD2:
  WRITE16(a2 + 0, d0);
  WRITE16(a2 + 24, 1);
  flag_z=(READ16(a3 + 450)==0); flag_n=((int32_t)READ16(a3 + 450)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC01ECE6;
  WRITE16(a2 + 22, 0);
lbC01ECE6:
  WRITE16(a2 + 18, 0);
  flag_z=(READ16(a3 + 446)==0); flag_n=((int32_t)READ16(a3 + 446)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01ED12;
  WRITE16(a2 + 16, 0);
  W(d0) = (uint16_t)(READ16(a3 + 448));
  d0 = (d0 >> 16) | (d0 << 16);
  W(d0) = (uint16_t)(0);
  d0 >>= 1;
  { uint16_t q=(uint16_t)((uint32_t)d0/(uint16_t)READ16(a6 + 50)); uint16_t r=(uint16_t)((uint32_t)d0%(uint16_t)READ16(a6 + 50)); d0=((uint32_t)r<<16)|q; }
  W(d0) = (uint16_t)((uint32_t)(d0) >> 2);
  WRITE16(a2 + 18, d0);
  B(d0) = (uint8_t)(READ8(a3 + 164));
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  WRITE16(a2 + 20, d0);
lbC01ED12:
  WRITE8(a1 + 10, 0xFF);
  goto lbC01ED26;
lbC01ED1A:
  { int32_t _cmp=(int32_t)d0-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)2); }
  if (!flag_z) goto lbC01ED26;
  WRITE16(a2 + 10, 6);
lbC01ED26:
  flag_z=(READ16(a2 + 18)==0); flag_n=((int32_t)READ16(a2 + 18)<0); flag_c=0; flag_v=0;
  if (flag_n) goto lbC01ED76;
  if (flag_z) goto lbC01ED34;
  WRITE16(a2 + 18, READ16(a2 + 18) - 1);
  goto lbC01ED76;
lbC01ED34:
  W(d0) = (uint16_t)(READ16(a2 + 16));
  W(d1) = (uint16_t)(READ16(a3 + 444));
  d1 = (uint32_t)((uint16_t)READ16(a6 + 50) * (uint16_t)d1);
  d1 = d1 << 6;
  d1 = (d1 >> 16) | (d1 << 16);
  flag_z=(READ16(a3 + 446)==0); flag_n=((int32_t)READ16(a3 + 446)<0); flag_c=0; flag_v=0;
  if (flag_z||(flag_n!=flag_v)) goto lbC01ED60;
  W(d0) = (uint16_t)(d0 + d1);
  if (flag_c) goto lbC01ED54;
  { int32_t _cmp=(int32_t)d0-(int32_t)0xFE00; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0xFE00); }
  if (flag_c) goto lbC01ED62;
lbC01ED54:
  WRITE16(a2 + 18, 0xFFFF);
  W(d0) = (uint16_t)(0xFE00);
  goto lbC01ED62;
lbC01ED60:
  W(d0) = (uint16_t)(d0 + d1);
lbC01ED62:
  WRITE16(a2 + 16, d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  a0 = (uint32_t)(a3 + 164);
  B(d0) = (uint8_t)(READ8(a0 + 0));
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  WRITE16(a2 + 20, d0);
lbC01ED76:
  W(d0) = (uint16_t)(READ16(a2 + 10));
  a0 = (uint32_t)(a3 + 0);
  d1 = 0;
  W(d1) = (uint16_t)(READ16(a0 + 454));
  d1 = (d1 >> 16) | (d1 << 16);
  d2 = READ32(a2 + 12);
  d3 = 0;
  W(d3) = (uint16_t)(READ16(a0 + 462));
  W(d0) = (uint16_t)d3;
  W(d0) = (uint16_t)((uint32_t)(d0) >> 5);
  W(d0) ^= (uint16_t)(7);
  W(d3) &= (uint16_t)(0x1F);
  W(d3) = (uint16_t)(d3 + 0x21);
  d3 = (uint32_t)((uint16_t)READ16(a6 + 50) * (uint16_t)d3);
  d3 = d3 << 3;
  d3 >>= d0;
  d0 = d1;
  d0 -= d2;
  if (!flag_n) goto lbC01EDB0;
  d0 = (uint32_t)(-(int32_t)d0);
lbC01EDB0:
  { int32_t _cmp=(int32_t)d0-(int32_t)d3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d3); }
  if (!flag_z && (flag_n==flag_v)) goto lbC01EDC8;
  d2 = d1;
  { int32_t _cmp=(int32_t)READ16(a2 + 10)-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a2 + 10)<(uint32_t)4); }
  if (flag_n!=flag_v) goto lbC01EDC0;
  goto lbC01EDD2;
lbC01EDC0:
  WRITE16(a2 + 10, READ16(a2 + 10) + 2);
  goto lbC01EDD2;
lbC01EDC8:
  { int32_t _cmp=(int32_t)d2-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)d1); }
  if (flag_n!=flag_v) goto lbC01EDD0;
  d2 -= d3;
  goto lbC01EDD2;
lbC01EDD0:
  d2 += d3;
lbC01EDD2:
  WRITE32(a2 + 12, d2);
  if (!flag_z) goto lbC01EDDC;
  WRITE32(a1 + 28, 0);
lbC01EDDC:
  W(d0) = (uint16_t)(READ16(a2 + 0));
  d2 = (uint32_t)(int32_t)(int8_t)(5);
  flag_z=(READ16(a2 + 2)==0); flag_n=((int32_t)READ16(a2 + 2)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01EDF4;
  WRITE16(a2 + 2, READ16(a2 + 2) - 1);
  W(d0) = (uint16_t)(d0 + READ16(a2 + 4));
  WRITE16(a2 + 0, d0);
lbC01EDF4:
  { int32_t _cmp=(int32_t)d0-(int32_t)0x1AC; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x1AC); }
  if (flag_z||(flag_n!=flag_v)) goto lbC01EE00;
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(1));
  goto lbC01EDF4;
lbC01EE00:
  WRITE16(a2 + 8, d2);
  d1 = (uint32_t)(int32_t)(int8_t)(0x40);
  W(d1) = (uint16_t)((uint32_t)(d1) >> d2);
  WRITE16(a1 + 16, d1);
  W(d1) = (uint16_t)(READ16(a2 + 20));
  W(d2) = (uint16_t)(READ16(a3 + 436));
  d1 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d1);
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 7));
  W(d2) = (uint16_t)(READ16(a6 + 2));
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(0x80));
  W(d1) = (uint16_t)(W(d1) - W(d2));
  W(d1) = (uint16_t)(d1 + 0x1000);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(12);
  d0 >>= d1;
  lbC01E328();
  WRITE16(a1 + 24, d0);
  W(d0) = (uint16_t)(READ16(a3 + 428));
  W(d2) = (uint16_t)(READ16(a3 + 432));
  if (flag_z) goto lbC01EE4A;
  W(d1) = (uint16_t)(READ16(a2 + 20));
  W(d1) = (uint16_t)(-(int16_t)W(d1));
  d1 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d1);
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 8));
  W(d0) = (uint16_t)(d0 + d1);
lbC01EE4A:
  flag_z=(READ16(a3 + 430)==0); flag_n=((int32_t)READ16(a3 + 430)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01EE5C;
  d1 = READ32(a2 + 12);
  d1 = (d1 >> 16) | (d1 << 16);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  goto lbC01EE66;
lbC01EE5C:
  { int32_t _cmp=(int32_t)READ16(a2 + 10)-(int32_t)6; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a2 + 10)<(uint32_t)6); }
  if (!flag_z) goto lbC01EE66;
  W(d0) = (uint16_t)(0);
lbC01EE66:
  W(d0) &= (uint16_t)(0xFF);
  W(d0) = (uint16_t)(d0 + 1);
  W(d1) = (uint16_t)d0;
  lbC01E308();
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  W(d0) = (uint16_t)(d0 + 1);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 2);
  WRITE16(a1 + 26, d0);
  W(d0) = (uint16_t)(READ16(a3 + 440));
  d1 = READ32(a2 + 12);
  d1 = (d1 >> 16) | (d1 << 16);
  d1 = (uint32_t)((uint16_t)d0 * (uint16_t)d1);
  W(d1) = (uint16_t)((uint32_t)(d1) >> 8);
  W(d0) = (uint16_t)(READ16(a3 + 438));
  W(d0) ^= (uint16_t)(0xFF);
  W(d0) = (uint16_t)(W(d0) - W(d1));
  W(d1) = (uint16_t)(READ16(a2 + 20));
  W(d2) = (uint16_t)(READ16(a3 + 442));
  d1 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d1);
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 8));
  W(d0) = (uint16_t)(d0 + d1);
  W(d0) &= (uint16_t)(0xFF);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 2);
  W(d0) = (uint16_t)(d0 << 7);
  /* MOVEA.L	$1D6(A3),A0			; here filter pointer */
  a0 = READ32(a3 + -4);
  d1 = a0;
  if (!flag_z) goto lbC01EEBA;
  a0 = (uint32_t)(a3 + 36);
  W(d0) = (uint16_t)(0);
lbC01EEBA:
  W(a0) = (uint16_t)(a0 + d0);
  W(d0) = (uint16_t)(READ16(a2 + 6));
  W(d0) ^= (uint16_t)(0x80);
  WRITE16(a2 + 6, d0);
  a4 = READ32(a6 + 994);
  a4 = (uint32_t)(a4 + 0);
  W(d0) = (uint16_t)d7;
  W(d0) = (uint16_t)(d0 << 8);
  W(a4) = (uint16_t)(a4 + d0);
  WRITE32(a1 + 12, a4);
  flag_z=(READ16(a3 + 450)==0); flag_n=((int32_t)READ16(a3 + 450)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC01EEFA;
  W(d3) = (uint16_t)(READ16(a2 + 8));
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  d1 = d1 | (1u << (d3 & 31));
  W(d4) = (uint16_t)(0x80);
  W(d4) = (uint16_t)((uint32_t)(d4) >> d3);
lbC01EEEE:
  WRITE8_POST(a4, READ8(a0));
  W(a0) = (uint16_t)(a0 + d1);
  W(d4) = (uint16_t)(W(d4) - (uint16_t)(1));
  if (!flag_z) goto lbC01EEEE;
  goto lbC01EFEE;
lbC01EEFA:
  flag_z=(READ16(a3 + 452)==0); flag_n=((int32_t)READ16(a3 + 452)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC01EF6C;
  W(d3) = (uint16_t)(READ16(a2 + 8));
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  d1 = d1 | (1u << (d3 & 31));
  W(d2) = (uint16_t)(READ16(a1 + 16));
  W(d2) = (uint16_t)(d2 << 1);
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(1));
  W(d4) = (uint16_t)(READ16(a3 + 450));
  d4 = (uint32_t)((uint16_t)READ16(a6 + 50) * (uint16_t)d4);
  d0 = (uint32_t)(int32_t)(int8_t)(13);
  d4 >>= d0;
  W(d4) = (uint16_t)(d4 + READ16(a2 + 22));
  WRITE16(a2 + 22, d4);
  d0 = (uint32_t)(int32_t)(int8_t)(9);
  W(d4) = (uint16_t)((uint32_t)(d4) >> d0);
  a5 = (uint32_t)(a0 + 0);
  W(d4) = (uint16_t)((uint32_t)(d4) >> d3);
  W(d2) = (uint16_t)(W(d2) - W(d4));
lbC01EF32:
  B(d0) = (uint8_t)(READ8(a0));
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  B(d3) = (uint8_t)(READ8(a5));
  d3 = (uint32_t)(int32_t)(int16_t)(int8_t)d3;
  W(d0) = (uint16_t)(d0 + d3);
  W(d0) = (uint16_t)((uint32_t)((int32_t)d0 >> 1));
  WRITE8_POST(a4, d0);
  W(a0) = (uint16_t)(a0 + d1);
  W(a5) = (uint16_t)(a5 + d1);
  if ((int16_t)(--d2) >= 0) goto lbC01EF32;
  W(a5) = (uint16_t)(W(a5) - (uint16_t)(0x80));
  W(d4) = (uint16_t)(W(d4) - (uint16_t)(1));
  if (flag_n) goto lbC01EFEE;
lbC01EF52:
  B(d0) = (uint8_t)(READ8(a0));
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  B(d3) = (uint8_t)(READ8(a5));
  d3 = (uint32_t)(int32_t)(int16_t)(int8_t)d3;
  W(d0) = (uint16_t)(d0 + d3);
  W(d0) = (uint16_t)((uint32_t)((int32_t)d0 >> 1));
  WRITE8_POST(a4, d0);
  W(a0) = (uint16_t)(a0 + d1);
  W(a5) = (uint16_t)(a5 + d1);
  if ((int16_t)(--d4) >= 0) goto lbC01EF52;
  goto lbC01EFEE;
lbC01EF6C:
  W(d0) = (uint16_t)(READ16(a3 + 450));
  d0 = (uint32_t)((uint16_t)READ16(a6 + 50) * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(11);
  d0 >>= d1;
  d0 = (uint32_t)((int32_t)(int16_t)READ16(a2 + 24) * (int32_t)(int16_t)d0);
  W(d0) = (uint16_t)(d0 + READ16(a2 + 22));
  if (!flag_v) goto lbC01EF92;
  { int32_t _cmp=(int32_t)d0-(int32_t)0x8000; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x8000); }
  if (!flag_z) goto lbC01EF8C;
  W(d0) = (uint16_t)(d0 + READ16(a2 + 24));
lbC01EF8C:
  W(READ16(a2 + 24)) = (uint16_t)(-(int16_t)W(READ16(a2 + 24)));
  W(d0) = (uint16_t)(-(int16_t)W(d0));
lbC01EF92:
  WRITE16(a2 + 22, d0);
  W(d1) = (uint16_t)(READ16(a3 + 452));
  d0 = (uint32_t)((int32_t)(int16_t)d1 * (int32_t)(int16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(0x11);
  W(d1) = (uint16_t)(d1 + READ16(a2 + 8));
  d0 = (uint32_t)((int32_t)d0 >> d1);
  W(d2) = (uint16_t)(READ16(a1 + 16));
  W(d3) = (uint16_t)d2;
  W(d2) = (uint16_t)(d2 + d0);
  W(d3) = (uint16_t)(W(d3) - W(d0));
  W(d6) = (uint16_t)d2;
  if (flag_z) goto lbC01EFCE;
  W(d0) = (uint16_t)(0);
  W(d1) = (uint16_t)(0);
  d4 = (uint32_t)(int32_t)(int8_t)(0x40);
  { uint16_t q=(uint16_t)((uint32_t)d4/(uint16_t)d2); uint16_t r=(uint16_t)((uint32_t)d4%(uint16_t)d2); d4=((uint32_t)r<<16)|q; }
  W(d5) = (uint16_t)d4;
  d4 = (d4 >> 16) | (d4 << 16);
lbC01EFBE:
  WRITE8_POST(a4, READ8(a0 + 0));
  W(d1) = (uint16_t)(W(d1) - W(d4));
  if (!flag_c) goto lbC01EFC8;
  W(d1) = (uint16_t)(d1 + d2);
lbC01EFC8:
  W(d0) = (uint16_t)(d0 + d5 + flag_x);
  W(d6) = (uint16_t)(W(d6) - (uint16_t)(1));
  if (!flag_z) goto lbC01EFBE;
lbC01EFCE:
  W(d6) = (uint16_t)d3;
  if (flag_z) goto lbC01EFEE;
  d0 = (uint32_t)(int32_t)(int8_t)(0x40);
  W(d1) = (uint16_t)(0);
  d4 = (uint32_t)(int32_t)(int8_t)(0x40);
  { uint16_t q=(uint16_t)((uint32_t)d4/(uint16_t)d3); uint16_t r=(uint16_t)((uint32_t)d4%(uint16_t)d3); d4=((uint32_t)r<<16)|q; }
  W(d5) = (uint16_t)d4;
  d4 = (d4 >> 16) | (d4 << 16);
lbC01EFDE:
  WRITE8_POST(a4, READ8(a0 + 0));
  W(d1) = (uint16_t)(W(d1) - W(d4));
  if (!flag_c) goto lbC01EFE8;
  W(d1) = (uint16_t)(d1 + d3);
lbC01EFE8:
  W(d0) = (uint16_t)(d0 + d5 + flag_x);
  W(d6) = (uint16_t)(W(d6) - (uint16_t)(1));
  if (!flag_z) goto lbC01EFDE;
lbC01EFEE:
}

static void SetFilter(void) {
  /* MOVEM.L d0,d7,a0,a6,? */
  /* MOVEA.L	A0,A1 */
  /* LEA	$8A(A6),A5 */
  /* MOVEQ	#$3F,D7 */
  /* lbC01EFFC	MOVE.L	0(A5),D0 */
  /* BEQ.S	lbC01F050 */
  /* MOVEA.L	D0,A0 */
  /* CMPA.L	A1,A0 */
  /* BEQ.S	lbC01F050 */
  /* LEA	SYNTTECH(PC),A3 */
  /* CMPA.L	0(A0),A3 */
  /* BNE.S	lbC01F050 */
  /* TST.L	$1D6(A0) */
  /* BEQ.S	lbC01F050 */
  /* LEA	$24(A0),A3 */
  /* LEA	$24(A1),A4 */
  /* MOVEQ	#$1F,D6 */
  /* lbC01F022	MOVE.L	(A3)+,D0 */
  /* CMP.L	(A4)+,D0 */
  /* BNE.S	lbC01F050 */
  /* DBRA	D6,lbC01F022 */
  /* MOVEA.L	A0,A2 */
  /* MOVE.L	$1D6(A1),D0 */
  /* BEQ.S	lbC01F040 */
  /* MOVEA.L	D0,A0 */
  /* SUBQ.W	#1,$2000(A0) */
  /* BNE.S	lbC01F040 */
  /* BSR.L	lbC01FEB2			; free mem */
  /* lbC01F040	MOVEA.L	$1D6(A2),A0 */
  /* MOVE.L	A0,$1D6(A1) */
  /* ADDQ.W	#1,$2000(A0) */
  /* BRA.L	lbC01F0EE */
  /* lbC01F050	ADDQ.L	#6,A5 */
  /* DBRA	D7,lbC01EFFC */
  /* MOVE.L	$1D6(A1),D2 */
  /* BEQ.S	lbC01F066 */
  /* MOVEA.L	D2,A2 */
  /* CMPI.W	#1,$2000(A2) */
  /* BEQ.S	lbC01F08C */
  /* lbC01F066	MOVE.L	#$2002,D0 */
  /* MOVE.L	#1,D1 */
  /* BSR.L	lbC01FE82			; alloc mem */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC01F08C */
  /* TST.L	D2 */
  /* BEQ.S	lbC01F082 */
  /* SUBQ.W	#1,$2000(A2) */
  /* lbC01F082	MOVE.L	A0,$1D6(A1) */
  /* MOVE.W	#1,$2000(A0) */
  /* lbC01F08C	MOVEA.L	A1,A2 */
  /* MOVE.L	$1D6(A2),D0 */
  /* BEQ.L	lbC01F0EE */
  /* MOVEA.L	D0,A1 */
  /* LEA	$24(A2),A0 */
}

static void OneFilter(void) {
  a2 = (uint32_t)(uintptr_t)&lbW01F0FE;
  W(d3) = (uint16_t)(0);
  B(d4) = (uint8_t)(READ8(a0 + 127));
  d4 = (uint32_t)(int32_t)(int16_t)(int8_t)d4;
  W(d4) = (uint16_t)(d4 << 7);
  W(d0) = (uint16_t)(0);
lbC01F0AC:
  W(d1) = (uint16_t)(READ16_POST(a2));
  W(d2) = (uint16_t)(0x8000);
  W(d2) = (uint16_t)(W(d2) - W(d1));
  d2 = (uint32_t)((uint16_t)0xE666 * (uint16_t)d2);
  d2 = (d2 >> 16) | (d2 << 16);
  W(d1) = (uint16_t)((uint32_t)(d1) >> 1);
  W(d5) = (uint16_t)(0);
lbC01F0BE:
  B(d6) = (uint8_t)(READ8(a0 + 0));
  d6 = (uint32_t)(int32_t)(int16_t)(int8_t)d6;
  W(d6) = (uint16_t)(d6 << 7);
  W(d6) = (uint16_t)(W(d6) - W(d4));
  d6 = (uint32_t)((int32_t)(int16_t)d1 * (int32_t)(int16_t)d6);
  d6 = d6 << 2;
  d6 = (d6 >> 16) | (d6 << 16);
  W(d3) = (uint16_t)(d3 + d6);
  W(d4) = (uint16_t)(d4 + d3);
  W(d4) = (uint16_t)(ROR32(d4, 7));
  WRITE8_POST(a1, d4);
  W(d4) = (uint16_t)(ROL32(d4, 7));
  d3 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d3);
  d3 = d3 << 1;
  d3 = (d3 >> 16) | (d3 << 16);
  W(d5) = (uint16_t)(d5 + 1);
  { int32_t _cmp=(int32_t)d5-(int32_t)0x80; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d5<(uint32_t)0x80); }
  if (flag_c) goto lbC01F0BE;
  W(d0) = (uint16_t)(d0 + 1);
  { int32_t _cmp=(int32_t)d0-(int32_t)0x40; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x40); }
  if (!flag_z) goto lbC01F0AC;
lbC01F0EE:
  /* MOVEM.L ?,d0,d7,a0,a6 */
  return;
  /* Synthesis.MSG	dc.b	'Synthesis',0 */
}
static const uint16_t lbW01F0FE[] = { 0x8000 };
static const uint16_t _data_2906[] = { 0x7683 };
static const uint16_t _data_2907[] = { 0x6dba };
static const uint16_t _data_2908[] = { 0x6597 };
static const uint16_t _data_2909[] = { 0x5e10 };
static const uint16_t _data_2910[] = { 0x5717 };
static const uint16_t _data_2911[] = { 0x50a2 };
static const uint16_t _data_2912[] = { 0x4aa8 };
static const uint16_t _data_2913[] = { 0x451f };
static const uint16_t _data_2914[] = { 0x4000 };
static const uint16_t _data_2915[] = { 0x3b41 };
static const uint16_t _data_2916[] = { 0x36dd };
static const uint16_t _data_2917[] = { 0x32cb };
static const uint16_t _data_2918[] = { 0x2f08 };
static const uint16_t _data_2919[] = { 0x2b8b };
static const uint16_t _data_2920[] = { 0x2851 };
static const uint16_t _data_2921[] = { 0x2554 };
static const uint16_t _data_2922[] = { 0x228f };
static const uint16_t _data_2923[] = { 0x2000 };
static const uint16_t _data_2924[] = { 0x1da0 };
static const uint16_t _data_2925[] = { 0x1b6e };
static const uint16_t _data_2926[] = { 0x1965 };
static const uint16_t _data_2927[] = { 0x1784 };
static const uint16_t _data_2928[] = { 0x15c5 };
static const uint16_t _data_2929[] = { 0x1428 };
static const uint16_t _data_2930[] = { 0x12aa };
static const uint16_t _data_2931[] = { 0x1147 };
static const uint16_t _data_2932[] = { 0x1000 };
static const uint16_t _data_2933[] = { 0xed0 };
static const uint16_t _data_2934[] = { 0xdb7 };
static const uint16_t _data_2935[] = { 0xcb2 };
static const uint16_t _data_2936[] = { 0xbc2 };
static const uint16_t _data_2937[] = { 0xae2 };
static const uint16_t _data_2938[] = { 0xa14 };
static const uint16_t _data_2939[] = { 0x955 };
static const uint16_t _data_2940[] = { 0x8a3 };
static const uint16_t _data_2941[] = { 0x800 };
static const uint16_t _data_2942[] = { 0x768 };
static const uint16_t _data_2943[] = { 0x6db };
static const uint16_t _data_2944[] = { 0x659 };
static const uint16_t _data_2945[] = { 0x5e1 };
static const uint16_t _data_2946[] = { 0x571 };
static const uint16_t _data_2947[] = { 0x50a };
static const uint16_t _data_2948[] = { 0x4aa };
static const uint16_t _data_2949[] = { 0x451 };
static const uint16_t _data_2950[] = { 0x400 };
static const uint16_t _data_2951[] = { 0x3b4 };
static const uint16_t _data_2952[] = { 0x36d };
static const uint16_t _data_2953[] = { 0x32c };
static const uint16_t _data_2954[] = { 0x2f0 };
static const uint16_t _data_2955[] = { 0x2b8 };
static const uint16_t _data_2956[] = { 0x285 };
static const uint16_t _data_2957[] = { 0x255 };
static const uint16_t _data_2958[] = { 0x228 };
static const uint16_t _data_2959[] = { 0x200 };
static const uint16_t _data_2960[] = { 0x1da };
static const uint16_t _data_2961[] = { 0x1b6 };
static const uint16_t _data_2962[] = { 0x196 };
static const uint16_t _data_2963[] = { 0x178 };
static const uint16_t _data_2964[] = { 0x15c };
static const uint16_t _data_2965[] = { 0x142 };
static const uint16_t _data_2966[] = { 0x12a };
static const uint16_t _data_2967[] = { 0x114 };
static const uint16_t _data_2968[] = { 0x100 };

static void SSTech(void) {
  /* dc.w	IFFTech-SSTech */
  /* dc.w	SampledSound.MSG-SSTech */
  /* BRA.L	lbC01F192 */
  /* BRA.L	lbC01F252 */
  goto lbC01F276;
  lbC01E286(); return;
  /* lbC01F192	MOVEM.L	D1-D7/A1-A6,-(SP) */
  /* MOVE.L	D0,D2 */
  /* MOVEA.L	A0,A4 */
  /* MOVEQ	#$60,D0 */
  /* MOVE.L	#$10001,D1 */
  /* BSR.L	lbC01FE82			; alloc mem */
  /* MOVE.L	A0,D0 */
  /* BEQ.L	lbC01F242 */
  /* MOVEA.L	A0,A3 */
  /* MOVE.L	D2,D0 */
  /* MOVEQ	#$60,D1 */
  /* BSR.L	lbC01DF9E			; read file */
  /* CLR.L	$44(A3) */
  /* CMP.L	D1,D0 */
  /* BNE.L	lbC01F24A */
  /* MOVE.L	D2,D0 */
  /* BSR.L	lbC01DF76			; close file */
  /* CLR.L	D2 */
  /* LEA	$24(A3),A0 */
  /* LEA	$8A(A6),A5 */
  /* MOVEQ	#$3F,D7 */
  /* lbC01F1D2	MOVE.L	0(A5),D0 */
  /* BEQ.S	lbC01F202 */
  /* MOVEA.L	D0,A1 */
  /* LEA	SSTECH(PC),A2 */
  /* CMPA.L	0(A1),A2 */
  /* BNE.S	lbC01F202 */
  /* LEA	$24(A1),A2 */
  /* MOVE.L	A0,-(SP) */
  /* MOVE.L	A2,-(SP) */
  /* BSR.L	lbC01FE44			; compare string */
  /* ADDQ.L	#8,SP */
  /* BNE.S	lbC01F202 */
  /* MOVEA.L	$44(A1),A2 */
  /* MOVE.L	A2,$44(A3) */
  /* ADDQ.W	#1,$1E(A2) */
  /* BRA.S	lbC01F240 */
  /* lbC01F202	ADDQ.L	#6,A5 */
  /* DBRA	D7,lbC01F1D2 */
  /* MOVEA.L	A0,A1 */
  /* MOVEA.L	A4,A0 */
  /* LEA	ss.MSG(PC),A2 */
  /* BSR.L	lbC01DF04			; copy string */
  /* MOVE.L	#3,D0 */
  /* BSR.L	lbC01FEDE			; get size + read */
  /* MOVE.L	A0,D1 */
  /* BNE.S	lbC01F236 */
  /* BSR.L	lbC01DF04			; copy string */
  /* BSR.L	lbC01FEDE			; get size + read */
  /* MOVE.L	A0,D1 */
  /* BNE.S	lbC01F236 */
  /* BSET	#6,$56(A6) */
  /* BRA.S	lbC01F24A */
  /* lbC01F236	MOVE.L	A0,$44(A3) */
  /* MOVE.W	#1,$1E(A0) */
  /* lbC01F240	MOVEA.L	A3,A0 */
  /* lbC01F242	MOVE.L	D2,D0 */
  /* MOVEM.L	(SP)+,D1-D7/A1-A6 */
  /* RTS */
  /* lbC01F24A	MOVEA.L	A3,A0 */
  /* BSR.S	lbC01F252 */
  /* SUBA.L	A0,A0 */
  /* BRA.S	lbC01F242 */
  /* lbC01F252	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVEA.L	A0,A1 */
  /* MOVE.L	$44(A1),D0 */
  /* BEQ.S	lbC01F26A */
  /* MOVEA.L	D0,A0 */
  /* SUBQ.W	#1,$1E(A0) */
  /* BNE.S	lbC01F26A */
  /* BSR.L	lbC01FEB2			; free mem */
  /* lbC01F26A	MOVEA.L	A1,A0 */
  /* BSR.L	lbC01FEB2			; free mem */
  /* MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
lbC01F276:
  a3 = READ32(a1 + 4);
  a2 = (uint32_t)(a1 + 58);
  B(d0) = (uint8_t)(READ8(a1 + 0));
  if (flag_z) goto lbC01F368;
  { int32_t _cmp=(int32_t)d0-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)1); }
  if (!flag_z) goto lbC01F35C;
  a5 = READ32(a3 + 68);
  d1 = 0;
  W(d1) = (uint16_t)(READ16(a1 + 2));
  { int32_t _cmp=(int32_t)d1-(int32_t)0x80; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)0x80); }
  if (flag_c) goto lbC01F2AC;
  d0 = 0x369E990;
  { uint16_t q=(uint16_t)((uint32_t)d0/(uint16_t)d1); uint16_t r=(uint16_t)((uint32_t)d0%(uint16_t)d1); d0=((uint32_t)r<<16)|q; }
  B(d2) = (uint8_t)(READ8(a5 + 5));
  goto lbC01F2EE;
lbC01F2AC:
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)12); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)12); d1=((uint32_t)r<<16)|q; }
  W(d2) = (uint16_t)d1;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(10));
  W(d2) = (uint16_t)(-(int16_t)W(d2));
  { int32_t _cmp=(int32_t)d2-(int32_t)READ8(a5 + 5); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)READ8(a5 + 5)); }
  if (flag_z||(flag_n!=flag_v)) goto lbC01F2D6;
lbC01F2C0:
  WRITE8(a1 + 0, 0);
  WRITE32(a1 + 28, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC01F460;
  goto lbC01F368;
lbC01F2D6:
  { int32_t _cmp=(int32_t)d2-(int32_t)READ8(a5 + 4); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)READ8(a5 + 4)); }
  if (flag_n!=flag_v) goto lbC01F2C0;
  W(d1) = (uint16_t)(d1 << 1);
  a0 = (uint32_t)(uintptr_t)&lbW01EB58;
  W(d0) = (uint16_t)(0x1AB9);
  d0 = (uint32_t)((uint16_t)READ16(a0 + 0) * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(15);
  d0 >>= d1;
lbC01F2EE:
  WRITE16(a2 + 0, d0);
  d0 = (uint32_t)(int32_t)(int8_t)(0);
  d0 = d0 | (1u << (d2 & 31));
  B(d3) = (uint8_t)(READ8(a5 + 4));
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  d1 = d1 | (1u << (d3 & 31));
  d0 -= d1;
  d0 = (uint32_t)((uint16_t)READ16(a5 + 0) * (uint16_t)d0);
  a0 = (uint32_t)(a5 + 62);
  d0 = (uint32_t)(int32_t)(int8_t)(0);
  W(d0) = (uint16_t)(READ16(a5 + 2));
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  W(d1) = (uint16_t)(READ16(a5 + 0));
  W(d1) = (uint16_t)(W(d1) - W(d0));
  d0 = d0 << d2;
  d1 = d1 << d2;
  lbC01E2C0();
  WRITE32(a2 + 4, 0);
  WRITE16(a2 + 2, 0);
  flag_z = ((READ32(a1 + 10) & (1u << (0 & 31))) == 0);
  if (flag_z) goto lbC01F33E;
  WRITE16(a2 + 2, 4);
  d0 = READ32(a3 + 78);
  W(d0) = (uint16_t)(0);
  WRITE32(a2 + 4, d0);
lbC01F33E:
  WRITE16(a2 + 8, 0);
  W(d0) = (uint16_t)(READ16(a3 + 94));
  d0 = (d0 >> 16) | (d0 << 16);
  W(d0) = (uint16_t)(0);
  d0 >>= 1;
  { uint16_t q=(uint16_t)((uint32_t)d0/(uint16_t)READ16(a6 + 50)); uint16_t r=(uint16_t)((uint32_t)d0%(uint16_t)READ16(a6 + 50)); d0=((uint32_t)r<<16)|q; }
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  WRITE16(a2 + 10, d0);
  lbC01EA46();
  goto lbC01F368;
lbC01F35C:
  { int32_t _cmp=(int32_t)d0-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)2); }
  if (!flag_z) goto lbC01F368;
  WRITE16(a2 + 2, 6);
lbC01F368:
  flag_z=(READ16(a2 + 10)==0); flag_n=((int32_t)READ16(a2 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01F376;
  WRITE16(a2 + 10, READ16(a2 + 10) - 1);
  goto lbC01F390;
lbC01F376:
  W(d0) = (uint16_t)(READ16(a2 + 8));
  W(d1) = (uint16_t)(READ16(a3 + 92));
  d1 = (uint32_t)((uint16_t)READ16(a6 + 50) * (uint16_t)d1);
  d1 = d1 << 7;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)(d1 + 0x40);
  W(d0) = (uint16_t)(d0 + d1);
  WRITE16(a2 + 8, d0);
lbC01F390:
  W(d0) = (uint16_t)(READ16(a2 + 8));
  W(d0) = (uint16_t)((uint32_t)(d0) >> 7);
  W(d0) = (uint16_t)(d0 + 0x80);
  flag_z = ((d0 & (1u << (8 & 31))) == 0);
  if (flag_z) goto lbC01F3A4;
  W(d0) ^= (uint16_t)(0xFF);
lbC01F3A4:
  W(d0) ^= (uint16_t)(0x80);
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  W(d0) = (uint16_t)(-(int16_t)W(d0));
  WRITE16(a2 + 12, d0);
  W(d0) = (uint16_t)(READ16(a2 + 2));
  a0 = (uint32_t)(a3 + 0);
  d1 = 0;
  W(d1) = (uint16_t)(READ16(a0 + 74));
  d1 = (d1 >> 16) | (d1 << 16);
  d2 = READ32(a2 + 4);
  d3 = 0;
  W(d3) = (uint16_t)(READ16(a0 + 82));
  W(d0) = (uint16_t)d3;
  W(d0) = (uint16_t)((uint32_t)(d0) >> 5);
  W(d0) ^= (uint16_t)(7);
  W(d3) &= (uint16_t)(0x1F);
  W(d3) = (uint16_t)(d3 + 0x21);
  d3 = (uint32_t)((uint16_t)READ16(a6 + 50) * (uint16_t)d3);
  d3 = d3 << 3;
  d3 >>= d0;
  d0 = d1;
  d0 -= d2;
  if (!flag_n) goto lbC01F3EA;
  d0 = (uint32_t)(-(int32_t)d0);
lbC01F3EA:
  { int32_t _cmp=(int32_t)d0-(int32_t)d3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d3); }
  if (!flag_z && (flag_n==flag_v)) goto lbC01F400;
  d2 = d1;
  { int32_t _cmp=(int32_t)READ16(a2 + 2)-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a2 + 2)<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC01F40A;
  WRITE16(a2 + 2, READ16(a2 + 2) + 2);
  goto lbC01F40A;
lbC01F400:
  { int32_t _cmp=(int32_t)d2-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)d1); }
  if (flag_n!=flag_v) goto lbC01F408;
  d2 -= d3;
  goto lbC01F40A;
lbC01F408:
  d2 += d3;
lbC01F40A:
  WRITE32(a2 + 4, d2);
  if (!flag_z) goto lbC01F414;
  WRITE32(a1 + 28, 0);
lbC01F414:
  W(d0) = (uint16_t)(READ16(a2 + 0));
  W(d1) = (uint16_t)(READ16(a2 + 12));
  W(d2) = (uint16_t)(READ16(a3 + 90));
  d1 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d1);
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 7));
  W(d2) = (uint16_t)(READ16(a6 + 2));
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(0x80));
  W(d1) = (uint16_t)(W(d1) - W(d2));
  W(d1) = (uint16_t)(d1 + 0x1000);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(0x10);
  d0 >>= d1;
  lbC01E328();
  WRITE16(a1 + 24, d0);
  lbC01E35C();
  lbC01E308();
  W(d0) = (uint16_t)(d0 + 1);
  d0 = (uint32_t)((uint16_t)READ16(a3 + 72) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  d1 = READ32(a2 + 4);
  d1 = (d1 >> 16) | (d1 << 16);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(10);
  W(d0) = (uint16_t)((uint32_t)(d0) >> d1);
  WRITE16(a1 + 26, d0);
lbC01F460:
  /* SampledSound.MSG */
  /* dc.b	'SampledSound',0 */
  /* ss.MSG	dc.b	'.ss',0,0 */
IFFTech:
  /* dc.w	AIFFTech-IFFTech */
  /* dc.w	FORM.MSG-IFFTech */
  /* BRA.L	lbC01F488 */
  /* BRA.L	lbC01F5EA */
  lbC01F604(); return;
  lbC01E286(); return;
}

static void InstallIFF(void) {
  /* lbC01F488	CMPI.L	#'AIFF',$47A(A6) */
  /* BEQ.L	lbC01F73E */
  /* MOVEM.L d0,d7,a1,a6,? */
  /* LEA	$472(A6),A5 */
  /* MOVEQ	#$20,D5 */
  /* MOVE.L	D0,D2 */
  /* MOVEA.L	SP,A4 */
  /* MOVEQ	#$3E,D0 */
  /* MOVE.L	#$10001,D1 */
  /* BSR.L	lbC01FE82			; alloc mem */
  /* MOVE.L	A0,D0 */
  /* BEQ.L	lbC01F59A */
  /* MOVEA.L	A0,A3 */
  /* BSR.L	lbC01F5AC */
  /* CMPI.L	#'FORM',D0 */
  /* BNE.L	lbC01F5A0 */
  /* BSR.L	lbC01F5AC */
  /* MOVE.L	D0,D7 */
  /* BSR.L	lbC01F5AC */
  /* CMPI.L	#'8SVX',D0 */
  /* BNE.L	lbC01F5A0 */
  /* SUBQ.L	#4,D7 */
  /* lbC01F4DA	TST.L	D7 */
  /* BLE.L	lbC01F55A */
  /* BSR.L	lbC01F5AC */
  /* MOVE.L	D0,D1 */
  /* BSR.L	lbC01F5AC */
  /* MOVE.L	D0,D6 */
  /* SUBQ.L	#8,D7 */
  /* CMPI.L	#'VHDR',D1 */
  /* BEQ.L	lbC01F510 */
  /* CMPI.L	#'BODY',D1 */
  /* BEQ.L	lbC01F528 */
  /* lbC01F502	TST.L	D6 */
  /* BLE.S	lbC01F4DA */
  /* BSR.L	lbC01F5B8 */
  /* SUBQ.L	#2,D6 */
  /* SUBQ.L	#2,D7 */
  /* BRA.S	lbC01F502 */
  /* lbC01F510	LEA	$24(A3),A0 */
  /* MOVEQ	#$14,D0 */
  /* BSR.L	lbC01F5C4 */
  /* TST.B	15(A0) */
  /* BNE.L	lbC01F5A0 */
  /* SUB.L	D0,D6 */
  /* SUB.L	D0,D7 */
  /* BRA.S	lbC01F502 */
  /* lbC01F528	TST.L	$3A(A3) */
  /* BNE.L	lbC01F5A0 */
  /* TST.B	$32(A3) */
  /* BEQ.L	lbC01F5A0 */
  /* MOVE.L	D6,D0 */
  /* ADDQ.L	#1,D0 */
  /* ANDI.W	#$FFFE,D0 */
  /* MOVE.L	#3,D1 */
  /* BSR.L	lbC01FE82			;alloc mem */
  /* MOVE.L	A0,$3A(A3) */
  /* BEQ.L	lbC01F5A0 */
  /* BSR.L	lbC01F5C4 */
  /* SUB.L	D0,D7 */
  /* BRA.S	lbC01F4DA */
  /* lbC01F55A	TST.L	$3A(A3) */
  /* BEQ.L	lbC01F5A0 */
  a1 = (uint32_t)(a0 + 20);
  a3 = d5;
  a0 = (uint32_t)(a3 + 36);
  a2 = a0;
  d0 = (uint32_t)(int32_t)(int8_t)(4);
CopyVHDR:
  WRITE32_POST(a2, READ32_POST(a1));
  if ((int16_t)(--d0) >= 0) goto CopyVHDR;
FindBody:
  { int32_t _cmp=(int32_t)READ32(a1)-(int32_t)0x424f4459; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a1)<(uint32_t)0x424f4459); }
  if (flag_z) goto BodyOK;
  a1 += 2;
  goto FindBody;
BodyOK:
  a1 += 8;
  WRITE32(a3 + 58, a1);
  d2 = READ32_POST(a0);
  d3 = READ32_POST(a0);
  d4 = READ32_POST(a0);
  W(d1) = (uint16_t)(0);
lbC01F56E:
  d2 >>= 1;
  d3 >>= 1;
  d4 >>= 1;
  W(d1) = (uint16_t)(d1 + 1);
  d0 = d2;
  d0 |= d3;
  flag_z = ((d0 & (1u << (0 & 31))) == 0);
  if (!flag_z) goto lbC01F594;
  { int32_t _cmp=(int32_t)d4-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d4<(uint32_t)1); }
  if (flag_z) goto lbC01F594;
  B(d0) = (uint8_t)d1;
  B(d0) = (uint8_t)(d0 + READ8(a3 + 50));
  { int32_t _cmp=(int32_t)d0-(int32_t)8; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)8); }
  if (flag_n!=flag_v) goto lbC01F56E;
lbC01F594:
  WRITE16(a3 + 56, d1);
  /* MOVEA.L	A3,A0 */
lbC01F59A:
  /* MOVEM.L ?,d0,d7,a1,a6 */
  return;
  /* lbC01F5A0	MOVEA.L	A4,SP */
  /* MOVEA.L	A3,A0 */
  /* BSR.L	lbC01F5EA */
  /* SUBA.L	A0,A0 */
  /* BRA.S	lbC01F59A */
  /* lbC01F5AC	SUBQ.L	#4,SP */
  /* MOVEA.L	SP,A0 */
  /* MOVEQ	#4,D0 */
  /* BSR.S	lbC01F5C4 */
  /* MOVE.L	(SP)+,D0 */
  /* RTS */
  /* lbC01F5B8	SUBQ.L	#2,SP */
  /* MOVEA.L	SP,A0 */
  /* MOVEQ	#2,D0 */
  /* BSR.S	lbC01F5C4 */
  /* MOVE.W	(SP)+,D0 */
  /* RTS */
  /* lbC01F5C4	MOVEM.L	D0/D1/A0,-(SP) */
  /* lbC01F5C8	TST.L	D0 */
  /* BEQ.S	lbC01F5E4 */
  /* TST.W	D5 */
  /* BEQ.S	lbC01F5D8 */
  /* MOVE.W	(A5)+,(A0)+ */
  /* SUBQ.W	#2,D5 */
  /* SUBQ.L	#2,D0 */
  /* BRA.S	lbC01F5C8 */
  /* lbC01F5D8	MOVE.L	D0,D1 */
  /* MOVE.L	D2,D0 */
  /* BSR.L	lbC01DF9E			; read file */
  /* CMP.L	D1,D0 */
  /* BNE.S	lbC01F5A0 */
  /* lbC01F5E4	MOVEM.L	(SP)+,D0/D1/A0 */
  /* RTS */
  /* lbC01F5EA	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVEA.L	A0,A1 */
  /* MOVEA.L	$3A(A1),A0 */
  /* BSR.L	lbC01FEB2			; free mem */
  /* MOVEA.L	A1,A0 */
  /* BSR.L	lbC01FEB2			; free mem */
  /* MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
}

static void lbC01F604(void) {
  a3 = READ32(a1 + 4);
  a2 = (uint32_t)(a1 + 72);
  B(d0) = (uint8_t)(READ8(a1 + 0));
  if (flag_z) { lbC01F6B4(); return; }
  { int32_t _cmp=(int32_t)d0-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)1); }
  if (!flag_z) { lbC01F6A6(); return; }
  d1 = 0;
  W(d1) = (uint16_t)(READ16(a1 + 2));
  { int32_t _cmp=(int32_t)d1-(int32_t)0x80; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)0x80); }
  if (flag_c) { lbC01F638(); return; }
  d0 = 0x369E99;
  { uint16_t q=(uint16_t)((uint32_t)d0/(uint16_t)d1); uint16_t r=(uint16_t)((uint32_t)d0%(uint16_t)d1); d0=((uint32_t)r<<16)|q; }
  B(d2) = (uint8_t)(READ8(a3 + 50));
  B(d2) = (uint8_t)(B(d2) - (uint8_t)(1));
  lbC01F67A(); return;
}

static void lbC01F638(void) {
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)12); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)12); d1=((uint32_t)r<<16)|q; }
  W(d2) = (uint16_t)d1;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)(d1 << 1);
  a0 = (uint32_t)(uintptr_t)&lbW01EB58;
  W(d0) = (uint16_t)(0x1AC);
  d0 = (uint32_t)((uint16_t)READ16(a0 + 0) * (uint16_t)d0);
  d0 += d0;
  d0 = (d0 >> 16) | (d0 << 16);
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(10));
  W(d2) = (uint16_t)(-(int16_t)W(d2));
  W(d2) = (uint16_t)(W(d2) - READ16(a3 + 56));
  if (!flag_n) { lbC01F674(); return; }
}

static void lbC01F65E(void) {
  WRITE8(a1 + 0, 0);
  WRITE32(a1 + 28, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) { lbC01F6EC(); return; }
  lbC01F6B4(); return;
}

static void lbC01F674(void) {
  { int32_t _cmp=(int32_t)d2-(int32_t)READ8(a3 + 50); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)READ8(a3 + 50)); }
  if (flag_n==flag_v) { lbC01F65E(); return; }
}

static void lbC01F67A(void) {
  WRITE16(a2 + 0, d0);
  a0 = READ32(a3 + 58);
  d0 = READ32(a3 + 36);
  d1 = READ32(a3 + 40);
  a0 -= d0;
  a0 -= d1;
  d0 = d0 << d2;
  d1 = d1 << d2;
  a0 += d0;
  a0 += d1;
  lbC01E2C0();
  WRITE16(a2 + 2, 1);
  lbC01EA46();
  lbC01F6B4(); return;
}

static void lbC01F6A6(void) {
  { int32_t _cmp=(int32_t)d0-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)2); }
  if (!flag_z) { lbC01F6B4(); return; }
  WRITE16(a2 + 2, 0);
  WRITE32(a1 + 28, 0);
}

static void lbC01F6B4(void) {
  W(d0) = (uint16_t)(0x1080);
  W(d0) = (uint16_t)(W(d0) - READ16(a6 + 2));
  d0 = (uint32_t)((uint16_t)READ16(a2 + 0) * (uint16_t)d0);
  d0 = d0 << 4;
  d0 = (d0 >> 16) | (d0 << 16);
  lbC01E328();
  WRITE16(a1 + 24, d0);
  lbC01E35C();
  W(d0) = (uint16_t)(READ16(a2 + 2));
  if (flag_z) { lbC01F6E8(); return; }
  lbC01E308();
  W(d0) = (uint16_t)(d0 + 1);
  d1 = READ32(a3 + 52);
  d1 >>= 1;
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d0 = (d0 >> 16) | (d0 << 16);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
}

static void lbC01F6E8(void) {
  WRITE16(a1 + 26, d0);
}

static void lbC01F6EC(void) {
  /* FORM.MSG	dc.b	'FORM',0,0 */
AIFFTech:
  /* dc.w	0 */
  /* dc.w	LIST.MSG-AIFFTech */
  /* BRA.L	lbC01F73E */
  /* BRA.L	lbC01F92A */
  lbC01F944(); return;
  lbC01E286(); return;
}

static void lbC01F708(void) {
  WRITE32_PRE(sp, d1);
  { int32_t _cmp=(int32_t)READ32(a0 + 4)-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a0 + 4)<(uint32_t)4); }
  if (flag_z||(flag_n!=flag_v)) goto lbC01F722;
lbC01F714:
  { int32_t _cmp=(int32_t)d0-(int32_t)READ32(a1); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)READ32(a1)); }
  if (flag_z) goto lbC01F71E;
  lbC01F726();
  d1 = a1;
  if (!flag_z) goto lbC01F714;
lbC01F71E:
  d1 = READ32_POST(sp);
  return;
lbC01F722:
  a1 -= a1;
  goto lbC01F71E;
}

static void lbC01F726(void) {
  WRITE32_PRE(sp, d0);
  a1 += READ32(a1 + 4);
  d0 = a1;
  a1 += 8;
  d0 -= a0;
  { int32_t _cmp=(int32_t)d0-(int32_t)READ32(a0 + 4); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)READ32(a0 + 4)); }
  if (flag_c) goto lbC01F73A;
  a1 -= a1;
lbC01F73A:
  d0 = READ32_POST(sp);
  return;
}

static void InstallAIFF(void) {
  /* lbC01F73E	MOVEM.L	D1-D7/A1-A3/A5/A6,-(SP) */
  /* MOVE.L	#2,D1 */
  /* BSR.L	lbC01FEF6 */
  /* MOVEA.L	A0,A5 */
  /* MOVE.L	A0,D0 */
  /* BEQ.L	lbC01F7D2 */
  /* MOVEQ	#$2C,D0 */
  /* MOVE.L	#$10000,D1 */
  /* BSR.L	lbC01FE82				;alloc mem */
  /* MOVEA.L	A0,A4 */
  /* MOVE.L	A0,D0 */
  /* BEQ.L	lbC01F7D2 */
  /* MOVEM.L d1,a6,? */
  a5 = a0;
  a4 = d5;
  WRITE32(a4 + 36, a5);
  { int32_t _cmp=(int32_t)READ32(a5 + 8)-(int32_t)0x41494646; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a5 + 8)<(uint32_t)0x41494646); }
  if (!flag_z) goto lbC01F7D2;
  a2 -= a2;
  d0 = READ32(a5);
  { int32_t _cmp=(int32_t)d0-(int32_t)0x464f524d; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x464f524d); }
  if (flag_z) goto lbC01F7B4;
  a0 = a5;
  a1 = (uint32_t)(a0 + 12);
lbC01F78A:
  d0 = 0x464f524d;
  lbC01F708();
  d0 = a1;
  if (flag_z) goto lbC01F7BE;
  { int32_t _cmp=(int32_t)READ32(a1 + 8)-(int32_t)0x41494646; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ32(a1 + 8)<(uint32_t)0x41494646); }
  if (!flag_z) goto lbC01F7D2;
  lbC01F7E8();
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC01F7D2;
  lbC01F726();
  d0 = a1;
  if (flag_z) goto lbC01F7BE;
  goto lbC01F78A;
lbC01F7B4:
  a1 = a5;
  lbC01F7E8();
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC01F7D2;
lbC01F7BE:
  flag_z=(READ32(a4 + 40)==0); flag_n=((int32_t)READ32(a4 + 40)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01F7D2;
  /* MOVEA.L	A4,A0 */
  /* lbC01F7C6	LEA	AIFFTech(PC),A4 */
  /* CLR.L	D0 */
  /* MOVEM.L	(SP)+,D1-D7/A1-A3/A5/A6 */
  d0 = (uint32_t)(int32_t)(int8_t)(0);
exit:
  /* MOVEM.L ?,d1,a6 */
  return;
lbC01F7D2:
  d0 = (uint32_t)(int32_t)(int8_t)(-1);
  goto exit;
  /* MOVE.L	A4,D0 */
  /* BEQ.S	lbC01F7DE */
  /* MOVEA.L	D0,A0 */
  /* BSR.L	lbC01F92A */
  /* BRA.S	lbC01F7E4 */
  /* lbC01F7DE	MOVEA.L	A5,A0 */
  /* BSR.L	lbC01FEB2			; free mem */
  /* lbC01F7E4	SUBA.L	A0,A0 */
  /* BRA.S	lbC01F7C6 */
}

static void lbC01F7E8(void) {
  /* MOVEM.L d1,d7,a0,a1,a3,a5,? */
  a0 = a1;
  a1 = (uint32_t)(a0 + 12);
  d0 = 0x434f4d4d;
  lbC01F708();
  d0 = a1;
  if (flag_z) goto lbC01F8CA;
  a5 = a1;
  a1 = (uint32_t)(a0 + 12);
  d0 = 0x53534e44;
  lbC01F708();
  d0 = a1;
  if (flag_z) goto lbC01F8CA;
  d0 = a2;
  if (!flag_z) goto lbC01F822;
  WRITE32(a4 + 40, a1);
  goto lbC01F826;
lbC01F822:
  WRITE32(a2 + 0, a1);
lbC01F826:
  a2 = a1;
  WRITE32(a2 + 0, 0);
  W(d0) = (uint16_t)(0x400E);
  W(d0) = (uint16_t)(W(d0) - READ16(a5 + 16));
  W(d1) = (uint16_t)(READ16(a5 + 18));
  W(d1) = (uint16_t)((uint32_t)(d1) >> d0);
  WRITE16(a2 + 12, d1);
  d0 = READ32(a5 + 10);
  d0 >>= 1;
  WRITE16(a2 + 14, d0);
  WRITE16(a2 + 8, 0);
  WRITE16(a2 + 10, 0);
  a1 = (uint32_t)(a0 + 12);
  d0 = 0x4e414d45;
  lbC01F708();
  d0 = a1;
  if (flag_z) goto lbC01F874;
  a1 += 8;
  lbC01F902();
  WRITE16(a2 + 8, d0);
  lbC01F902();
  WRITE16(a2 + 10, d0);
lbC01F874:
  d0 = 0x494e5354;
  lbC01F708();
  WRITE32(a2 + 4, a1);
  if (flag_z) goto lbC01F8C2;
  a3 = a1;
  flag_z=(READ16(a3 + 16)==0); flag_n=((int32_t)READ16(a3 + 16)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC01F8C2;
  a1 = (uint32_t)(a0 + 12);
  d0 = 0x4d41524b;
  lbC01F708();
  d0 = a1;
  if (flag_z) goto lbC01F8CA;
  W(d0) = (uint16_t)(READ16(a3 + 18));
  lbC01F8CE();
  d0 = (uint32_t)((int32_t)d0 >> 1);
  if (flag_n) goto lbC01F8CA;
  WRITE16(a3 + 18, d0);
  W(d0) = (uint16_t)(READ16(a3 + 20));
  lbC01F8CE();
  d0 = (uint32_t)((int32_t)d0 >> 1);
  if (flag_n) goto lbC01F8CA;
  WRITE16(a3 + 20, d0);
lbC01F8C2:
lbC01F8C4:
  /* MOVEM.L ?,d1,d7,a0,a1,a3,a5 */
  return;
lbC01F8CA:
  goto lbC01F8C4;
}

static void lbC01F8CE(void) {
  /* MOVEM.L d1,d7,a1,? */
  W(d7) = (uint16_t)(READ16(a1 + 8));
  W(a1) = (uint16_t)(a1 + 10);
lbC01F8DA:
  W(d7) = (uint16_t)(W(d7) - (uint16_t)(1));
  if (flag_n) goto lbC01F8FA;
  { int32_t _cmp=(int32_t)d0-(int32_t)READ16(a1 + 0); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)READ16(a1 + 0)); }
  if (!flag_z) goto lbC01F8EA;
  d0 = READ32(a1 + 2);
  goto lbC01F8FC;
lbC01F8EA:
  W(a1) = (uint16_t)(a1 + 6);
  B(d1) = (uint8_t)(READ8(a1));
  B(d1) = (uint8_t)(d1 + 2);
  W(d1) &= (uint16_t)(0xFE);
  W(a1) = (uint16_t)(a1 + d1);
  goto lbC01F8DA;
lbC01F8FA:
lbC01F8FC:
  /* MOVEM.L ?,d1,d7,a1 */
  return;
}

static void lbC01F902(void) {
  WRITE32_PRE(sp, d1);
lbC01F904:
  { int32_t _cmp=(int32_t)READ8_POST(a1)-(int32_t)0x20; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8_POST(a1)<(uint32_t)0x20); }
  if (flag_z) goto lbC01F904;
  a1 -= 1;
  W(d0) = (uint16_t)(0);
lbC01F90E:
  W(d1) = (uint16_t)(0);
  B(d1) = (uint8_t)(READ8(a1));
  B(d1) = (uint8_t)(B(d1) - (uint8_t)(0x30));
  { int32_t _cmp=(int32_t)d1-(int32_t)10; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)10); }
  if (!flag_c) goto lbC01F926;
  d0 = (uint32_t)((uint16_t)10 * (uint16_t)d0);
  W(d0) = (uint16_t)(d0 + d1);
  a1 += 1;
  goto lbC01F90E;
lbC01F926:
  d1 = READ32_POST(sp);
  return;
  /* lbC01F92A	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVEA.L	A0,A1 */
  /* MOVEA.L	$24(A1),A0 */
  /* BSR.L	lbC01FEB2			; free mem */
  /* MOVEA.L	A1,A0 */
  /* BSR.L	lbC01FEB2			; free mem */
  /* MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
}

static void lbC01F944(void) {
  a3 = READ32(a1 + 4);
  a2 = (uint32_t)(a1 + 76);
  B(d0) = (uint8_t)(READ8(a1 + 0));
  if (flag_z) { lbC01FA6A(); return; }
  { int32_t _cmp=(int32_t)d0-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)1); }
  if (!flag_z) { lbC01FA60(); return; }
  a5 = READ32(a3 + 40);
}

static void lbC01F960(void) {
  a4 = READ32(a5 + 4);
  W(d0) = (uint16_t)(READ16(a5 + 12));
  W(d1) = (uint16_t)(READ16(a1 + 2));
  if (flag_z) { lbC01F9E4(); return; }
  { int32_t _cmp=(int32_t)d1-(int32_t)0x80; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)0x80); }
  if (!flag_c) { lbC01F9E6(); return; }
  d2 = a4;
  if (!flag_z) { lbC01F982(); return; }
  B(d1) = (uint8_t)(B(d1) - (uint8_t)(0x3C));
  lbC01F9B0(); return;
}

static void lbC01F982(void) {
  { int32_t _cmp=(int32_t)d1-(int32_t)READ8(a4 + 11); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)READ8(a4 + 11)); }
  if (!flag_c&&!flag_z) { lbC01F98E(); return; }
  { int32_t _cmp=(int32_t)d1-(int32_t)READ8(a4 + 10); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)READ8(a4 + 10)); }
  if (!flag_c) { lbC01F9AC(); return; }
}

static void lbC01F98E(void) {
  a5 = READ32(a5 + 0);
  d2 = a5;
  if (!flag_z) { lbC01F960(); return; }
}

static void lbC01F996(void) {
  WRITE8(a1 + 0, 0);
  WRITE32(a1 + 28, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) { lbC01FAEA(); return; }
  lbC01FA6A(); return;
}

static void lbC01F9AC(void) {
  B(d1) = (uint8_t)(B(d1) - READ8(a4 + 8));
}

static void lbC01F9B0(void) {
  if (flag_z) { lbC01F9E4(); return; }
  if (!flag_n) { lbC01F9BE(); return; }
}

static void lbC01F9B4(void) {
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  B(d1) = (uint8_t)(d1 + 12);
  if (flag_n) { lbC01F9B4(); return; }
  lbC01F9CE(); return;
}

static void lbC01F9BE(void) {
  { int32_t _cmp=(int32_t)d1-(int32_t)12; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)12); }
  if (flag_n!=flag_v) { lbC01F9CE(); return; }
  W(d0) = (uint16_t)(d0 + d0);
  if (flag_c) { lbC01F996(); return; }
  B(d1) = (uint8_t)(B(d1) - (uint8_t)(12));
  lbC01F9BE(); return;
}

static void lbC01F9CE(void) {
  d1 = (uint32_t)(int32_t)(int16_t)(int8_t)d1;
  if (flag_z) { lbC01F9E4(); return; }
  W(d1) = (uint16_t)(d1 + d1);
  d0 = (d0 >> 16) | (d0 << 16);
  W(d0) = (uint16_t)(0);
  d0 >>= 1;
  a0 = (uint32_t)(uintptr_t)&lbW01EB58;
  { uint16_t q=(uint16_t)((uint32_t)d0/(uint16_t)READ16(a0 + 0)); uint16_t r=(uint16_t)((uint32_t)d0%(uint16_t)READ16(a0 + 0)); d0=((uint32_t)r<<16)|q; }
  if (flag_v) { lbC01F996(); return; }
}

static void lbC01F9E4(void) {
  W(d1) = (uint16_t)d0;
}

static void lbC01F9E6(void) {
  flag_z=(d1==0); flag_n=((int32_t)d1<0); flag_c=0; flag_v=0;
  if (flag_z) { lbC01F996(); return; }
  d0 = 0x369E99;
  { uint16_t q=(uint16_t)((uint32_t)d0/(uint16_t)d1); uint16_t r=(uint16_t)((uint32_t)d0%(uint16_t)d1); d0=((uint32_t)r<<16)|q; }
  WRITE16(a2 + 0, d0);
  d0 = (uint32_t)(int32_t)(int8_t)(0);
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  W(d0) = (uint16_t)(READ16(a5 + 14));
  d2 = a4;
  if (flag_z) { lbC01FA12(); return; }
  flag_z=(READ16(a4 + 16)==0); flag_n=((int32_t)READ16(a4 + 16)<0); flag_c=0; flag_v=0;
  if (flag_z) { lbC01FA12(); return; }
  W(d0) = (uint16_t)(READ16(a4 + 18));
  W(d1) = (uint16_t)(READ16(a4 + 20));
  W(d1) = (uint16_t)(W(d1) - W(d0));
}

static void lbC01FA12(void) {
  d0 += d0;
  d1 += d1;
  a0 = (uint32_t)(a5 + 16);
  lbC01E2C0();
  W(d0) = (uint16_t)(0);
  flag_z = ((READ32(a1 + 10) & (1u << (0 & 31))) == 0);
  if (flag_z) { lbC01FA2C(); return; }
  W(d0) = (uint16_t)(0xFF00);
}

static void lbC01FA2C(void) {
  WRITE16(a2 + 2, d0);
  W(d1) = (uint16_t)(READ16(a5 + 8));
  W(d1) = (uint16_t)(d1 + 1);
  d0 = 0xFF00;
  { uint16_t q=(uint16_t)((uint32_t)d0/(uint16_t)d1); uint16_t r=(uint16_t)((uint32_t)d0%(uint16_t)d1); d0=((uint32_t)r<<16)|q; }
  WRITE16(a2 + 4, d0);
  W(d1) = (uint16_t)(READ16(a5 + 10));
  W(d1) = (uint16_t)(d1 + 1);
  d0 = 0xFF00;
  { uint16_t q=(uint16_t)((uint32_t)d0/(uint16_t)d1); uint16_t r=(uint16_t)((uint32_t)d0%(uint16_t)d1); d0=((uint32_t)r<<16)|q; }
  WRITE16(a2 + 6, d0);
  WRITE8(a1 + 10, 0xFF);
  lbC01EA46();
  lbC01FA6A(); return;
}

static void lbC01FA60(void) {
  { int32_t _cmp=(int32_t)d0-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)2); }
  if (!flag_z) { lbC01FA6A(); return; }
  WRITE8(a1 + 10, 0);
}

static void lbC01FA6A(void) {
  W(d0) = (uint16_t)(0x1080);
  W(d0) = (uint16_t)(W(d0) - READ16(a6 + 2));
  d0 = (uint32_t)((uint16_t)READ16(a2 + 0) * (uint16_t)d0);
  d0 = d0 << 4;
  d0 = (d0 >> 16) | (d0 << 16);
  lbC01E328();
  WRITE16(a1 + 24, d0);
  lbC01E35C();
  W(d1) = (uint16_t)(READ16(a2 + 2));
  flag_z=(READ8(a1 + 10)==0); flag_n=((int32_t)READ8(a1 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) { lbC01FAB2(); return; }
  W(d2) = (uint16_t)(0xFF00);
  { int32_t _cmp=(int32_t)d2-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)d1); }
  if (flag_z) { lbC01FAD6(); return; }
  W(d0) = (uint16_t)(READ16(a2 + 4));
  d0 = (uint32_t)((uint16_t)READ16(a6 + 50) * (uint16_t)d0);
  d0 += d0;
  if (flag_c) { lbC01FACC(); return; }
  d0 = (d0 >> 16) | (d0 << 16);
  W(d1) = (uint16_t)(d1 + d0);
  if (flag_c) { lbC01FACC(); return; }
  { int32_t _cmp=(int32_t)d1-(int32_t)d2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)d2); }
  if (!flag_c) { lbC01FACC(); return; }
  W(d2) = (uint16_t)d1;
  lbC01FACC(); return;
}

static void lbC01FAB2(void) {
  W(d2) = (uint16_t)(0);
  flag_z=(d1==0); flag_n=((int32_t)d1<0); flag_c=0; flag_v=0;
  if (flag_z) { lbC01FACC(); return; }
  W(d0) = (uint16_t)(READ16(a2 + 6));
  d0 = (uint32_t)((uint16_t)READ16(a6 + 50) * (uint16_t)d0);
  d0 += d0;
  if (flag_c) { lbC01FACC(); return; }
  d0 = (d0 >> 16) | (d0 << 16);
  W(d1) = (uint16_t)(W(d1) - W(d0));
  if (flag_c) { lbC01FACC(); return; }
  W(d2) = (uint16_t)d1;
}

static void lbC01FACC(void) {
  WRITE16(a2 + 2, d2);
  if (!flag_z) { lbC01FAD6(); return; }
  WRITE32(a1 + 28, 0);
}

static void lbC01FAD6(void) {
  lbC01E308();
  W(d0) = (uint16_t)(d0 + 1);
  d0 = (uint32_t)((uint16_t)READ16(a2 + 2) * (uint16_t)d0);
  d0 = (d0 >> 16) | (d0 << 16);
  W(d0) = (uint16_t)(d0 + 1);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 2);
  WRITE16(a1 + 26, d0);
}

static void lbC01FAEA(void) {
  /* LIST.MSG	dc.b	'LIST' */
  /* dc.w	0 */
  /* dc.w	$880F */
  /* dc.w	$FC0C */
  /* dc.w	$F3F5 */
  /* dc.w	$3544 */
  /* COPYRIGHT	dc.b	'Sonix Music Driver (C) Copyright 1987-91 Mar' */
  /* dc.b	'k Riley, All Rights Reserved.',0 */
  /* VERSION	dc.b	'Version 2.3c - January 9, 1991',0,0 */
  /* INITSONIX	MOVEM.L	D1-D7/A0-A6,-(SP) */
  /* LEA	SONIX(PC),A1 */
  /* MOVE.L	(A1),D0 */
  /* BNE.L	lbC01FCDC */
  /* MOVE.L	#$538,D0 */
  /* MOVE.L	#$10001,D1 */
  /* BSR.L	lbC01FE82			;alloc mem */
  /* MOVEA.L	A0,A6 */
  /* MOVE.L	A0,(A1) */
  /* BEQ.L	lbC01FCE6 */
  /* MOVE.L	#$408,D0 */
  /* MOVE.L	#$10003,D1 */
  /* BSR.L	lbC01FE82			;alloc mem */
  /* MOVE.L	A0,$3E2(A6) */
  /* BEQ.L	lbC01FCE6 */
  /* LEA	doslibrary.MSG(PC),A1 */
  /* MOVEQ	#0,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$228(A6)			; open library */
  /* MOVEA.L	(SP)+,A6 */
  /* LEA	DOS_Base(PC),A0 */
  /* MOVE.L	D0,(A0) */
  /* BEQ.L	lbC01FCE6 */
  /* LEA	$4F4(A6),A2 */
  /* MOVE.B	#4,8(A2) */
  /* MOVE.B	#0,14(A2) */
  /* MOVEQ	#-1,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$14A(A6)			; alloc signal */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.B	D0,15(A2) */
  /* SUBA.L	A1,A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$126(A6)			; find task */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	D0,$10(A2) */
  /* LEA	$14(A2),A0 */
  /* MOVE.L	A0,0(A0) */
  /* ADDQ.L	#4,0(A0) */
  /* CLR.L	4(A0) */
  /* MOVE.L	A0,8(A0) */
  /* LEA	$4B0(A6),A1 */
  /* MOVE.B	#5,8(A1) */
  /* MOVE.L	A2,14(A1) */
  /* LEA	lbW01FF4A(PC),A0 */
  /* MOVE.L	A0,$22(A1) */
  /* MOVEQ	#1,D0 */
  /* MOVE.L	D0,$26(A1) */
  /* MOVE.B	#$7F,9(A1) */
  /* LEA	audiodevice.MSG(PC),A0 */
  /* MOVEQ	#0,D0 */
  /* MOVEQ	#0,D1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$1BC(A6)			; open device */
  /* MOVEA.L	(SP)+,A6 */
  /* TST.L	D0 */
  /* BNE.L	lbC01FCE6 */
  /* LEA	ciabresource.MSG(PC),A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$1F2(A6)			; open resource */
  /* MOVEA.L	(SP)+,A6 */
  /* LEA	Resource_Base(PC),A0 */
  /* MOVE.L	D0,(A0) */
  /* BEQ.L	lbC01FCE6 */
  /* LEA	$516(A6),A2 */
  /* LEA	$BFD400,A3 */
  /* LEA	$BFDE00,A4 */
  /* MOVEQ	#0,D7 */
  /* lbC01FC6E	LEA	INTERRUPT(PC),A0 */
  /* MOVE.L	A0,$12(A2) */
  /* MOVEA.L	A2,A1 */
  /* MOVE.L	D7,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	Resource_Base(PC),A6 */
  /* JSR	-6(A6)				; add ICR vector */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	D0,14(A2) */
  /* BEQ.S	lbC01FCA2 */
  /* TST.L	D7 */
  /* BNE.L	lbC01FCE6 */
  /* LEA	$BFD600,A3 */
  /* LEA	$BFDF00,A4 */
  /* MOVEQ	#1,D7 */
  /* BRA.S	lbC01FC6E */
  /* lbC01FCA2	MOVE.L	A3,$52C(A6) */
  /* MOVE.L	A4,$530(A6) */
  /* MOVE.L	D7,$534(A6) */
  /* MOVE.W	#$80,2(A6) */
  /* MOVEQ	#$78,D0 */
  /* MOVE.W	D0,0(A6) */
  /* BSR.L	lbC01E798 */
  /* CLR.W	D0 */
  /* MOVE.B	#$FF,D1 */
  /* MOVE.B	#$FF,D2 */
  /* BSR.L	RAMPVOLUME */
  /* MOVE.B	#$81,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	Resource_Base(PC),A6 */
  /* JSR	-$12(A6)			; able ICR */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC01FCDC	MOVE.L	SONIX(PC),D0 */
  /* MOVEM.L	(SP)+,D1-D7/A0-A6 */
  /* RTS */
  /* lbC01FCE6	BSR.S	lbC01FD0A */
  /* BRA.S	lbC01FCDC */
  /* QUITSONIX	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	SONIX(PC),D0 */
  /* BEQ.S	lbC01FD04 */
  /* MOVEA.L	D0,A6 */
  /* BSR.L	STOPSOUND */
  /* BSR.L	lbC01E508 */
  /* BSR.L	lbC01E0D8 */
  /* BSR.S	lbC01FD0A */
  /* lbC01FD04	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* remove player routine */
  /* lbC01FD0A	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* LEA	SONIX(PC),A1 */
  /* MOVE.L	(A1),D0 */
  /* BEQ.L	lbC01FDC4 */
  /* MOVEA.L	D0,A6 */
  /* CLR.L	(A1) */
  /* LEA	Resource_Base(PC),A3 */
  /* TST.L	(A3) */
  /* BEQ.S	lbC01FD56 */
  /* LEA	$516(A6),A2 */
  /* TST.L	14(A2) */
  /* BNE.S	lbC01FD56 */
  /* MOVE.B	#1,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	Resource_Base(PC),A6 */
  /* JSR	-$12(A6)			; able ICR */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVEA.L	$530(A6),A0 */
  /* CLR.B	(A0) */
  /* MOVE.L	$534(A6),D0 */
  /* MOVEA.L	A2,A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	Resource_Base(PC),A6 */
  /* JSR	-12(A6)				; rem ICR vector */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC01FD56	CLR.L	(A3) */
  /* LEA	$4B0(A6),A2 */
  /* SUBA.L	A1,A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$126(A6)			; find task */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	D0,$10(A2) */
  /* MOVE.L	$14(A2),D0 */
  /* BEQ.S	lbC01FD86 */
  /* ADDQ.L	#1,D0 */
  /* BEQ.S	lbC01FD86 */
  /* MOVEA.L	A2,A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$1C2(A6)			; close device */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC01FD86	LEA	$4F4(A6),A2 */
  /* CLR.L	D0 */
  /* MOVE.B	15(A2),D0 */
  /* BEQ.S	lbC01FD9E */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$150(A6)			; free signal */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC01FD9E	LEA	DOS_Base(PC),A2 */
  /* MOVE.L	(A2),D0 */
  /* BEQ.S	lbC01FDB4 */
  /* MOVEA.L	D0,A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$19E(A6)			; close library */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC01FDB4	CLR.L	(A2) */
  /* MOVEA.L	$3E2(A6),A0 */
  /* BSR.L	lbC01FEB2 */
  /* MOVEA.L	A6,A0 */
  /* BSR.L	lbC01FEB2 */
  /* lbC01FDC4	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* lbC01FDCA	MOVEM.L	D1/D2/A0/A1,-(SP) */
  /* MOVE.L	D1,-(SP) */
  /* MOVE.L	D0,-(SP) */
  /* MOVEQ	#-1,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$14A(A6)			; alloc signal */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	D0,D2 */
  /* MOVE.L	(SP)+,D0 */
  /* CLR.L	D1 */
  /* BSET	D2,D1 */
  /* BSR.S	lbC01FE18 */
  /* MOVE.L	D1,D0 */
  /* OR.L	(SP),D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$13E(A6)			; wait */
  /* MOVEA.L	(SP)+,A6 */
  /* AND.L	(SP)+,D0 */
  /* MOVE.L	D0,-(SP) */
  /* CLR.L	D1 */
  /* BSR.S	lbC01FE18 */
  /* MOVE.L	D2,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$150(A6)			; free signal */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	(SP)+,D0 */
  /* MOVEM.L	(SP)+,D1/D2/A0/A1 */
  /* RTS */
  /* lbC01FE18	MOVEM.L	D0-D2/A0/A1,-(SP) */
  /* CLR.L	$4A4(A6) */
  /* MOVE.L	D1,D2 */
  /* BEQ.S	lbC01FE3E */
  /* MOVE.L	D0,$4A8(A6) */
  /* SUBA.L	A1,A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$126(A6)			; find task */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	D0,$4A0(A6) */
  /* MOVE.L	D2,$4A4(A6) */
  /* lbC01FE3E	MOVEM.L	(SP)+,D0-D2/A0/A1 */
  /* RTS */
  /* compare string routine */
  /* lbC01FE44	MOVEM.L	D0/D1/A0/A1,-(SP) */
  /* MOVEA.L	$18(SP),A0 */
  /* MOVEA.L	$14(SP),A1 */
  /* lbC01FE50	MOVE.B	(A0)+,D0 */
  /* CMPI.B	#$61,D0 */
  /* BCS.S	lbC01FE62 */
  /* CMPI.B	#$7B,D0 */
  /* BCC.S	lbC01FE62 */
  /* ANDI.B	#$DF,D0 */
  /* lbC01FE62	MOVE.B	(A1)+,D1 */
  /* CMPI.B	#$61,D1 */
  /* BCS.S	lbC01FE74 */
  /* CMPI.B	#$7B,D1 */
  /* BCC.S	lbC01FE74 */
  /* ANDI.B	#$DF,D1 */
  /* lbC01FE74	CMP.B	D0,D1 */
  /* BNE.S	lbC01FE7C */
  /* TST.B	D0 */
  /* BNE.S	lbC01FE50 */
  /* lbC01FE7C	MOVEM.L	(SP)+,D0/D1/A0/A1 */
  /* RTS */
  /* alloc memory routine */
  /* lbC01FE82	MOVEM.L	D0-D3/A1/A6,-(SP) */
  /* ADDQ.L	#4,D0 */
  /* MOVE.L	D0,D2 */
  /* MOVE.L	lbL01DEFC(PC),D3 */
  /* BNE.S	lbC01FEAC */
  /* MOVE.L	D2,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$C6(A6)			; alloc mem */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC01FE9E	MOVEA.L	D0,A0 */
  /* TST.L	D0 */
  /* BEQ.S	lbC01FEA6 */
  /* MOVE.L	D2,(A0)+ */
  /* lbC01FEA6	MOVEM.L	(SP)+,D0-D3/A1/A6 */
  /* RTS */
  /* lbC01FEAC	MOVEA.L	D3,A0 */
  /* JSR	(A0) */
  /* BRA.S	lbC01FE9E */
  /* free memory routine */
  /* lbC01FEB2	MOVEM.L	D0/D1/A0/A1,-(SP) */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC01FED2 */
  /* SUBQ.L	#4,A0 */
  /* MOVE.L	lbL01DF00(PC),D1 */
  /* BNE.S	lbC01FED8 */
  /* MOVEA.L	A0,A1 */
  /* MOVE.L	(A1),D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$D2(A6)			; free mem */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC01FED2	MOVEM.L	(SP)+,D0/D1/A0/A1 */
  /* RTS */
  /* lbC01FED8	MOVEA.L	D1,A1 */
  /* JSR	(A1) */
  /* BRA.S	lbC01FED2 */
  /* lbC01FEDE	MOVEM.L	D0/D1,-(SP) */
  /* MOVE.L	D0,D1 */
  /* MOVE.L	#$3ED,D0 */
  /* BSR.L	lbC01DF4C			; open file */
  /* BSR.S	lbC01FEF6 */
  /* MOVEM.L	(SP)+,D0/D1 */
  /* RTS */
  /* lbC01FEF6	MOVEM.L	D0-D3/D5-D7,-(SP) */
  /* CLR.L	D5 */
  /* MOVE.L	D0,D7 */
  /* BEQ.S	lbC01FF36 */
  /* MOVE.L	D1,D6 */
  /* MOVE.L	D7,D1 */
  /* MOVEQ	#0,D2 */
  /* MOVEQ	#1,D3 */
  /* BSR.L	lbC01DFCA			; seek file */
  /* MOVEQ	#-1,D3 */
  /* BSR.L	lbC01DFCA			; seek file */
  /* TST.L	D0 */
  /* BMI.S	lbC01FF30 */
  /* MOVE.L	D6,D1 */
  /* BSR.L	lbC01FE82			; alloc mem */
  /* MOVE.L	A0,D5 */
  /* BEQ.S	lbC01FF30 */
  /* MOVE.L	D0,D1 */
  /* MOVE.L	D7,D0 */
  /* BSR.L	lbC01DF9E			; read file */
  /* CMP.L	D1,D0 */
  /* BEQ.S	lbC01FF30 */
  /* BSR.S	lbC01FEB2			; free mem */
  /* CLR.L	D5 */
  /* lbC01FF30	MOVE.L	D7,D0 */
  /* BSR.L	lbC01DF76			; close file */
  /* lbC01FF36	MOVEA.L	D5,A0 */
  /* MOVEM.L	(SP)+,D0-D3/D5-D7 */
  /* RTS */
}
static const uint32_t Sonix[] = { 0 /* Buffer */ };
/* DOS_Base */
/* dc.l	0 */
/* Resource_Base */
/* dc.l	0 */
/* lbW01FF4A	dc.w	$F0F */
/* doslibrary.MSG	dc.b	'dos.library',0 */
/* audiodevice.MSG	dc.b	'audio.device',0 */
/* ciabresource.MSG	dc.b	'ciab.resource',0,0 */
/* JMP	INITSONIX */
/* JMP	QUITSONIX */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	8(SP),A0 */
/* MOVE.L	12(SP),D0 */
/* MOVE.L	$10(SP),D1 */
/* MOVE.L	$14(SP),D2 */
/* MOVE.L	$18(SP),D3 */
/* MOVE.L	$1C(SP),D4 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	PLAYSCORE */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVE.L	8(SP),D0 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	RELEASESCORE */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	STOPSCORE */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	8(SP),A0 */
/* MOVE.L	12(SP),D0 */
/* MOVE.L	$10(SP),D1 */
/* MOVE.L	$14(SP),D2 */
/* MOVE.L	$18(SP),D3 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	STARTNOTE */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVE.L	8(SP),D0 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	RELEASENOTE */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVE.L	8(SP),D0 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	STOPNOTE */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	RELEASESOUND */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	STOPSOUND */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVE.L	8(SP),D0 */
/* MOVE.L	12(SP),D1 */
/* MOVE.L	$10(SP),D2 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	RAMPVOLUME */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVE.L	8(SP),D0 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	STEALTRACK */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVE.L	8(SP),D0 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	RESUMETRACK */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	8(SP),A0 */
/* MOVEA.L	12(SP),A1 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	InitScore */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	8(SP),A0 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	lbC01E51E */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	lbC01E508 */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	8(SP),A0 */
/* MOVEA.L	12(SP),A1 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	INITINSTRUMENT */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	8(SP),A0 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	lbC01E0F4 */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	lbC01E0D8 */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVE.L	8(SP),D0 */
/* MOVE.L	12(SP),D1 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	lbC01FE18 */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVE.L	8(SP),D0 */
/* MOVE.L	12(SP),D1 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	lbC01FDCA */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	8(SP),A0 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	SETFILTER */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVE.L	8(SP),D0 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	lbC01EA68 */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* lbC020176	MOVE.L	A6,-(SP) */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	lbC01E262 */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVE.L	8(SP),D0 */
/* MOVE.L	12(SP),D1 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	lbC01E388 */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVEA.L	8(SP),A0 */
/* MOVE.L	12(SP),D0 */
/* MOVE.L	$10(SP),D1 */
/* MOVE.L	$14(SP),D2 */
/* MOVE.L	$18(SP),D3 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	lbC01E246 */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* MOVE.L	A6,-(SP) */
/* MOVE.L	8(SP),D0 */
/* MOVEA.L	lbL033A60,A6 */
/* JSR	lbC01E270 */
/* MOVEA.L	(SP)+,A6 */
/* RTS */
/* dc.l	COPYRIGHT */
/* dc.l	VERSION */
/* lbL033A60 */
/* dc.l	0 */
/* ************************************************************************** */
/* ************** Sonix Music Driver v2.0b player (TINY format) ************* */
/* ************************************************************************** */
/* Player from game "Magic Johnson's Basketball" (c) 1989 by Melbourne House */
/* SONIXCODE	BRA.L	INTERRUPT */
/* BRA.L	INITSONIX */
/* BRA.L	QUITSONIX */
/* BRA.L	PLAYSCORE */
/* BRA.L	RELEASESCORE */
/* BRA.L	STOPSCORE */
/* BRA.L	STARTNOTE */
/* BRA.L	RELEASENOTE */
/* BRA.L	STOPNOTE */
/* BRA.L	RELEASESOUND */
/* BRA.L	STOPSOUND */
/* BRA.L	RAMPVOLUME */
/* BRA.L	STEALTRACK */
/* BRA.L	RESUMETRACK */
/* BRA.L	INITINSTRUMENT */
/* BRA.L	QUITINSTRUMENT */
/* BRA.L	SETFILTER */

static void INITINSTRUMENT(void) {
  /* MOVEM.L d0,d7,a0,a6,? */
  d0 = READ32(a0 + 0);
  d0 -= 1;
  if (flag_z) goto lbC00CE6E;
  d0 -= 1;
  if (flag_z) goto lbC00CE86;
  d0 -= 1;
  if (flag_z) goto lbC00CE90;
lbC00CE68:
  /* MOVEM.L ?,d0,d7,a0,a6 */
  return;
lbC00CE6E:
  WRITE32(a0 + 4, a1);
  { int32_t _cmp=(int32_t)READ8(a1)-(int32_t)0x80; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1)<(uint32_t)0x80); }
  if (!flag_z) goto lbC00CE7C;
  SETFILTER();
lbC00CE7C:
lbC00CE80:
  WRITE32(a0 + 0, a2);
  goto lbC00CE68;
lbC00CE86:
  WRITE32(a0 + 4, a1);
  a2 = (uint32_t)(uintptr_t)&SSTECH;
  goto lbC00CE80;
lbC00CE90:
  goto lbC00CE80;
  /* QUITINSTRUMENT	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC00CEC2 */
  /* LEA	$3E(A6),A1 */
  /* CLR.B	D0 */
  /* lbC00CEA4	CMPI.B	#0,1(A1) */
  /* BEQ.S	lbC00CEB6 */
  /* CMPA.L	4(A1),A0 */
  /* BNE.S	lbC00CEB6 */
  /* BSR.L	STOPNOTE */
  /* lbC00CEB6	ADDA.W	#$16,A1 */
  /* ADDQ.B	#1,D0 */
  /* CMPI.B	#4,D0 */
  /* BNE.S	lbC00CEA4 */
  /* lbC00CEC2	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* RELEASESCORE	MOVEM.L	D0/D1,-(SP) */
  /* CLR.W	$3C(A6) */
  /* BSET	#0,$1C(A6) */
  /* TST.W	D0 */
  /* BNE.S	lbC00CEDC */
  /* MOVEQ	#1,D0 */
  /* lbC00CEDC	CLR.W	D1 */
  /* BSR.L	RAMPVOLUME */
  /* MOVEM.L	(SP)+,D0/D1 */
  /* RTS */
}

static void PLAYSCORE(void) {
  /* MOVEM.L d0,d7,a0,a6,? */
  STOPSCORE();
  d4 = a0;
  if (flag_z) goto lbC00CF44;
  a5 = d4;
  { int32_t _cmp=(int32_t)d1-(int32_t)d0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)d0); }
  if (flag_z) goto lbC00CF44;
  if (flag_c) goto lbC00CF44;
  WRITE32(a6 + 12, d0);
  WRITE32(a6 + 20, d1);
  a0 = (uint32_t)(a5 + 32);
  a1 = (uint32_t)(a6 + 38);
  d7 = (uint32_t)(int32_t)(int8_t)(3);
lbC00CF0E:
  WRITE32_POST(a1, READ32_POST(a0));
  if ((int16_t)(--d7) >= 0) goto lbC00CF0E;
  a0 = a5;
  lbC00CF7A();
  lbC00CFEC();
  WRITE16(a6 + 30, 0);
  WRITE32(a6 + 6, a5);
  WRITE16(a6 + 0, 0);
  WRITE16(a6 + 2, READ16(a5 + 2));
  WRITE16(a6 + 4, READ16(a5 + 6));
  W(d1) = (uint16_t)(READ16(a5 + 0));
  W(d0) = (uint16_t)d3;
  RAMPVOLUME();
  WRITE16(a6 + 10, d2);
lbC00CF44:
  /* MOVEM.L ?,d0,d7,a0,a6 */
  return;
}

static void STOPSCORE(void) {
}

static void lbC00CF50(void) {
  /* MOVEM.L d0,a0,? */
  flag_z=(READ16(a6 + 10)==0); flag_n=((int32_t)READ16(a6 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00CF74;
  WRITE16(a6 + 10, 0);
  a0 = (uint32_t)(a6 + 38);
  B(d0) = (uint8_t)(0);
lbC00CF64:
  flag_z=(READ32_POST(a0)==0); flag_n=((int32_t)READ32_POST(a0)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00CF6C;
  RELEASENOTE();
lbC00CF6C:
  B(d0) = (uint8_t)(d0 + 1);
  { int32_t _cmp=(int32_t)d0-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)4); }
  if (!flag_z) goto lbC00CF64;
lbC00CF74:
  /* MOVEM.L ?,d0,a0 */
  return;
}

static void lbC00CF7A(void) {
  /* MOVEM.L d0,d7,a0,a6,? */
  a3 = a0;
  a1 = (uint32_t)(a6 + 198);
  d6 = d0;
  B(d7) = (uint8_t)(0);
lbC00CF88:
  WRITE32(a1 + 0, 0);
  WRITE8(a1 + 16, 0);
  WRITE8(a1 + 17, 0);
  d0 = READ32(a0 + 48);
  if (flag_z) goto lbC00CFDA;
  d0 += a3;
  a2 = d0;
  d5 = d6;
lbC00CFA0:
  WRITE32(a1 + 0, a2);
  flag_z=(d5==0); flag_n=((int32_t)d5<0); flag_c=0; flag_v=0;
  if (flag_z||(flag_n!=flag_v)) goto lbC00CFDA;
  W(d0) = (uint16_t)(READ16_POST(a2));
  if (flag_z) goto lbC00CFA0;
  { int32_t _cmp=(int32_t)d0-(int32_t)0xFFFF; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0xFFFF); }
  if (flag_z) goto lbC00CFDA;
  { int32_t _cmp=(int32_t)d0-(int32_t)0x8200; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x8200); }
  if (!flag_c) goto lbC00CFA0;
  { int32_t _cmp=(int32_t)d0-(int32_t)0x8100; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x8100); }
  if (!flag_c) goto lbC00CFD2;
  d0 &= 0xFF;
  d5 -= d0;
  if (!flag_n) goto lbC00CFA0;
  d0 = d5;
  d0 = (uint32_t)(-(int32_t)d0);
  WRITE8(a1 + 17, d0);
  goto lbC00CFA0;
lbC00CFD2:
  B(d0) = (uint8_t)(d0 + 1);
  WRITE8(a1 + 16, d0);
  goto lbC00CFA0;
lbC00CFDA:
  a0 += 4;
  a1 += 4;
  B(d7) = (uint8_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC00CF88;
  /* MOVEM.L ?,d0,d7,a0,a6 */
  return;
}

static void lbC00CFEC(void) {
  /* MOVEM.L d0,d7,a0,a6,? */
  a2 = (uint32_t)(a6 + 198);
  a1 = (uint32_t)(a6 + 230);
  d7 = (uint32_t)(int32_t)(int8_t)(7);
lbC00CFFA:
  WRITE32_POST(a1, READ32_POST(a2));
  if ((int16_t)(--d7) >= 0) goto lbC00CFFA;
  WRITE32(a6 + 16, READ32(a6 + 12));
  a4 = a6;
  B(d7) = (uint8_t)(0);
lbC00D00A:
  flag_z=(READ32(a4 + 38)==0); flag_n=((int32_t)READ32(a4 + 38)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D016;
  B(d0) = (uint8_t)d7;
  RELEASENOTE();
lbC00D016:
  WRITE32(a4 + 166, 0);
  d0 = 0;
  B(d0) = (uint8_t)(READ8(a4 + 247));
  B(d0) = (uint8_t)(d0 + 1);
  WRITE32(a4 + 182, d0);
  B(d0) = (uint8_t)(READ8(a4 + 246));
  if (flag_z) goto lbC00D038;
  B(d0) = (uint8_t)(B(d0) - (uint8_t)(1));
  a3 = (uint32_t)(a0 + 64);
  W(d0) = (uint16_t)(d0 << 1);
  d0 = READ32(a3 + 0);
lbC00D038:
  WRITE32(a4 + 150, d0);
  a0 += 4;
  a4 += 4;
  B(d7) = (uint8_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_c) goto lbC00D00A;
  /* MOVEM.L ?,d0,d7,a0,a6 */
  return;
}

static void PlayTINY(void) {
  /* INTERRUPT	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVEA.L	SONIX(PC),A6 */
  /* MOVE.L	$18(A6),D0 */
  /* BEQ.S	lbC00D060 */
  /* MOVEA.L	D0,A0 */
  /* JSR	(A0) */
lbC00D060:
  lbC00D430();
  lbC00D070();
  lbC00D1DE();
  /* MOVEM.L	(SP)+,D0-D7/A0-A6 */
  return;
}

static void lbC00D070(void) {
  flag_z=(READ16(a6 + 30)==0); flag_n=((int32_t)READ16(a6 + 30)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D07E;
  WRITE16(a6 + 30, READ16(a6 + 30) - 1);
  if (!flag_z) goto lbC00D1DC;
lbC00D07E:
  W(d0) = (uint16_t)(READ16(a6 + 2));
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  { int32_t _cmp=(int32_t)d0-(int32_t)READ16(a6 + 32); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)READ16(a6 + 32)); }
  if (flag_z) goto lbC00D0CE;
  WRITE16(a6 + 32, d0);
  W(d0) = (uint16_t)(d0 << 1);
  a0 = (uint32_t)(uintptr_t)&lbW00D4CC;
  W(d1) = (uint16_t)(READ16(a0 + 0));
  W(d2) = (uint16_t)d1;
  d7 = (uint32_t)(int32_t)(int8_t)(12);
  W(d2) = (uint16_t)((uint32_t)(d2) >> d7);
  WRITE16(a6 + 36, d2);
  W(d2) = (uint16_t)(d2 << d7);
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)(0);
  d1 >>= 1;
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)d2); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)d2); d1=((uint32_t)r<<16)|q; }
  WRITE16(a6 + 34, d1);
  d1 = (uint32_t)((uint16_t)0x2E9C * (uint16_t)d1);
  d7 = (uint32_t)(int32_t)(int8_t)(15);
  d1 >>= d7;
  /* MOVE.B	D1,$BFE401 */
  /* LSR.W	#8,D1 */
  /* MOVE.B	D1,$BFE501 */
  /* MOVE.B	#$11,$BFEE01 */
  /* MOVEM.L a1,a5,? */
  a5 = (uint32_t)(uintptr_t)EagleBase;
  WRITE16(a5 + (intptr_t)dtg_Timer, d1);
  a1 = READ32(a5 + (intptr_t)dtg_SetTimer);
  ((void(*)(void))(uintptr_t)(READ32(a1)))();
  /* MOVEM.L ?,a1,a5 */
lbC00D0CE:
  flag_z=(READ16(a6 + 10)==0); flag_n=((int32_t)READ16(a6 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D1DC;
  WRITE16(a6 + 30, READ16(a6 + 36));
  a2 = READ32(a6 + 6);
  W(d6) = (uint16_t)(0);
lbC00D0E2:
  a1 = a2;
  a5 = a6;
  B(d7) = (uint8_t)(0);
lbC00D0E8:
  flag_z=(READ32(a5 + 166)==0); flag_n=((int32_t)READ32(a5 + 166)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D104;
  WRITE32(a5 + 166, READ32(a5 + 166) - 1);
  if (!flag_z) goto lbC00D100;
  flag_z=(READ32(a5 + 38)==0); flag_n=((int32_t)READ32(a5 + 38)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D100;
  B(d0) = (uint8_t)d7;
  RELEASENOTE();
lbC00D100:
  goto lbC00D19C;
lbC00D104:
  flag_z=(READ32(a5 + 182)==0); flag_n=((int32_t)READ32(a5 + 182)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D110;
  WRITE32(a5 + 182, READ32(a5 + 182) - 1);
  if (!flag_z) goto lbC00D100;
lbC00D110:
  d0 = READ32(a5 + 230);
  if (!flag_z) goto lbC00D11A;
lbC00D116:
  W(d6) = (uint16_t)(d6 + 1);
  goto lbC00D100;
lbC00D11A:
  a0 = d0;
lbC00D11C:
  W(d2) = (uint16_t)(READ16_POST(a0));
  if (flag_z) goto lbC00D11C;
  { int32_t _cmp=(int32_t)d2-(int32_t)0xFFFF; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)0xFFFF); }
  if (flag_z) goto lbC00D116;
  WRITE32(a5 + 230, a0);
  W(d3) = (uint16_t)d2;
  W(d2) = (uint16_t)((uint32_t)(d2) >> 8);
  W(d3) &= (uint16_t)(0xFF);
  flag_z=(d2==0); flag_n=((int32_t)d2<0); flag_c=0; flag_v=0;
  if (!flag_n) goto lbC00D156;
  { int32_t _cmp=(int32_t)d2-(int32_t)0x80; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)0x80); }
  if (flag_z) goto lbC00D198;
  { int32_t _cmp=(int32_t)d2-(int32_t)0x81; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)0x81); }
  if (!flag_z) goto lbC00D11C;
  d0 = 0;
  a3 = (uint32_t)(a2 + 64);
  W(d3) = (uint16_t)(d3 << 2);
  d0 = READ32(a3 + 0);
  WRITE32(a5 + 150, d0);
  goto lbC00D11C;
lbC00D156:
  flag_z=(READ32(a5 + 38)==0); flag_n=((int32_t)READ32(a5 + 38)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D198;
  d0 = READ32(a5 + 150);
  if (!flag_z) goto lbC00D168;
  d0 = READ32(a2 + 12);
  if (flag_z) goto lbC00D198;
lbC00D168:
  a0 = d0;
  W(d1) = (uint16_t)(READ16(a2 + 4));
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 4));
  W(d1) = (uint16_t)(W(d1) - (uint16_t)(8));
  W(d1) = (uint16_t)(d1 + d2);
  B(d0) = (uint8_t)d7;
  W(d2) = (uint16_t)(READ16(a1 + 18));
  { int32_t _cmp=(int32_t)READ16(a5 + 40)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a5 + 40)<(uint32_t)1); }
  if (flag_z) goto _STARTNOTE;
  W(d2) = (uint16_t)((uint32_t)(d2) >> 1);
_STARTNOTE:
  STARTNOTE();
  W(d0) = (uint16_t)d3;
  d0 = (uint32_t)((uint16_t)0xC000 * (uint16_t)d0);
  d0 = (d0 >> 16) | (d0 << 16);
  WRITE16(a5 + 168, d0);
  W(d3) = (uint16_t)(W(d3) - W(d0));
lbC00D198:
  WRITE16(a5 + 184, d3);
lbC00D19C:
  a1 += 4;
  a5 += 4;
  B(d7) = (uint8_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC00D0E8;
  d0 = READ32(a6 + 16);
  WRITE32(a6 + 16, READ32(a6 + 16) + 1);
  d1 = READ32(a6 + 20);
  if (!flag_n) goto lbC00D1C0;
  { int32_t _cmp=(int32_t)d6-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d6<(uint32_t)4); }
  if (!flag_z) goto lbC00D1DC;
  goto lbC00D1C4;
lbC00D1C0:
  { int32_t _cmp=(int32_t)d0-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d1); }
  if (!flag_z) goto lbC00D1DC;
lbC00D1C4:
  /* TST.W	10(A6) */
  /* BMI.S	lbC00D1D0 */
  /* SUBQ.W	#1,10(A6) */
  /* BEQ.S	lbC00D1DC */
lbC00D1D0:
  SongEnd();
  a0 = a2;
  lbC00CFEC();
  W(d6) = (uint16_t)(d6 + 1);
  goto lbC00D0E2;
lbC00D1DC:
}

static void lbC00D1DE(void) {
  W(d6) = (uint16_t)(0);
  d7 = 0;
  a0 = READ32(a6 + 6);
  a1 = (uint32_t)(a6 + 62);
lbC00D1EA:
  flag_z=(READ8(a1 + 0)==0); flag_n=((int32_t)READ8(a1 + 0)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC00D1F8;
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC00D216;
lbC00D1F8:
  d0 = READ32(a1 + 4);
  if (flag_z) goto lbC00D22A;
  a4 = d0;
  a4 = READ32(a4 + 0);
  /* MOVEM.L d6,d7,a0,a1,a6,? */
  ((void(*)(void))(uintptr_t)(READ32(a4 + 0)))();
  /* MOVEM.L ?,d6,d7,a0,a1,a6 */
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D216;
  d6 = d6 | (1u << (d7 & 31));
lbC00D216:
  { int32_t _cmp=(int32_t)READ8(a1 + 0)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 0)<(uint32_t)1); }
  if (flag_z) goto lbC00D22A;
  d0 = (uint32_t)(int32_t)(int8_t)(2);
  { int32_t _cmp=(int32_t)READ8(a1 + 0)-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 0)<(uint32_t)2); }
  if (!flag_z) goto lbC00D22E;
lbC00D22A:
  WRITE8(a1 + 1, d0);
lbC00D22E:
  WRITE8(a1 + 0, 0);
  W(a1) = (uint16_t)(a1 + 0x16);
  W(d7) = (uint16_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC00D1EA;
  paula_dma_write((uint16_t)(d6));
  W(d6) = (uint16_t)(0x8000);
  d7 = 0;
  a1 = (uint32_t)(a6 + 62);
  a2 = (uint32_t)0xDFF0A0;
lbC00D254:
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC00D276;
  a4 = READ32(a1 + 4);
  a4 = READ32(a4 + 0);
  /* MOVEM.L d6,d7,a0,a2,a6,? */
  ((void(*)(void))(uintptr_t)(READ32(a4 + 4)))();
  /* MOVEM.L ?,d6,d7,a0,a2,a6 */
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D276;
  d6 = d6 | (1u << (d7 & 31));
lbC00D276:
  W(a2) = (uint16_t)(a2 + 0x10);
  W(a1) = (uint16_t)(a1 + 0x16);
  W(d7) = (uint16_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC00D254;
  DMAWait();
  paula_dma_write((uint16_t)(d6));
  return;
}

static void lbC00D28E(void) {
  W(d0) = (uint16_t)(0);
  d0 = d0 | (1u << (d7 & 31));
  paula_dma_write((uint16_t)(d0));
  W(d0) = (uint16_t)d7;
  W(d0) = (uint16_t)(d0 << 4);
  a0 = (uint32_t)0xDFF0A0;
  WRITE16(a0 + 6, 2);
  return;
}

static void STARTNOTE(void) {
  /* MOVEM.L d1,d7,a0,a6,? */
  d3 = a0;
  if (flag_z) goto lbC00D352;
  a0 = d3;
  a5 = READ32(a6 + 6);
  a1 = (uint32_t)(a6 + 62);
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  if (!flag_n) goto lbC00D310;
  B(d5) = (uint8_t)(0);
  d7 = (uint32_t)(int32_t)(int8_t)(4);
lbC00D2CA:
  W(d6) = (uint16_t)d7;
  W(d0) = (uint16_t)(READ16(a6 + 54));
lbC00D2D0:
  W(d0) = (uint16_t)(d0 + 1);
  { int32_t _cmp=(int32_t)d0-(int32_t)d7; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d7); }
  if (flag_c) goto lbC00D2D8;
  W(d0) = (uint16_t)(0);
lbC00D2D8:
  W(d3) = (uint16_t)d0;
  d3 = (uint32_t)((uint16_t)0x16 * (uint16_t)d3);
  flag_z=(READ8(a1 + 0)==0); flag_n=((int32_t)READ8(a1 + 0)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC00D2EA;
  { int32_t _cmp=(int32_t)d5-(int32_t)READ8(a1 + 1); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d5<(uint32_t)READ8(a1 + 1)); }
  if (flag_z) goto lbC00D2FC;
lbC00D2EA:
  W(d6) = (uint16_t)(W(d6) - (uint16_t)(1));
  if (!flag_z) goto lbC00D2D0;
  { int32_t _cmp=(int32_t)d5-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d5<(uint32_t)0); }
  if (!flag_z) goto lbC00D352;
  B(d5) = (uint8_t)(2);
  goto lbC00D2CA;
lbC00D2FC:
  flag_z=(READ16(a6 + 10)==0); flag_n=((int32_t)READ16(a6 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D30C;
  W(d3) = (uint16_t)d0;
  W(d3) = (uint16_t)(d3 << 2);
  flag_z=(READ32(a6 + 38)==0); flag_n=((int32_t)READ32(a6 + 38)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC00D2EA;
lbC00D30C:
  WRITE16(a6 + 54, d0);
lbC00D310:
  W(d3) = (uint16_t)d0;
  d3 = (uint32_t)((uint16_t)0x16 * (uint16_t)d3);
  W(a1) = (uint16_t)(a1 + d3);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC00D334;
  a2 = READ32(a0 + 0);
  a3 = READ32(a1 + 4);
  a3 = READ32(a3 + 0);
  { int32_t _cmp=(int32_t)a2-(int32_t)a3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)a3); }
  if (flag_z) goto lbC00D334;
  STOPNOTE();
lbC00D334:
  WRITE32(a1 + 4, a0);
  WRITE8(a1 + 3, d1);
  W(d2) &= (uint16_t)(0xFF);
  WRITE16(a1 + 8, d2);
  WRITE8(a1 + 0, 1);
  d0 = (uint32_t)(int32_t)(int16_t)d0;
lbC00D34C:
  /* MOVEM.L ?,d1,d7,a0,a6 */
  return;
lbC00D352:
  goto lbC00D34C;
  /* RELEASESOUND	MOVE.L	D0,-(SP) */
  /* CLR.W	10(A6) */
  /* MOVEQ	#3,D0 */
  /* lbC00D35E	BSR.S	RELEASENOTE */
  /* DBRA	D0,lbC00D35E */
  /* MOVE.L	(SP)+,D0 */
  /* RTS */
}

static void RELEASENOTE(void) {
  /* MOVEM.L d0,a1,? */
  a1 = (uint32_t)(a6 + 62);
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  d0 = (uint32_t)((uint16_t)0x16 * (uint16_t)d0);
  W(a1) = (uint16_t)(a1 + d0);
  WRITE8(a1 + 0, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)1); }
  if (!flag_z) goto lbC00D38A;
  WRITE8(a1 + 0, 2);
lbC00D38A:
  /* MOVEM.L ?,d0,a1 */
  return;
  /* STOPSOUND	MOVE.L	D0,-(SP) */
  /* CLR.W	10(A6) */
  /* MOVEQ	#3,D0 */
  /* lbC00D398	BSR.S	STOPNOTE */
  /* DBRA	D0,lbC00D398 */
  /* MOVE.L	(SP)+,D0 */
  /* RTS */
}

static void STOPNOTE(void) {
  /* MOVEM.L d0,d7,a0,a1,? */
  a0 = READ32(a6 + 6);
  a1 = (uint32_t)(a6 + 62);
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  W(d7) = (uint16_t)d0;
  d0 = (uint32_t)((uint16_t)0x16 * (uint16_t)d0);
  W(a1) = (uint16_t)(a1 + d0);
  WRITE8(a1 + 0, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC00D3EC;
  WRITE8(a1 + 0, 3);
  d0 = READ32(a1 + 4);
  if (flag_z) goto lbC00D3E2;
  /* MOVEM.L d0,d7,a0,a6,? */
  a4 = d0;
  a4 = READ32(a4 + 0);
  ((void(*)(void))(uintptr_t)(READ32(a4 + 0)))();
  /* MOVEM.L ?,d0,d7,a0,a6 */
lbC00D3E2:
  WRITE8(a1 + 1, 0);
  WRITE8(a1 + 0, 0);
lbC00D3EC:
  /* MOVEM.L ?,d0,d7,a0,a1 */
  return;
}

static void RAMPVOLUME(void) {
  /* MOVEM.L d1,d2,a0,? */
  a0 = READ32(a6 + 6);
  WRITE16(a6 + 60, 0);
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D42A;
  d2 = (uint32_t)(int32_t)(int8_t)(0);
  W(d2) = (uint16_t)(READ16(a6 + 0));
  W(d2) = (uint16_t)(d2 << 8);
  WRITE16(a6 + 56, d2);
  W(d1) = (uint16_t)(d1 << 8);
  W(d2) = (uint16_t)(W(d2) - W(d1));
  if (!flag_c) goto lbC00D416;
  W(d2) = (uint16_t)(-(int16_t)W(d2));
lbC00D416:
  { uint16_t q=(uint16_t)((uint32_t)d2/(uint16_t)d0); uint16_t r=(uint16_t)((uint32_t)d2%(uint16_t)d0); d2=((uint32_t)r<<16)|q; }
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)d2;
  if (!flag_z) goto lbC00D420;
  W(d1) = (uint16_t)(d1 + 1);
lbC00D420:
  WRITE32(a6 + 58, d1);
lbC00D424:
  /* MOVEM.L ?,d1,d2,a0 */
  return;
lbC00D42A:
  WRITE16(a6 + 0, d1);
  goto lbC00D424;
}

static void lbC00D430(void) {
  W(d0) = (uint16_t)(READ16(a6 + 60));
  if (flag_z) goto lbC00D462;
  d0 = (uint32_t)((uint16_t)READ16(a6 + 34) * (uint16_t)d0);
  d0 = d0 << 1;
  if (flag_c) goto lbC00D464;
  d0 = (d0 >> 16) | (d0 << 16);
  W(d3) = (uint16_t)d0;
  W(d1) = (uint16_t)(READ16(a6 + 56));
  W(d2) = (uint16_t)(READ16(a6 + 58));
  W(d2) = (uint16_t)(W(d2) - W(d1));
  if (!flag_c) goto lbC00D452;
  W(d3) = (uint16_t)(-(int16_t)W(d3));
  W(d2) = (uint16_t)(-(int16_t)W(d2));
lbC00D452:
  { int32_t _cmp=(int32_t)d0-(int32_t)d2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d2); }
  if (!flag_c) goto lbC00D464;
  W(d1) = (uint16_t)(d1 + d3);
  WRITE16(a6 + 56, d1);
lbC00D45C:
  W(d1) = (uint16_t)((uint32_t)(d1) >> 8);
  WRITE16(a6 + 0, d1);
lbC00D462:
lbC00D464:
  W(d1) = (uint16_t)(READ16(a6 + 58));
  if (!flag_z) goto lbC00D476;
  WRITE32(a6 + 28, READ32(a6 + 28) & ~(1u << (0 & 31)));
  if (flag_z) goto lbC00D476;
  lbC00CF50();
lbC00D476:
  WRITE16(a6 + 60, 0);
  goto lbC00D45C;
  /* STEALTRACK	MOVEM.L	D1/A0,-(SP) */
  /* CLR.W	D1 */
  /* MOVE.B	D0,D1 */
  /* ASL.W	#2,D1 */
  /* LEA	$28(A6,D1.W),A0 */
  /* TST.W	(A0) */
  /* BEQ.S	lbC00D494 */
  /* BSR.L	STOPNOTE */
  /* CLR.W	(A0) */
  /* lbC00D494	MOVEM.L	(SP)+,D1/A0 */
  /* RTS */
  /* RESUMETRACK	MOVEM.L	D0/A0,-(SP) */
  /* EXT.W	D0 */
  /* ASL.W	#2,D0 */
  /* MOVEA.L	6(A6),A0 */
  /* MOVE.W	$22(A0,D0.W),$28(A6,D0.W) */
  /* MOVEM.L	(SP)+,D0/A0 */
  /* RTS */
  /* lbW00D4B2	dc.w	$8000 */
  /* dc.w	$78D1 */
  /* dc.w	$7209 */
  /* dc.w	$6BA2 */
  /* dc.w	$6598 */
  /* dc.w	$5FE4 */
  /* dc.w	$5A82 */
  /* dc.w	$556E */
  /* dc.w	$50A3 */
  /* dc.w	$4C1C */
  /* dc.w	$47D6 */
  /* dc.w	$43CE */
  /* dc.w	$4000 */
  /* lbW00D4CC	dc.w	$FA83 */
  /* dc.w	$F525 */
  /* dc.w	$EFE4 */
  /* dc.w	$EAC0 */
  /* dc.w	$E5B9 */
  /* dc.w	$E0CC */
  /* dc.w	$DBFB */
  /* dc.w	$D744 */
  /* dc.w	$D2A8 */
  /* dc.w	$CE24 */
  /* dc.w	$C9B9 */
  /* dc.w	$C567 */
  /* dc.w	$C12C */
  /* dc.w	$BD08 */
  /* dc.w	$B8FB */
  /* dc.w	$B504 */
  /* dc.w	$B123 */
  /* dc.w	$AD58 */
  /* dc.w	$A9A1 */
  /* dc.w	$A5FE */
  /* dc.w	$A270 */
  /* dc.w	$9EF5 */
  /* dc.w	$9B8D */
  /* dc.w	$9837 */
  /* dc.w	$94F4 */
  /* dc.w	$91C3 */
  /* dc.w	$8EA4 */
  /* dc.w	$8B95 */
  /* dc.w	$8898 */
  /* dc.w	$85AA */
  /* dc.w	$82CD */
  /* dc.w	$8000 */
  /* dc.w	$7D41 */
  /* dc.w	$7A92 */
  /* dc.w	$77F2 */
  /* dc.w	$7560 */
  /* dc.w	$72DC */
  /* dc.w	$7066 */
  /* dc.w	$6DFD */
  /* dc.w	$6BA2 */
  /* dc.w	$6954 */
  /* dc.w	$6712 */
  /* dc.w	$64DC */
  /* dc.w	$62B3 */
  /* dc.w	$6096 */
  /* dc.w	$5E84 */
  /* dc.w	$5C7D */
  /* dc.w	$5A82 */
  /* dc.w	$5891 */
  /* dc.w	$56AC */
  /* dc.w	$54D0 */
  /* dc.w	$52FF */
  /* dc.w	$5138 */
  /* dc.w	$4F7A */
  /* dc.w	$4DC6 */
  /* dc.w	$4C1B */
  /* dc.w	$4A7A */
  /* dc.w	$48E1 */
  /* dc.w	$4752 */
  /* dc.w	$45CA */
  /* dc.w	$444C */
  /* dc.w	$42D5 */
  /* dc.w	$4166 */
  /* dc.w	$4000 */
  /* dc.w	$3EA0 */
  /* dc.w	$3D49 */
  /* dc.w	$3BF9 */
  /* dc.w	$3AB0 */
  /* dc.w	$396E */
  /* dc.w	$3833 */
  /* dc.w	$36FE */
  /* dc.w	$35D1 */
  /* dc.w	$34AA */
  /* dc.w	$3389 */
  /* dc.w	$326E */
  /* dc.w	$3159 */
  /* dc.w	$304B */
  /* dc.w	$2F42 */
  /* dc.w	$2E3E */
  /* dc.w	$2D41 */
  /* dc.w	$2C48 */
  /* dc.w	$2B56 */
  /* dc.w	$2A68 */
  /* dc.w	$297F */
  /* dc.w	$289C */
  /* dc.w	$27BD */
  /* dc.w	$26E3 */
  /* dc.w	$260D */
  /* dc.w	$253D */
  /* dc.w	$2470 */
  /* dc.w	$23A9 */
  /* dc.w	$22E5 */
  /* dc.w	$2226 */
  /* dc.w	$216A */
  /* dc.w	$20B3 */
  /* dc.w	$2000 */
  /* dc.w	$1F50 */
  /* dc.w	$1EA4 */
  /* dc.w	$1DFC */
  /* dc.w	$1D58 */
  /* dc.w	$1CB7 */
  /* dc.w	$1C19 */
  /* dc.w	$1B7F */
  /* dc.w	$1AE8 */
  /* dc.w	$1A55 */
  /* dc.w	$19C4 */
  /* dc.w	$1937 */
  /* dc.w	$18AC */
  /* dc.w	$1825 */
  /* dc.w	$17A1 */
  /* dc.w	$171F */
  /* dc.w	$16A0 */
  /* dc.w	$1624 */
  /* dc.w	$15AB */
  /* dc.w	$1534 */
  /* dc.w	$14BF */
  /* dc.w	$144E */
  /* dc.w	$13DE */
  /* dc.w	$1371 */
  /* dc.w	$1306 */
  /* dc.w	$129E */
  /* dc.w	$1238 */
  /* dc.w	$11D4 */
  /* dc.w	$1172 */
  /* dc.w	$1113 */
  /* dc.w	$10B5 */
  /* dc.w	$1059 */
  /* dc.w	$1000 */
SYNTHTECH:
  goto lbC00D5FE;
  goto lbC00D5D4;
lbC00D5D4:
  d0 = 0;
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC00D5FC;
  WRITE32(a2 + 0, READ32(a1 + 12));
  WRITE16(a2 + 4, READ16(a1 + 16));
  WRITE16(a2 + 6, READ16(a1 + 18));
  /* MOVE.W	$14(A1),8(A2) */
  WRITE32_PRE(sp, d0);
  d0 = READ32(a1 + 12);
  SetAdr();
  W(d0) = (uint16_t)(READ16(a1 + 16));
  SetLen();
  W(d0) = (uint16_t)(READ16(a1 + 18));
  SetPer();
  W(d0) = (uint16_t)(READ16(a1 + 20));
  ChangeVolume();
  d0 = READ32_POST(sp);
  W(d0) = (uint16_t)(READ16(a1 + 10));
  WRITE16(a1 + 10, 0);
lbC00D5FC:
lbC00D5FE:
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC00D9D0;
  a3 = READ32(a1 + 4);
  a2 = (uint32_t)(a6 + 266);
  W(d0) = (uint16_t)d7;
  d0 = (uint32_t)((uint16_t)0x1A * (uint16_t)d0);
  W(a2) = (uint16_t)(a2 + d0);
  B(d0) = (uint8_t)(READ8(a1 + 0));
  if (flag_z) goto lbC00D71A;
  { int32_t _cmp=(int32_t)d0-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)1); }
  if (!flag_z) goto lbC00D6FE;
  d1 = 0;
  B(d1) = (uint8_t)(READ8(a1 + 3));
  { int32_t _cmp=(int32_t)d1-(int32_t)0x24; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)0x24); }
  if (flag_n==flag_v) goto lbC00D644;
lbC00D632:
  WRITE8(a1 + 0, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC00D9D0;
  goto lbC00D71A;
lbC00D644:
  { int32_t _cmp=(int32_t)d1-(int32_t)0x6C; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)0x6C); }
  if (flag_n==flag_v) goto lbC00D632;
  W(d1) = (uint16_t)(W(d1) - (uint16_t)(0x24));
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (!flag_z) goto lbC00D65A;
  WRITE32(a2 + 12, 0);
lbC00D65A:
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)1); }
  if (flag_z) goto lbC00D666;
  WRITE16(a2 + 10, 0);
lbC00D666:
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)12); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)12); d1=((uint32_t)r<<16)|q; }
  W(d2) = (uint16_t)d1;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)(d1 << 1);
  a0 = (uint32_t)(uintptr_t)&lbW00D4B2;
  W(d0) = (uint16_t)(0xD5C8);
  d0 = (uint32_t)((uint16_t)READ16(a0 + 0) * (uint16_t)d0);
  W(d2) = (uint16_t)(d2 + 0x11);
  d0 >>= d2;
  flag_z=(READ16(a2 + 0)==0); flag_n=((int32_t)READ16(a2 + 0)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC00D68E;
  WRITE16(a2 + 2, 0);
  goto lbC00D6B6;
lbC00D68E:
  W(d1) = (uint16_t)d0;
  W(d1) = (uint16_t)(W(d1) - READ16(a2 + 0));
  d1 = (uint32_t)(int32_t)(int16_t)d1;
  W(d2) = (uint16_t)(READ16(a3 + 406));
  d2 = (d2 >> 16) | (d2 << 16);
  W(d2) = (uint16_t)(0);
  d2 >>= 1;
  { uint16_t q=(uint16_t)((uint32_t)d2/(uint16_t)READ16(a6 + 34)); uint16_t r=(uint16_t)((uint32_t)d2%(uint16_t)READ16(a6 + 34)); d2=((uint32_t)r<<16)|q; }
  W(d2) = (uint16_t)((uint32_t)(d2) >> 3);
  W(d2) = (uint16_t)(d2 + 1);
  WRITE16(a2 + 2, d2);
  { int16_t q=(int16_t)((int32_t)d1/(int16_t)d2); int16_t r=(int16_t)((int32_t)d1%(int16_t)d2); d1=((uint32_t)(uint16_t)r<<16)|(uint16_t)q; }
  WRITE16(a2 + 4, d1);
  d1 = (uint32_t)((uint16_t)d2 * (uint16_t)d1);
  W(d0) = (uint16_t)(W(d0) - W(d1));
lbC00D6B6:
  WRITE16(a2 + 0, d0);
  WRITE16(a2 + 24, 1);
  flag_z=(READ16(a3 + 422)==0); flag_n=((int32_t)READ16(a3 + 422)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC00D6CA;
  WRITE16(a2 + 22, 0);
lbC00D6CA:
  WRITE16(a2 + 18, 0);
  flag_z=(READ16(a3 + 418)==0); flag_n=((int32_t)READ16(a3 + 418)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D6F6;
  WRITE16(a2 + 16, 0);
  W(d0) = (uint16_t)(READ16(a3 + 420));
  d0 = (d0 >> 16) | (d0 << 16);
  W(d0) = (uint16_t)(0);
  d0 >>= 1;
  { uint16_t q=(uint16_t)((uint32_t)d0/(uint16_t)READ16(a6 + 34)); uint16_t r=(uint16_t)((uint32_t)d0%(uint16_t)READ16(a6 + 34)); d0=((uint32_t)r<<16)|q; }
  W(d0) = (uint16_t)((uint32_t)(d0) >> 2);
  WRITE16(a2 + 18, d0);
  B(d0) = (uint8_t)(READ8(a3 + 136));
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  WRITE16(a2 + 20, d0);
lbC00D6F6:
  WRITE16(a1 + 10, 0xFFFF);
  goto lbC00D71A;
lbC00D6FE:
  { int32_t _cmp=(int32_t)d0-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)2); }
  if (!flag_z) goto lbC00D70C;
  WRITE16(a2 + 10, 6);
  goto lbC00D71A;
lbC00D70C:
  { int32_t _cmp=(int32_t)d0-(int32_t)3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)3); }
  if (!flag_z) goto lbC00D71A;
  lbC00D28E();
  goto lbC00D9D0;
lbC00D71A:
  flag_z=(READ16(a2 + 18)==0); flag_n=((int32_t)READ16(a2 + 18)<0); flag_c=0; flag_v=0;
  if (flag_n) goto lbC00D760;
  if (flag_z) goto lbC00D728;
  WRITE16(a2 + 18, READ16(a2 + 18) - 1);
  goto lbC00D760;
lbC00D728:
  W(d0) = (uint16_t)(READ16(a2 + 16));
  W(d1) = (uint16_t)(READ16(a3 + 416));
  d1 = (uint32_t)((uint16_t)READ16(a6 + 34) * (uint16_t)d1);
  d1 = d1 << 6;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d0) = (uint16_t)(d0 + d1);
  if (!flag_c) goto lbC00D74C;
  flag_z=(READ16(a3 + 418)==0); flag_n=((int32_t)READ16(a3 + 418)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D74C;
  if (flag_n) goto lbC00D74C;
  WRITE16(a2 + 18, 0xFFFF);
  goto lbC00D760;
lbC00D74C:
  WRITE16(a2 + 16, d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  a0 = (uint32_t)(a3 + 136);
  B(d0) = (uint8_t)(READ8(a0 + 0));
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  WRITE16(a2 + 20, d0);
lbC00D760:
  W(d0) = (uint16_t)(READ16(a2 + 10));
  a0 = (uint32_t)(a3 + 0);
  d1 = 0;
  W(d1) = (uint16_t)(READ16(a0 + 426));
  d1 = (d1 >> 16) | (d1 << 16);
  d2 = READ32(a2 + 12);
  d3 = 0;
  W(d3) = (uint16_t)(READ16(a0 + 434));
  W(d0) = (uint16_t)d3;
  W(d0) = (uint16_t)((uint32_t)(d0) >> 5);
  W(d0) ^= (uint16_t)(7);
  W(d3) &= (uint16_t)(0x1F);
  W(d3) = (uint16_t)(d3 + 0x21);
  d3 = (uint32_t)((uint16_t)READ16(a6 + 34) * (uint16_t)d3);
  d3 = d3 << 3;
  d3 >>= d0;
  d0 = d1;
  d0 -= d2;
  if (!flag_n) goto lbC00D79A;
  d0 = (uint32_t)(-(int32_t)d0);
lbC00D79A:
  { int32_t _cmp=(int32_t)d0-(int32_t)d3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d3); }
  if (!flag_z && (flag_n==flag_v)) goto lbC00D7B0;
  d2 = d1;
  { int32_t _cmp=(int32_t)READ16(a2 + 10)-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a2 + 10)<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC00D7BA;
  WRITE16(a2 + 10, READ16(a2 + 10) + 2);
  goto lbC00D7BA;
lbC00D7B0:
  { int32_t _cmp=(int32_t)d2-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)d1); }
  if (flag_n!=flag_v) goto lbC00D7B8;
  d2 -= d3;
  goto lbC00D7BA;
lbC00D7B8:
  d2 += d3;
lbC00D7BA:
  WRITE32(a2 + 12, d2);
  W(d0) = (uint16_t)(READ16(a2 + 0));
  d2 = (uint32_t)(int32_t)(int8_t)(5);
  flag_z=(READ16(a2 + 2)==0); flag_n=((int32_t)READ16(a2 + 2)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D7D6;
  WRITE16(a2 + 2, READ16(a2 + 2) - 1);
  W(d0) = (uint16_t)(d0 + READ16(a2 + 4));
  WRITE16(a2 + 0, d0);
lbC00D7D6:
  { int32_t _cmp=(int32_t)d0-(int32_t)0x1AC; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x1AC); }
  if (flag_z||(flag_n!=flag_v)) goto lbC00D7E2;
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(1));
  goto lbC00D7D6;
lbC00D7E2:
  WRITE16(a2 + 8, d2);
  d1 = (uint32_t)(int32_t)(int8_t)(0x40);
  W(d1) = (uint16_t)((uint32_t)(d1) >> d2);
  WRITE16(a1 + 16, d1);
  W(d1) = (uint16_t)(READ16(a2 + 20));
  W(d2) = (uint16_t)(READ16(a3 + 408));
  d1 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d1);
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 7));
  W(d2) = (uint16_t)(READ16(a6 + 4));
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(0x80));
  W(d1) = (uint16_t)(W(d1) - W(d2));
  W(d1) = (uint16_t)(d1 + 0x1000);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(12);
  d0 >>= d1;
  WRITE16(a1 + 18, d0);
  W(d0) = (uint16_t)(READ16(a3 + 400));
  W(d1) = (uint16_t)(READ16(a2 + 20));
  W(d1) = (uint16_t)(-(int16_t)W(d1));
  W(d2) = (uint16_t)(READ16(a3 + 404));
  d1 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d1);
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 8));
  W(d0) = (uint16_t)(d0 + d1);
  flag_z=(READ16(a3 + 402)==0); flag_n=((int32_t)READ16(a3 + 402)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00D838;
  d1 = READ32(a2 + 12);
  d1 = (d1 >> 16) | (d1 << 16);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  goto lbC00D842;
lbC00D838:
  { int32_t _cmp=(int32_t)READ16(a2 + 10)-(int32_t)6; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a2 + 10)<(uint32_t)6); }
  if (!flag_z) goto lbC00D842;
  W(d0) = (uint16_t)(0);
lbC00D842:
  W(d0) &= (uint16_t)(0xFF);
  W(d0) = (uint16_t)(d0 + 1);
  d0 = (uint32_t)((uint16_t)READ16(a6 + 0) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  W(d0) = (uint16_t)(d0 + 1);
  d0 = (uint32_t)((uint16_t)READ16(a1 + 8) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  W(d0) = (uint16_t)(d0 + 1);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 2);
  WRITE16(a1 + 20, d0);
  W(d0) = (uint16_t)(READ16(a3 + 412));
  d1 = READ32(a2 + 12);
  d1 = (d1 >> 16) | (d1 << 16);
  d1 = (uint32_t)((uint16_t)d0 * (uint16_t)d1);
  W(d1) = (uint16_t)((uint32_t)(d1) >> 8);
  W(d0) = (uint16_t)(READ16(a3 + 410));
  W(d0) ^= (uint16_t)(0xFF);
  W(d0) = (uint16_t)(W(d0) - W(d1));
  W(d1) = (uint16_t)(READ16(a2 + 20));
  W(d2) = (uint16_t)(READ16(a3 + 414));
  d1 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d1);
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 8));
  W(d0) = (uint16_t)(d0 + d1);
  W(d0) &= (uint16_t)(0xFF);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 2);
  W(d0) = (uint16_t)(d0 << 7);
  a0 = READ32(a3 + 4);
  d1 = a0;
  if (!flag_z) goto lbC00D89A;
  a0 = (uint32_t)(a3 + 8);
  W(d0) = (uint16_t)(0);
lbC00D89A:
  W(a0) = (uint16_t)(a0 + d0);
  W(d0) = (uint16_t)(READ16(a2 + 6));
  W(d0) ^= (uint16_t)(0x80);
  WRITE16(a2 + 6, d0);
  a4 = READ32(a6 + 262);
  a4 = (uint32_t)(a4 + 0);
  W(d0) = (uint16_t)(0x100);
  d0 = (uint32_t)((uint16_t)d7 * (uint16_t)d0);
  W(a4) = (uint16_t)(a4 + d0);
  WRITE32(a1 + 12, a4);
  flag_z=(READ16(a3 + 422)==0); flag_n=((int32_t)READ16(a3 + 422)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC00D8DC;
  W(d3) = (uint16_t)(READ16(a2 + 8));
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  d1 = d1 | (1u << (d3 & 31));
  W(d4) = (uint16_t)(0x80);
  W(d4) = (uint16_t)((uint32_t)(d4) >> d3);
lbC00D8D0:
  WRITE8_POST(a4, READ8(a0));
  W(a0) = (uint16_t)(a0 + d1);
  W(d4) = (uint16_t)(W(d4) - (uint16_t)(1));
  if (!flag_z) goto lbC00D8D0;
  goto lbC00D9D0;
lbC00D8DC:
  flag_z=(READ16(a3 + 424)==0); flag_n=((int32_t)READ16(a3 + 424)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC00D94E;
  W(d3) = (uint16_t)(READ16(a2 + 8));
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  d1 = d1 | (1u << (d3 & 31));
  W(d2) = (uint16_t)(READ16(a1 + 16));
  W(d2) = (uint16_t)(d2 << 1);
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(1));
  W(d4) = (uint16_t)(READ16(a3 + 422));
  d4 = (uint32_t)((uint16_t)READ16(a6 + 34) * (uint16_t)d4);
  d0 = (uint32_t)(int32_t)(int8_t)(13);
  d4 >>= d0;
  W(d4) = (uint16_t)(d4 + READ16(a2 + 22));
  WRITE16(a2 + 22, d4);
  d0 = (uint32_t)(int32_t)(int8_t)(9);
  W(d4) = (uint16_t)((uint32_t)(d4) >> d0);
  a5 = (uint32_t)(a0 + 0);
  W(d4) = (uint16_t)((uint32_t)(d4) >> d3);
  W(d2) = (uint16_t)(W(d2) - W(d4));
lbC00D914:
  B(d0) = (uint8_t)(READ8(a0));
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  B(d3) = (uint8_t)(READ8(a5));
  d3 = (uint32_t)(int32_t)(int16_t)(int8_t)d3;
  W(d0) = (uint16_t)(d0 + d3);
  W(d0) = (uint16_t)((uint32_t)((int32_t)d0 >> 1));
  WRITE8_POST(a4, d0);
  W(a0) = (uint16_t)(a0 + d1);
  W(a5) = (uint16_t)(a5 + d1);
  if ((int16_t)(--d2) >= 0) goto lbC00D914;
  W(a5) = (uint16_t)(W(a5) - (uint16_t)(0x80));
  W(d4) = (uint16_t)(W(d4) - (uint16_t)(1));
  if (flag_n) goto lbC00D9D0;
lbC00D934:
  B(d0) = (uint8_t)(READ8(a0));
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  B(d3) = (uint8_t)(READ8(a5));
  d3 = (uint32_t)(int32_t)(int16_t)(int8_t)d3;
  W(d0) = (uint16_t)(d0 + d3);
  W(d0) = (uint16_t)((uint32_t)((int32_t)d0 >> 1));
  WRITE8_POST(a4, d0);
  W(a0) = (uint16_t)(a0 + d1);
  W(a5) = (uint16_t)(a5 + d1);
  if ((int16_t)(--d4) >= 0) goto lbC00D934;
  goto lbC00D9D0;
lbC00D94E:
  W(d0) = (uint16_t)(READ16(a3 + 422));
  d0 = (uint32_t)((uint16_t)READ16(a6 + 34) * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(11);
  d0 >>= d1;
  d0 = (uint32_t)((int32_t)(int16_t)READ16(a2 + 24) * (int32_t)(int16_t)d0);
  W(d0) = (uint16_t)(d0 + READ16(a2 + 22));
  if (!flag_v) goto lbC00D974;
  { int32_t _cmp=(int32_t)d0-(int32_t)0x8000; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x8000); }
  if (!flag_z) goto lbC00D96E;
  W(d0) = (uint16_t)(d0 + READ16(a2 + 24));
lbC00D96E:
  W(READ16(a2 + 24)) = (uint16_t)(-(int16_t)W(READ16(a2 + 24)));
  W(d0) = (uint16_t)(-(int16_t)W(d0));
lbC00D974:
  WRITE16(a2 + 22, d0);
  W(d1) = (uint16_t)(READ16(a3 + 424));
  d0 = (uint32_t)((int32_t)(int16_t)d1 * (int32_t)(int16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(0x11);
  W(d1) = (uint16_t)(d1 + READ16(a2 + 8));
  d0 = (uint32_t)((int32_t)d0 >> d1);
  W(d2) = (uint16_t)(READ16(a1 + 16));
  W(d3) = (uint16_t)d2;
  W(d2) = (uint16_t)(d2 + d0);
  W(d3) = (uint16_t)(W(d3) - W(d0));
  W(d6) = (uint16_t)d2;
  if (flag_z) goto lbC00D9B0;
  W(d0) = (uint16_t)(0);
  W(d1) = (uint16_t)(0);
  d4 = (uint32_t)(int32_t)(int8_t)(0x40);
  { uint16_t q=(uint16_t)((uint32_t)d4/(uint16_t)d2); uint16_t r=(uint16_t)((uint32_t)d4%(uint16_t)d2); d4=((uint32_t)r<<16)|q; }
  W(d5) = (uint16_t)d4;
  d4 = (d4 >> 16) | (d4 << 16);
lbC00D9A0:
  WRITE8_POST(a4, READ8(a0 + 0));
  W(d1) = (uint16_t)(W(d1) - W(d4));
  if (!flag_c) goto lbC00D9AA;
  W(d1) = (uint16_t)(d1 + d2);
lbC00D9AA:
  W(d0) = (uint16_t)(d0 + d5 + flag_x);
  W(d6) = (uint16_t)(W(d6) - (uint16_t)(1));
  if (!flag_z) goto lbC00D9A0;
lbC00D9B0:
  W(d6) = (uint16_t)d3;
  if (flag_z) goto lbC00D9D0;
  d0 = (uint32_t)(int32_t)(int8_t)(0x40);
  W(d1) = (uint16_t)(0);
  d4 = (uint32_t)(int32_t)(int8_t)(0x40);
  { uint16_t q=(uint16_t)((uint32_t)d4/(uint16_t)d3); uint16_t r=(uint16_t)((uint32_t)d4%(uint16_t)d3); d4=((uint32_t)r<<16)|q; }
  W(d5) = (uint16_t)d4;
  d4 = (d4 >> 16) | (d4 << 16);
lbC00D9C0:
  WRITE8_POST(a4, READ8(a0 + 0));
  W(d1) = (uint16_t)(W(d1) - W(d4));
  if (!flag_c) goto lbC00D9CA;
  W(d1) = (uint16_t)(d1 + d3);
lbC00D9CA:
  W(d0) = (uint16_t)(d0 + d5 + flag_x);
  W(d6) = (uint16_t)(W(d6) - (uint16_t)(1));
  if (!flag_z) goto lbC00D9C0;
lbC00D9D0:
  d0 = 0;
  return;
}

static void SETFILTER(void) {
  /* MOVEM.L d0,d7,a0,a6,? */
  a1 = READ32(a0 + 4);
  a0 = (uint32_t)(a0 + 8);
  OneFilter(); return;
  /* LEA	lbW00DA38(PC),A2 */
  /* CLR.W	D3 */
  /* MOVE.B	$7F(A0),D4 */
  /* EXT.W	D4 */
  /* ASL.W	#7,D4 */
  /* CLR.W	D0 */
  /* lbC00D9F0	MOVE.W	(A2)+,D1 */
  /* MOVE.W	#$8000,D2 */
  /* SUB.W	D1,D2 */
  /* MULU.W	#$E666,D2 */
  /* SWAP	D2 */
  /* LSR.W	#1,D1 */
  /* CLR.W	D5 */
  /* lbC00DA02	MOVE.B	0(A0,D5.W),D6 */
  /* EXT.W	D6 */
  /* ASL.W	#7,D6 */
  /* SUB.W	D4,D6 */
  /* MULS.W	D1,D6 */
  /* ASL.L	#2,D6 */
  /* SWAP	D6 */
  /* ADD.W	D6,D3 */
  /* ADD.W	D3,D4 */
  /* ROR.W	#7,D4 */
  /* MOVE.B	D4,(A1)+ */
  /* ROL.W	#7,D4 */
  /* MULS.W	D2,D3 */
  /* ASL.L	#1,D3 */
  /* SWAP	D3 */
  /* ADDQ.W	#1,D5 */
  /* CMPI.W	#$80,D5 */
  /* BCS.S	lbC00DA02 */
  /* ADDQ.W	#1,D0 */
  /* CMPI.W	#$40,D0 */
  /* BNE.S	lbC00D9F0 */
  /* MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* lbW00DA38	dc.w	$8000 */
  /* dc.w	$7683 */
  /* dc.w	$6DBA */
  /* dc.w	$6597 */
  /* dc.w	$5E10 */
  /* dc.w	$5717 */
  /* dc.w	$50A2 */
  /* dc.w	$4AA8 */
  /* dc.w	$451F */
  /* dc.w	$4000 */
  /* dc.w	$3B41 */
  /* dc.w	$36DD */
  /* dc.w	$32CB */
  /* dc.w	$2F08 */
  /* dc.w	$2B8B */
  /* dc.w	$2851 */
  /* dc.w	$2554 */
  /* dc.w	$228F */
  /* dc.w	$2000 */
  /* dc.w	$1DA0 */
  /* dc.w	$1B6E */
  /* dc.w	$1965 */
  /* dc.w	$1784 */
  /* dc.w	$15C5 */
  /* dc.w	$1428 */
  /* dc.w	$12AA */
  /* dc.w	$1147 */
  /* dc.w	$1000 */
  /* dc.w	$ED0 */
  /* dc.w	$DB7 */
  /* dc.w	$CB2 */
  /* dc.w	$BC2 */
  /* dc.w	$AE2 */
  /* dc.w	$A14 */
  /* dc.w	$955 */
  /* dc.w	$8A3 */
  /* dc.w	$800 */
  /* dc.w	$768 */
  /* dc.w	$6DB */
  /* dc.w	$659 */
  /* dc.w	$5E1 */
  /* dc.w	$571 */
  /* dc.w	$50A */
  /* dc.w	$4AA */
  /* dc.w	$451 */
  /* dc.w	$400 */
  /* dc.w	$3B4 */
  /* dc.w	$36D */
  /* dc.w	$32C */
  /* dc.w	$2F0 */
  /* dc.w	$2B8 */
  /* dc.w	$285 */
  /* dc.w	$255 */
  /* dc.w	$228 */
  /* dc.w	$200 */
  /* dc.w	$1DA */
  /* dc.w	$1B6 */
  /* dc.w	$196 */
  /* dc.w	$178 */
  /* dc.w	$15C */
  /* dc.w	$142 */
  /* dc.w	$12A */
  /* dc.w	$114 */
  /* dc.w	$100 */
SSTECH:
  goto lbC00DB0A;
  goto lbC00DAC0;
lbC00DAC0:
  d0 = 0;
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC00DB08;
  flag_z=(READ16(a1 + 10)==0); flag_n=((int32_t)READ16(a1 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00DAFC;
  WRITE16(a1 + 10, READ16(a1 + 10) - 1);
  if (flag_z) goto lbC00DAE4;
  WRITE16(a2 + 4, READ16(a1 + 16));
  WRITE32(a2 + 0, READ32(a1 + 12));
  d0 = READ32(a1 + 12);
  SetAdr();
  W(d0) = (uint16_t)(READ16(a1 + 16));
  SetLen();
  W(d0) = (uint16_t)(READ16(a1 + 18));
  SetPer();
  d0 = (uint32_t)(int32_t)(int8_t)(-1);
  goto lbC00DAFC;
lbC00DAE4:
  W(d1) = (uint16_t)d7;
  d1 = (uint32_t)((uint16_t)0x14 * (uint16_t)d1);
  W(a3) = (uint16_t)(a3 + d1);
  WRITE16(a2 + 4, READ16(a3 + 4));
  WRITE32(a2 + 0, READ32(a3 + 0));
lbC00DAFC:
  WRITE16(a2 + 6, READ16(a1 + 18));
  /* MOVE.W	$14(A1),8(A2) */
  WRITE32_PRE(sp, d0);
  W(d0) = (uint16_t)(READ16(a1 + 20));
  ChangeVolume();
  d0 = READ32_POST(sp);
lbC00DB08:
lbC00DB0A:
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_n!=flag_v) goto lbC00DB14;
  d0 = 0;
  return;
lbC00DB14:
  a3 = READ32(a1 + 4);
  a2 = (uint32_t)(a6 + 370);
  W(d0) = (uint16_t)d7;
  d0 = (uint32_t)((uint16_t)0x14 * (uint16_t)d0);
  W(a2) = (uint16_t)(a2 + d0);
  B(d0) = (uint8_t)(READ8(a1 + 0));
  if (flag_z) goto lbC00DC32;
  { int32_t _cmp=(int32_t)d0-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)1); }
  if (!flag_z) goto lbC00DC16;
  a5 = READ32(a3 + 4);
  d1 = 0;
  B(d1) = (uint8_t)(READ8(a1 + 3));
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)12); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)12); d1=((uint32_t)r<<16)|q; }
  W(d2) = (uint16_t)d1;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(10));
  W(d2) = (uint16_t)(-(int16_t)W(d2));
  { int32_t _cmp=(int32_t)d2-(int32_t)READ8(a5 + 5); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)READ8(a5 + 5)); }
  if (flag_z||(flag_n!=flag_v)) goto lbC00DB64;
lbC00DB52:
  WRITE8(a1 + 0, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC00DD24;
  goto lbC00DC32;
lbC00DB64:
  { int32_t _cmp=(int32_t)d2-(int32_t)READ8(a5 + 4); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)READ8(a5 + 4)); }
  if (flag_n!=flag_v) goto lbC00DB52;
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (!flag_z) goto lbC00DB76;
  WRITE32(a2 + 10, 0);
lbC00DB76:
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)1); }
  if (flag_z) goto lbC00DB82;
  WRITE16(a2 + 8, 0);
lbC00DB82:
  W(d1) = (uint16_t)(d1 << 1);
  a0 = (uint32_t)(uintptr_t)&lbW00D4B2;
  W(d0) = (uint16_t)(0xD5C8);
  d0 = (uint32_t)((uint16_t)READ16(a0 + 0) * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(15);
  d0 >>= d1;
  WRITE16(a2 + 6, d0);
  d0 = (uint32_t)(int32_t)(int8_t)(1);
  d0 = d0 << d2;
  d4 = d0;
  d1 = (uint32_t)(int32_t)(int8_t)(1);
  W(d3) = (uint16_t)(0);
  B(d3) = (uint8_t)(READ8(a5 + 4));
  d1 = d1 << d3;
  d0 -= d1;
  d0 = (uint32_t)((uint16_t)READ16(a5 + 0) * (uint16_t)d0);
  a0 = (uint32_t)(a5 + 62);
  WRITE32(a1 + 12, a0);
  W(d0) = (uint16_t)(READ16(a5 + 0));
  d0 = (uint32_t)((uint16_t)d4 * (uint16_t)d0);
  d0 >>= 1;
  WRITE16(a1 + 16, d0);
  a0 = READ32(a6 + 262);
  W(a0) = (uint16_t)(a0 + 0x400);
  d0 = (uint32_t)(int32_t)(int8_t)(4);
  W(d1) = (uint16_t)(READ16(a5 + 2));
  { int32_t _cmp=(int32_t)d1-(int32_t)READ16(a5 + 0); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)READ16(a5 + 0)); }
  if (flag_z) goto lbC00DBEA;
  d1 = (uint32_t)((uint16_t)d4 * (uint16_t)d1);
  a0 = READ32(a1 + 12);
  a0 += d1;
  W(d0) = (uint16_t)(READ16(a5 + 0));
  W(d0) = (uint16_t)(W(d0) - READ16(a5 + 2));
  d0 = (uint32_t)((uint16_t)d4 * (uint16_t)d0);
  d0 >>= 1;
lbC00DBEA:
  WRITE32(a2 + 0, a0);
  WRITE16(a2 + 4, d0);
  WRITE16(a2 + 14, 0);
  W(d0) = (uint16_t)(READ16(a3 + 30));
  d0 = (d0 >> 16) | (d0 << 16);
  W(d0) = (uint16_t)(0);
  d0 >>= 1;
  { uint16_t q=(uint16_t)((uint32_t)d0/(uint16_t)READ16(a6 + 34)); uint16_t r=(uint16_t)((uint32_t)d0%(uint16_t)READ16(a6 + 34)); d0=((uint32_t)r<<16)|q; }
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  WRITE16(a2 + 16, d0);
  WRITE16(a1 + 10, 2);
  lbC00D28E();
  goto lbC00DC32;
lbC00DC16:
  { int32_t _cmp=(int32_t)d0-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)2); }
  if (!flag_z) goto lbC00DC24;
  WRITE16(a2 + 8, 6);
  goto lbC00DC32;
lbC00DC24:
  { int32_t _cmp=(int32_t)d0-(int32_t)3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)3); }
  if (!flag_z) goto lbC00DC32;
  lbC00D28E();
  goto lbC00DD24;
lbC00DC32:
  flag_z=(READ16(a2 + 16)==0); flag_n=((int32_t)READ16(a2 + 16)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00DC40;
  WRITE16(a2 + 16, READ16(a2 + 16) - 1);
  goto lbC00DC5A;
lbC00DC40:
  W(d0) = (uint16_t)(READ16(a2 + 14));
  W(d1) = (uint16_t)(READ16(a3 + 28));
  d1 = (uint32_t)((uint16_t)READ16(a6 + 34) * (uint16_t)d1);
  d1 = d1 << 7;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)(d1 + 0x40);
  W(d0) = (uint16_t)(d0 + d1);
  WRITE16(a2 + 14, d0);
lbC00DC5A:
  W(d0) = (uint16_t)(READ16(a2 + 14));
  W(d0) = (uint16_t)((uint32_t)(d0) >> 7);
  W(d0) = (uint16_t)(d0 + 0x80);
  flag_z = ((d0 & (1u << (8 & 31))) == 0);
  if (flag_z) goto lbC00DC6E;
  W(d0) ^= (uint16_t)(0xFF);
lbC00DC6E:
  W(d0) ^= (uint16_t)(0x80);
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  W(d0) = (uint16_t)(-(int16_t)W(d0));
  WRITE16(a2 + 18, d0);
  W(d0) = (uint16_t)(READ16(a2 + 8));
  a0 = (uint32_t)(a3 + 0);
  d1 = 0;
  W(d1) = (uint16_t)(READ16(a0 + 10));
  d1 = (d1 >> 16) | (d1 << 16);
  d2 = READ32(a2 + 10);
  d3 = 0;
  W(d3) = (uint16_t)(READ16(a0 + 18));
  W(d0) = (uint16_t)d3;
  W(d0) = (uint16_t)((uint32_t)(d0) >> 5);
  W(d0) ^= (uint16_t)(7);
  W(d3) &= (uint16_t)(0x1F);
  W(d3) = (uint16_t)(d3 + 0x21);
  d3 = (uint32_t)((uint16_t)READ16(a6 + 34) * (uint16_t)d3);
  d3 = d3 << 3;
  d3 >>= d0;
  d0 = d1;
  d0 -= d2;
  if (!flag_n) goto lbC00DCB4;
  d0 = (uint32_t)(-(int32_t)d0);
lbC00DCB4:
  { int32_t _cmp=(int32_t)d0-(int32_t)d3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d3); }
  if (!flag_z && (flag_n==flag_v)) goto lbC00DCCA;
  d2 = d1;
  { int32_t _cmp=(int32_t)READ16(a2 + 8)-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a2 + 8)<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC00DCD4;
  WRITE16(a2 + 8, READ16(a2 + 8) + 2);
  goto lbC00DCD4;
lbC00DCCA:
  { int32_t _cmp=(int32_t)d2-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)d1); }
  if (flag_n!=flag_v) goto lbC00DCD2;
  d2 -= d3;
  goto lbC00DCD4;
lbC00DCD2:
  d2 += d3;
lbC00DCD4:
  WRITE32(a2 + 10, d2);
  W(d0) = (uint16_t)(READ16(a2 + 6));
  W(d1) = (uint16_t)(READ16(a2 + 18));
  W(d2) = (uint16_t)(READ16(a3 + 26));
  d1 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d1);
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 7));
  W(d2) = (uint16_t)(READ16(a6 + 4));
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(0x80));
  W(d1) = (uint16_t)(W(d1) - W(d2));
  W(d1) = (uint16_t)(d1 + 0x1000);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(0x13);
  d0 >>= d1;
  WRITE16(a1 + 18, d0);
  W(d0) = (uint16_t)(READ16(a6 + 0));
  W(d0) = (uint16_t)(d0 + 1);
  d0 = (uint32_t)((uint16_t)READ16(a1 + 8) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  W(d0) = (uint16_t)(d0 + 1);
  d0 = (uint32_t)((uint16_t)READ16(a3 + 8) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  d1 = READ32(a2 + 10);
  d1 = (d1 >> 16) | (d1 << 16);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(10);
  W(d0) = (uint16_t)((uint32_t)(d0) >> d1);
  WRITE16(a1 + 20, d0);
lbC00DD24:
  d0 = 0;
  { int32_t _cmp=(int32_t)READ16(a1 + 10)-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a1 + 10)<(uint32_t)2); }
  if (!flag_z) goto lbC00DD30;
  d0 = (uint32_t)(int32_t)(int8_t)(-1);
lbC00DD30:
IFFTECH:
  goto lbC00DD88;
  goto lbC00DD3A;
lbC00DD3A:
  d0 = 0;
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC00DD86;
  flag_z=(READ16(a1 + 10)==0); flag_n=((int32_t)READ16(a1 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00DD7A;
  WRITE16(a1 + 10, READ16(a1 + 10) - 1);
  if (flag_z) goto lbC00DD62;
  WRITE16(a2 + 4, READ16(a1 + 16));
  WRITE32(a2 + 0, READ32(a1 + 12));
  d0 = (uint32_t)(int32_t)(int8_t)(-1);
  goto lbC00DD7A;
lbC00DD62:
  W(d1) = (uint16_t)d7;
  d1 = (uint32_t)((uint16_t)10 * (uint16_t)d1);
  W(a3) = (uint16_t)(a3 + d1);
  WRITE16(a2 + 4, READ16(a3 + 4));
  WRITE32(a2 + 0, READ32(a3 + 0));
lbC00DD7A:
  WRITE16(a2 + 6, READ16(a1 + 18));
  WRITE16(a2 + 8, READ16(a1 + 20));
lbC00DD86:
lbC00DD88:
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_n!=flag_v) goto lbC00DD92;
  d0 = 0;
  return;
lbC00DD92:
  a3 = READ32(a1 + 4);
  a2 = (uint32_t)(a6 + 450);
  W(d0) = (uint16_t)d7;
  d0 = (uint32_t)((uint16_t)10 * (uint16_t)d0);
  W(a2) = (uint16_t)(a2 + d0);
  B(d0) = (uint8_t)(READ8(a1 + 0));
  if (flag_z) goto lbC00DE6E;
  { int32_t _cmp=(int32_t)d0-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)1); }
  if (!flag_z) goto lbC00DE54;
  a5 = (uint32_t)(a3 + 26);
  d1 = 0;
  B(d1) = (uint8_t)(READ8(a1 + 3));
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)12); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)12); d1=((uint32_t)r<<16)|q; }
  W(d2) = (uint16_t)d1;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)(d1 << 1);
  a0 = (uint32_t)(uintptr_t)&lbW00D4B2;
  W(d0) = (uint16_t)(0xD5C8);
  d0 = (uint32_t)((uint16_t)READ16(a0 + 0) * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(15);
  d0 >>= d1;
  WRITE16(a2 + 6, d0);
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(10));
  W(d2) = (uint16_t)(-(int16_t)W(d2));
  W(d2) = (uint16_t)(W(d2) - READ16(a3 + 24));
  if (!flag_n) goto lbC00DDF8;
lbC00DDE6:
  WRITE8(a1 + 0, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC00DEA4;
  goto lbC00DE6E;
lbC00DDF8:
  { int32_t _cmp=(int32_t)d2-(int32_t)READ8(a3 + 18); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)READ8(a3 + 18)); }
  if (flag_n==flag_v) goto lbC00DDE6;
  d4 = READ32(a3 + 4);
  d5 = READ32(a3 + 8);
  d0 = d4;
  d0 += d5;
  d1 = d0;
  d1 = d1 << d2;
  d1 -= d0;
  a0 = (uint32_t)(a5 + 0);
  d4 = d4 << d2;
  d5 = d5 << d2;
  W(d0) = (uint16_t)d4;
  if (!flag_z) goto lbC00DE1E;
  W(d0) = (uint16_t)d5;
lbC00DE1E:
  WRITE32(a1 + 12, a0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  WRITE16(a1 + 16, d0);
  W(a0) = (uint16_t)(a0 + d4);
  W(d0) = (uint16_t)d5;
  if (!flag_z) goto lbC00DE38;
  a0 = READ32(a6 + 262);
  W(a0) = (uint16_t)(a0 + 0x400);
  d0 = (uint32_t)(int32_t)(int8_t)(8);
lbC00DE38:
  WRITE32(a2 + 0, a0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  WRITE16(a2 + 4, d0);
  WRITE16(a1 + 10, 2);
  lbC00D28E();
  WRITE16(a2 + 8, 1);
  goto lbC00DE6E;
lbC00DE54:
  { int32_t _cmp=(int32_t)d0-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)2); }
  if (!flag_z) goto lbC00DE60;
  WRITE16(a2 + 8, 0);
  goto lbC00DE6E;
lbC00DE60:
  { int32_t _cmp=(int32_t)d0-(int32_t)3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)3); }
  if (!flag_z) goto lbC00DE6E;
  lbC00D28E();
  goto lbC00DEA4;
lbC00DE6E:
  W(d0) = (uint16_t)(0x1080);
  W(d0) = (uint16_t)(W(d0) - READ16(a6 + 4));
  d0 = (uint32_t)((uint16_t)READ16(a2 + 6) * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(0x13);
  d0 >>= d1;
  WRITE16(a1 + 18, d0);
  W(d0) = (uint16_t)(READ16(a6 + 0));
  W(d0) = (uint16_t)(d0 + 1);
  d0 = (uint32_t)((uint16_t)READ16(a1 + 8) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  W(d0) = (uint16_t)(d0 + 1);
  d1 = READ32(a3 + 20);
  d1 >>= 1;
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(0x11);
  d0 >>= d1;
  d0 = (uint32_t)((uint16_t)READ16(a2 + 8) * (uint16_t)d0);
  WRITE16(a1 + 20, d0);
lbC00DEA4:
  d0 = 0;
  { int32_t _cmp=(int32_t)READ16(a1 + 10)-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a1 + 10)<(uint32_t)2); }
  if (!flag_z) goto lbC00DEB0;
  d0 = (uint32_t)(int32_t)(int8_t)(-1);
lbC00DEB0:
  /* dc.w	$9D */
  /* dc.w	$FAFB */
  /* dc.w	$FFFD */
  /* dc.w	$FE02 */
  /* dc.w	$DF1 */
  /* dc.w	$112 */
  /* dc.w	$144D */
  /* COPYRIGHT	dc.b	'Sonix Music Driver (C) Copyright 1987 Mark R' */
  /* dc.b	'iley, All Rights Reserved.',0,0 */
  /* VERSION	dc.b	'Version 2.0b - July 19, 1988',0,0 */
  /* INITSONIX	MOVEM.L	D1-D7/A0-A6,-(SP) */
  /* LEA	SONIX(PC),A1 */
  /* MOVE.L	(A1),D0 */
  /* BNE.L	lbC00DF86 */
  /* MOVE.L	A6,(A1) */
  /* MOVEA.L	A6,A1 */
  /* MOVE.W	#$F4,D0 */
  /* lbC00DF3C	CLR.W	(A1)+ */
  /* DBRA	D0,lbC00DF3C */
  /* MOVE.L	A0,$106(A6) */
  /* MOVE.W	#$203,D0 */
  /* lbC00DF4A	CLR.W	(A0)+ */
  /* DBRA	D0,lbC00DF4A */
  /* MOVE.W	#$3F,$36(A6) */
  /* MOVE.W	#$8000,$22(A6) */
  /* MOVE.W	#$FF,0(A6) */
  /* MOVE.W	#$80,2(A6) */
  /* MOVE.W	#$80,4(A6) */
  /* MOVE.B	#$9C,$BFE401 */
  /* MOVE.B	#$2E,$BFE501 */
  /* MOVE.B	#$11,$BFEE01 */
  /* lbC00DF86	MOVE.L	SONIX(PC),D0 */
  /* MOVEM.L	(SP)+,D1-D7/A0-A6 */
  /* RTS */
  /* QUITSONIX	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	SONIX(PC),D0 */
  /* BEQ.S	lbC00DFA2 */
  /* MOVEA.L	D0,A6 */
  /* BSR.L	STOPSOUND */
  /* BSR.S	lbC00DFA8 */
  /* lbC00DFA2	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* lbC00DFA8	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* LEA	SONIX(PC),A0 */
  /* MOVE.L	(A0),D0 */
  /* BEQ.L	lbC00DFC0 */
  /* MOVEA.L	D0,A6 */
  /* CLR.L	(A0) */
  /* CLR.B	$BFEE01 */
  /* lbC00DFC0	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* SONIX	dc.l	0 */
  /* ************************************************************************** */
  /* ************** Sonix Music Driver v2.0f player (SMUS format) ************* */
  /* ************************************************************************** */
  /* Player from game "Vengeance Of Excalibur" (c) 1991 by Synergistic/Virgin */
  /* BRA.L	InitSONIX */
  /* BRA.L	QuitSONIX */
  /* BRA.L	PlaySCORE */
  /* BRA.L	ReleaseSCORE */
  /* BRA.L	StopSCORE */
  /* BRA.L	StartNOTE */
  /* BRA.L	ReleaseNOTE */
  /* BRA.L	StopNOTE */
  /* BRA.L	ReleaseSOUND */
  /* BRA.L	StopSOUND */
  /* BRA.L	RampVOLUME */
  /* BRA.L	StealTRACK */
  /* BRA.L	ResumeTRACK */
  /* BRA.L	LoadSCORE */
  /* BRA.L	PurgeSCORE */
  /* BRA.L	PurgeSCORES */
  /* BRA.L	LoadINSTRUMENT */
  /* BRA.L	PurgeINSTRUMENT */
  /* BRA.L	PurgeINSTRUMENTS */
  /* BRA.L	SonixLOAD */
  /* BRA.L	SonixALLOCATE */
  /* BRA.L	RELEASE */
  /* BRA.L	SonixSIGNAL */
  /* BRA.L	SonixWAIT */
  /* BRA.L	SetFILTER */
  /* AllocatePATCH	dc.l	0 */
  /* ReleasePATCH	dc.l	0 */
  /* lbC00006C	MOVEM.L	D0/D1/A1-A3/A6,-(SP) */
  /* LEA	$29E(A6),A3 */
  /* MOVE.L	A0,-(SP) */
  /* TST.L	(SP)+ */
  /* BEQ.S	lbC000096 */
  /* MOVEQ	#$3A,D0 */
  /* lbC00007C	MOVE.B	D0,D1 */
  /* MOVE.B	(A0)+,D0 */
  /* MOVE.B	D0,(A3)+ */
  /* BNE.S	lbC00007C */
  /* SUBQ.L	#1,A3 */
  /* CMPI.B	#$3A,D1 */
  /* BEQ.S	lbC000096 */
  /* CMPI.B	#$2F,D1 */
  /* BEQ.S	lbC000096 */
  /* MOVE.B	#$2F,(A3)+ */
  /* lbC000096	MOVE.B	(A1)+,(A3)+ */
  /* BNE.S	lbC000096 */
  /* MOVE.L	A2,-(SP) */
  /* TST.L	(SP)+ */
  /* BEQ.S	lbC0000A6 */
  /* SUBQ.L	#1,A3 */
  /* lbC0000A2	MOVE.B	(A2)+,(A3)+ */
  /* BNE.S	lbC0000A2 */
  /* lbC0000A6	LEA	$29E(A6),A0 */
  /* MOVEM.L	(SP)+,D0/D1/A1-A3/A6 */
  /* RTS */
  /* lbC0000B0	MOVEM.L	D1/D2/A0/A1/A6,-(SP) */
  /* MOVE.L	A0,D1 */
  /* MOVE.L	D0,D2 */
  /* MOVE.L	$18(A6),D0 */
  /* BNE.S	lbC0000D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	$3EC(A6),A6 */
  /* JSR	-$1E(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC0000CA	MOVEM.L	(SP)+,D1/D2/A0/A1/A6 */
  /* RTS */
  /* lbC0000D0	MOVEA.L	D0,A0 */
  /* JSR	(A0) */
  /* BRA.S	lbC0000CA */
  /* lbC0000D6	MOVEM.L	D1/A0/A1/A6,-(SP) */
  /* MOVE.L	D0,D1 */
  /* MOVE.L	$1C(A6),D0 */
  /* BNE.S	lbC0000F4 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	$3EC(A6),A6 */
  /* JSR	-$24(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC0000EE	MOVEM.L	(SP)+,D1/A0/A1/A6 */
  /* RTS */
  /* lbC0000F4	MOVEA.L	D0,A0 */
  /* JSR	(A0) */
  /* BRA.S	lbC0000EE */
  /* lbC0000FA	MOVEM.L	D1-D3/A0/A1/A6,-(SP) */
  /* MOVE.L	D1,D3 */
  /* MOVE.L	D0,D1 */
  /* MOVE.L	A0,D2 */
  /* MOVE.L	$20(A6),D0 */
  /* BNE.S	lbC00011C */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	$3EC(A6),A6 */
  /* JSR	-$2A(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC000116	MOVEM.L	(SP)+,D1-D3/A0/A1/A6 */
  /* RTS */
  /* lbC00011C	MOVEA.L	D0,A0 */
  /* JSR	(A0) */
  /* BRA.S	lbC000116 */
  /* lbC000122	MOVEM.L	D1/A0/A1/A6,-(SP) */
  /* MOVE.L	$24(A6),D0 */
  /* BNE.S	lbC00013E */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	$3EC(A6),A6 */
  /* JSR	-$42(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC000138	MOVEM.L	(SP)+,D1/A0/A1/A6 */
  /* RTS */
  /* lbC00013E	MOVEA.L	D0,A0 */
  /* JSR	(A0) */
  /* BRA.S	lbC000138 */
  /* LoadINSTRUMENT	MOVEM.L	D1-D7/A0-A6,-(SP) */
  /* MOVEA.L	A1,A4 */
  /* CLR.L	D2 */
  /* BCLR	#6,$30(A6) */
  /* LEA	$4A(A6),A5 */
  /* SUBA.L	A3,A3 */
  /* MOVEQ	#$3F,D7 */
  /* lbC00015A	MOVE.L	0(A5),D0 */
  /* BNE.S	lbC000168 */
  /* MOVE.L	A3,D0 */
  /* BNE.S	lbC00017C */
  /* MOVEA.L	A5,A3 */
  /* BRA.S	lbC00017C */
  /* lbC000168	MOVEA.L	D0,A2 */
  /* LEA	4(A2),A2 */
  /* MOVE.L	A0,-(SP) */
  /* MOVE.L	A2,-(SP) */
  /* BSR.L	DOCMPSTR */
  /* ADDQ.L	#8,SP */
  /* BEQ.L	lbC000214 */
  /* lbC00017C	ADDQ.L	#6,A5 */
  /* DBRA	D7,lbC00015A */
  /* MOVE.L	A3,D0 */
  /* BEQ.L	lbC000222 */
  /* MOVEA.L	D0,A5 */
  /* EXG	A0,A1 */
  /* LEA	instr.MSG(PC),A2 */
  /* MOVEA.L	A0,A3 */
  /* BSR.L	lbC00006C */
  /* MOVE.L	#$3ED,D0 */
  /* BSR.L	lbC0000B0 */
  /* MOVE.L	D0,D2 */
  /* BNE.S	lbC0001C2 */
  /* SUBA.L	A0,A0 */
  /* BSR.L	lbC00006C */
  /* MOVE.L	#$3ED,D0 */
  /* BSR.L	lbC0000B0 */
  /* MOVE.L	D0,D2 */
  /* BNE.S	lbC0001C2 */
  /* BSET	#6,$30(A6) */
  /* BRA.L	lbC000228 */
  /* lbC0001C2	LEA	$32A(A6),A0 */
  /* MOVEQ	#$20,D1 */
  /* BSR.L	lbC0000FA */
  /* CMP.L	D1,D0 */
  /* BNE.L	lbC000228 */
  /* LEA	Synttech(PC),A4 */
  /* TST.B	(A0) */
  /* BEQ.S	lbC0001F6 */
  /* lbC0001DA	MOVEA.L	A4,A2 */
  /* ADDA.W	2(A4),A2 */
  /* MOVE.L	A2,-(SP) */
  /* MOVE.L	A0,-(SP) */
  /* BSR.L	DOCMPSTR */
  /* ADDQ.L	#8,SP */
  /* BEQ.S	lbC0001F6 */
  /* MOVE.W	0(A4),D0 */
  /* BEQ.S	lbC000228 */
  /* ADDA.W	D0,A4 */
  /* BRA.S	lbC0001DA */
  /* lbC0001F6	MOVEA.L	A3,A0 */
  /* MOVE.L	D2,D0 */
  /* JSR	4(A4) */
  /* MOVE.L	D0,D2 */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC000228 */
  /* MOVE.L	A4,0(A0) */
  /* LEA	4(A0),A2 */
  /* lbC00020C	MOVE.B	(A1)+,(A2)+ */
  /* BNE.S	lbC00020C */
  /* MOVE.L	A0,0(A5) */
  /* lbC000214	ADDQ.W	#1,4(A5) */
  /* lbC000218	MOVE.L	D2,D0 */
  /* BEQ.S	lbC000220 */
  /* BSR.L	lbC0000D6 */
  /* lbC000220	MOVE.L	A5,D0 */
  /* lbC000222	MOVEM.L	(SP)+,D1-D7/A0-A6 */
  /* RTS */
  /* lbC000228	SUBA.L	A5,A5 */
  /* BRA.S	lbC000218 */
  /* PurgeINSTRUMENTS	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* LEA	$4A(A6),A0 */
  /* MOVEQ	#$3F,D7 */
  /* lbC000236	CLR.W	4(A0) */
  /* BSR.S	PurgeINSTRUMENT */
  /* ADDQ.L	#6,A0 */
  /* DBRA	D7,lbC000236 */
  /* MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* PurgeINSTRUMENT	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC000274 */
  /* MOVEA.L	D0,A5 */
  /* SUBQ.W	#1,4(A5) */
  /* BGT.S	lbC000274 */
  /* MOVE.L	0(A5),D0 */
  /* BEQ.S	lbC000270 */
  /* MOVEA.L	D0,A0 */
  /* BSR.L	lbC00027A */
  /* MOVEA.L	0(A0),A1 */
  /* JSR	8(A1) */
  /* CLR.L	0(A5) */
  /* lbC000270	CLR.W	4(A5) */
  /* lbC000274	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* lbC00027A	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC0002A6 */
  /* LEA	$1D2(A6),A1 */
  /* CLR.B	D0 */
  /* lbC000288	CMPI.B	#0,1(A1) */
  /* BEQ.S	lbC00029A */
  /* CMPA.L	4(A1),A0 */
  /* BNE.S	lbC00029A */
  /* BSR.L	StopNOTE */
  /* lbC00029A	ADDA.W	#$16,A1 */
  /* ADDQ.B	#1,D0 */
  /* CMPI.B	#4,D0 */
  /* BNE.S	lbC000288 */
  /* lbC0002A6	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* instr.MSG	dc.b	'.instr',0,0 */
}

static void LoadSCORE(void) {
  /* MOVEM.L d1,d7,a0,a6,? */
  /* MOVE.L	SP,$34E(A6) */
  /* SUBA.L	A5,A5 */
  /* ANDI.B	#$3F,$30(A6) */
  /* MOVE.L	A1,$34A(A6) */
  /* CLR.W	$35A(A6) */
  /* MOVE.L	#$3ED,D0 */
  /* BSR.L	lbC0000B0 */
  /* MOVE.L	D0,$352(A6) */
  /* BEQ.L	lbC00054E */
  /* MOVE.L	#$84,D0 */
  /* MOVE.L	#$10001,D1 */
  /* BSR.L	ALLOCATE */
  /* MOVE.L	A0,D0 */
  /* BEQ.L	lbC00054E */
  /* MOVEA.L	A0,A5 */
  a6 = (uint32_t)(uintptr_t)Sonix;
  a5 = (uint32_t)(a6 + 1336);
  a2 = a0;
  a0 = (uint32_t)(a5 + 16);
  d7 = (uint32_t)(int32_t)(int8_t)(3);
lbC0002FC:
  WRITE16(a0 + 2, 0xFF);
  a0 += 4;
  if ((int16_t)(--d7) >= 0) goto lbC0002FC;
  lbC000562();
  /* CMPI.L	#'FORM',D0 */
  /* BNE.L	lbC000554 */
  lbC000562();
  d0 -= 4;
  WRITE32(a6 + 854, d0);
  lbC000562();
  /* CMPI.L	#'SMUS',D0 */
  /* BNE.L	lbC000554 */
lbC00032E:
  flag_z=(READ32(a6 + 854)==0); flag_n=((int32_t)READ32(a6 + 854)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC000526;
  lbC000562();
  d7 = d0;
  lbC000562();
  d0 += 1;
  W(d0) &= (uint16_t)(0xFFFE);
  d6 = d0;
  d0 += 8;
  WRITE32(a6 + 854, READ32(a6 + 854) - d0);
  { int32_t _cmp=(int32_t)d7-(int32_t)0x53484452; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)0x53484452); }
  if (flag_z) goto lbC000388;
  { int32_t _cmp=(int32_t)d7-(int32_t)0x494e5331; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)0x494e5331); }
  /* BEQ.L	lbC00041A */
  if (flag_z) goto lbC00037C;
  { int32_t _cmp=(int32_t)d7-(int32_t)0x5452414b; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)0x5452414b); }
  if (flag_z) goto lbC00048A;
  { int32_t _cmp=(int32_t)d7-(int32_t)0x534e5831; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)0x534e5831); }
  if (flag_c) goto lbC00037C;
  { int32_t _cmp=(int32_t)d7-(int32_t)0x534e583a; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)0x534e583a); }
  if (flag_c) goto lbC0003EC;
lbC00037C:
  flag_z=(d6==0); flag_n=((int32_t)d6<0); flag_c=0; flag_v=0;
  if (flag_z||(flag_n!=flag_v)) goto lbC00032E;
  lbC000576();
  d6 -= 1;
  goto lbC00037C;
lbC000388:
  lbC00056C();
  { int32_t _cmp=(int32_t)d0-(int32_t)0xE11; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0xE11); }
  if (!flag_c) goto lbC000396;
  W(d0) = (uint16_t)(0);
  goto lbC0003B4;
lbC000396:
  d1 = 0xE100000;
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)d0); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)d0); d1=((uint32_t)r<<16)|q; }
  a0 = (uint32_t)(uintptr_t)&lbW000CAE;
  W(d0) = (uint16_t)(0);
lbC0003A4:
  { int32_t _cmp=(int32_t)d1-(int32_t)READ16(a0 + 0); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)READ16(a0 + 0)); }
  if (!flag_c) goto lbC0003B4;
  W(d0) = (uint16_t)(d0 + 2);
  { int32_t _cmp=(int32_t)d0-(int32_t)0x100; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x100); }
  if (flag_c) goto lbC0003A4;
  W(d0) = (uint16_t)(W(d0) - (uint16_t)(1));
lbC0003B4:
  WRITE16(a5 + 2, d0);
  lbC000576();
  W(d0) &= (uint16_t)(0xFF);
  { int32_t _cmp=(int32_t)d0-(int32_t)0x80; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x80); }
  if (flag_n==flag_v) goto lbC0003C8;
  W(d0) = (uint16_t)(d0 << 1);
lbC0003C8:
  WRITE16(a5 + 0, d0);
  a0 = (uint32_t)(a5 + 32);
  lbC000576();
  { int32_t _cmp=(int32_t)d0-(int32_t)5; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)5); }
  if (flag_c) goto lbC0003DC;
  d0 = (uint32_t)(int32_t)(int8_t)(4);
lbC0003DC:
  B(d0) = (uint8_t)(B(d0) - (uint8_t)(1));
  if (flag_n) goto lbC0003E8;
  WRITE32_POST(a0, 1);
  goto lbC0003DC;
lbC0003E8:
  d6 -= 4;
  goto lbC00037C;
lbC0003EC:
  lbC00056C();
  WRITE16(a5 + 4, d0);
  lbC00056C();
  WRITE16(a5 + 6, d0);
  lbC000562();
  a0 = (uint32_t)(a5 + 32);
  d7 = (uint32_t)(int32_t)(int8_t)(3);
lbC000406:
  lbC000562();
  WRITE32_POST(a0, d0);
  if ((int16_t)(--d7) >= 0) goto lbC000406;
  d6 -= 0x18;
  goto lbC00037C;
  /* lbC00041A	BSR.L	lbC000576 */
  /* SUBQ.L	#1,D6 */
  /* CMPI.B	#$40,D0 */
  /* BCC.L	lbC00037C */
  /* LEA	$40(A5),A3 */
  /* EXT.W	D0 */
  /* ADDA.W	D0,A3 */
  /* TST.B	(A3) */
  /* BNE.L	lbC00037C */
  /* BSR.L	lbC000576 */
  /* SUBQ.L	#1,D6 */
  /* TST.B	D0 */
  /* BNE.L	lbC00037C */
  /* BSR.L	lbC00056C */
  /* SUBQ.L	#2,D6 */
  /* LEA	$30A(A6),A0 */
  /* MOVEQ	#$18,D7 */
  /* lbC00044E	BSR.L	lbC000576 */
  /* MOVE.B	D0,(A0)+ */
  /* SUBQ.L	#1,D6 */
  /* BEQ.S	lbC00045C */
  /* DBRA	D7,lbC00044E */
  /* lbC00045C	CLR.B	(A0)+ */
  /* LEA	$30A(A6),A0 */
  /* MOVEA.L	$34A(A6),A1 */
  /* BSR.L	LoadINSTRUMENT */
  /* TST.L	D0 */
  /* BNE.S	lbC000478 */
  /* BSET	#7,$30(A6) */
  /* BRA.L	lbC000554 */
  /* lbC000478	LEA	$4A(A6),A0 */
  /* SUB.L	A0,D0 */
  /* DIVU.W	#6,D0 */
  /* ADDQ.B	#1,D0 */
  /* MOVE.B	D0,(A3) */
  /* BRA.L	lbC00037C */
lbC00048A:
  W(d0) = (uint16_t)(READ16(a6 + 858));
  { int32_t _cmp=(int32_t)d0-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC00037C;
  WRITE16(a6 + 858, READ16(a6 + 858) + 1);
  W(d0) = (uint16_t)(d0 << 2);
  a4 = (uint32_t)(a5 + 0);
  /* MOVE.L	D6,D0 */
  /* ADDQ.L	#2,D0 */
  /* MOVE.L	#1,D1 */
  /* BSR.L	ALLOCATE */
  /* MOVE.L	A0,$30(A4) */
  /* BEQ.L	lbC000554 */
  /* MOVE.L	D6,D0 */
  /* BSR.L	lbC00058C */
  /* MOVE.W	#$FFFF,0(A0,D0.L) */
  /* CLR.L	D6 */
  a1 = (uint32_t)(a2 + -2);
  a0 = a1;
  WRITE32(a4 + 48, a1);
CopyTrack:
  WRITE8_POST(a1, READ8_POST(a2));
  d6 -= 1;
  if (!flag_z) goto CopyTrack;
  WRITE16(a1, -1);
lbC0004C4:
  W(d0) = (uint16_t)(READ16(a0));
  { int32_t _cmp=(int32_t)d0-(int32_t)0xFFFF; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0xFFFF); }
  if (flag_z) goto lbC00037C;
  W(d1) = (uint16_t)d0;
  W(d1) &= (uint16_t)(0xFF00);
  { int32_t _cmp=(int32_t)d1-(int32_t)0x8100; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)0x8100); }
  if (flag_z) goto lbC000522;
  if (!flag_c) goto lbC0004EE;
  a1 = (uint32_t)(uintptr_t)&lbW0007C2;
  W(d0) &= (uint16_t)(15);
  B(d0) = (uint8_t)(READ8(a1 + 0));
  if (flag_n) goto lbC000520;
  W(d0) |= W(d1);
  goto lbC000522;
lbC0004EE:
  { int32_t _cmp=(int32_t)d1-(int32_t)0x8200; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)0x8200); }
  if (!flag_z) goto lbC000510;
  W(d1) = (uint16_t)d0;
  W(d1) = (uint16_t)((uint32_t)(d1) >> 3);
  W(d1) &= (uint16_t)(0x1F);
  W(d1) = (uint16_t)(d1 + 1);
  WRITE16(a5 + 8, d1);
  W(d0) &= (uint16_t)(7);
  W(d1) = (uint16_t)(0);
  d1 = d1 | (1u << (d0 & 31));
  WRITE16(a5 + 10, d1);
  goto lbC000520;
lbC000510:
  { int32_t _cmp=(int32_t)d1-(int32_t)0x8400; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)0x8400); }
  if (!flag_z) goto lbC000520;
  W(d0) &= (uint16_t)(0x7F);
  W(d0) = (uint16_t)(d0 << 1);
  WRITE16(a4 + 18, d0);
lbC000520:
  W(d0) = (uint16_t)(0);
lbC000522:
  WRITE16_POST(a0, d0);
  goto lbC0004C4;
lbC000526:
  /* LEA	$368(A6),A0 */
  /* lbC00052A	MOVE.L	(A0),D0 */
  /* BEQ.S	lbC000536 */
  /* MOVEA.L	D0,A0 */
  /* LEA	$80(A0),A0 */
  /* BRA.S	lbC00052A */
  /* lbC000536	MOVE.L	A5,(A0) */
  /* lbC000538	MOVE.L	$352(A6),D0 */
  /* BEQ.S	lbC000546 */
  /* BSR.L	lbC0000D6 */
  /* CLR.L	$352(A6) */
  /* lbC000546	MOVE.L	A5,D0 */
  /* MOVEM.L ?,d1,d7,a0,a6 */
  return;
  /* lbC00054E	BSET	#6,$30(A6) */
  /* lbC000554	MOVEA.L	$34E(A6),SP */
  /* MOVEA.L	A5,A0 */
  /* BSR.L	PurgeSCORE */
  /* SUBA.L	A5,A5 */
  /* BRA.S	lbC000538 */
}

static void lbC000562(void) {
  /* MOVEQ	#4,D0 */
  /* CLR.L	-(SP) */
  /* BSR.S	lbC000580 */
  /* MOVE.L	(SP)+,D0 */
  d0 = READ32_POST(a2);
  return;
}

static void lbC00056C(void) {
  /* MOVEQ	#2,D0 */
  /* CLR.W	-(SP) */
  /* BSR.S	lbC000580 */
  /* MOVE.W	(SP)+,D0 */
  W(d0) = (uint16_t)(READ16_POST(a2));
  return;
}

static void lbC000576(void) {
  /* MOVEQ	#1,D0 */
  /* CLR.B	-(SP) */
  /* BSR.S	lbC000580 */
  /* MOVE.B	(SP)+,D0 */
  B(d0) = (uint8_t)(READ8_POST(a2));
  return;
  /* lbC000580	MOVE.L	A0,-(SP) */
  /* LEA	8(SP),A0 */
  /* BSR.S	lbC00058C */
  /* MOVEA.L	(SP)+,A0 */
  /* RTS */
  /* lbC00058C	MOVEM.L	D0/D1,-(SP) */
  /* MOVE.L	D0,D1 */
  /* MOVE.L	$352(A6),D0 */
  /* BSR.L	lbC0000FA */
  /* CMP.L	D1,D0 */
  /* BNE.S	lbC000554 */
  /* MOVEM.L	(SP)+,D0/D1 */
  /* RTS */
  /* PurgeSCORES	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* lbC0005A8	MOVE.L	$368(A6),D0 */
  /* BEQ.S	lbC0005B4 */
  /* MOVEA.L	D0,A0 */
  /* BSR.S	PurgeSCORE */
  /* BRA.S	lbC0005A8 */
  /* lbC0005B4	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* PurgeSCORE	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	A0,D0 */
  /* BEQ.L	lbC000628 */
  /* MOVEA.L	D0,A5 */
  /* CMPA.L	6(A6),A5 */
  /* BNE.S	lbC0005D8 */
  /* BSR.L	StopSCORE */
  /* CLR.L	6(A6) */
  /* CLR.W	$32(A6) */
  /* lbC0005D8	LEA	$40(A5),A1 */
  /* MOVEQ	#$3F,D7 */
  /* lbC0005DE	MOVE.B	(A1)+,D0 */
  /* BEQ.S	lbC0005F4 */
  /* SUBQ.B	#1,D0 */
  /* LEA	$4A(A6),A0 */
  /* EXT.W	D0 */
  /* MULU.W	#6,D0 */
  /* ADDA.W	D0,A0 */
  /* BSR.L	PurgeINSTRUMENT */
  /* lbC0005F4	DBRA	D7,lbC0005DE */
  /* LEA	$30(A5),A1 */
  /* MOVEQ	#3,D7 */
  /* lbC0005FE	MOVEA.L	(A1)+,A0 */
  /* BSR.L	RELEASE */
  /* DBRA	D7,lbC0005FE */
  /* MOVEA.L	$80(A5),A1 */
  /* LEA	$368(A6),A0 */
  /* lbC000610	MOVE.L	(A0),D0 */
  /* BEQ.S	lbC000622 */
  /* CMP.L	A5,D0 */
  /* BEQ.S	lbC000620 */
  /* MOVEA.L	D0,A0 */
  /* LEA	$80(A0),A0 */
  /* BRA.S	lbC000610 */
  /* lbC000620	MOVE.L	A1,(A0) */
  /* lbC000622	MOVEA.L	A5,A0 */
  /* BSR.L	RELEASE */
  /* lbC000628	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* ReleaseSCORE	MOVEM.L	D0/D1,-(SP) */
  /* CLR.W	$1D0(A6) */
  /* BSET	#0,$30(A6) */
  /* TST.W	D0 */
  /* BNE.S	lbC000642 */
  /* MOVEQ	#1,D0 */
  /* lbC000642	CLR.W	D1 */
  /* BSR.L	RampVOLUME */
  /* MOVEM.L	(SP)+,D0/D1 */
  /* RTS */
}

static void PlaySCORE(void) {
  /* MOVEM.L d0,d7,a0,a6,? */
  StopSCORE();
  d4 = a0;
  if (flag_z) goto lbC0006AA;
  a5 = d4;
  { int32_t _cmp=(int32_t)d1-(int32_t)d0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)d0); }
  if (flag_z) goto lbC0006AA;
  if (flag_c) goto lbC0006AA;
  WRITE32(a6 + 12, d0);
  WRITE32(a6 + 20, d1);
  a0 = (uint32_t)(a5 + 32);
  a1 = (uint32_t)(a6 + 58);
  d7 = (uint32_t)(int32_t)(int8_t)(3);
lbC000674:
  WRITE32_POST(a1, READ32_POST(a0));
  if ((int16_t)(--d7) >= 0) goto lbC000674;
  a0 = a5;
  lbC0006E4();
  lbC000754();
  WRITE16(a6 + 50, 0);
  WRITE32(a6 + 6, a5);
  WRITE16(a6 + 0, 0);
  WRITE16(a6 + 2, READ16(a5 + 2));
  WRITE16(a6 + 4, READ16(a5 + 6));
  W(d1) = (uint16_t)(READ16(a5 + 0));
  W(d0) = (uint16_t)d3;
  RampVOLUME();
  WRITE16(a6 + 10, d2);
lbC0006AA:
  /* MOVEM.L ?,d0,d7,a0,a6 */
  return;
}

static void StopSCORE(void) {
  WRITE32(a6 + 864, 0);
  WRITE32(a6 + 48, READ32(a6 + 48) & ~(1u << (0 & 31)));
}

static void lbC0006BA(void) {
  /* MOVEM.L d0,a0,? */
  flag_z=(READ16(a6 + 10)==0); flag_n=((int32_t)READ16(a6 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC0006DE;
  WRITE16(a6 + 10, 0);
  a0 = (uint32_t)(a6 + 58);
  B(d0) = (uint8_t)(0);
lbC0006CE:
  flag_z=(READ32_POST(a0)==0); flag_n=((int32_t)READ32_POST(a0)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC0006D6;
  ReleaseNOTE();
lbC0006D6:
  B(d0) = (uint8_t)(d0 + 1);
  { int32_t _cmp=(int32_t)d0-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)4); }
  if (!flag_z) goto lbC0006CE;
lbC0006DE:
  /* MOVEM.L ?,d0,a0 */
  return;
}

static void lbC0006E4(void) {
  /* MOVEM.L d0,d7,a0,a6,? */
  a3 = a0;
  a1 = (uint32_t)(a6 + 602);
  d6 = d0;
  B(d7) = (uint8_t)(0);
lbC0006F2:
  WRITE32(a1 + 0, 0);
  WRITE8(a1 + 16, 0);
  WRITE8(a1 + 17, 0);
  d0 = READ32(a0 + 48);
  if (flag_z) goto lbC000742;
  a2 = d0;
  d5 = d6;
lbC000708:
  WRITE32(a1 + 0, a2);
  flag_z=(d5==0); flag_n=((int32_t)d5<0); flag_c=0; flag_v=0;
  if (flag_z||(flag_n!=flag_v)) goto lbC000742;
  W(d0) = (uint16_t)(READ16_POST(a2));
  if (flag_z) goto lbC000708;
  { int32_t _cmp=(int32_t)d0-(int32_t)0xFFFF; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0xFFFF); }
  if (flag_z) goto lbC000742;
  { int32_t _cmp=(int32_t)d0-(int32_t)0x8200; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x8200); }
  if (!flag_c) goto lbC000708;
  { int32_t _cmp=(int32_t)d0-(int32_t)0x8100; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x8100); }
  if (!flag_c) goto lbC00073A;
  d0 &= 0xFF;
  d5 -= d0;
  if (!flag_n) goto lbC000708;
  d0 = d5;
  d0 = (uint32_t)(-(int32_t)d0);
  WRITE8(a1 + 17, d0);
  goto lbC000708;
lbC00073A:
  B(d0) = (uint8_t)(d0 + 1);
  WRITE8(a1 + 16, d0);
  goto lbC000708;
lbC000742:
  a0 += 4;
  a1 += 4;
  B(d7) = (uint8_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC0006F2;
  /* MOVEM.L ?,d0,d7,a0,a6 */
  return;
}

static void lbC000754(void) {
  /* MOVEM.L d0,d7,a0,a6,? */
  a2 = (uint32_t)(a6 + 602);
  a1 = (uint32_t)(a6 + 634);
  d7 = (uint32_t)(int32_t)(int8_t)(7);
lbC000762:
  WRITE32_POST(a1, READ32_POST(a2));
  if ((int16_t)(--d7) >= 0) goto lbC000762;
  WRITE32(a6 + 16, READ32(a6 + 12));
  a4 = a6;
  B(d7) = (uint8_t)(0);
lbC000772:
  flag_z=(READ32(a4 + 58)==0); flag_n=((int32_t)READ32(a4 + 58)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00077E;
  B(d0) = (uint8_t)d7;
  ReleaseNOTE();
lbC00077E:
  WRITE32(a4 + 570, 0);
  d0 = 0;
  B(d0) = (uint8_t)(READ8(a4 + 651));
  B(d0) = (uint8_t)(d0 + 1);
  WRITE32(a4 + 586, d0);
  B(d0) = (uint8_t)(READ8(a4 + 650));
  if (flag_z) goto lbC0007AC;
  B(d0) = (uint8_t)(B(d0) - (uint8_t)(1));
  a3 = (uint32_t)(a0 + 64);
  B(d0) = (uint8_t)(READ8(a3 + 0));
  if (flag_z) goto lbC0007AC;
  B(d0) = (uint8_t)(B(d0) - (uint8_t)(1));
  d0 = (uint32_t)((uint16_t)6 * (uint16_t)d0);
  a3 = (uint32_t)(a6 + 74);
  d0 += a3;
lbC0007AC:
  WRITE32(a4 + 554, d0);
  a0 += 4;
  a4 += 4;
  B(d7) = (uint8_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_c) goto lbC000772;
  /* MOVEM.L ?,d0,d7,a0,a6 */
  return;
}
static const uint16_t lbW0007C2[] = { 0x2010 };
static const uint16_t _data_6824[] = { 0x804 };
static const uint16_t _data_6825[] = { 0x2ff };
static const uint16_t _data_6826[] = { 0xffff };
static const uint16_t _data_6827[] = { 0x3018 };
static const uint16_t _data_6828[] = { 0xc06 };
static const uint16_t _data_6829[] = { 0x3ff };
static const uint16_t _data_6830[] = { 0xffff };

static void PlaySMUS(void) {
  /* lbC0007D2	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVEA.L	A1,A6 */
  /* MOVE.L	$2C(A6),D0 */
  /* BEQ.S	lbC0007E2 */
  /* MOVEA.L	D0,A0 */
  /* JSR	(A0) */
lbC0007E2:
  lbC000C12();
  lbC000846();
  lbC0009B0();
  /* MOVEM.L	(SP)+,D0-D7/A0-A6 */
  return;
}

static void lbC0007F2(void) {
  /* MOVEM.L d1,d2,a0,? */
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  { int32_t _cmp=(int32_t)d0-(int32_t)READ16(a6 + 52); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)READ16(a6 + 52)); }
  if (flag_z) goto lbC000840;
  WRITE16(a6 + 52, d0);
  W(d0) = (uint16_t)(d0 << 1);
  a0 = (uint32_t)(uintptr_t)&lbW000CAE;
  W(d1) = (uint16_t)(READ16(a0 + 0));
  W(d2) = (uint16_t)d1;
  d0 = (uint32_t)(int32_t)(int8_t)(12);
  W(d2) = (uint16_t)((uint32_t)(d2) >> d0);
  WRITE16(a6 + 56, d2);
  W(d2) = (uint16_t)(d2 << d0);
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)(0);
  d1 >>= 1;
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)d2); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)d2); d1=((uint32_t)r<<16)|q; }
  WRITE16(a6 + 54, d1);
  d1 = (uint32_t)((uint16_t)0x2E9C * (uint16_t)d1);
  d0 = (uint32_t)(int32_t)(int8_t)(15);
  d1 >>= d0;
  /* MOVEA.L	$3F0(A6),A0 */
  /* MOVE.B	D1,(A0) */
  /* LSR.W	#8,D1 */
  /* MOVE.B	D1,$100(A0) */
  /* MOVEA.L	$3F4(A6),A0 */
  /* MOVE.B	#$11,(A0) */
  /* MOVEM.L a1,a5,? */
  a5 = (uint32_t)(uintptr_t)EagleBase;
  WRITE16(a5 + (intptr_t)dtg_Timer, d1);
  a1 = READ32(a5 + (intptr_t)dtg_SetTimer);
  ((void(*)(void))(uintptr_t)(READ32(a1)))();
  /* MOVEM.L ?,a1,a5 */
lbC000840:
  /* MOVEM.L ?,d1,d2,a0 */
  return;
}

static void lbC000846(void) {
  flag_z=(READ16(a6 + 50)==0); flag_n=((int32_t)READ16(a6 + 50)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC000854;
  WRITE16(a6 + 50, READ16(a6 + 50) - 1);
  if (!flag_z) goto lbC00097C;
lbC000854:
  W(d0) = (uint16_t)(READ16(a6 + 2));
  lbC0007F2();
  flag_z=(READ16(a6 + 10)==0); flag_n=((int32_t)READ16(a6 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00097C;
  WRITE16(a6 + 50, READ16(a6 + 56));
  a2 = READ32(a6 + 6);
  W(d6) = (uint16_t)(0);
lbC00086E:
  a1 = a2;
  a5 = a6;
  B(d7) = (uint8_t)(0);
lbC000874:
  flag_z=(READ32(a5 + 570)==0); flag_n=((int32_t)READ32(a5 + 570)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC000890;
  WRITE32(a5 + 570, READ32(a5 + 570) - 1);
  if (!flag_z) goto lbC00088C;
  flag_z=(READ32(a5 + 58)==0); flag_n=((int32_t)READ32(a5 + 58)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00088C;
  B(d0) = (uint8_t)d7;
  ReleaseNOTE();
lbC00088C:
  goto lbC000934;
lbC000890:
  flag_z=(READ32(a5 + 586)==0); flag_n=((int32_t)READ32(a5 + 586)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00089C;
  WRITE32(a5 + 586, READ32(a5 + 586) - 1);
  if (!flag_z) goto lbC00088C;
lbC00089C:
  d0 = READ32(a5 + 634);
  if (!flag_z) goto lbC0008A6;
lbC0008A2:
  W(d6) = (uint16_t)(d6 + 1);
  goto lbC00088C;
lbC0008A6:
  a0 = d0;
lbC0008A8:
  W(d2) = (uint16_t)(READ16_POST(a0));
  if (flag_z) goto lbC0008A8;
  { int32_t _cmp=(int32_t)d2-(int32_t)0xFFFF; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)0xFFFF); }
  if (flag_z) goto lbC0008A2;
  WRITE32(a5 + 634, a0);
  W(d3) = (uint16_t)d2;
  W(d2) = (uint16_t)((uint32_t)(d2) >> 8);
  W(d3) &= (uint16_t)(0xFF);
  flag_z=(d2==0); flag_n=((int32_t)d2<0); flag_c=0; flag_v=0;
  if (!flag_n) goto lbC0008EE;
  { int32_t _cmp=(int32_t)d2-(int32_t)0x80; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)0x80); }
  if (flag_z) goto lbC000930;
  { int32_t _cmp=(int32_t)d2-(int32_t)0x81; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)0x81); }
  if (!flag_z) goto lbC0008A8;
  d0 = 0;
  a3 = (uint32_t)(a2 + 64);
  B(d0) = (uint8_t)(READ8(a3 + 0));
  if (flag_z) goto lbC0008E8;
  B(d0) = (uint8_t)(B(d0) - (uint8_t)(1));
  d0 = (uint32_t)((uint16_t)6 * (uint16_t)d0);
  a3 = (uint32_t)(a6 + 74);
  d0 += a3;
lbC0008E8:
  WRITE32(a5 + 554, d0);
  goto lbC0008A8;
lbC0008EE:
  flag_z=(READ32(a5 + 58)==0); flag_n=((int32_t)READ32(a5 + 58)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC000930;
  d0 = READ32(a5 + 554);
  if (!flag_z) goto lbC000900;
  d0 = READ32(a2 + 12);
  if (flag_z) goto lbC000930;
lbC000900:
  a0 = d0;
  W(d1) = (uint16_t)(READ16(a2 + 4));
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 4));
  W(d1) = (uint16_t)(W(d1) - (uint16_t)(8));
  W(d1) = (uint16_t)(d1 + d2);
  B(d0) = (uint8_t)d7;
  W(d2) = (uint16_t)(READ16(a1 + 18));
  { int32_t _cmp=(int32_t)READ16(a5 + 60)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a5 + 60)<(uint32_t)1); }
  if (flag_z) goto _StartNOTE;
  W(d2) = (uint16_t)((uint32_t)(d2) >> 1);
_StartNOTE:
  StartNOTE();
  W(d0) = (uint16_t)d3;
  d0 = (uint32_t)((uint16_t)0xC000 * (uint16_t)d0);
  d0 = (d0 >> 16) | (d0 << 16);
  WRITE16(a5 + 572, d0);
  W(d3) = (uint16_t)(W(d3) - W(d0));
lbC000930:
  WRITE16(a5 + 588, d3);
lbC000934:
  a1 += 4;
  a5 += 4;
  B(d7) = (uint8_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC000874;
  d0 = READ32(a6 + 16);
  WRITE32(a6 + 16, READ32(a6 + 16) + 1);
  /* CMP.L	$364(A6),D0 */
  /* BNE.S	lbC000952 */
  /* BSR.S	lbC000990 */
lbC000952:
  d1 = READ32(a6 + 20);
  if (!flag_n) goto lbC000960;
  { int32_t _cmp=(int32_t)d6-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d6<(uint32_t)4); }
  if (!flag_z) goto lbC00097C;
  goto lbC000964;
lbC000960:
  { int32_t _cmp=(int32_t)d0-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d1); }
  if (!flag_z) goto lbC00097C;
lbC000964:
  /* TST.W	10(A6) */
  /* BMI.S	lbC000970 */
  /* SUBQ.W	#1,10(A6) */
  /* BEQ.S	lbC00097C */
lbC000970:
  SongEnd();
  a0 = a2;
  lbC000754();
  W(d6) = (uint16_t)(d6 + 1);
  goto lbC00086E;
lbC00097C:
  /* TST.W	10(A6) */
  /* BNE.S	lbC00098E */
  /* TST.L	$360(A6) */
  /* BEQ.S	lbC00098E */
  /* BSR.S	lbC000990 */
  /* CLR.L	$360(A6) */
lbC00098E:
  /* lbC000990	MOVEM.L	D0/D1/A0/A1,-(SP) */
  /* MOVE.L	$360(A6),D0 */
  /* BEQ.S	lbC0009AA */
  /* MOVEA.L	$35C(A6),A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$144(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC0009AA	MOVEM.L	(SP)+,D0/D1/A0/A1 */
  /* RTS */
}

static void lbC0009B0(void) {
  W(d6) = (uint16_t)(0);
  d7 = 0;
  a0 = READ32(a6 + 6);
  a1 = (uint32_t)(a6 + 466);
lbC0009BC:
  flag_z=(READ8(a1 + 0)==0); flag_n=((int32_t)READ8(a1 + 0)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC0009CA;
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC0009E8;
lbC0009CA:
  d0 = READ32(a1 + 4);
  if (flag_z) goto lbC0009FC;
  a4 = d0;
  a4 = READ32(a4 + 0);
  /* MOVEM.L d6,d7,a0,a1,a6,? */
  ((void(*)(void))(uintptr_t)(12))();
  /* MOVEM.L ?,d6,d7,a0,a1,a6 */
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC0009E8;
  d6 = d6 | (1u << (d7 & 31));
lbC0009E8:
  { int32_t _cmp=(int32_t)READ8(a1 + 0)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 0)<(uint32_t)1); }
  if (flag_z) goto lbC0009FC;
  d0 = (uint32_t)(int32_t)(int8_t)(2);
  { int32_t _cmp=(int32_t)READ8(a1 + 0)-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 0)<(uint32_t)2); }
  if (!flag_z) goto lbC000A00;
lbC0009FC:
  WRITE8(a1 + 1, d0);
lbC000A00:
  WRITE8(a1 + 0, 0);
  W(a1) = (uint16_t)(a1 + 0x16);
  W(d7) = (uint16_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC0009BC;
  paula_dma_write((uint16_t)(d6));
  W(d6) = (uint16_t)(0x8000);
  d7 = 0;
  a1 = (uint32_t)(a6 + 466);
  a2 = (uint32_t)0xDFF0A0;
lbC000A26:
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC000A48;
  a4 = READ32(a1 + 4);
  a4 = READ32(a4 + 0);
  /* MOVEM.L d6,d7,a0,a2,a6,? */
  ((void(*)(void))(uintptr_t)(0x10))();
  /* MOVEM.L ?,d6,d7,a0,a2,a6 */
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC000A48;
  d6 = d6 | (1u << (d7 & 31));
lbC000A48:
  W(a2) = (uint16_t)(a2 + 0x10);
  W(a1) = (uint16_t)(a1 + 0x16);
  W(d7) = (uint16_t)(d7 + 1);
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (!flag_z) goto lbC000A26;
  DMAWait();
  paula_dma_write((uint16_t)(d6));
  return;
}

static void lbC000A60(void) {
  W(d0) = (uint16_t)(0);
  d0 = d0 | (1u << (d7 & 31));
  paula_dma_write((uint16_t)(d0));
  W(d0) = (uint16_t)d7;
  W(d0) = (uint16_t)(d0 << 4);
  a0 = (uint32_t)0xDFF0A0;
  WRITE16(a0 + 6, 2);
  return;
}

static void StartNOTE(void) {
  /* MOVEM.L d1,d7,a0,a6,? */
  d3 = a0;
  if (flag_z) goto lbC000B2C;
  d3 = READ32(a0 + 0);
  if (flag_z) goto lbC000B2C;
  a0 = d3;
  a5 = READ32(a6 + 6);
  a1 = (uint32_t)(a6 + 466);
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  if (!flag_n) goto lbC000AEA;
  B(d5) = (uint8_t)(0);
  d7 = (uint32_t)(int32_t)(int8_t)(4);
lbC000AA4:
  W(d6) = (uint16_t)d7;
  W(d0) = (uint16_t)(READ16(a6 + 458));
lbC000AAA:
  W(d0) = (uint16_t)(d0 + 1);
  { int32_t _cmp=(int32_t)d0-(int32_t)d7; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d7); }
  if (flag_c) goto lbC000AB2;
  W(d0) = (uint16_t)(0);
lbC000AB2:
  W(d3) = (uint16_t)d0;
  d3 = (uint32_t)((uint16_t)0x16 * (uint16_t)d3);
  flag_z=(READ8(a1 + 0)==0); flag_n=((int32_t)READ8(a1 + 0)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC000AC4;
  { int32_t _cmp=(int32_t)d5-(int32_t)READ8(a1 + 1); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d5<(uint32_t)READ8(a1 + 1)); }
  if (flag_z) goto lbC000AD6;
lbC000AC4:
  W(d6) = (uint16_t)(W(d6) - (uint16_t)(1));
  if (!flag_z) goto lbC000AAA;
  { int32_t _cmp=(int32_t)d5-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d5<(uint32_t)0); }
  if (!flag_z) goto lbC000B2C;
  B(d5) = (uint8_t)(2);
  goto lbC000AA4;
lbC000AD6:
  flag_z=(READ16(a6 + 10)==0); flag_n=((int32_t)READ16(a6 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC000AE6;
  W(d3) = (uint16_t)d0;
  W(d3) = (uint16_t)(d3 << 2);
  flag_z=(READ32(a6 + 58)==0); flag_n=((int32_t)READ32(a6 + 58)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC000AC4;
lbC000AE6:
  WRITE16(a6 + 458, d0);
lbC000AEA:
  W(d3) = (uint16_t)d0;
  d3 = (uint32_t)((uint16_t)0x16 * (uint16_t)d3);
  W(a1) = (uint16_t)(a1 + d3);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC000B0E;
  a2 = READ32(a0 + 0);
  a3 = READ32(a1 + 4);
  a3 = READ32(a3 + 0);
  { int32_t _cmp=(int32_t)a2-(int32_t)a3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)a2<(uint32_t)a3); }
  if (flag_z) goto lbC000B0E;
  StopNOTE();
lbC000B0E:
  WRITE32(a1 + 4, a0);
  WRITE8(a1 + 3, d1);
  W(d2) &= (uint16_t)(0xFF);
  WRITE16(a1 + 8, d2);
  WRITE8(a1 + 0, 1);
  d0 = (uint32_t)(int32_t)(int16_t)d0;
lbC000B26:
  /* MOVEM.L ?,d1,d7,a0,a6 */
  return;
lbC000B2C:
  goto lbC000B26;
  /* ReleaseSOUND	MOVE.L	D0,-(SP) */
  /* CLR.L	$360(A6) */
  /* CLR.W	10(A6) */
  /* MOVEQ	#3,D0 */
  /* lbC000B3C	BSR.S	ReleaseNOTE */
  /* DBRA	D0,lbC000B3C */
  /* MOVE.L	(SP)+,D0 */
  /* RTS */
}

static void ReleaseNOTE(void) {
  /* MOVEM.L d0,a1,? */
  a1 = (uint32_t)(a6 + 466);
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  d0 = (uint32_t)((uint16_t)0x16 * (uint16_t)d0);
  W(a1) = (uint16_t)(a1 + d0);
  WRITE8(a1 + 0, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)1); }
  if (!flag_z) goto lbC000B68;
  WRITE8(a1 + 0, 2);
lbC000B68:
  /* MOVEM.L ?,d0,a1 */
  return;
  /* StopSOUND	MOVE.L	D0,-(SP) */
  /* CLR.L	$360(A6) */
  /* CLR.W	10(A6) */
  /* MOVEQ	#3,D0 */
  /* lbC000B7A	BSR.S	StopNOTE */
  /* DBRA	D0,lbC000B7A */
  /* MOVE.L	(SP)+,D0 */
  /* RTS */
}

static void StopNOTE(void) {
  /* MOVEM.L d0,d7,a0,a1,? */
  a0 = READ32(a6 + 6);
  a1 = (uint32_t)(a6 + 466);
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  W(d7) = (uint16_t)d0;
  d0 = (uint32_t)((uint16_t)0x16 * (uint16_t)d0);
  W(a1) = (uint16_t)(a1 + d0);
  WRITE8(a1 + 0, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC000BCE;
  WRITE8(a1 + 0, 3);
  d0 = READ32(a1 + 4);
  if (flag_z) goto lbC000BC4;
  /* MOVEM.L d0,d7,a0,a6,? */
  a4 = d0;
  a4 = READ32(a4 + 0);
  ((void(*)(void))(uintptr_t)(12))();
  /* MOVEM.L ?,d0,d7,a0,a6 */
lbC000BC4:
  WRITE8(a1 + 1, 0);
  WRITE8(a1 + 0, 0);
lbC000BCE:
  /* MOVEM.L ?,d0,d7,a0,a1 */
  return;
}

static void RampVOLUME(void) {
  /* MOVEM.L d1,d2,a0,? */
  a0 = READ32(a6 + 6);
  WRITE16(a6 + 464, 0);
  flag_z=(d0==0); flag_n=((int32_t)d0<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC000C0C;
  d2 = (uint32_t)(int32_t)(int8_t)(0);
  W(d2) = (uint16_t)(READ16(a6 + 0));
  W(d2) = (uint16_t)(d2 << 8);
  WRITE16(a6 + 460, d2);
  W(d1) = (uint16_t)(d1 << 8);
  W(d2) = (uint16_t)(W(d2) - W(d1));
  if (!flag_c) goto lbC000BF8;
  W(d2) = (uint16_t)(-(int16_t)W(d2));
lbC000BF8:
  { uint16_t q=(uint16_t)((uint32_t)d2/(uint16_t)d0); uint16_t r=(uint16_t)((uint32_t)d2%(uint16_t)d0); d2=((uint32_t)r<<16)|q; }
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)d2;
  if (!flag_z) goto lbC000C02;
  W(d1) = (uint16_t)(d1 + 1);
lbC000C02:
  WRITE32(a6 + 462, d1);
lbC000C06:
  /* MOVEM.L ?,d1,d2,a0 */
  return;
lbC000C0C:
  WRITE16(a6 + 0, d1);
  goto lbC000C06;
}

static void lbC000C12(void) {
  W(d0) = (uint16_t)(READ16(a6 + 464));
  if (flag_z) goto lbC000C44;
  d0 = (uint32_t)((uint16_t)READ16(a6 + 54) * (uint16_t)d0);
  d0 = d0 << 1;
  if (flag_c) goto lbC000C46;
  d0 = (d0 >> 16) | (d0 << 16);
  W(d3) = (uint16_t)d0;
  W(d1) = (uint16_t)(READ16(a6 + 460));
  W(d2) = (uint16_t)(READ16(a6 + 462));
  W(d2) = (uint16_t)(W(d2) - W(d1));
  if (!flag_c) goto lbC000C34;
  W(d3) = (uint16_t)(-(int16_t)W(d3));
  W(d2) = (uint16_t)(-(int16_t)W(d2));
lbC000C34:
  { int32_t _cmp=(int32_t)d0-(int32_t)d2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d2); }
  if (!flag_c) goto lbC000C46;
  W(d1) = (uint16_t)(d1 + d3);
  WRITE16(a6 + 460, d1);
lbC000C3E:
  W(d1) = (uint16_t)((uint32_t)(d1) >> 8);
  WRITE16(a6 + 0, d1);
lbC000C44:
lbC000C46:
  W(d1) = (uint16_t)(READ16(a6 + 462));
  if (!flag_z) goto lbC000C58;
  WRITE32(a6 + 48, READ32(a6 + 48) & ~(1u << (0 & 31)));
  if (flag_z) goto lbC000C58;
  lbC0006BA();
lbC000C58:
  WRITE16(a6 + 464, 0);
  goto lbC000C3E;
  /* StealTRACK	MOVEM.L	D1/A0,-(SP) */
  /* CLR.W	D1 */
  /* MOVE.B	D0,D1 */
  /* ASL.W	#2,D1 */
  /* LEA	$3C(A6,D1.W),A0 */
  /* TST.W	(A0) */
  /* BEQ.S	lbC000C76 */
  /* BSR.L	StopNOTE */
  /* CLR.W	(A0) */
  /* lbC000C76	MOVEM.L	(SP)+,D1/A0 */
  /* RTS */
  /* ResumeTRACK	MOVEM.L	D0/A0,-(SP) */
  /* EXT.W	D0 */
  /* ASL.W	#2,D0 */
  /* MOVEA.L	6(A6),A0 */
  /* MOVE.W	$22(A0,D0.W),$3C(A6,D0.W) */
  /* MOVEM.L	(SP)+,D0/A0 */
  /* RTS */
lbW01EB58:
lbW00D4B2:
}
static const uint16_t lbW000C94[] = { 0x8000 };
static const uint16_t _data_7273[] = { 0x78d1 };
static const uint16_t _data_7274[] = { 0x7209 };
static const uint16_t _data_7275[] = { 0x6ba2 };
static const uint16_t _data_7276[] = { 0x6598 };
static const uint16_t _data_7277[] = { 0x5fe4 };
static const uint16_t _data_7278[] = { 0x5a82 };
static const uint16_t _data_7279[] = { 0x556e };
static const uint16_t _data_7280[] = { 0x50a3 };
static const uint16_t _data_7281[] = { 0x4c1c };
static const uint16_t _data_7282[] = { 0x47d6 };
static const uint16_t _data_7283[] = { 0x43ce };
static const uint16_t _data_7284[] = { 0x4000 };

static void lbW00D4CC(void) {
}
static const uint16_t lbW000CAE[] = { 0xfa83 };
static const uint16_t _data_7287[] = { 0xf525 };
static const uint16_t _data_7288[] = { 0xefe4 };
static const uint16_t _data_7289[] = { 0xeac0 };
static const uint16_t _data_7290[] = { 0xe5b9 };
static const uint16_t _data_7291[] = { 0xe0cc };
static const uint16_t _data_7292[] = { 0xdbfb };
static const uint16_t _data_7293[] = { 0xd744 };
static const uint16_t _data_7294[] = { 0xd2a8 };
static const uint16_t _data_7295[] = { 0xce24 };
static const uint16_t _data_7296[] = { 0xc9b9 };
static const uint16_t _data_7297[] = { 0xc567 };
static const uint16_t _data_7298[] = { 0xc12c };
static const uint16_t _data_7299[] = { 0xbd08 };
static const uint16_t _data_7300[] = { 0xb8fb };
static const uint16_t _data_7301[] = { 0xb504 };
static const uint16_t _data_7302[] = { 0xb123 };
static const uint16_t _data_7303[] = { 0xad58 };
static const uint16_t _data_7304[] = { 0xa9a1 };
static const uint16_t _data_7305[] = { 0xa5fe };
static const uint16_t _data_7306[] = { 0xa270 };
static const uint16_t _data_7307[] = { 0x9ef5 };
static const uint16_t _data_7308[] = { 0x9b8d };
static const uint16_t _data_7309[] = { 0x9837 };
static const uint16_t _data_7310[] = { 0x94f4 };
static const uint16_t _data_7311[] = { 0x91c3 };
static const uint16_t _data_7312[] = { 0x8ea4 };
static const uint16_t _data_7313[] = { 0x8b95 };
static const uint16_t _data_7314[] = { 0x8898 };
static const uint16_t _data_7315[] = { 0x85aa };
static const uint16_t _data_7316[] = { 0x82cd };
static const uint16_t _data_7317[] = { 0x8000 };
static const uint16_t _data_7318[] = { 0x7d41 };
static const uint16_t _data_7319[] = { 0x7a92 };
static const uint16_t _data_7320[] = { 0x77f2 };
static const uint16_t _data_7321[] = { 0x7560 };
static const uint16_t _data_7322[] = { 0x72dc };
static const uint16_t _data_7323[] = { 0x7066 };
static const uint16_t _data_7324[] = { 0x6dfd };
static const uint16_t _data_7325[] = { 0x6ba2 };
static const uint16_t _data_7326[] = { 0x6954 };
static const uint16_t _data_7327[] = { 0x6712 };
static const uint16_t _data_7328[] = { 0x64dc };
static const uint16_t _data_7329[] = { 0x62b3 };
static const uint16_t _data_7330[] = { 0x6096 };
static const uint16_t _data_7331[] = { 0x5e84 };
static const uint16_t _data_7332[] = { 0x5c7d };
static const uint16_t _data_7333[] = { 0x5a82 };
static const uint16_t _data_7334[] = { 0x5891 };
static const uint16_t _data_7335[] = { 0x56ac };
static const uint16_t _data_7336[] = { 0x54d0 };
static const uint16_t _data_7337[] = { 0x52ff };
static const uint16_t _data_7338[] = { 0x5138 };
static const uint16_t _data_7339[] = { 0x4f7a };
static const uint16_t _data_7340[] = { 0x4dc6 };
static const uint16_t _data_7341[] = { 0x4c1b };
static const uint16_t _data_7342[] = { 0x4a7a };
static const uint16_t _data_7343[] = { 0x48e1 };
static const uint16_t _data_7344[] = { 0x4752 };
static const uint16_t _data_7345[] = { 0x45ca };
static const uint16_t _data_7346[] = { 0x444c };
static const uint16_t _data_7347[] = { 0x42d5 };
static const uint16_t _data_7348[] = { 0x4166 };
static const uint16_t _data_7349[] = { 0x4000 };
static const uint16_t _data_7350[] = { 0x3ea0 };
static const uint16_t _data_7351[] = { 0x3d49 };
static const uint16_t _data_7352[] = { 0x3bf9 };
static const uint16_t _data_7353[] = { 0x3ab0 };
static const uint16_t _data_7354[] = { 0x396e };
static const uint16_t _data_7355[] = { 0x3833 };
static const uint16_t _data_7356[] = { 0x36fe };
static const uint16_t _data_7357[] = { 0x35d1 };
static const uint16_t _data_7358[] = { 0x34aa };
static const uint16_t _data_7359[] = { 0x3389 };
static const uint16_t _data_7360[] = { 0x326e };
static const uint16_t _data_7361[] = { 0x3159 };
static const uint16_t _data_7362[] = { 0x304b };
static const uint16_t _data_7363[] = { 0x2f42 };
static const uint16_t _data_7364[] = { 0x2e3e };
static const uint16_t _data_7365[] = { 0x2d41 };
static const uint16_t _data_7366[] = { 0x2c48 };
static const uint16_t _data_7367[] = { 0x2b56 };
static const uint16_t _data_7368[] = { 0x2a68 };
static const uint16_t _data_7369[] = { 0x297f };
static const uint16_t _data_7370[] = { 0x289c };
static const uint16_t _data_7371[] = { 0x27bd };
static const uint16_t _data_7372[] = { 0x26e3 };
static const uint16_t _data_7373[] = { 0x260d };
static const uint16_t _data_7374[] = { 0x253d };
static const uint16_t _data_7375[] = { 0x2470 };
static const uint16_t _data_7376[] = { 0x23a9 };
static const uint16_t _data_7377[] = { 0x22e5 };
static const uint16_t _data_7378[] = { 0x2226 };
static const uint16_t _data_7379[] = { 0x216a };
static const uint16_t _data_7380[] = { 0x20b3 };
static const uint16_t _data_7381[] = { 0x2000 };
static const uint16_t _data_7382[] = { 0x1f50 };
static const uint16_t _data_7383[] = { 0x1ea4 };
static const uint16_t _data_7384[] = { 0x1dfc };
static const uint16_t _data_7385[] = { 0x1d58 };
static const uint16_t _data_7386[] = { 0x1cb7 };
static const uint16_t _data_7387[] = { 0x1c19 };
static const uint16_t _data_7388[] = { 0x1b7f };
static const uint16_t _data_7389[] = { 0x1ae8 };
static const uint16_t _data_7390[] = { 0x1a55 };
static const uint16_t _data_7391[] = { 0x19c4 };
static const uint16_t _data_7392[] = { 0x1937 };
static const uint16_t _data_7393[] = { 0x18ac };
static const uint16_t _data_7394[] = { 0x1825 };
static const uint16_t _data_7395[] = { 0x17a1 };
static const uint16_t _data_7396[] = { 0x171f };
static const uint16_t _data_7397[] = { 0x16a0 };
static const uint16_t _data_7398[] = { 0x1624 };
static const uint16_t _data_7399[] = { 0x15ab };
static const uint16_t _data_7400[] = { 0x1534 };
static const uint16_t _data_7401[] = { 0x14bf };
static const uint16_t _data_7402[] = { 0x144e };
static const uint16_t _data_7403[] = { 0x13de };
static const uint16_t _data_7404[] = { 0x1371 };
static const uint16_t _data_7405[] = { 0x1306 };
static const uint16_t _data_7406[] = { 0x129e };
static const uint16_t _data_7407[] = { 0x1238 };
static const uint16_t _data_7408[] = { 0x11d4 };
static const uint16_t _data_7409[] = { 0x1172 };
static const uint16_t _data_7410[] = { 0x1113 };
static const uint16_t _data_7411[] = { 0x10b5 };
static const uint16_t _data_7412[] = { 0x1059 };
static const uint16_t _data_7413[] = { 0x1000 };

static void Synttech(void) {
  /* dc.w	SStech-Synttech */
  /* dc.w	Synthesis.MSG-Synttech */
  /* BRA.L	lbC000DC2 */
  /* BRA.L	lbC000E02 */
  goto lbC000E4E;
  goto lbC000E24;
  /* lbC000DC2	MOVEM.L	D0-D7/A1-A6,-(SP) */
  /* MOVE.L	D0,D3 */
  /* MOVE.L	#$1DA,D0 */
  /* MOVE.L	#$10001,D1 */
  /* BSR.L	ALLOCATE */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC000DF6 */
  /* MOVE.L	D3,D0 */
  /* MOVE.L	#$1D6,D1 */
  /* BSR.L	lbC0000FA */
  /* CMP.L	D1,D0 */
  /* BNE.S	lbC000DFC */
  /* BSR.L	SetFILTER */
  /* TST.L	$1D6(A0) */
  /* BEQ.S	lbC000DFC */
  /* lbC000DF6	MOVEM.L	(SP)+,D0-D7/A1-A6 */
  /* RTS */
  /* lbC000DFC	BSR.S	lbC000E02 */
  /* SUBA.L	A0,A0 */
  /* BRA.S	lbC000DF6 */
  /* lbC000E02	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	$1D6(A0),D0 */
  /* BSR.L	RELEASE */
  /* TST.L	D0 */
  /* BEQ.S	lbC000E1E */
  /* MOVEA.L	D0,A0 */
  /* SUBQ.W	#1,$2000(A0) */
  /* BNE.S	lbC000E1E */
  /* BSR.L	RELEASE */
  /* lbC000E1E	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
lbC000E24:
  d0 = 0;
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC000E4C;
  WRITE32(a2 + 0, READ32(a1 + 12));
  WRITE16(a2 + 4, READ16(a1 + 16));
  WRITE16(a2 + 6, READ16(a1 + 18));
  /* MOVE.W	$14(A1),8(A2) */
  WRITE32_PRE(sp, d0);
  d0 = READ32(a1 + 12);
  SetAdr();
  W(d0) = (uint16_t)(READ16(a1 + 16));
  SetLen();
  W(d0) = (uint16_t)(READ16(a1 + 18));
  SetPer();
  W(d0) = (uint16_t)(READ16(a1 + 20));
  ChangeVolume();
  d0 = READ32_POST(sp);
  W(d0) = (uint16_t)(READ16(a1 + 10));
  WRITE16(a1 + 10, 0);
lbC000E4C:
lbC000E4E:
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC001220;
  a3 = READ32(a1 + 4);
  a2 = (uint32_t)(a6 + 1020);
  W(d0) = (uint16_t)d7;
  d0 = (uint32_t)((uint16_t)0x1A * (uint16_t)d0);
  W(a2) = (uint16_t)(a2 + d0);
  B(d0) = (uint8_t)(READ8(a1 + 0));
  if (flag_z) goto lbC000F6A;
  { int32_t _cmp=(int32_t)d0-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)1); }
  if (!flag_z) goto lbC000F4E;
  d1 = 0;
  B(d1) = (uint8_t)(READ8(a1 + 3));
  { int32_t _cmp=(int32_t)d1-(int32_t)0x24; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)0x24); }
  if (flag_n==flag_v) goto lbC000E94;
lbC000E82:
  WRITE8(a1 + 0, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC001220;
  goto lbC000F6A;
lbC000E94:
  { int32_t _cmp=(int32_t)d1-(int32_t)0x6C; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)0x6C); }
  if (flag_n==flag_v) goto lbC000E82;
  W(d1) = (uint16_t)(W(d1) - (uint16_t)(0x24));
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (!flag_z) goto lbC000EAA;
  WRITE32(a2 + 12, 0);
lbC000EAA:
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)1); }
  if (flag_z) goto lbC000EB6;
  WRITE16(a2 + 10, 0);
lbC000EB6:
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)12); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)12); d1=((uint32_t)r<<16)|q; }
  W(d2) = (uint16_t)d1;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)(d1 << 1);
  a0 = (uint32_t)(uintptr_t)&lbW000C94;
  W(d0) = (uint16_t)(0xD5C8);
  d0 = (uint32_t)((uint16_t)READ16(a0 + 0) * (uint16_t)d0);
  W(d2) = (uint16_t)(d2 + 0x11);
  d0 >>= d2;
  flag_z=(READ16(a2 + 0)==0); flag_n=((int32_t)READ16(a2 + 0)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC000EDE;
  WRITE16(a2 + 2, 0);
  goto lbC000F06;
lbC000EDE:
  W(d1) = (uint16_t)d0;
  W(d1) = (uint16_t)(W(d1) - READ16(a2 + 0));
  d1 = (uint32_t)(int32_t)(int16_t)d1;
  W(d2) = (uint16_t)(READ16(a3 + 434));
  d2 = (d2 >> 16) | (d2 << 16);
  W(d2) = (uint16_t)(0);
  d2 >>= 1;
  { uint16_t q=(uint16_t)((uint32_t)d2/(uint16_t)READ16(a6 + 54)); uint16_t r=(uint16_t)((uint32_t)d2%(uint16_t)READ16(a6 + 54)); d2=((uint32_t)r<<16)|q; }
  W(d2) = (uint16_t)((uint32_t)(d2) >> 3);
  W(d2) = (uint16_t)(d2 + 1);
  WRITE16(a2 + 2, d2);
  { int16_t q=(int16_t)((int32_t)d1/(int16_t)d2); int16_t r=(int16_t)((int32_t)d1%(int16_t)d2); d1=((uint32_t)(uint16_t)r<<16)|(uint16_t)q; }
  WRITE16(a2 + 4, d1);
  d1 = (uint32_t)((uint16_t)d2 * (uint16_t)d1);
  W(d0) = (uint16_t)(W(d0) - W(d1));
lbC000F06:
  WRITE16(a2 + 0, d0);
  WRITE16(a2 + 24, 1);
  flag_z=(READ16(a3 + 450)==0); flag_n=((int32_t)READ16(a3 + 450)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC000F1A;
  WRITE16(a2 + 22, 0);
lbC000F1A:
  WRITE16(a2 + 18, 0);
  flag_z=(READ16(a3 + 446)==0); flag_n=((int32_t)READ16(a3 + 446)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC000F46;
  WRITE16(a2 + 16, 0);
  W(d0) = (uint16_t)(READ16(a3 + 448));
  d0 = (d0 >> 16) | (d0 << 16);
  W(d0) = (uint16_t)(0);
  d0 >>= 1;
  { uint16_t q=(uint16_t)((uint32_t)d0/(uint16_t)READ16(a6 + 54)); uint16_t r=(uint16_t)((uint32_t)d0%(uint16_t)READ16(a6 + 54)); d0=((uint32_t)r<<16)|q; }
  W(d0) = (uint16_t)((uint32_t)(d0) >> 2);
  WRITE16(a2 + 18, d0);
  B(d0) = (uint8_t)(READ8(a3 + 164));
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  WRITE16(a2 + 20, d0);
lbC000F46:
  WRITE16(a1 + 10, 0xFFFF);
  goto lbC000F6A;
lbC000F4E:
  { int32_t _cmp=(int32_t)d0-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)2); }
  if (!flag_z) goto lbC000F5C;
  WRITE16(a2 + 10, 6);
  goto lbC000F6A;
lbC000F5C:
  { int32_t _cmp=(int32_t)d0-(int32_t)3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)3); }
  if (!flag_z) goto lbC000F6A;
  lbC000A60();
  goto lbC001220;
lbC000F6A:
  flag_z=(READ16(a2 + 18)==0); flag_n=((int32_t)READ16(a2 + 18)<0); flag_c=0; flag_v=0;
  if (flag_n) goto lbC000FB0;
  if (flag_z) goto lbC000F78;
  WRITE16(a2 + 18, READ16(a2 + 18) - 1);
  goto lbC000FB0;
lbC000F78:
  W(d0) = (uint16_t)(READ16(a2 + 16));
  W(d1) = (uint16_t)(READ16(a3 + 444));
  d1 = (uint32_t)((uint16_t)READ16(a6 + 54) * (uint16_t)d1);
  d1 = d1 << 6;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d0) = (uint16_t)(d0 + d1);
  if (!flag_c) goto lbC000F9C;
  flag_z=(READ16(a3 + 446)==0); flag_n=((int32_t)READ16(a3 + 446)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC000F9C;
  if (flag_n) goto lbC000F9C;
  WRITE16(a2 + 18, 0xFFFF);
  goto lbC000FB0;
lbC000F9C:
  WRITE16(a2 + 16, d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  a0 = (uint32_t)(a3 + 164);
  B(d0) = (uint8_t)(READ8(a0 + 0));
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  WRITE16(a2 + 20, d0);
lbC000FB0:
  W(d0) = (uint16_t)(READ16(a2 + 10));
  a0 = (uint32_t)(a3 + 0);
  d1 = 0;
  W(d1) = (uint16_t)(READ16(a0 + 454));
  d1 = (d1 >> 16) | (d1 << 16);
  d2 = READ32(a2 + 12);
  d3 = 0;
  W(d3) = (uint16_t)(READ16(a0 + 462));
  W(d0) = (uint16_t)d3;
  W(d0) = (uint16_t)((uint32_t)(d0) >> 5);
  W(d0) ^= (uint16_t)(7);
  W(d3) &= (uint16_t)(0x1F);
  W(d3) = (uint16_t)(d3 + 0x21);
  d3 = (uint32_t)((uint16_t)READ16(a6 + 54) * (uint16_t)d3);
  d3 = d3 << 3;
  d3 >>= d0;
  d0 = d1;
  d0 -= d2;
  if (!flag_n) goto lbC000FEA;
  d0 = (uint32_t)(-(int32_t)d0);
lbC000FEA:
  { int32_t _cmp=(int32_t)d0-(int32_t)d3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d3); }
  if (!flag_z && (flag_n==flag_v)) goto lbC001000;
  d2 = d1;
  { int32_t _cmp=(int32_t)READ16(a2 + 10)-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a2 + 10)<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC00100A;
  WRITE16(a2 + 10, READ16(a2 + 10) + 2);
  goto lbC00100A;
lbC001000:
  { int32_t _cmp=(int32_t)d2-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)d1); }
  if (flag_n!=flag_v) goto lbC001008;
  d2 -= d3;
  goto lbC00100A;
lbC001008:
  d2 += d3;
lbC00100A:
  WRITE32(a2 + 12, d2);
  W(d0) = (uint16_t)(READ16(a2 + 0));
  d2 = (uint32_t)(int32_t)(int8_t)(5);
  flag_z=(READ16(a2 + 2)==0); flag_n=((int32_t)READ16(a2 + 2)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC001026;
  WRITE16(a2 + 2, READ16(a2 + 2) - 1);
  W(d0) = (uint16_t)(d0 + READ16(a2 + 4));
  WRITE16(a2 + 0, d0);
lbC001026:
  { int32_t _cmp=(int32_t)d0-(int32_t)0x1AC; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x1AC); }
  if (flag_z||(flag_n!=flag_v)) goto lbC001032;
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(1));
  goto lbC001026;
lbC001032:
  WRITE16(a2 + 8, d2);
  d1 = (uint32_t)(int32_t)(int8_t)(0x40);
  W(d1) = (uint16_t)((uint32_t)(d1) >> d2);
  WRITE16(a1 + 16, d1);
  W(d1) = (uint16_t)(READ16(a2 + 20));
  W(d2) = (uint16_t)(READ16(a3 + 436));
  d1 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d1);
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 7));
  W(d2) = (uint16_t)(READ16(a6 + 4));
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(0x80));
  W(d1) = (uint16_t)(W(d1) - W(d2));
  W(d1) = (uint16_t)(d1 + 0x1000);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(12);
  d0 >>= d1;
  WRITE16(a1 + 18, d0);
  W(d0) = (uint16_t)(READ16(a3 + 428));
  W(d1) = (uint16_t)(READ16(a2 + 20));
  W(d1) = (uint16_t)(-(int16_t)W(d1));
  W(d2) = (uint16_t)(READ16(a3 + 432));
  d1 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d1);
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 8));
  W(d0) = (uint16_t)(d0 + d1);
  flag_z=(READ16(a3 + 430)==0); flag_n=((int32_t)READ16(a3 + 430)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC001088;
  d1 = READ32(a2 + 12);
  d1 = (d1 >> 16) | (d1 << 16);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  goto lbC001092;
lbC001088:
  { int32_t _cmp=(int32_t)READ16(a2 + 10)-(int32_t)6; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a2 + 10)<(uint32_t)6); }
  if (!flag_z) goto lbC001092;
  W(d0) = (uint16_t)(0);
lbC001092:
  W(d0) &= (uint16_t)(0xFF);
  W(d0) = (uint16_t)(d0 + 1);
  d0 = (uint32_t)((uint16_t)READ16(a6 + 0) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  W(d0) = (uint16_t)(d0 + 1);
  d0 = (uint32_t)((uint16_t)READ16(a1 + 8) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  W(d0) = (uint16_t)(d0 + 1);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 2);
  WRITE16(a1 + 20, d0);
  W(d0) = (uint16_t)(READ16(a3 + 440));
  d1 = READ32(a2 + 12);
  d1 = (d1 >> 16) | (d1 << 16);
  d1 = (uint32_t)((uint16_t)d0 * (uint16_t)d1);
  W(d1) = (uint16_t)((uint32_t)(d1) >> 8);
  W(d0) = (uint16_t)(READ16(a3 + 438));
  W(d0) ^= (uint16_t)(0xFF);
  W(d0) = (uint16_t)(W(d0) - W(d1));
  W(d1) = (uint16_t)(READ16(a2 + 20));
  W(d2) = (uint16_t)(READ16(a3 + 442));
  d1 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d1);
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 8));
  W(d0) = (uint16_t)(d0 + d1);
  W(d0) &= (uint16_t)(0xFF);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 2);
  W(d0) = (uint16_t)(d0 << 7);
  /* MOVEA.L	$1D6(A3),A0 */
  a0 = READ32(a3 + -4);
  d1 = a0;
  if (!flag_z) goto lbC0010EA;
  a0 = (uint32_t)(a3 + 36);
  W(d0) = (uint16_t)(0);
lbC0010EA:
  W(a0) = (uint16_t)(a0 + d0);
  W(d0) = (uint16_t)(READ16(a2 + 6));
  W(d0) ^= (uint16_t)(0x80);
  WRITE16(a2 + 6, d0);
  a4 = READ32(a6 + 666);
  a4 = (uint32_t)(a4 + 0);
  W(d0) = (uint16_t)(0x100);
  d0 = (uint32_t)((uint16_t)d7 * (uint16_t)d0);
  W(a4) = (uint16_t)(a4 + d0);
  WRITE32(a1 + 12, a4);
  flag_z=(READ16(a3 + 450)==0); flag_n=((int32_t)READ16(a3 + 450)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC00112C;
  W(d3) = (uint16_t)(READ16(a2 + 8));
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  d1 = d1 | (1u << (d3 & 31));
  W(d4) = (uint16_t)(0x80);
  W(d4) = (uint16_t)((uint32_t)(d4) >> d3);
lbC001120:
  WRITE8_POST(a4, READ8(a0));
  W(a0) = (uint16_t)(a0 + d1);
  W(d4) = (uint16_t)(W(d4) - (uint16_t)(1));
  if (!flag_z) goto lbC001120;
  goto lbC001220;
lbC00112C:
  flag_z=(READ16(a3 + 452)==0); flag_n=((int32_t)READ16(a3 + 452)<0); flag_c=0; flag_v=0;
  if (!flag_z) goto lbC00119E;
  W(d3) = (uint16_t)(READ16(a2 + 8));
  d1 = (uint32_t)(int32_t)(int8_t)(0);
  d1 = d1 | (1u << (d3 & 31));
  W(d2) = (uint16_t)(READ16(a1 + 16));
  W(d2) = (uint16_t)(d2 << 1);
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(1));
  W(d4) = (uint16_t)(READ16(a3 + 450));
  d4 = (uint32_t)((uint16_t)READ16(a6 + 54) * (uint16_t)d4);
  d0 = (uint32_t)(int32_t)(int8_t)(13);
  d4 >>= d0;
  W(d4) = (uint16_t)(d4 + READ16(a2 + 22));
  WRITE16(a2 + 22, d4);
  d0 = (uint32_t)(int32_t)(int8_t)(9);
  W(d4) = (uint16_t)((uint32_t)(d4) >> d0);
  a5 = (uint32_t)(a0 + 0);
  W(d4) = (uint16_t)((uint32_t)(d4) >> d3);
  W(d2) = (uint16_t)(W(d2) - W(d4));
lbC001164:
  B(d0) = (uint8_t)(READ8(a0));
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  B(d3) = (uint8_t)(READ8(a5));
  d3 = (uint32_t)(int32_t)(int16_t)(int8_t)d3;
  W(d0) = (uint16_t)(d0 + d3);
  W(d0) = (uint16_t)((uint32_t)((int32_t)d0 >> 1));
  WRITE8_POST(a4, d0);
  W(a0) = (uint16_t)(a0 + d1);
  W(a5) = (uint16_t)(a5 + d1);
  if ((int16_t)(--d2) >= 0) goto lbC001164;
  W(a5) = (uint16_t)(W(a5) - (uint16_t)(0x80));
  W(d4) = (uint16_t)(W(d4) - (uint16_t)(1));
  if (flag_n) goto lbC001220;
lbC001184:
  B(d0) = (uint8_t)(READ8(a0));
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  B(d3) = (uint8_t)(READ8(a5));
  d3 = (uint32_t)(int32_t)(int16_t)(int8_t)d3;
  W(d0) = (uint16_t)(d0 + d3);
  W(d0) = (uint16_t)((uint32_t)((int32_t)d0 >> 1));
  WRITE8_POST(a4, d0);
  W(a0) = (uint16_t)(a0 + d1);
  W(a5) = (uint16_t)(a5 + d1);
  if ((int16_t)(--d4) >= 0) goto lbC001184;
  goto lbC001220;
lbC00119E:
  W(d0) = (uint16_t)(READ16(a3 + 450));
  d0 = (uint32_t)((uint16_t)READ16(a6 + 54) * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(11);
  d0 >>= d1;
  d0 = (uint32_t)((int32_t)(int16_t)READ16(a2 + 24) * (int32_t)(int16_t)d0);
  W(d0) = (uint16_t)(d0 + READ16(a2 + 22));
  if (!flag_v) goto lbC0011C4;
  { int32_t _cmp=(int32_t)d0-(int32_t)0x8000; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)0x8000); }
  if (!flag_z) goto lbC0011BE;
  W(d0) = (uint16_t)(d0 + READ16(a2 + 24));
lbC0011BE:
  W(READ16(a2 + 24)) = (uint16_t)(-(int16_t)W(READ16(a2 + 24)));
  W(d0) = (uint16_t)(-(int16_t)W(d0));
lbC0011C4:
  WRITE16(a2 + 22, d0);
  W(d1) = (uint16_t)(READ16(a3 + 452));
  d0 = (uint32_t)((int32_t)(int16_t)d1 * (int32_t)(int16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(0x11);
  W(d1) = (uint16_t)(d1 + READ16(a2 + 8));
  d0 = (uint32_t)((int32_t)d0 >> d1);
  W(d2) = (uint16_t)(READ16(a1 + 16));
  W(d3) = (uint16_t)d2;
  W(d2) = (uint16_t)(d2 + d0);
  W(d3) = (uint16_t)(W(d3) - W(d0));
  W(d6) = (uint16_t)d2;
  if (flag_z) goto lbC001200;
  W(d0) = (uint16_t)(0);
  W(d1) = (uint16_t)(0);
  d4 = (uint32_t)(int32_t)(int8_t)(0x40);
  { uint16_t q=(uint16_t)((uint32_t)d4/(uint16_t)d2); uint16_t r=(uint16_t)((uint32_t)d4%(uint16_t)d2); d4=((uint32_t)r<<16)|q; }
  W(d5) = (uint16_t)d4;
  d4 = (d4 >> 16) | (d4 << 16);
lbC0011F0:
  WRITE8_POST(a4, READ8(a0 + 0));
  W(d1) = (uint16_t)(W(d1) - W(d4));
  if (!flag_c) goto lbC0011FA;
  W(d1) = (uint16_t)(d1 + d2);
lbC0011FA:
  W(d0) = (uint16_t)(d0 + d5 + flag_x);
  W(d6) = (uint16_t)(W(d6) - (uint16_t)(1));
  if (!flag_z) goto lbC0011F0;
lbC001200:
  W(d6) = (uint16_t)d3;
  if (flag_z) goto lbC001220;
  d0 = (uint32_t)(int32_t)(int8_t)(0x40);
  W(d1) = (uint16_t)(0);
  d4 = (uint32_t)(int32_t)(int8_t)(0x40);
  { uint16_t q=(uint16_t)((uint32_t)d4/(uint16_t)d3); uint16_t r=(uint16_t)((uint32_t)d4%(uint16_t)d3); d4=((uint32_t)r<<16)|q; }
  W(d5) = (uint16_t)d4;
  d4 = (d4 >> 16) | (d4 << 16);
lbC001210:
  WRITE8_POST(a4, READ8(a0 + 0));
  W(d1) = (uint16_t)(W(d1) - W(d4));
  if (!flag_c) goto lbC00121A;
  W(d1) = (uint16_t)(d1 + d3);
lbC00121A:
  W(d0) = (uint16_t)(d0 + d5 + flag_x);
  W(d6) = (uint16_t)(W(d6) - (uint16_t)(1));
  if (!flag_z) goto lbC001210;
lbC001220:
  d0 = 0;
  return;
  /* SetFILTER	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVEA.L	A0,A1 */
  /* LEA	$4A(A6),A5 */
  /* MOVEQ	#$3F,D7 */
  /* lbC001230	MOVE.L	0(A5),D0 */
  /* BEQ.S	lbC001284 */
  /* MOVEA.L	D0,A0 */
  /* CMPA.L	A1,A0 */
  /* BEQ.S	lbC001284 */
  /* LEA	Synttech(PC),A3 */
  /* CMPA.L	0(A0),A3 */
  /* BNE.S	lbC001284 */
  /* TST.L	$1D6(A0) */
  /* BEQ.S	lbC001284 */
  /* LEA	$24(A0),A3 */
  /* LEA	$24(A1),A4 */
  /* MOVEQ	#$1F,D6 */
  /* lbC001256	MOVE.L	(A3)+,D0 */
  /* CMP.L	(A4)+,D0 */
  /* BNE.S	lbC001284 */
  /* DBRA	D6,lbC001256 */
  /* MOVEA.L	A0,A2 */
  /* MOVE.L	$1D6(A1),D0 */
  /* BEQ.S	lbC001274 */
  /* MOVEA.L	D0,A0 */
  /* SUBQ.W	#1,$2000(A0) */
  /* BNE.S	lbC001274 */
  /* BSR.L	RELEASE */
  /* lbC001274	MOVEA.L	$1D6(A2),A0 */
  /* MOVE.L	A0,$1D6(A1) */
  /* ADDQ.W	#1,$2000(A0) */
  /* BRA.L	lbC001322 */
  /* lbC001284	ADDQ.L	#6,A5 */
  /* DBRA	D7,lbC001230 */
  /* MOVE.L	$1D6(A1),D2 */
  /* BEQ.S	lbC00129A */
  /* MOVEA.L	D2,A2 */
  /* CMPI.W	#1,$2000(A2) */
  /* BEQ.S	lbC0012C0 */
  /* lbC00129A	MOVE.L	#$2002,D0 */
  /* MOVE.L	#1,D1 */
  /* BSR.L	ALLOCATE */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC0012C0 */
  /* TST.L	D2 */
  /* BEQ.S	lbC0012B6 */
  /* SUBQ.W	#1,$2000(A2) */
  /* lbC0012B6	MOVE.L	A0,$1D6(A1) */
  /* MOVE.W	#1,$2000(A0) */
  /* lbC0012C0	MOVEA.L	A1,A2 */
  /* MOVE.L	$1D6(A2),D0 */
  /* BEQ.L	lbC001322 */
  /* MOVEA.L	D0,A1 */
  /* LEA	$24(A2),A0 */
  /* LEA	lbW001332(PC),A2 */
  /* CLR.W	D3 */
  /* MOVE.B	$7F(A0),D4 */
  /* EXT.W	D4 */
  /* ASL.W	#7,D4 */
  /* CLR.W	D0 */
  /* lbC0012E0	MOVE.W	(A2)+,D1 */
  /* MOVE.W	#$8000,D2 */
  /* SUB.W	D1,D2 */
  /* MULU.W	#$E666,D2 */
  /* SWAP	D2 */
  /* LSR.W	#1,D1 */
  /* CLR.W	D5 */
  /* lbC0012F2	MOVE.B	0(A0,D5.W),D6 */
  /* EXT.W	D6 */
  /* ASL.W	#7,D6 */
  /* SUB.W	D4,D6 */
  /* MULS.W	D1,D6 */
  /* ASL.L	#2,D6 */
  /* SWAP	D6 */
  /* ADD.W	D6,D3 */
  /* ADD.W	D3,D4 */
  /* ROR.W	#7,D4 */
  /* MOVE.B	D4,(A1)+ */
  /* ROL.W	#7,D4 */
  /* MULS.W	D2,D3 */
  /* ASL.L	#1,D3 */
  /* SWAP	D3 */
  /* ADDQ.W	#1,D5 */
  /* CMPI.W	#$80,D5 */
  /* BCS.S	lbC0012F2 */
  /* ADDQ.W	#1,D0 */
  /* CMPI.W	#$40,D0 */
  /* BNE.S	lbC0012E0 */
  /* lbC001322	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* Synthesis.MSG	dc.b	'Synthesis',0 */
  /* lbW001332	dc.w	$8000 */
  /* dc.w	$7683 */
  /* dc.w	$6DBA */
  /* dc.w	$6597 */
  /* dc.w	$5E10 */
  /* dc.w	$5717 */
  /* dc.w	$50A2 */
  /* dc.w	$4AA8 */
  /* dc.w	$451F */
  /* dc.w	$4000 */
  /* dc.w	$3B41 */
  /* dc.w	$36DD */
  /* dc.w	$32CB */
  /* dc.w	$2F08 */
  /* dc.w	$2B8B */
  /* dc.w	$2851 */
  /* dc.w	$2554 */
  /* dc.w	$228F */
  /* dc.w	$2000 */
  /* dc.w	$1DA0 */
  /* dc.w	$1B6E */
  /* dc.w	$1965 */
  /* dc.w	$1784 */
  /* dc.w	$15C5 */
  /* dc.w	$1428 */
  /* dc.w	$12AA */
  /* dc.w	$1147 */
  /* dc.w	$1000 */
  /* dc.w	$ED0 */
  /* dc.w	$DB7 */
  /* dc.w	$CB2 */
  /* dc.w	$BC2 */
  /* dc.w	$AE2 */
  /* dc.w	$A14 */
  /* dc.w	$955 */
  /* dc.w	$8A3 */
  /* dc.w	$800 */
  /* dc.w	$768 */
  /* dc.w	$6DB */
  /* dc.w	$659 */
  /* dc.w	$5E1 */
  /* dc.w	$571 */
  /* dc.w	$50A */
  /* dc.w	$4AA */
  /* dc.w	$451 */
  /* dc.w	$400 */
  /* dc.w	$3B4 */
  /* dc.w	$36D */
  /* dc.w	$32C */
  /* dc.w	$2F0 */
  /* dc.w	$2B8 */
  /* dc.w	$285 */
  /* dc.w	$255 */
  /* dc.w	$228 */
  /* dc.w	$200 */
  /* dc.w	$1DA */
  /* dc.w	$1B6 */
  /* dc.w	$196 */
  /* dc.w	$178 */
  /* dc.w	$15C */
  /* dc.w	$142 */
  /* dc.w	$12A */
  /* dc.w	$114 */
  /* dc.w	$100 */
SStech:
  /* dc.w	IFFtech-SStech */
  /* dc.w	SampledSound.MSG-SStech */
  /* BRA.L	lbC0013C6 */
  /* BRA.L	lbC001486 */
  goto lbC0014F4;
  goto lbC0014AA;
  /* lbC0013C6	MOVEM.L	D1-D7/A1-A6,-(SP) */
  /* MOVE.L	D0,D2 */
  /* MOVEA.L	A0,A4 */
  /* MOVEQ	#$60,D0 */
  /* MOVE.L	#$10001,D1 */
  /* BSR.L	ALLOCATE */
  /* MOVE.L	A0,D0 */
  /* BEQ.L	lbC001476 */
  /* MOVEA.L	A0,A3 */
  /* MOVE.L	D2,D0 */
  /* MOVEQ	#$60,D1 */
  /* BSR.L	lbC0000FA */
  /* CLR.L	$44(A3) */
  /* CMP.L	D1,D0 */
  /* BNE.L	lbC00147E */
  /* MOVE.L	D2,D0 */
  /* BSR.L	lbC0000D6 */
  /* CLR.L	D2 */
  /* LEA	$24(A3),A0 */
  /* LEA	$4A(A6),A5 */
  /* MOVEQ	#$3F,D7 */
  /* lbC001406	MOVE.L	0(A5),D0 */
  /* BEQ.S	lbC001436 */
  /* MOVEA.L	D0,A1 */
  /* LEA	SStech(PC),A2 */
  /* CMPA.L	0(A1),A2 */
  /* BNE.S	lbC001436 */
  /* LEA	$24(A1),A2 */
  /* MOVE.L	A0,-(SP) */
  /* MOVE.L	A2,-(SP) */
  /* BSR.L	DOCMPSTR */
  /* ADDQ.L	#8,SP */
  /* BNE.S	lbC001436 */
  /* MOVEA.L	$44(A1),A2 */
  /* MOVE.L	A2,$44(A3) */
  /* ADDQ.W	#1,$1E(A2) */
  /* BRA.S	lbC001474 */
  /* lbC001436	ADDQ.L	#6,A5 */
  /* DBRA	D7,lbC001406 */
  /* MOVEA.L	A0,A1 */
  /* MOVEA.L	A4,A0 */
  /* LEA	ss.MSG(PC),A2 */
  /* BSR.L	lbC00006C */
  /* MOVE.L	#3,D0 */
  /* BSR.L	LoadCODE */
  /* MOVE.L	A0,D1 */
  /* BNE.S	lbC00146A */
  /* BSR.L	lbC00006C */
  /* BSR.L	LoadCODE */
  /* MOVE.L	A0,D1 */
  /* BNE.S	lbC00146A */
  /* BSET	#6,$30(A6) */
  /* BRA.S	lbC00147E */
  /* lbC00146A	MOVE.L	A0,$44(A3) */
  /* MOVE.W	#1,$1E(A0) */
  /* lbC001474	MOVEA.L	A3,A0 */
  /* lbC001476	MOVE.L	D2,D0 */
  /* MOVEM.L	(SP)+,D1-D7/A1-A6 */
  /* RTS */
  /* lbC00147E	MOVEA.L	A3,A0 */
  /* BSR.S	lbC001486 */
  /* SUBA.L	A0,A0 */
  /* BRA.S	lbC001476 */
  /* lbC001486	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVEA.L	A0,A1 */
  /* MOVE.L	$44(A1),D0 */
  /* BEQ.S	lbC00149E */
  /* MOVEA.L	D0,A0 */
  /* SUBQ.W	#1,$1E(A0) */
  /* BNE.S	lbC00149E */
  /* BSR.L	RELEASE */
  /* lbC00149E	MOVEA.L	A1,A0 */
  /* BSR.L	RELEASE */
  /* MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
lbC0014AA:
  d0 = 0;
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC0014F2;
  flag_z=(READ16(a1 + 10)==0); flag_n=((int32_t)READ16(a1 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC0014E6;
  WRITE16(a1 + 10, READ16(a1 + 10) - 1);
  if (flag_z) goto lbC0014CE;
  WRITE16(a2 + 4, READ16(a1 + 16));
  WRITE32(a2 + 0, READ32(a1 + 12));
  d0 = READ32(a1 + 12);
  SetAdr();
  W(d0) = (uint16_t)(READ16(a1 + 16));
  SetLen();
  W(d0) = (uint16_t)(READ16(a1 + 18));
  SetPer();
  d0 = (uint32_t)(int32_t)(int8_t)(-1);
  goto lbC0014E6;
lbC0014CE:
  W(d1) = (uint16_t)d7;
  d1 = (uint32_t)((uint16_t)0x14 * (uint16_t)d1);
  W(a3) = (uint16_t)(a3 + d1);
  WRITE16(a2 + 4, READ16(a3 + 4));
  WRITE32(a2 + 0, READ32(a3 + 0));
lbC0014E6:
  WRITE16(a2 + 6, READ16(a1 + 18));
  /* MOVE.W	$14(A1),8(A2) */
  WRITE32_PRE(sp, d0);
  W(d0) = (uint16_t)(READ16(a1 + 20));
  ChangeVolume();
  d0 = READ32_POST(sp);
lbC0014F2:
lbC0014F4:
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_n!=flag_v) goto lbC0014FE;
  d0 = 0;
  return;
lbC0014FE:
  a3 = READ32(a1 + 4);
  a2 = (uint32_t)(a6 + 1124);
  W(d0) = (uint16_t)d7;
  d0 = (uint32_t)((uint16_t)0x14 * (uint16_t)d0);
  W(a2) = (uint16_t)(a2 + d0);
  B(d0) = (uint8_t)(READ8(a1 + 0));
  if (flag_z) goto lbC00161C;
  { int32_t _cmp=(int32_t)d0-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)1); }
  if (!flag_z) goto lbC001600;
  a5 = READ32(a3 + 68);
  d1 = 0;
  B(d1) = (uint8_t)(READ8(a1 + 3));
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)12); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)12); d1=((uint32_t)r<<16)|q; }
  W(d2) = (uint16_t)d1;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(10));
  W(d2) = (uint16_t)(-(int16_t)W(d2));
  { int32_t _cmp=(int32_t)d2-(int32_t)READ8(a5 + 5); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)READ8(a5 + 5)); }
  if (flag_z||(flag_n!=flag_v)) goto lbC00154E;
lbC00153C:
  WRITE8(a1 + 0, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC00170E;
  goto lbC00161C;
lbC00154E:
  { int32_t _cmp=(int32_t)d2-(int32_t)READ8(a5 + 4); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)READ8(a5 + 4)); }
  if (flag_n!=flag_v) goto lbC00153C;
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (!flag_z) goto lbC001560;
  WRITE32(a2 + 10, 0);
lbC001560:
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)1); }
  if (flag_z) goto lbC00156C;
  WRITE16(a2 + 8, 0);
lbC00156C:
  W(d1) = (uint16_t)(d1 << 1);
  a0 = (uint32_t)(uintptr_t)&lbW000C94;
  W(d0) = (uint16_t)(0xD5C8);
  d0 = (uint32_t)((uint16_t)READ16(a0 + 0) * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(15);
  d0 >>= d1;
  WRITE16(a2 + 6, d0);
  d0 = (uint32_t)(int32_t)(int8_t)(1);
  d0 = d0 << d2;
  d4 = d0;
  d1 = (uint32_t)(int32_t)(int8_t)(1);
  W(d3) = (uint16_t)(0);
  B(d3) = (uint8_t)(READ8(a5 + 4));
  d1 = d1 << d3;
  d0 -= d1;
  d0 = (uint32_t)((uint16_t)READ16(a5 + 0) * (uint16_t)d0);
  a0 = (uint32_t)(a5 + 62);
  WRITE32(a1 + 12, a0);
  W(d0) = (uint16_t)(READ16(a5 + 0));
  d0 = (uint32_t)((uint16_t)d4 * (uint16_t)d0);
  d0 >>= 1;
  WRITE16(a1 + 16, d0);
  a0 = READ32(a6 + 666);
  W(a0) = (uint16_t)(a0 + 0x400);
  d0 = (uint32_t)(int32_t)(int8_t)(4);
  W(d1) = (uint16_t)(READ16(a5 + 2));
  { int32_t _cmp=(int32_t)d1-(int32_t)READ16(a5 + 0); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d1<(uint32_t)READ16(a5 + 0)); }
  if (flag_z) goto lbC0015D4;
  d1 = (uint32_t)((uint16_t)d4 * (uint16_t)d1);
  a0 = READ32(a1 + 12);
  a0 += d1;
  W(d0) = (uint16_t)(READ16(a5 + 0));
  W(d0) = (uint16_t)(W(d0) - READ16(a5 + 2));
  d0 = (uint32_t)((uint16_t)d4 * (uint16_t)d0);
  d0 >>= 1;
lbC0015D4:
  WRITE32(a2 + 0, a0);
  WRITE16(a2 + 4, d0);
  WRITE16(a2 + 14, 0);
  W(d0) = (uint16_t)(READ16(a3 + 94));
  d0 = (d0 >> 16) | (d0 << 16);
  W(d0) = (uint16_t)(0);
  d0 >>= 1;
  { uint16_t q=(uint16_t)((uint32_t)d0/(uint16_t)READ16(a6 + 54)); uint16_t r=(uint16_t)((uint32_t)d0%(uint16_t)READ16(a6 + 54)); d0=((uint32_t)r<<16)|q; }
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  WRITE16(a2 + 16, d0);
  WRITE16(a1 + 10, 2);
  lbC000A60();
  goto lbC00161C;
lbC001600:
  { int32_t _cmp=(int32_t)d0-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)2); }
  if (!flag_z) goto lbC00160E;
  WRITE16(a2 + 8, 6);
  goto lbC00161C;
lbC00160E:
  { int32_t _cmp=(int32_t)d0-(int32_t)3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)3); }
  if (!flag_z) goto lbC00161C;
  lbC000A60();
  goto lbC00170E;
lbC00161C:
  flag_z=(READ16(a2 + 16)==0); flag_n=((int32_t)READ16(a2 + 16)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC00162A;
  WRITE16(a2 + 16, READ16(a2 + 16) - 1);
  goto lbC001644;
lbC00162A:
  W(d0) = (uint16_t)(READ16(a2 + 14));
  W(d1) = (uint16_t)(READ16(a3 + 92));
  d1 = (uint32_t)((uint16_t)READ16(a6 + 54) * (uint16_t)d1);
  d1 = d1 << 7;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)(d1 + 0x40);
  W(d0) = (uint16_t)(d0 + d1);
  WRITE16(a2 + 14, d0);
lbC001644:
  W(d0) = (uint16_t)(READ16(a2 + 14));
  W(d0) = (uint16_t)((uint32_t)(d0) >> 7);
  W(d0) = (uint16_t)(d0 + 0x80);
  flag_z = ((d0 & (1u << (8 & 31))) == 0);
  if (flag_z) goto lbC001658;
  W(d0) ^= (uint16_t)(0xFF);
lbC001658:
  W(d0) ^= (uint16_t)(0x80);
  d0 = (uint32_t)(int32_t)(int16_t)(int8_t)d0;
  W(d0) = (uint16_t)(-(int16_t)W(d0));
  WRITE16(a2 + 18, d0);
  W(d0) = (uint16_t)(READ16(a2 + 8));
  a0 = (uint32_t)(a3 + 0);
  d1 = 0;
  W(d1) = (uint16_t)(READ16(a0 + 74));
  d1 = (d1 >> 16) | (d1 << 16);
  d2 = READ32(a2 + 10);
  d3 = 0;
  W(d3) = (uint16_t)(READ16(a0 + 82));
  W(d0) = (uint16_t)d3;
  W(d0) = (uint16_t)((uint32_t)(d0) >> 5);
  W(d0) ^= (uint16_t)(7);
  W(d3) &= (uint16_t)(0x1F);
  W(d3) = (uint16_t)(d3 + 0x21);
  d3 = (uint32_t)((uint16_t)READ16(a6 + 54) * (uint16_t)d3);
  d3 = d3 << 3;
  d3 >>= d0;
  d0 = d1;
  d0 -= d2;
  if (!flag_n) goto lbC00169E;
  d0 = (uint32_t)(-(int32_t)d0);
lbC00169E:
  { int32_t _cmp=(int32_t)d0-(int32_t)d3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)d3); }
  if (!flag_z && (flag_n==flag_v)) goto lbC0016B4;
  d2 = d1;
  { int32_t _cmp=(int32_t)READ16(a2 + 8)-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a2 + 8)<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC0016BE;
  WRITE16(a2 + 8, READ16(a2 + 8) + 2);
  goto lbC0016BE;
lbC0016B4:
  { int32_t _cmp=(int32_t)d2-(int32_t)d1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)d1); }
  if (flag_n!=flag_v) goto lbC0016BC;
  d2 -= d3;
  goto lbC0016BE;
lbC0016BC:
  d2 += d3;
lbC0016BE:
  WRITE32(a2 + 10, d2);
  W(d0) = (uint16_t)(READ16(a2 + 6));
  W(d1) = (uint16_t)(READ16(a2 + 18));
  W(d2) = (uint16_t)(READ16(a3 + 90));
  d1 = (uint32_t)((int32_t)(int16_t)d2 * (int32_t)(int16_t)d1);
  W(d1) = (uint16_t)((uint32_t)((int32_t)d1 >> 7));
  W(d2) = (uint16_t)(READ16(a6 + 4));
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(0x80));
  W(d1) = (uint16_t)(W(d1) - W(d2));
  W(d1) = (uint16_t)(d1 + 0x1000);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(0x13);
  d0 >>= d1;
  WRITE16(a1 + 18, d0);
  W(d0) = (uint16_t)(READ16(a6 + 0));
  W(d0) = (uint16_t)(d0 + 1);
  d0 = (uint32_t)((uint16_t)READ16(a1 + 8) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  W(d0) = (uint16_t)(d0 + 1);
  d0 = (uint32_t)((uint16_t)READ16(a3 + 72) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  d1 = READ32(a2 + 10);
  d1 = (d1 >> 16) | (d1 << 16);
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(10);
  W(d0) = (uint16_t)((uint32_t)(d0) >> d1);
  WRITE16(a1 + 20, d0);
lbC00170E:
  d0 = 0;
  { int32_t _cmp=(int32_t)READ16(a1 + 10)-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a1 + 10)<(uint32_t)2); }
  if (!flag_z) goto lbC00171A;
  d0 = (uint32_t)(int32_t)(int8_t)(-1);
lbC00171A:
  /* SampledSound.MSG	dc.b	'SampledSound',0 */
  /* ss.MSG	dc.b	'.ss',0,0 */
IFFtech:
  /* dc.w	IFFtech-IFFtech */
  /* dc.w	FORM.MSG-IFFtech */
  /* BRA.L	lbC001742 */
  /* BRA.L	lbC001898 */
  goto lbC001900;
  goto lbC0018B2;
  /* lbC001742	MOVEM.L	D0-D7/A1-A6,-(SP) */
  /* LEA	$32A(A6),A5 */
  /* MOVEQ	#$20,D5 */
  /* MOVE.L	D0,D2 */
  /* MOVEA.L	SP,A4 */
  /* MOVEQ	#$3E,D0 */
  /* MOVE.L	#$10001,D1 */
  /* BSR.L	ALLOCATE */
  /* MOVE.L	A0,D0 */
  /* BEQ.L	lbC001848 */
  /* MOVEA.L	A0,A3 */
  /* BSR.L	lbC00185A */
  /* CMPI.L	#'FORM',D0 */
  /* BNE.L	lbC00184E */
  /* BSR.L	lbC00185A */
  /* MOVE.L	D0,D7 */
  /* BSR.L	lbC00185A */
  /* CMPI.L	#'8SVX',D0 */
  /* BNE.L	lbC00184E */
  /* SUBQ.L	#4,D7 */
  /* lbC001788	TST.L	D7 */
  /* BLE.L	lbC001808 */
  /* BSR.L	lbC00185A */
  /* MOVE.L	D0,D1 */
  /* BSR.L	lbC00185A */
  /* MOVE.L	D0,D6 */
  /* SUBQ.L	#8,D7 */
  /* CMPI.L	#'VHDR',D1 */
  /* BEQ.L	lbC0017BE */
  /* CMPI.L	#'BODY',D1 */
  /* BEQ.L	lbC0017D6 */
  /* lbC0017B0	TST.L	D6 */
  /* BLE.S	lbC001788 */
  /* BSR.L	lbC001866 */
  /* SUBQ.L	#2,D6 */
  /* SUBQ.L	#2,D7 */
  /* BRA.S	lbC0017B0 */
  /* lbC0017BE	LEA	$24(A3),A0 */
  /* MOVEQ	#$14,D0 */
  /* BSR.L	lbC001872 */
  /* TST.B	15(A0) */
  /* BNE.L	lbC00184E */
  /* SUB.L	D0,D6 */
  /* SUB.L	D0,D7 */
  /* BRA.S	lbC0017B0 */
  /* lbC0017D6	TST.L	$3A(A3) */
  /* BNE.L	lbC00184E */
  /* TST.B	$32(A3) */
  /* BEQ.L	lbC00184E */
  /* MOVE.L	D6,D0 */
  /* ADDQ.L	#1,D0 */
  /* ANDI.W	#$FFFE,D0 */
  /* MOVE.L	#3,D1 */
  /* BSR.L	ALLOCATE */
  /* MOVE.L	A0,$3A(A3) */
  /* BEQ.L	lbC00184E */
  /* BSR.L	lbC001872 */
  /* SUB.L	D0,D7 */
  /* BRA.S	lbC001788 */
  /* lbC001808	TST.L	$3A(A3) */
  /* BEQ.L	lbC00184E */
  /* LEA	$24(A3),A0 */
  /* MOVE.L	(A0)+,D2 */
  /* MOVE.L	(A0)+,D3 */
  /* MOVE.L	(A0)+,D4 */
  /* CLR.W	D1 */
  /* lbC00181C	LSR.L	#1,D2 */
  /* LSR.L	#1,D3 */
  /* LSR.L	#1,D4 */
  /* ADDQ.W	#1,D1 */
  /* MOVE.L	D2,D0 */
  /* OR.L	D3,D0 */
  /* BTST	#0,D0 */
  /* BNE.S	lbC001842 */
  /* CMPI.L	#1,D4 */
  /* BEQ.S	lbC001842 */
  /* MOVE.B	D1,D0 */
  /* ADD.B	$32(A3),D0 */
  /* CMPI.B	#8,D0 */
  /* BLT.S	lbC00181C */
  /* lbC001842	MOVE.W	D1,$38(A3) */
  /* MOVEA.L	A3,A0 */
  /* lbC001848	MOVEM.L	(SP)+,D0-D7/A1-A6 */
  /* RTS */
  /* lbC00184E	MOVEA.L	A4,SP */
  /* MOVEA.L	A3,A0 */
  /* BSR.L	lbC001898 */
  /* SUBA.L	A0,A0 */
  /* BRA.S	lbC001848 */
  /* lbC00185A	SUBQ.L	#4,SP */
  /* MOVEA.L	SP,A0 */
  /* MOVEQ	#4,D0 */
  /* BSR.S	lbC001872 */
  /* MOVE.L	(SP)+,D0 */
  /* RTS */
  /* lbC001866	SUBQ.L	#2,SP */
  /* MOVEA.L	SP,A0 */
  /* MOVEQ	#2,D0 */
  /* BSR.S	lbC001872 */
  /* MOVE.W	(SP)+,D0 */
  /* RTS */
  /* lbC001872	MOVEM.L	D0/D1/A0,-(SP) */
  /* lbC001876	TST.L	D0 */
  /* BEQ.S	lbC001892 */
  /* TST.W	D5 */
  /* BEQ.S	lbC001886 */
  /* MOVE.W	(A5)+,(A0)+ */
  /* SUBQ.W	#2,D5 */
  /* SUBQ.L	#2,D0 */
  /* BRA.S	lbC001876 */
  /* lbC001886	MOVE.L	D0,D1 */
  /* MOVE.L	D2,D0 */
  /* BSR.L	lbC0000FA */
  /* CMP.L	D1,D0 */
  /* BNE.S	lbC00184E */
  /* lbC001892	MOVEM.L	(SP)+,D0/D1/A0 */
  /* RTS */
  /* lbC001898	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVEA.L	A0,A1 */
  /* MOVEA.L	$3A(A1),A0 */
  /* BSR.L	RELEASE */
  /* MOVEA.L	A1,A0 */
  /* BSR.L	RELEASE */
  /* MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
lbC0018B2:
  d0 = 0;
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_n==flag_v) goto lbC0018FE;
  flag_z=(READ16(a1 + 10)==0); flag_n=((int32_t)READ16(a1 + 10)<0); flag_c=0; flag_v=0;
  if (flag_z) goto lbC0018F2;
  WRITE16(a1 + 10, READ16(a1 + 10) - 1);
  if (flag_z) goto lbC0018DA;
  WRITE16(a2 + 4, READ16(a1 + 16));
  WRITE32(a2 + 0, READ32(a1 + 12));
  d0 = READ32(a1 + 12);
  SetAdr();
  W(d0) = (uint16_t)(READ16(a1 + 16));
  SetLen();
  W(d0) = (uint16_t)(READ16(a1 + 18));
  SetPer();
  d0 = (uint32_t)(int32_t)(int8_t)(-1);
  goto lbC0018F2;
lbC0018DA:
  W(d1) = (uint16_t)d7;
  d1 = (uint32_t)((uint16_t)10 * (uint16_t)d1);
  W(a3) = (uint16_t)(a3 + d1);
  WRITE16(a2 + 4, READ16(a3 + 4));
  WRITE32(a2 + 0, READ32(a3 + 0));
lbC0018F2:
  WRITE16(a2 + 6, READ16(a1 + 18));
  /* MOVE.W	$14(A1),8(A2) */
  WRITE32_PRE(sp, d0);
  W(d0) = (uint16_t)(READ16(a1 + 20));
  ChangeVolume();
  d0 = READ32_POST(sp);
lbC0018FE:
lbC001900:
  { int32_t _cmp=(int32_t)d7-(int32_t)4; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d7<(uint32_t)4); }
  if (flag_n!=flag_v) goto lbC00190A;
  d0 = 0;
  return;
lbC00190A:
  a3 = READ32(a1 + 4);
  a2 = (uint32_t)(a6 + 1204);
  W(d0) = (uint16_t)d7;
  d0 = (uint32_t)((uint16_t)10 * (uint16_t)d0);
  W(a2) = (uint16_t)(a2 + d0);
  B(d0) = (uint8_t)(READ8(a1 + 0));
  if (flag_z) goto lbC0019E6;
  { int32_t _cmp=(int32_t)d0-(int32_t)1; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)1); }
  if (!flag_z) goto lbC0019CC;
  a5 = READ32(a3 + 58);
  d1 = 0;
  B(d1) = (uint8_t)(READ8(a1 + 3));
  { uint16_t q=(uint16_t)((uint32_t)d1/(uint16_t)12); uint16_t r=(uint16_t)((uint32_t)d1%(uint16_t)12); d1=((uint32_t)r<<16)|q; }
  W(d2) = (uint16_t)d1;
  d1 = (d1 >> 16) | (d1 << 16);
  W(d1) = (uint16_t)(d1 << 1);
  a0 = (uint32_t)(uintptr_t)&lbW000C94;
  W(d0) = (uint16_t)(0xD5C8);
  d0 = (uint32_t)((uint16_t)READ16(a0 + 0) * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(15);
  d0 >>= d1;
  WRITE16(a2 + 6, d0);
  W(d2) = (uint16_t)(W(d2) - (uint16_t)(10));
  W(d2) = (uint16_t)(-(int16_t)W(d2));
  W(d2) = (uint16_t)(W(d2) - READ16(a3 + 56));
  if (!flag_n) goto lbC001970;
lbC00195E:
  WRITE8(a1 + 0, 0);
  { int32_t _cmp=(int32_t)READ8(a1 + 1)-(int32_t)0; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ8(a1 + 1)<(uint32_t)0); }
  if (flag_z) goto lbC001A1C;
  goto lbC0019E6;
lbC001970:
  { int32_t _cmp=(int32_t)d2-(int32_t)READ8(a3 + 50); flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d2<(uint32_t)READ8(a3 + 50)); }
  if (flag_n==flag_v) goto lbC00195E;
  d4 = READ32(a3 + 36);
  d5 = READ32(a3 + 40);
  d0 = d4;
  d0 += d5;
  d1 = d0;
  d1 = d1 << d2;
  d1 -= d0;
  a0 = (uint32_t)(a5 + 0);
  d4 = d4 << d2;
  d5 = d5 << d2;
  W(d0) = (uint16_t)d4;
  if (!flag_z) goto lbC001996;
  W(d0) = (uint16_t)d5;
lbC001996:
  WRITE32(a1 + 12, a0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  WRITE16(a1 + 16, d0);
  W(a0) = (uint16_t)(a0 + d4);
  W(d0) = (uint16_t)d5;
  if (!flag_z) goto lbC0019B0;
  a0 = READ32(a6 + 666);
  W(a0) = (uint16_t)(a0 + 0x400);
  d0 = (uint32_t)(int32_t)(int8_t)(8);
lbC0019B0:
  WRITE32(a2 + 0, a0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 1);
  WRITE16(a2 + 4, d0);
  WRITE16(a1 + 10, 2);
  lbC000A60();
  WRITE16(a2 + 8, 1);
  goto lbC0019E6;
lbC0019CC:
  { int32_t _cmp=(int32_t)d0-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)2); }
  if (!flag_z) goto lbC0019D8;
  WRITE16(a2 + 8, 0);
  goto lbC0019E6;
lbC0019D8:
  { int32_t _cmp=(int32_t)d0-(int32_t)3; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)d0<(uint32_t)3); }
  if (!flag_z) goto lbC0019E6;
  lbC000A60();
  goto lbC001A1C;
lbC0019E6:
  W(d0) = (uint16_t)(0x1080);
  W(d0) = (uint16_t)(W(d0) - READ16(a6 + 4));
  d0 = (uint32_t)((uint16_t)READ16(a2 + 6) * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(0x13);
  d0 >>= d1;
  WRITE16(a1 + 18, d0);
  W(d0) = (uint16_t)(READ16(a6 + 0));
  W(d0) = (uint16_t)(d0 + 1);
  d0 = (uint32_t)((uint16_t)READ16(a1 + 8) * (uint16_t)d0);
  W(d0) = (uint16_t)((uint32_t)(d0) >> 8);
  W(d0) = (uint16_t)(d0 + 1);
  d1 = READ32(a3 + 52);
  d1 >>= 1;
  d0 = (uint32_t)((uint16_t)d1 * (uint16_t)d0);
  d1 = (uint32_t)(int32_t)(int8_t)(0x11);
  d0 >>= d1;
  d0 = (uint32_t)((uint16_t)READ16(a2 + 8) * (uint16_t)d0);
  WRITE16(a1 + 20, d0);
lbC001A1C:
  d0 = 0;
  { int32_t _cmp=(int32_t)READ16(a1 + 10)-(int32_t)2; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)READ16(a1 + 10)<(uint32_t)2); }
  if (!flag_z) goto lbC001A28;
  d0 = (uint32_t)(int32_t)(int8_t)(-1);
  /* FORM.MSG	dc.b	'FORM',0,0 */
  /* dc.b	$9D */
  /* dc.b	$FA */
  /* dc.b	$F5 */
  /* dc.b	1 */
  /* dc.b	10 */
  /* dc.b	2 */
  /* dc.b	$F5 */
  /* dc.b	13 */
  /* dc.b	$F7 */
  /* dc.b	$F5 */
  /* dc.b	'&SSonix Music Driver (C) Copyright 1987-90 M' */
  /* dc.b	'ark Riley, All Rights Reserved.',0 */
  /* dc.b	'Version 2.0f - January 14, 1990',0 */
  /* InitSONIX	MOVEM.L	D1-D7/A0-A6,-(SP) */
  /* SUBA.L	A6,A6 */
  /* MOVE.L	#$4DC,D0 */
  /* MOVE.L	#$10001,D1 */
  /* BSR.L	ALLOCATE */
  /* MOVEA.L	A0,A6 */
  /* MOVE.L	A6,D0 */
  /* BEQ.L	lbC001C26 */
  /* MOVE.L	#$1000,$28(A6) */
  /* MOVE.L	#$408,D0 */
  /* MOVE.L	#$10003,D1 */
  /* BSR.L	ALLOCATE */
  /* MOVE.L	A0,$29A(A6) */
  /* BEQ.L	lbC001C2E */
  /* LEA	doslibrary.MSG(PC),A1 */
  /* MOVEQ	#0,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$228(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	D0,$3EC(A6) */
  /* BEQ.L	lbC001C2E */
  /* LEA	$3B0(A6),A2 */
  /* MOVE.B	#4,8(A2) */
  /* MOVE.B	#0,14(A2) */
  /* MOVEQ	#-1,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$14A(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.B	D0,15(A2) */
  /* SUBA.L	A1,A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$126(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	D0,$10(A2) */
  /* LEA	$14(A2),A0 */
  /* MOVE.L	A0,0(A0) */
  /* ADDQ.L	#4,0(A0) */
  /* CLR.L	4(A0) */
  /* MOVE.L	A0,8(A0) */
  /* LEA	$36C(A6),A1 */
  /* MOVE.B	#5,8(A1) */
  /* MOVE.L	A2,14(A1) */
  /* LEA	lbW001E9C(PC),A0 */
  /* MOVE.L	A0,$22(A1) */
  /* MOVEQ	#1,D0 */
  /* MOVE.L	D0,$26(A1) */
  /* MOVE.B	#$7F,9(A1) */
  /* LEA	audiodevice.MSG(PC),A0 */
  /* MOVEQ	#0,D0 */
  /* MOVEQ	#0,D1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$1BC(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* TST.L	D0 */
  /* BNE.L	lbC001C2E */
  /* LEA	ciabresource.MSG(PC),A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$1F2(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	D0,$3E8(A6) */
  /* BEQ.L	lbC001C2E */
  /* LEA	$3D2(A6),A2 */
  /* LEA	$BFD400,A3 */
  /* LEA	$BFDE00,A4 */
  /* MOVEQ	#0,D7 */
  /* lbC001BAC	LEA	lbC0007D2(PC),A0 */
  /* MOVE.L	A0,$12(A2) */
  /* MOVE.L	A6,14(A2) */
  /* MOVEA.L	A2,A1 */
  /* MOVE.L	D7,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	$3E8(A6),A6 */
  /* JSR	-6(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* TST.L	D0 */
  /* BEQ.S	lbC001BE6 */
  /* CLR.L	$12(A2) */
  /* TST.L	D7 */
  /* BNE.L	lbC001C2E */
  /* LEA	$BFD600,A3 */
  /* LEA	$BFDF00,A4 */
  /* MOVEQ	#1,D7 */
  /* BRA.S	lbC001BAC */
  /* lbC001BE6	MOVE.L	A3,$3F0(A6) */
  /* MOVE.L	A4,$3F4(A6) */
  /* MOVE.L	D7,$3F8(A6) */
  /* MOVE.W	#$3F,$1CA(A6) */
  /* MOVE.W	#$FF,0(A6) */
  /* MOVE.W	#$80,4(A6) */
  /* MOVE.W	#$80,D0 */
  /* MOVE.W	D0,2(A6) */
  /* BSR.L	lbC0007F2 */
  /* MOVE.L	$3F8(A6),D0 */
  /* ADDQ.B	#1,D0 */
  /* ORI.B	#$80,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	$3E8(A6),A6 */
  /* JSR	-$12(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC001C26	MOVE.L	A6,D0 */
  /* MOVEM.L	(SP)+,D1-D7/A0-A6 */
  /* RTS */
  /* lbC001C2E	BSR.S	lbC001C50 */
  /* SUBA.L	A6,A6 */
  /* BRA.S	lbC001C26 */
  /* QuitSONIX	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	A6,D0 */
  /* BEQ.S	lbC001C4A */
  /* BSR.L	StopSOUND */
  /* BSR.L	PurgeSCORES */
  /* BSR.L	PurgeINSTRUMENTS */
  /* BSR.S	lbC001C50 */
  /* lbC001C4A	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* lbC001C50	MOVEM.L	D0-D7/A0-A6,-(SP) */
  /* MOVE.L	A6,D0 */
  /* BEQ.L	lbC001CFC */
  /* TST.L	$3E8(A6) */
  /* BEQ.S	lbC001C94 */
  /* LEA	$3D2(A6),A2 */
  /* TST.L	$12(A2) */
  /* BEQ.S	lbC001C94 */
  /* MOVE.L	$3F8(A6),D0 */
  /* ADDQ.L	#1,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	$3E8(A6),A6 */
  /* JSR	-$12(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVEA.L	$3F4(A6),A0 */
  /* CLR.B	(A0) */
  /* MOVE.L	$3F8(A6),D0 */
  /* MOVEA.L	A2,A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	$3E8(A6),A6 */
  /* JSR	-12(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC001C94	LEA	$36C(A6),A2 */
  /* SUBA.L	A1,A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$126(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	D0,$10(A2) */
  /* MOVE.L	$14(A2),D0 */
  /* BEQ.S	lbC001CC2 */
  /* ADDQ.L	#1,D0 */
  /* BEQ.S	lbC001CC2 */
  /* MOVEA.L	A2,A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$1C2(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC001CC2	LEA	$3B0(A6),A2 */
  /* CLR.L	D0 */
  /* MOVE.B	15(A2),D0 */
  /* BEQ.S	lbC001CDA */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$150(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC001CDA	MOVE.L	$3EC(A6),D0 */
  /* BEQ.S	lbC001CEE */
  /* MOVEA.L	D0,A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$19E(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC001CEE	MOVEA.L	$29A(A6),A0 */
  /* BSR.L	RELEASE */
  /* MOVEA.L	A6,A0 */
  /* BSR.L	RELEASE */
  /* lbC001CFC	MOVEM.L	(SP)+,D0-D7/A0-A6 */
  /* RTS */
  /* SonixWAIT	MOVEM.L	D1/D2/A0/A1,-(SP) */
  /* MOVE.L	D1,-(SP) */
  /* MOVE.L	D0,-(SP) */
  /* MOVEQ	#-1,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$14A(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	D0,D2 */
  /* MOVE.L	(SP)+,D0 */
  /* CLR.L	D1 */
  /* BSET	D2,D1 */
  /* BSR.S	SonixSIGNAL */
  /* MOVE.L	D1,D0 */
  /* OR.L	(SP),D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$13E(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* AND.L	(SP)+,D0 */
  /* MOVE.L	D0,-(SP) */
  /* CLR.L	D1 */
  /* BSR.S	SonixSIGNAL */
  /* MOVE.L	D2,D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$150(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	(SP)+,D0 */
  /* MOVEM.L	(SP)+,D1/D2/A0/A1 */
  /* RTS */
  /* SonixSIGNAL	MOVEM.L	D0-D2/A0/A1,-(SP) */
  /* CLR.L	$360(A6) */
  /* MOVE.L	D1,D2 */
  /* BEQ.S	lbC001D76 */
  /* MOVE.L	D0,$364(A6) */
  /* SUBA.L	A1,A1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$126(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* MOVE.L	D0,$35C(A6) */
  /* MOVE.L	D2,$360(A6) */
  /* lbC001D76	MOVEM.L	(SP)+,D0-D2/A0/A1 */
  /* RTS */
  /* DOCMPSTR	MOVEM.L	D0/D1/A0/A1,-(SP) */
  /* MOVEA.L	$18(SP),A0 */
  /* MOVEA.L	$14(SP),A1 */
  /* lbC001D88	MOVE.B	(A0)+,D0 */
  /* CMPI.B	#$61,D0 */
  /* BCS.S	lbC001D9A */
  /* CMPI.B	#$7B,D0 */
  /* BCC.S	lbC001D9A */
  /* ANDI.B	#$DF,D0 */
  /* lbC001D9A	MOVE.B	(A1)+,D1 */
  /* CMPI.B	#$61,D1 */
  /* BCS.S	lbC001DAC */
  /* CMPI.B	#$7B,D1 */
  /* BCC.S	lbC001DAC */
  /* ANDI.B	#$DF,D1 */
  /* lbC001DAC	CMP.B	D0,D1 */
  /* BNE.S	lbC001DB4 */
  /* TST.B	D0 */
  /* BNE.S	lbC001D88 */
  /* lbC001DB4	MOVEM.L	(SP)+,D0/D1/A0/A1 */
  /* RTS */
  /* SonixALLOCATE	MOVE.L	A0,-(SP) */
  /* BSR.S	ALLOCATE */
  /* MOVE.L	A0,D0 */
  /* MOVEA.L	(SP)+,A0 */
  /* RTS */
  /* ALLOCATE	MOVEM.L	D0-D3/A1/A6,-(SP) */
  /* ADDQ.L	#4,D0 */
  /* MOVE.L	D0,D2 */
  /* MOVE.L	AllocatePATCH(PC),D3 */
  /* BNE.S	lbC001E0E */
  /* MOVE.L	D1,D3 */
  /* MOVE.L	A6,D1 */
  /* BEQ.S	lbC001DF0 */
  /* MOVEQ	#1,D1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$D8(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* SUB.L	D2,D0 */
  /* SUBA.L	A0,A0 */
  /* SUB.L	$28(A6),D0 */
  /* BMI.S	lbC001E08 */
  /* lbC001DF0	MOVE.L	D2,D0 */
  /* MOVE.L	D3,D1 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$C6(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC001E00	MOVEA.L	D0,A0 */
  /* TST.L	D0 */
  /* BEQ.S	lbC001E08 */
  /* MOVE.L	D2,(A0)+ */
  /* lbC001E08	MOVEM.L	(SP)+,D0-D3/A1/A6 */
  /* RTS */
  /* lbC001E0E	MOVEA.L	D3,A0 */
  /* JSR	(A0) */
  /* BRA.S	lbC001E00 */
  /* RELEASE	MOVEM.L	D0/D1/A0/A1,-(SP) */
  /* MOVE.L	A0,D0 */
  /* BEQ.S	lbC001E34 */
  /* SUBQ.L	#4,A0 */
  /* MOVE.L	ReleasePATCH(PC),D1 */
  /* BNE.S	lbC001E3A */
  /* MOVEA.L	A0,A1 */
  /* MOVE.L	(A1),D0 */
  /* MOVE.L	A6,-(SP) */
  /* MOVEA.L	4,A6 */
  /* JSR	-$D2(A6) */
  /* MOVEA.L	(SP)+,A6 */
  /* lbC001E34	MOVEM.L	(SP)+,D0/D1/A0/A1 */
  /* RTS */
  /* lbC001E3A	MOVEA.L	D1,A1 */
  /* JSR	(A1) */
  /* BRA.S	lbC001E34 */
  /* SonixLOAD	MOVE.L	A0,-(SP) */
  /* BSR.S	LoadCODE */
  /* MOVE.L	A0,D0 */
  /* MOVEA.L	(SP)+,A0 */
  /* RTS */
  /* LoadCODE	MOVEM.L	D0-D7/A1-A6,-(SP) */
  /* MOVE.L	D0,D4 */
  /* CLR.L	D6 */
  /* MOVE.L	#$3ED,D0 */
  /* BSR.L	lbC0000B0 */
  /* MOVE.L	D0,D7 */
  /* BEQ.S	lbC001E94 */
  /* MOVE.L	D7,D1 */
  /* MOVEQ	#0,D2 */
  /* MOVEQ	#1,D3 */
  /* BSR.L	lbC000122 */
  /* MOVEQ	#-1,D3 */
  /* BSR.L	lbC000122 */
  /* TST.L	D0 */
  /* BMI.S	lbC001E8E */
  /* MOVE.L	D4,D1 */
  /* BSR.L	ALLOCATE */
  /* MOVE.L	A0,D6 */
  /* BEQ.S	lbC001E8E */
  /* MOVE.L	D0,D1 */
  /* MOVE.L	D7,D0 */
  /* BSR.L	lbC0000FA */
  /* CMP.L	D1,D0 */
  /* BEQ.S	lbC001E8E */
  /* BSR.S	RELEASE */
  /* CLR.L	D6 */
  /* lbC001E8E	MOVE.L	D7,D0 */
  /* BSR.L	lbC0000D6 */
  /* lbC001E94	MOVEA.L	D6,A0 */
  /* MOVEM.L	(SP)+,D0-D7/A1-A6 */
  /* RTS */
  /* lbW001E9C	dc.w	$F0F */
  /* doslibrary.MSG	dc.b	'dos.library',0 */
  /* audiodevice.MSG	dc.b	'audio.device',0 */
  /* ciabresource.MSG	dc.b	'ciab.resource',0,0 */
}

/* SECTION Buffy */
static const uint8_t Buffer[] = { 0x538 };
static const uint8_t Buffer2[] = { 0x84 };

/* SECTION Hips */
static const uint8_t Chip[] = { 0x400 };
static const uint8_t Empty[] = { 0x8 };

/* TRANSPILER WARNINGS:
 * Line 1088: Custom chip write $DFF006 — emitted as no-op
 * Line 1089: Custom chip write $DFF006 — emitted as no-op
 * Line 1170: Custom chip write $DFF000 — emitted as no-op
 */