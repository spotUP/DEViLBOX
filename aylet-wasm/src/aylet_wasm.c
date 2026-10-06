/*
 * aylet_wasm.c - Emscripten bridge around aylet 0.5 (Russell Marks, Ian
 * Collier; GPL-2.0-or-later, third-party/aylet-0.5) for DEViLBOX.
 *
 * aylet is a complete ZXAYEMUL player: a Z80 (z80_frame.c, from its z80.c)
 * runs the tune's own Spectrum code, and sound.c turns the AY register
 * writes and the beeper into audio. aylet's main.c is a file-by-filename
 * command-line program with blocking playback, so this file carries the
 * parts of main.c an AudioWorklet needs - the ZXAY loader (read_ay_file),
 * memory set-up (mem_init) and the port handlers (in/out) - copied with the
 * I/O replaced: the file comes from a memory buffer, and sound frames go to
 * a ring the worklet pulls from (driver_frame).
 *
 * What is DEViLBOX's own here: the pull-based render loop, the per-channel
 * mute mask (the mixer's solo/mute), and the song-length fade.
 */
#include <stdlib.h>
#include <string.h>
#include <emscripten/emscripten.h>

#include "main.h"
#include "sound.h"
#include "driver.h"

#define FRAME_STATES_128	(3546900/50)
#define FRAME_STATES_CPC	(4000000/50)

/* ---- globals aylet's sound.c / z80 core expect from main.c ------------- */
struct aydata_tag aydata;
struct time_tag tunetime;
unsigned char mem[64*1024];
unsigned long tstates=0,tsmax=FRAME_STATES_128;
int highspeed=0;
int playing=1;
int paused=0;
int want_quit=0;
int stopafter=0;
int fadetime=0;
int use_ui=0;
int play_to_stdout=0;
char **ay_filenames=NULL;
int ay_file=0,ay_num_files=0;
int ay_track=0;

static int ay_current_reg=0;
static int do_cpc=0;

extern void z80_frame_reset(unsigned char *data,unsigned char *stacketc);
extern void z80_run_frame(void);

/* ---- DEViLBOX state ------------------------------------------------------ */
static int g_sample_rate=44100;
static int g_sound_up=0;
static int g_loaded=0;
static int g_finished=0;
static unsigned int g_mute_mask=0xffffffffu;	/* bit n set = AY channel n audible */
static unsigned char g_ay_shadow[16];		/* last value the tune wrote per register */
static unsigned long g_frames_played=0;
static int g_fade_at=0;				/* frames (1/50 s) before the fade; 0 = play forever */
static int g_fade_len=0;			/* fade length, frames */

/* One 1/50 s frame of S16 stereo, as sound.c hands it to driver_frame(). */
#define RING_CAP (8192*2)
static float g_ring[RING_CAP];
static int g_ring_len=0,g_ring_pos=0;

/* ---- driver.h: the "sound card" sound.c plays into ----------------------- */
int driver_init(int *freqptr,int *stereoptr)
{
*freqptr=g_sample_rate;
*stereoptr=1;
return 1;
}

void driver_end(void) { }

void driver_frame(signed short *data,int len)
{
int f;
if(len>RING_CAP) len=RING_CAP;
for(f=0;f<len;f++) g_ring[f]=data[f]*(1.0f/32768.0f);
g_ring_len=len;
g_ring_pos=0;
}

/* ---- main.c: port handlers (copied; mute mask added at the AY data write) */
unsigned int in(int h,int l)
{
(void)h; (void)l;
/* presumably nothing? XXX */
return(255);
}

static void ay_write_masked(int reg,int val)
{
g_ay_shadow[reg&15]=(unsigned char)val;
/* Registers 8-10 are the channel volumes: a muted channel is written 0
 * (envelope bit cleared too), everything else passes through. */
if(reg>=8 && reg<=10 && !(g_mute_mask&(1u<<(reg-8))))
  val=0;
sound_ay_write(reg,val,tstates);
}

