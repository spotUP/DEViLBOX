// Prints synth fields for one instrument index so the vitest can assert parse correctness.
// Build: cc -O1 -w -I <repo>/sonix-wasm/src probe-synth-fields.c -o probe -lm
// Run:   probe "<song>.smus" <instIndex>
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <dirent.h>
#include "sonix/sonix.h"
#include "sonix/sonix.c"
#include "sonix/sonix_io.c"
static bool rd(const char*p,uint8_t**o,uint32_t*os,void*u){(void)u;FILE*f=fopen(p,"rb");if(!f)return false;fseek(f,0,2);long n=ftell(f);fseek(f,0,0);uint8_t*b=malloc(n);fread(b,1,n,f);fclose(f);*o=b;*os=n;return true;}
static int ls(const char*d,void(*v)(const char*,void*),void*c,void*u){(void)u;DIR*dir=opendir(d);if(!dir)return -1;struct dirent*e;int n=0;while((e=readdir(dir))){if(e->d_name[0]=='.')continue;if(v)v(e->d_name,c);n++;}closedir(dir);return n;}
int main(int c,char**v){
  int idx = c>=3?atoi(v[2]):0;
  FILE*fi=fopen(v[1],"rb");fseek(fi,0,2);long n=ftell(fi);fseek(fi,0,0);uint8_t*bf=malloc(n);fread(bf,1,n,fi);fclose(fi);
  SonixIoCallbacks io;memset(&io,0,sizeof(io));io.read_file=rd;io.list_dir=ls;
  SonixSong*s=sonix_song_create(bf,n,&io);sonix_song_load_instruments(s,v[1]);
  int lfoNonZero=0; for(int k=0;k<128;k++) if(s->synth_lfo_wave[idx][k]!=0) lfoNonZero++;
  printf("IS_SYNTH %d LFO_SET %d LFO_NONZERO %d EG_L %u %u %u %u EG_R %u %u %u %u\n",
    s->instrument_is_synth[idx], s->synth_lfo_wave_set[idx], lfoNonZero,
    s->ss_port_target[idx][0],s->ss_port_target[idx][1],s->ss_port_target[idx][2],s->ss_port_target[idx][3],
    s->ss_port_speed[idx][0],s->ss_port_speed[idx][1],s->ss_port_speed[idx][2],s->ss_port_speed[idx][3]);
  return 0;}
