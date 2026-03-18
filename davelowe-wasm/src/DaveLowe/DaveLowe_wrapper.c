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
EMSCRIPTEN_KEEPALIVE int player_load(const uint8_t*d,int l){if(!d||l<=0)return 0;if(s_mod)free(s_mod);s_mod=(uint8_t*)malloc(l);if(!s_mod)return 0;memcpy(s_mod,d,l);uintptr_t p=(uintptr_t)s_mod;_ds[346]=(uint8_t)(p>>24);_ds[347]=(uint8_t)(p>>16);_ds[348]=(uint8_t)(p>>8);_ds[349]=(uint8_t)p;paula_reset();InitPlayer();InitSound();s_loaded=1;s_fin=0;s_ta=0;return 1;}
EMSCRIPTEN_KEEPALIVE int player_render(float*b,int f){if(!s_loaded){memset(b,0,f*8);return -1;}if(s_fin){memset(b,0,f*8);return 0;}int w=0;while(w<f){int c=(f-w)<64?(f-w):64;paula_render(b+w*2,c);w+=c;s_ta+=(float)c;while(s_ta>=s_spt){s_ta-=s_spt;Interrupt();}}return f;}
EMSCRIPTEN_KEEPALIVE void player_stop(void){EndSound();paula_reset();s_loaded=0;s_fin=1;}
EMSCRIPTEN_KEEPALIVE int player_is_finished(void){return s_fin;}
EMSCRIPTEN_KEEPALIVE int player_get_subsong_count(void){return 1;}
EMSCRIPTEN_KEEPALIVE void player_set_subsong(int n){(void)n;}
EMSCRIPTEN_KEEPALIVE const char*player_get_title(void){return "DaveLowe";}
EMSCRIPTEN_KEEPALIVE double player_detect_duration(void){return 0.0;}
EMSCRIPTEN_KEEPALIVE void player_get_channel_levels(float*o){paula_get_channel_levels(o);}