unsigned int out(int h,int l,int a)
{
static int cpc_f4=0;

/* unlike a real speccy, it seems we should only emulate exact port
 * number matches, rather than using bitmasks.
 */
if(do_cpc<1)
  switch(l)
    {
    case 0xfd:
      switch(h)
        {
        case 0xff:
          do_cpc=-1;
        write_reg:
          ay_current_reg=(a&15);
          break;
        case 0xbf:
          do_cpc=-1;
        write_dat:
          ay_write_masked(ay_current_reg,a);
          break;
        default:
          /* ok, since we do at least have low byte=FDh,
           * do bitmask for top byte to allow for
           * crappy .ay conversions. But don't disable
           * CPC autodetect, just in case.
           */
          if((h&0xc0)==0xc0) goto write_reg;
          if((h&0xc0)==0x80) goto write_dat;
        }
      break;

    case 0xfe:
      do_cpc=-1;
      sound_beeper(a&0x10);
      break;
    }

if(do_cpc>-1)
  switch(h)
    {
    case 0xf6:
      switch(a&0xc0)
        {
        case 0x80:	/* write */
          ay_write_masked(ay_current_reg,cpc_f4);
          break;

        case 0xc0:	/* select */
          ay_current_reg=(cpc_f4&15);
          break;
        }
      break;

    case 0xf4:
      cpc_f4=a;
      if(!do_cpc)
        {
        /* restart as a more CPC-ish emulation */
        do_cpc=1;
        sound_ay_reset_cpc();
        tsmax=FRAME_STATES_CPC;
        if(tstates>tsmax) tstates-=tsmax;
        }
      break;
    }

return(0);	/* additional t-states */
}

int do_interrupt(void) { return 1; }	/* z80_frame.c never calls it; main.h declares it */
int action_callback(enum cb_action_tag action) { (void)action; return 1; }

/* ---- main.c: mem_init (copied) ------------------------------------------- */
static void mem_init(int track)
{
static unsigned char intz[]=
  {
  0xf3,		/* di */
  0xcd,0,0,	/* call init */
  0xed,0x5e,	/* loop: im 2 */
  0xfb,		/* ei */
  0x76,		/* halt */
  0x18,0xfa	/* jr loop */
  };
static unsigned char intnz[]=
  {
  0xf3,		/* di */
  0xcd,0,0,	/* call init */
  0xed,0x56,	/* loop: im 1 */
  0xfb,		/* ei */
  0x76,		/* halt */
  0xcd,0,0,	/* call interrupt */
  0x18,0xf7	/* jr loop */
  };
int init,ay_1st_block,ourinit,interrupt;
unsigned char *ptr;
int addr,len,ofs;

#define GETWORD(x) (((*(x))<<8)|(*(x+1)))

init=GETWORD(aydata.tracks[track].data_stacketc+2);
interrupt=GETWORD(aydata.tracks[track].data_stacketc+4);
ay_1st_block=GETWORD(aydata.tracks[track].data_memblocks);

memset(mem+0x0000,0xc9,0x0100);
memset(mem+0x0100,0xff,0x3f00);
memset(mem+0x4000,0x00,0xc000);
mem[0x38]=0xfb;		/* ei */

/* call first AY block if no init */
ourinit=(init?init:ay_1st_block);

if(!interrupt)
  memcpy(mem,intz,sizeof(intz));
else
  {
  memcpy(mem,intnz,sizeof(intnz));
  mem[ 9]=interrupt%256;
  mem[10]=interrupt/256;
  }

mem[2]=ourinit%256;
mem[3]=ourinit/256;

/* now put the memory blocks in place */
ptr=aydata.tracks[track].data_memblocks;
while((addr=GETWORD(ptr))!=0)
  {
  len=GETWORD(ptr+2);
  ofs=GETWORD(ptr+4);
  if(ofs>=0x8000) ofs=-0x10000+ofs;

  /* range check */
  if(ptr-4-aydata.filedata+ofs>=aydata.filelen ||
     ptr-4-aydata.filedata+ofs<0)
    {
    ptr+=6;
    continue;
    }

  /* fix any broken length */
  if(ptr+4+ofs+len>=aydata.filedata+aydata.filelen)
    len=aydata.filedata+aydata.filelen-(ptr+4+ofs);
  if(addr+len>0x10000)
    len=0x10000-addr;

  memcpy(mem+addr,ptr+4+ofs,len);
  ptr+=6;
  }
}

/* ---- main.c: read_ay_file, from a memory buffer instead of a filename ---- */
static void free_aydata(void)
{
if(aydata.tracks) free(aydata.tracks);
if(aydata.filedata) free(aydata.filedata);
memset(&aydata,0,sizeof(aydata));
}

