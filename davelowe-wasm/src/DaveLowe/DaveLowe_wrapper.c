#include "DaveLowe.h"
#include "paula_soft.h"
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <emscripten.h>
extern void InitPlayer(void); extern void InitSound(void);
extern void Interrupt(void); extern void EndSound(void);
extern uint8_t _ds[];
static uint8_t* s_mod=NULL; static int s_loaded=0,s_fin=0;
static float s_ta=0,s_spt=0;
EMSCRIPTEN_KEEPALIVE void player_init(int sr){int r=sr>0?sr:PAULA_RATE_PAL;s_spt=(float)r/50.f;paula_reset();paula_set_output_rate((float)r);s_loaded=s_fin=0;s_ta=0;}
static uint32_t rd32(const uint8_t*p){return((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3];}
static void wr32(uint8_t*p,uint32_t v){p[0]=(uint8_t)(v>>24);p[1]=(uint8_t)(v>>16);p[2]=(uint8_t)(v>>8);p[3]=(uint8_t)v;}

EMSCRIPTEN_KEEPALIVE int player_load(const uint8_t*d,int l){
  if(!d||l<=0)return 0;
  /* Strip Amiga HUNK header if present: magic 0x000003F3 */
  const uint8_t*raw=d; int rawlen=l;
  if(l>0x24 && rd32(d)==0x000003F3){
    /* HUNK_HEADER: skip to HUNK_CODE data */
    /* Typical layout: 0x00=magic, 0x18=HUNK_CODE, 0x1C=codesize, 0x20=data */
    if(rd32(d+0x18)==0x000003E9){
      raw=d+0x20; rawlen=l-0x20;
    }
  }
  if(rawlen<80)return 0; /* too small */

  if(s_mod)free(s_mod);
  s_mod=(uint8_t*)malloc(rawlen);
  if(!s_mod)return 0;
  memcpy(s_mod,raw,rawlen);

  /* Module internal layout (code section):
   * +0:  70FF4E75  security (moveq #-1,d0; rts)
   * +4:  UNCLEART  (8 bytes)
   * +12: Init ptr
   * +16: Play ptr
   * +20: End ptr
   * +24: SubsongCtr ptr
   * +28: SampleInfo ptr
   * +32: EndSampleInfo ptr
   * +36: Init2 ptr (or 0)
   * +40: InitPlayer ptr (or 0)
   * +44: FirstSubsong ptr
   * All pointers are offsets from code section start (pre-relocation).
   * We need to convert them to absolute WASM addresses. */
  uintptr_t base=(uintptr_t)s_mod;

  /* Verify UNCLEART signature */
  if(memcmp(s_mod+4,"UNCLEART",8)!=0){free(s_mod);s_mod=NULL;return 0;}

  /* Set ModulePtr (absolute pointer to module data) */
  wr32(_ds+354,(uint32_t)base);
  /* Set internal pointers: offset from code start → absolute address */
  wr32(_ds+358,(uint32_t)(base+rd32(s_mod+12))); /* InitPtr */
  wr32(_ds+362,(uint32_t)(base+rd32(s_mod+16))); /* PlayPtr */
  wr32(_ds+366,(uint32_t)(base+rd32(s_mod+20))); /* EndPtr */
  wr32(_ds+370,(uint32_t)(base+rd32(s_mod+24))); /* SubsongPtr */
  wr32(_ds+374,(uint32_t)(base+rd32(s_mod+28))); /* SampleInfoPtr */
  wr32(_ds+378,(uint32_t)(base+rd32(s_mod+32))); /* EndSampleInfoPtr */
  uint32_t init2=rd32(s_mod+36);
  wr32(_ds+382,init2?(uint32_t)(base+init2):0);  /* Init2Ptr */
  uint32_t initPl=rd32(s_mod+40);
  wr32(_ds+386,initPl?(uint32_t)(base+initPl):0);/* InitPlayerPtr */
  uint32_t firstSub=rd32(s_mod+44);
  wr32(_ds+390,firstSub?(uint32_t)(base+firstSub):0); /* FirstSubsongPtr */

  /* Relocate internal pointers within the module data itself.
   * The module contains 68k code with absolute references that need
   * base address added. Without full hunk relocation this is incomplete,
   * but the key pointers (in the header and at FirstSubsong) suffice
   * for the replayer to find sequence data. */

  /* Apply Amiga HUNK_RELOC32 relocations from the original file.
   * The reloc section follows the code section in the hunk file.
   * Format: HUNK_RELOC32 (0x3EC) then { count, hunk_num, offsets[count] }
   * repeated until count==0, then HUNK_END (0x3F2). */
  {
    /* Find HUNK_RELOC32 in original file data (after HUNK_CODE + code data) */
    uint32_t codeWords=rd32(d+0x1C);
    uint32_t relocOff=0x20+(codeWords*4); /* byte offset of what follows code */
    if(relocOff+4<=(uint32_t)l && rd32(d+relocOff)==0x000003EC){
      relocOff+=4; /* skip HUNK_RELOC32 marker */
      while(relocOff+4<=(uint32_t)l){
        uint32_t cnt=rd32(d+relocOff); relocOff+=4;
        if(cnt==0) break; /* end of reloc entries */
        relocOff+=4; /* skip hunk number (always 0 for single-hunk) */
        uint32_t ri;
        for(ri=0;ri<cnt && relocOff+4<=(uint32_t)l;ri++){
          uint32_t off=rd32(d+relocOff); relocOff+=4;
          if(off+4<=(uint32_t)rawlen){
            /* Add base address to the longword at this offset */
            uint32_t val=rd32(s_mod+off);
            wr32(s_mod+off,(uint32_t)(base+val));
          }
        }
      }
    }
  }

  paula_reset();
  /* Skip InitPlayer (it calls LoadSeg which doesn't exist in WASM).
   * Instead, call InitSound directly — it initializes the replayer state. */
  InitSound();
  s_loaded=1;s_fin=0;s_ta=0;return 1;
}
EMSCRIPTEN_KEEPALIVE int player_render(float*b,int f){if(!s_loaded){memset(b,0,f*8);return -1;}if(s_fin){memset(b,0,f*8);return 0;}int w=0;while(w<f){int c=(f-w)<64?(f-w):64;paula_render(b+w*2,c);w+=c;s_ta+=(float)c;while(s_ta>=s_spt){s_ta-=s_spt;Interrupt();paula_capture_tick();}}return f;}
EMSCRIPTEN_KEEPALIVE void player_stop(void){EndSound();paula_reset();s_loaded=0;s_fin=1;}
EMSCRIPTEN_KEEPALIVE int player_is_finished(void){return s_fin;}
EMSCRIPTEN_KEEPALIVE int player_get_subsong_count(void){return 1;}
EMSCRIPTEN_KEEPALIVE void player_set_subsong(int n){(void)n;}
EMSCRIPTEN_KEEPALIVE const char*player_get_title(void){return "DaveLowe";}
EMSCRIPTEN_KEEPALIVE double player_detect_duration(void){return 0.0;}
EMSCRIPTEN_KEEPALIVE void player_get_channel_levels(float*o){paula_get_channel_levels(o);}
EMSCRIPTEN_KEEPALIVE void player_capture_start(void){paula_capture_start();}
EMSCRIPTEN_KEEPALIVE void player_capture_stop(void){paula_capture_stop();}
EMSCRIPTEN_KEEPALIVE int player_capture_count(void){return paula_capture_count();}
EMSCRIPTEN_KEEPALIVE const void* player_capture_buffer(void){return paula_capture_buffer();}
