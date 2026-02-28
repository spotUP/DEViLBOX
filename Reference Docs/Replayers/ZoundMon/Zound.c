#include <exec/types.h>
#include <libraries/dos.h>

#define MEMF_CHIP (1L<<1)
#define VOICES          4
#define PARTLEN        32
#define TABLEN        256
#define NOPARTS       256

static ULONG ZMemsize[16];
static UBYTE SN;
static UBYTE MaxPart,MaxTable;

static WORD Periods[]=
{ 0x0000,0x0358,0x0328,0x02fa,0x02d0,0x02a6,0x0280,0x025c,
  0x023a,0x021a,0x01fc,0x01e0,0x01c5,0x01ac,0x0194,0x017d,
  0x0168,0x0153,0x0140,0x012e,0x011d,0x010d,0x00fe,0x00f0,
  0x00e2,0x00d6,0x00ca,0x00be,0x00b4,0x00aa,0x00a0,0x0097,
  0x008f,0x0087,0x007f,0x0078,0x0071
};

static UBYTE count,partvec,tabvec,tablen=2,speed=6,StartTab,EndTab,loadstart,loadend;
static struct TabData {UBYTE partno,volume,instradd,noteadd;} Table[TABLEN][VOICES];
static struct SampleData {ULONG start;UBYTE name[40];UBYTE vol;UWORD length,replen,restart;UBYTE preset;}
              Sample[16];
static ULONG Parts[NOPARTS][PARTLEN];
static WORD dmaconhulp;

#include "Player.c"

PlayZound(start,end)register UBYTE start,end;
{ if(start||end){StartTab=start;EndTab=end;}
  else{StartTab=loadstart;EndTab=loadend;}
  SetUpInterrupt();
}

QuitZound()
{ register int i;
  for(i=0;i<16;i++)if(Sample[i].start)FreeMem(Sample[i].start,ZMemsize[i]);
}

static LoadSample(dir)register char *dir;
{ register ULONG lock,dirlock,fh,ret=FALSE;
  if(!(Sample[SN].name[0]))ret=TRUE;else
  { if(lock=Lock(dir,1005))
    { dirlock=CurrentDir(lock);
      if(ZMemsize[SN]=FileSize(Sample[SN].name))
      { if(Sample[SN].start=AllocLoad(Sample[SN].name,ZMemsize[SN],MEMF_CHIP))
        { ret=TRUE;*(UWORD*)(Sample[SN].start)=0;
          Sample[SN].length=ZMemsize[SN]/2;
        }
      }UnLock(CurrentDir(dirlock));
    }
  }
  return ret;
}            

LoadZound(songname,path)register char *songname,*path;
{ register int i,ret=TRUE;
  long fh=Open(songname,1005);
  if(fh)
  { Read(fh,&MaxTable,1);Read(fh,&MaxPart,1);
    Read(fh,&loadstart,1);Read(fh,&loadend,1);Read(fh,&speed,1);
    for(i=0;i<16;i++)Read(fh,&Sample[i],sizeof(struct SampleData));
    for(i=0;i<=MaxTable;i++)Read(fh,&Table[i][0],VOICES*sizeof(struct TabData));
    for(i=0;i<=MaxPart;i++)Read(fh,&Parts[i][0],4*32);
    Close(fh);
    for(SN=0;SN<16;SN++)ret&=LoadSample(path);
    if(!ret)QuitZound();
  }else ret=FALSE;
  return ret;
}