static int read_ay_mem(const unsigned char *src,int data_len)
{
unsigned char *data,*ptr,*ptr2;
int tmp,f;

free_aydata();
if(data_len<24) return(0);
if((data=malloc(data_len))==NULL) return(0);
memcpy(data,src,data_len);

if(memcmp(data,"ZXAYEMUL",8)!=0)
  {
  free(data);
  return(0);
  }

/* for the rest, we don't parse that much; just make copies of the
 * offset `pointers' as real pointers, and save all the `top-level'
 * stuff.
 */
aydata.tracks=NULL;

#define READWORD(x)	(x)=256*(*ptr++); (x)|=*ptr++
#define READWORDPTR(x)	READWORD(tmp); \
		if(tmp>=0x8000) tmp=-0x10000+tmp; \
		if(ptr-data-2+tmp>=data_len || ptr-data-2+tmp<0) \
		  { \
                  free(data); \
                  if(aydata.tracks) free(aydata.tracks); \
                  aydata.tracks=NULL; \
		  return(0); \
                  } \
		(x)=ptr-2+tmp
#define CHECK_ASCIIZ(x) \
		if(!memchr((x),0,data+data_len-(x))) \
		  { \
                  free(data); \
                  if(aydata.tracks) free(aydata.tracks); \
                  aydata.tracks=NULL; \
		  return(0); \
                  }

ptr=data+8;
aydata.filever=*ptr++;
aydata.playerver=*ptr++;
ptr+=2;		/* skip `custom player' stuff */
READWORDPTR(aydata.authorstr);
CHECK_ASCIIZ(aydata.authorstr);
READWORDPTR(aydata.miscstr);
CHECK_ASCIIZ(aydata.miscstr);
aydata.num_tracks=1+*ptr++;
aydata.first_track=*ptr++;

/* skip to track info */
READWORDPTR(ptr2);
ptr=ptr2;

if((aydata.tracks=malloc(aydata.num_tracks*sizeof(struct ay_track_tag)))==NULL)
  {
  free(data);
  return(0);
  }

for(f=0;f<aydata.num_tracks;f++)
  {
  READWORDPTR(aydata.tracks[f].namestr);
  CHECK_ASCIIZ(aydata.tracks[f].namestr);
  READWORDPTR(aydata.tracks[f].data);
  }

for(f=0;f<aydata.num_tracks;f++)
  {
  if(aydata.tracks[f].data-data+10>data_len-4)
    {
    free(aydata.tracks);
    aydata.tracks=NULL;
    free(data);
    return(0);
    }
  ptr=aydata.tracks[f].data+10;
  READWORDPTR(aydata.tracks[f].data_stacketc);
  READWORDPTR(aydata.tracks[f].data_memblocks);
  ptr=aydata.tracks[f].data+4;
  READWORD(aydata.tracks[f].fadestart);
  READWORD(aydata.tracks[f].fadelen);
  }

/* ok then, that's as much parsing as we do here. */
aydata.filedata=data;
aydata.filelen=data_len;
return(1);
}

/* ---- the API the worklet calls ------------------------------------------ */

EMSCRIPTEN_KEEPALIVE
void aylet_wasm_init(int sample_rate)
{
if(sample_rate<=0) sample_rate=44100;
if(g_sound_up && sample_rate==g_sample_rate) return;
if(g_sound_up) { sound_end(); g_sound_up=0; }
g_sample_rate=sample_rate;
sound_freq=sample_rate;
sound_stereo=1;
if(sound_init()) g_sound_up=1;
}

EMSCRIPTEN_KEEPALIVE
void aylet_wasm_stop(void)
{
g_loaded=0;
g_finished=0;
g_ring_len=g_ring_pos=0;
}

/* Load a whole ZXAY file and start `track` (negative = the file's FirstSong).
 * 0 on success; -1 sound not initialised; -2 not a ZXAYEMUL file or broken. */
EMSCRIPTEN_KEEPALIVE
int aylet_wasm_load(const unsigned char *data,int len,int track)
{
if(!g_sound_up) return -1;
aylet_wasm_stop();
if(!read_ay_mem(data,len)) return -2;
/* sound.c keeps the AY stereo delay lines and the tone/envelope counters
 * across songs; a fresh sound_init() clears them, or the tail of the last
 * song leaks into the first frame of this one. */
sound_end();
g_sound_up=0;
if(!sound_init()) return -1;
g_sound_up=1;
if(track<0 || track>=aydata.num_tracks) track=aydata.first_track;
if(track<0 || track>=aydata.num_tracks) track=0;
ay_track=track;

do_cpc=0;
ay_current_reg=0;
tsmax=FRAME_STATES_128;
sound_ay_reset();
memset(g_ay_shadow,0,sizeof(g_ay_shadow));
mem_init(track);
z80_frame_reset(aydata.tracks[track].data,aydata.tracks[track].data_stacketc);

g_frames_played=0;
g_fade_at=aydata.tracks[track].fadestart;
g_fade_len=aydata.tracks[track].fadelen;
g_finished=0;
g_loaded=1;
return 0;
}

EMSCRIPTEN_KEEPALIVE int aylet_wasm_get_num_tracks(void) { return aydata.filedata?aydata.num_tracks:0; }
EMSCRIPTEN_KEEPALIVE int aylet_wasm_get_first_track(void) { return aydata.filedata?aydata.first_track:0; }
EMSCRIPTEN_KEEPALIVE int aylet_wasm_get_track(void) { return ay_track; }
EMSCRIPTEN_KEEPALIVE int aylet_wasm_is_finished(void) { return g_finished; }
EMSCRIPTEN_KEEPALIVE const char *aylet_wasm_get_author(void) { return aydata.filedata?(const char*)aydata.authorstr:""; }
EMSCRIPTEN_KEEPALIVE const char *aylet_wasm_get_misc(void) { return aydata.filedata?(const char*)aydata.miscstr:""; }
EMSCRIPTEN_KEEPALIVE const char *aylet_wasm_get_track_name(int t)
{
if(!aydata.filedata || t<0 || t>=aydata.num_tracks) return "";
return (const char*)aydata.tracks[t].namestr;
}

/* Bit n set = AY channel n (A, B, C) audible: the mixer's solo/mute. The
 * three volume registers are re-applied at once so a mute or unmute is
 * heard now, not at the tune's next volume write. */
EMSCRIPTEN_KEEPALIVE
void aylet_wasm_set_mute_mask(unsigned int mask)
{
int reg;
g_mute_mask=mask;
if(!g_loaded) return;
for(reg=8;reg<=10;reg++)
  {
  int val=g_ay_shadow[reg];
  if(!(mask&(1u<<(reg-8)))) val=0;
  sound_ay_write(reg,val,tstates);
  }
}

/* One frame of the Z80, then one 1/50 s frame of audio into the ring. */
static void run_one_frame(void)
{
z80_run_frame();
if(g_fade_at>0 && g_frames_played==(unsigned long)g_fade_at)
  {
  int secs=g_fade_len/50;
  sound_start_fade(secs>0?secs:1);
  }
if(g_fade_at>0 && g_fade_len>=0 && g_frames_played>(unsigned long)(g_fade_at+g_fade_len+50))
  g_finished=1;
g_frames_played++;
sound_frame(1);
}

/* Grid extraction: run one 1/50 s frame of the tune without pulling audio,
 * then read the 16 registers it last wrote (unmasked). AYParser draws the
 * tracker grid from these, so the grid shows what this engine plays. */
EMSCRIPTEN_KEEPALIVE
int aylet_wasm_step_frame(void)
{
if(!g_loaded || g_finished || !g_sound_up) return 0;
run_one_frame();
g_ring_pos=g_ring_len;	/* the audio of this frame is not wanted */
return 1;
}

EMSCRIPTEN_KEEPALIVE
const unsigned char *aylet_wasm_get_regs(void) { return g_ay_shadow; }

/* Render `frames` stereo float frames (L R interleaved). Silence when nothing
 * is loaded or the song has finished. Returns `frames`. */
EMSCRIPTEN_KEEPALIVE
int aylet_wasm_render(float *out,int frames)
{
int i=0;
if(!g_loaded || g_finished || !g_sound_up)
  {
  memset(out,0,sizeof(float)*2*frames);
  return frames;
  }
while(i<frames)
  {
  int avail,take;
  if(g_ring_pos>=g_ring_len)
    {
    run_one_frame();
    if(g_finished)
      {
      memset(out+i*2,0,sizeof(float)*2*(frames-i));
      return frames;
      }
    if(g_ring_len==0) { memset(out+i*2,0,sizeof(float)*2*(frames-i)); return frames; }
    }
  avail=(g_ring_len-g_ring_pos)/2;
  take=frames-i<avail?frames-i:avail;
  memcpy(out+i*2,g_ring+g_ring_pos,sizeof(float)*2*take);
  g_ring_pos+=take*2;
  i+=take;
  }
return frames;
}
