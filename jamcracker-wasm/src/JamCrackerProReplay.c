#include <stdio.h>
#include "paula_soft.h"
#include <stdint.h>

/* Register file */
static uint32_t d0,d1,d2,d3,d4,d5,d6,d7;
static uint32_t a0,a1,a2,a3,a4,a5,a6,sp,pc;
static int flag_z=0, flag_n=0, flag_c=0, flag_v=0, flag_x=0;

/* Size helpers */
#define W(r)  (*((uint16_t*)&(r)))
#define B(r)  (*((uint8_t*)&(r)))

/* Memory access — 68k is big-endian; byte-swap on little-endian hosts.
 * Uses memcpy for alignment-safe access (68k allows unaligned word/long). */
#include <string.h>
#define READ8(addr)   (*((const uint8_t*)(uintptr_t)(addr)))
#define WRITE8(addr,v)  (*((uint8_t*)(uintptr_t)(addr)) = (uint8_t)(v))
static inline uint16_t _rd16(uintptr_t a) { uint16_t v; memcpy(&v,(void*)a,2); return v; }
static inline uint32_t _rd32(uintptr_t a) { uint32_t v; memcpy(&v,(void*)a,4); return v; }
static inline void _wr16(uintptr_t a,uint16_t v) {
  if(a>=0xDFF0A0&&a<=0xDFF0DF){uint16_t n=__builtin_bswap16(v);int ch=(int)((a-0xDFF0A0)>>4);int r=(int)((a-0xDFF0A0)&0xF);
    if(r==6)paula_set_period(ch,n);else if(r==8)paula_set_volume(ch,(uint8_t)n);else if(r==4)paula_set_length(ch,n);return;}
  if(a==0xDFF096){paula_dma_write(__builtin_bswap16(v));return;}
  if(a>1048576){return;}
  memcpy((void*)a,&v,2); }
static inline void _wr32(uintptr_t a,uint32_t v) {
  if(a==0xDFF0A0||a==0xDFF0B0||a==0xDFF0C0||a==0xDFF0D0){int ch=(int)((a-0xDFF0A0)>>4);
    paula_set_sample_ptr(ch,(const int8_t*)(uintptr_t)__builtin_bswap32(v));return;}
  if(a>1048576){return;}
  memcpy((void*)a,&v,4); }
#if defined(__BYTE_ORDER__) && __BYTE_ORDER__ == __ORDER_BIG_ENDIAN__
#define READ16(addr)  _rd16((uintptr_t)(addr))
#define READ32(addr)  _rd32((uintptr_t)(addr))
#define WRITE16(addr,v) _wr16((uintptr_t)(addr),(uint16_t)(v))
#define WRITE32(addr,v) _wr32((uintptr_t)(addr),(uint32_t)(v))
#else
#define READ16(addr)  __builtin_bswap16(_rd16((uintptr_t)(addr)))
#define READ32(addr)  __builtin_bswap32(_rd32((uintptr_t)(addr)))
#define WRITE16(addr,v) _wr16((uintptr_t)(addr),__builtin_bswap16((uint16_t)(v)))
#define WRITE32(addr,v) _wr32((uintptr_t)(addr),__builtin_bswap32((uint32_t)(v)))
#endif
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
#define DMAWAIT 300
#define it_name 0
#define it_flags 31
#define it_size 32
#define it_address 36
#define it_sizeof 40
#define pt_size 0
#define pt_address 2
#define pt_sizeof 6
#define nt_period 0
#define nt_instr 1
#define nt_speed 2
#define nt_arpeggio 3
#define nt_vibrato 4
#define nt_phase 5
#define nt_volume 6
#define nt_porta 7
#define nt_sizeof 8
#define pv_waveoffset 0
#define pv_dmacon 2
#define pv_custbase 4
#define pv_inslen 8
#define pv_insaddress 10
#define pv_peraddress 14
#define pv_pers 18
#define pv_por 24
#define pv_deltapor 26
#define pv_porlevel 28
#define pv_vib 30
#define pv_deltavib 32
#define pv_vol 34
#define pv_deltavol 36
#define pv_vollevel 38
#define pv_phase 40
#define pv_deltaphase 42
#define pv_vibcnt 44
#define pv_vibmax 45
#define pv_flags 46
#define pv_sizeof 47

/* Packed data section — contiguous byte array matching 68k memory layout */
static uint8_t _ds[136 + 4*47 + 2] = {  /* pp_variables@136 (188 bytes for 4 voices) + pp_nullwave@324 */
  0x03,0xfb,0x03,0xc2,0x03,0x8c,0x03,0x59,0x03,0x29,0x02,0xfb,0x02,0xd0,0x02,0xa8, /* pp_periods@0 */
  0x02,0x82,0x02,0x5e,0x02,0x3c,0x02,0x1c,0x01,0xfd,0x01,0xe1,0x01,0xc6,0x01,0xac,
  0x01,0x94,0x01,0x7d,0x01,0x68,0x01,0x54,0x01,0x41,0x01,0x2f,0x01,0x1e,0x01,0x0e,
  0x00,0xfe,0x00,0xf0,0x00,0xe3,0x00,0xd6,0x00,0xca,0x00,0xbe,0x00,0xb4,0x00,0xaa,
  0x00,0xa0,0x00,0x97,0x00,0x8f,0x00,0x87,0x00,0x87,0x00,0x87,0x00,0x87,0x00,0x87,
  0x00,0x87,0x00,0x87,0x00,0x87,0x00,0x87,0x00,0x87,0x00,0x87,0x00,0x87,0x00,0x87,
  0x00,0x87,0x00,0x87,0x00,0x87,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00, /* songlen@102, songtable@104, instable@108 */
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00, /* patttable@112, pp_wait@116, pp_waitcnt@117, pp_notecnt@118, pp_address@120, pp_songptr@124 */
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00, /* pp_songcnt@128, pp_pattentry@130, pp_tmpdmacon@134, pp_variables@136, pp_nullwave@140 */
};
#define pp_periods ((uint16_t*)(_ds + 0))
#define songlen ((uint16_t*)(_ds + 102))
#define songtable ((uint32_t*)(_ds + 104))
#define instable ((uint32_t*)(_ds + 108))
#define patttable ((uint32_t*)(_ds + 112))
#define pp_wait ((uint8_t*)(_ds + 116))
#define pp_waitcnt ((uint8_t*)(_ds + 117))
#define pp_notecnt ((uint8_t*)(_ds + 118))
#define pp_address ((uint32_t*)(_ds + 120))
#define pp_songptr ((uint32_t*)(_ds + 124))
#define pp_songcnt ((uint16_t*)(_ds + 128))
#define pp_pattentry ((uint32_t*)(_ds + 130))
#define pp_tmpdmacon ((uint16_t*)(_ds + 134))
#define pp_variables ((uint8_t*)(_ds + 136))
#define pp_song (_ds + 142)
#define pp_nullwave ((uint16_t*)(_ds + 324))  /* relocated: was 140, overlapped with pp_variables voice data */

/* Forward declarations */
static void pp_init(void);
static void pp_play(void);
static void pp_end(void);
static void pp_nwnt(void);
static void pp_uvs(void);
static void pp_rot(void);
static void pp_nnt(void);
static void pp_scr(void);

/* *************************************** */
/* ** JamCrackerPro V1.0a play-routine *** */
/* **   Originally coded by M. Gemmel  *** */
/* **           Code optimised         *** */
/* **         by Xag of Betrayal       *** */
/* **    See docs for important info   *** */
/* *************************************** */
/* ** Relative offset definitions *** */

/* SECTION BTLCRACKER_PLAYER */
/* ** Test routine *** */

static void Start(void) {
  { uint32_t _mv=(uint32_t)(4); a6 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uintptr_t _jt=(uintptr_t)(READ32(a6 + -132)); if(_jt) ((void(*)(void))_jt)(); }
  pp_init();
_loop:
  { int32_t _lhs=(int32_t)(READ8(0xDFF006)),_rhs=(int32_t)(0x50); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (!flag_z) goto _loop;
  { uint16_t _mv=(uint16_t)(0x0F00); /* hw $DFF180 */ (void)(_mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  pp_play();
  { uint16_t _mv=(uint16_t)(0x0000); /* hw $DFF180 */ (void)(_mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  flag_z = ((READ32(0xBFE001) & (1u << (6 & 31))) == 0);
  if (!flag_z) goto _loop;
  pp_end();
  { uint32_t _mv=(uint32_t)(4); a6 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uintptr_t _jt=(uintptr_t)(READ32(a6 + -138)); if(_jt) ((void(*)(void))_jt)(); }
  d0 = (uint32_t)(int32_t)(int8_t)(0);
  return;
  /* ** Initialise routine *** */
}

static void pp_init(void) {
  if (!a0) a0 = (uint32_t)(uintptr_t)pp_song; /* harness pre-sets a0 */
  a0 = (uint32_t)((int32_t)a0 + (int32_t)(int16_t)(4));
  { uint16_t _mv=(uint16_t)(READ16_POST(a0)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(W(d0)); W(d1) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(a0); WRITE32((uintptr_t)instable, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  d0 = (uint32_t)((uint16_t)it_sizeof * (uint16_t)W(d0));
  a0 = (uint32_t)((int32_t)a0 + (int32_t)(int16_t)(W(d0)));
  { uint16_t _mv=(uint16_t)(READ16_POST(a0)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(W(d0)); W(d2) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(a0); WRITE32((uintptr_t)patttable, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  d0 = (uint32_t)((uint16_t)pt_sizeof * (uint16_t)W(d0));
  a0 = (uint32_t)((int32_t)a0 + (int32_t)(int16_t)(W(d0)));
  { uint16_t _mv=(uint16_t)(READ16_POST(a0)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(W(d0)); WRITE16((uintptr_t)songlen, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(a0); WRITE32((uintptr_t)songtable, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _ar=(uint16_t)(W(d0) + W(d0)); W(d0) = (uint16_t)((uint16_t)_ar); flag_z=((int16_t)(_ar)==0); flag_n=((int16_t)(_ar)<0); }
  a0 = (uint32_t)((int32_t)a0 + (int32_t)(int16_t)(W(d0)));
  { uint32_t _mv=(uint32_t)(READ32((uintptr_t)patttable)); a1 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(W(d2)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _sr=(uint16_t)(W(d0) - (uint16_t)(1)); W(d0) = (uint16_t)((uint16_t)_sr); flag_z=((int16_t)(_sr)==0); flag_n=((int16_t)(_sr)<0); }
_l0:
  { uint32_t _mv=(uint32_t)(a0); WRITE32(a1 + (intptr_t)pt_address, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a1)); W(d3) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  d3 = (uint32_t)((uint16_t)(nt_sizeof*4) * (uint16_t)W(d3));
  a0 = (uint32_t)((int32_t)a0 + (int32_t)(int16_t)(W(d3)));
  a1 = (uint32_t)((int32_t)a1 + (int32_t)(int16_t)(pt_sizeof));
  if ((int16_t)(--d0) >= 0) goto _l0;
  { uint32_t _mv=(uint32_t)(READ32((uintptr_t)instable)); a1 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(W(d1)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _sr=(uint16_t)(W(d0) - (uint16_t)(1)); W(d0) = (uint16_t)((uint16_t)_sr); flag_z=((int16_t)(_sr)==0); flag_n=((int16_t)(_sr)<0); }
_l1:
  { uint32_t _mv=(uint32_t)(a0); WRITE32(a1 + (intptr_t)it_address, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(READ32(a1 + (intptr_t)it_size)); d2 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  a0 = (uint32_t)((int32_t)a0 + (int32_t)(int16_t)(d2));
  a1 = (uint32_t)((int32_t)a1 + (int32_t)(int16_t)(it_sizeof));
  if ((int16_t)(--d0) >= 0) goto _l1;
  { uint32_t _mv=(uint32_t)(READ32((uintptr_t)songtable)); WRITE32((uintptr_t)pp_songptr, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16((uintptr_t)songlen)); WRITE16((uintptr_t)pp_songcnt, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(READ32((uintptr_t)pp_songptr)); a0 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a0)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  d0 = (uint32_t)((uint16_t)pt_sizeof * (uint16_t)W(d0));
  { uint32_t _ar=(uint32_t)(READ32((uintptr_t)patttable) + d0); d0 = (uint32_t)_ar; flag_z=((int32_t)(_ar)==0); flag_n=((int32_t)(_ar)<0); }
  { uint32_t _mv=(uint32_t)(d0); a0 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(a0); WRITE32((uintptr_t)pp_pattentry, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  /* ASM: move.b pt_size+1(a0),pp_notecnt — read low byte of pt_size word, store to pp_notecnt */
  { uint8_t _mv=(uint8_t)(READ8(a0 + (intptr_t)pt_size + 1)); WRITE8((uintptr_t)pp_notecnt, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(READ32(a0 + (intptr_t)pt_address)); WRITE32((uintptr_t)pp_address, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint8_t _mv=(uint8_t)(6); WRITE8((uintptr_t)pp_wait, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint8_t _mv=(uint8_t)(1); WRITE8((uintptr_t)pp_waitcnt, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  WRITE16((uintptr_t)pp_nullwave, 0);
  { uint16_t _mv=(uint16_t)(0x000F); paula_dma_write((uint16_t)(_mv)); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  a0 = (uint32_t)(uintptr_t)pp_variables;
  a1 = (uint32_t)0xDFF0A0;
  d1 = (uint32_t)(int32_t)(int8_t)(1);
  { uint16_t _mv=(uint16_t)(0x80); W(d2) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  d0 = (uint32_t)(int32_t)(int8_t)(3);
_l2:
  { uint16_t _mv=(uint16_t)(0); WRITE16(a1 + 8, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(W(d2)); WRITE16(a0, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(W(d1)); WRITE16(a0 + (intptr_t)pv_dmacon, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(a1); WRITE32(a0 + (intptr_t)pv_custbase, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(pp_periods); WRITE32(a0 + (intptr_t)pv_peraddress, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(1019); WRITE16(a0 + (intptr_t)pv_pers, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  WRITE16(a0 + (intptr_t)pv_pers + 2, 0);
  WRITE16(a0 + (intptr_t)pv_pers + 4, 0);
  WRITE32(a0 + (intptr_t)pv_por, 0);
  WRITE16(a0 + (intptr_t)pv_porlevel, 0);
  WRITE32(a0 + (intptr_t)pv_vib, 0);
  WRITE32(a0 + (intptr_t)pv_vol, 0);
  { uint16_t _mv=(uint16_t)(0x40); WRITE16(a0 + (intptr_t)pv_vollevel, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  WRITE32(a0 + (intptr_t)pv_phase, 0);
  WRITE16(a0 + (intptr_t)pv_vibcnt, 0);
  WRITE8(a0 + (intptr_t)pv_flags, 0);
  a0 = (uint32_t)((int32_t)a0 + (int32_t)(int16_t)(pv_sizeof));
  a1 = (uint32_t)((int32_t)a1 + (int32_t)(int16_t)(0x10));
  { uint16_t _ar=(uint16_t)(W(d1) + W(d1)); W(d1) = (uint16_t)((uint16_t)_ar); flag_z=((int16_t)(_ar)==0); flag_n=((int16_t)(_ar)<0); }
  { uint16_t _ar=(uint16_t)(W(d2) + 0x40); W(d2) = (uint16_t)((uint16_t)_ar); flag_z=((int16_t)(_ar)==0); flag_n=((int16_t)(_ar)<0); }
  if ((int16_t)(--d0) >= 0) goto _l2;
  /* hw $BFE001 */ (void)(READ32(0xBFE001) | (1u << (1 & 31)));
  return;
  /* ** Clean-up routine *** */
}

static void pp_end(void) {
  d0 = (uint32_t)(int32_t)(int8_t)(0);
  a0 = (uint32_t)0xDFF000;
  { uint16_t _mv=(uint16_t)(W(d0)); WRITE16(a0 + 168, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(W(d0)); WRITE16(a0 + 184, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(W(d0)); WRITE16(a0 + 200, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(W(d0)); WRITE16(a0 + 216, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(0x000F); WRITE16(a0 + 150, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  /* hw $BFE001 */ (void)(READ32(0xBFE001) & ~(1u << (1 & 31)));
  return;
  /* ** Play routine *** */
}

static void pp_play(void) {
  a6 = (uint32_t)0xDFF000;
  { uint8_t _sr=(uint8_t)(READ8((uintptr_t)pp_waitcnt) - 1); WRITE8((uintptr_t)pp_waitcnt, (uint8_t)_sr); flag_z=((int8_t)(_sr)==0); flag_n=((int8_t)(_sr)<0); }
  if (!flag_z) goto _l0;
  pp_nwnt();
  { uint8_t _mv=(uint8_t)(READ8((uintptr_t)pp_wait)); WRITE8((uintptr_t)pp_waitcnt, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
_l0:
  a1 = (uint32_t)(uintptr_t)pp_variables;
  pp_uvs();
  a1 = (uint32_t)((uintptr_t)pp_variables + pv_sizeof);
  pp_uvs();
  a1 = (uint32_t)((uintptr_t)pp_variables + 2*pv_sizeof);
  pp_uvs();
  a1 = (uint32_t)((uintptr_t)pp_variables + 3*pv_sizeof);
}

static void pp_uvs(void) {
  { uint32_t _mv=(uint32_t)(READ32(a1 + (intptr_t)pv_custbase)); a0 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
_l0:
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_pers)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  if (!flag_z) goto _l1;
  pp_rot();
  goto _l0;
_l1:
  { uint16_t _ar=(uint16_t)(W(d0) + READ16(a1 + (intptr_t)pv_por)); W(d0) = (uint16_t)((uint16_t)_ar); flag_z=((int16_t)(_ar)==0); flag_n=((int16_t)(_ar)<0); }
  { uint16_t _tst=(uint16_t)(READ16(a1 + (intptr_t)pv_por)); flag_z=(_tst==0); flag_n=((int16_t)(_tst)<0); flag_c=0; flag_v=0; }
  if (flag_z) goto _l1c;
  if (!flag_n) goto _l1a;
  { int32_t _lhs=(int32_t)(W(d0)),_rhs=(int32_t)(READ16(a1 + (intptr_t)pv_porlevel)); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (flag_n==flag_v) goto _l1c;
  goto _l1b;
_l1a:
  { int32_t _lhs=(int32_t)(W(d0)),_rhs=(int32_t)(READ16(a1 + (intptr_t)pv_porlevel)); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (flag_z||(flag_n!=flag_v)) goto _l1c;
_l1b:
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_porlevel)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_l1c:
  { uint16_t _ar=(uint16_t)(W(d0) + READ16(a1 + (intptr_t)pv_vib)); W(d0) = (uint16_t)((uint16_t)_ar); flag_z=((int16_t)(_ar)==0); flag_n=((int16_t)(_ar)<0); }
  { int32_t _lhs=(int32_t)(W(d0)),_rhs=(int32_t)(135); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (flag_n==flag_v) goto _l1d;
  { uint16_t _mv=(uint16_t)(135); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  goto _l1e;
_l1d:
  { int32_t _lhs=(int32_t)(W(d0)),_rhs=(int32_t)(1019); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (flag_z||(flag_n!=flag_v)) goto _l1e;
  { uint16_t _mv=(uint16_t)(1019); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_l1e:
  { uint16_t _mv=(uint16_t)(W(d0)); WRITE16(a0 + 6, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  pp_rot();
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_deltapor)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _ar=(uint16_t)(READ16(a1 + (intptr_t)pv_por) + W(d0)); WRITE16(a1 + (intptr_t)pv_por, (uint16_t)_ar); flag_z=((int16_t)(_ar)==0); flag_n=((int16_t)(_ar)<0); }
  { int32_t _lhs=(int32_t)(READ16(a1 + (intptr_t)pv_por)),_rhs=(int32_t)(-1019); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (flag_n==flag_v) goto _l3;
  { uint16_t _mv=(uint16_t)(-1019); WRITE16(a1 + (intptr_t)pv_por, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  goto _l5;
_l3:
  { int32_t _lhs=(int32_t)(READ16(a1 + (intptr_t)pv_por)),_rhs=(int32_t)(1019); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (flag_z||(flag_n!=flag_v)) goto _l5;
  { uint16_t _mv=(uint16_t)(1019); WRITE16(a1 + (intptr_t)pv_por, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_l5:
  { uint8_t _tst=(uint8_t)(READ8(a1 + (intptr_t)pv_vibcnt)); flag_z=(_tst==0); flag_n=((int8_t)(_tst)<0); flag_c=0; flag_v=0; }
  if (flag_z) goto _l7;
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_deltavib)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _ar=(uint16_t)(READ16(a1 + (intptr_t)pv_vib) + W(d0)); WRITE16(a1 + (intptr_t)pv_vib, (uint16_t)_ar); flag_z=((int16_t)(_ar)==0); flag_n=((int16_t)(_ar)<0); }
  { uint8_t _sr=(uint8_t)(READ8(a1 + (intptr_t)pv_vibcnt) - 1); WRITE8(a1 + (intptr_t)pv_vibcnt, (uint8_t)_sr); flag_z=((int8_t)(_sr)==0); flag_n=((int8_t)(_sr)<0); }
  if (!flag_z) goto _l7;
  WRITE16(a1 + (intptr_t)pv_deltavib, (uint16_t)(-(int16_t)(READ16(a1 + (intptr_t)pv_deltavib))));
  { uint8_t _mv=(uint8_t)(READ8(a1 + (intptr_t)pv_vibmax)); WRITE8(a1 + (intptr_t)pv_vibcnt, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
_l7:
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_dmacon)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_vol)); WRITE16(a0 + 8, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_deltavol)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _ar=(uint16_t)(READ16(a1 + (intptr_t)pv_vol) + W(d0)); WRITE16(a1 + (intptr_t)pv_vol, (uint16_t)_ar); flag_z=((int16_t)(_ar)==0); flag_n=((int16_t)(_ar)<0); }
  { uint16_t _tst=(uint16_t)(READ16(a1 + (intptr_t)pv_vol)); flag_z=(_tst==0); flag_n=((int16_t)(_tst)<0); flag_c=0; flag_v=0; }
  if (!flag_n) goto _l8;
  WRITE16(a1 + (intptr_t)pv_vol, 0);
  goto _la;
_l8:
  { int32_t _lhs=(int32_t)(READ16(a1 + (intptr_t)pv_vol)),_rhs=(int32_t)(0x40); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (flag_z||(flag_n!=flag_v)) goto _la;
  { uint16_t _mv=(uint16_t)(0x40); WRITE16(a1 + (intptr_t)pv_vol, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_la:
  flag_z = ((READ8(a1 + (intptr_t)pv_flags) & (1u << 1)) == 0);
  if (flag_z) goto _l10;
  { uint16_t _tst=(uint16_t)(READ16(a1 + (intptr_t)pv_deltaphase)); flag_z=(_tst==0); flag_n=((int16_t)(_tst)<0); flag_c=0; flag_v=0; }
  if (flag_z) goto _l10;
  if (!flag_n) goto _sk;
  WRITE16(a1 + (intptr_t)pv_deltaphase, 0);
_sk:
  { uint32_t _mv=(uint32_t)(READ32(a1 + (intptr_t)pv_insaddress)); a0 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a1)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  W(d0) = (uint16_t)(-(int16_t)W(d0));
  /* ASM: neg.w d0; lea (a0,d0.w),a2 — address calculation, NOT memory read */
  a2 = (uint32_t)((int32_t)a0 + (int32_t)(int16_t)W(d0));
  { uint32_t _mv=(uint32_t)(a2); a3 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_phase)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  W(d0) = (uint16_t)((uint32_t)(W(d0)) >> 2);
  a3 = (uint32_t)((int32_t)a3 + (int32_t)(int16_t)(W(d0)));
  d0 = (uint32_t)(int32_t)(int8_t)(63);
_lb:
  { uint8_t _mv=(uint8_t)(READ8_POST(a2)); B(d1) = (uint8_t)_mv; flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  W(d1) = (uint32_t)(int32_t)(int16_t)(int8_t)W(d1);
  { uint8_t _mv=(uint8_t)(READ8_POST(a3)); B(d2) = (uint8_t)_mv; flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  W(d2) = (uint32_t)(int32_t)(int16_t)(int8_t)W(d2);
  { uint16_t _ar=(uint16_t)(W(d2) + W(d1)); W(d2) = (uint16_t)((uint16_t)_ar); flag_z=((int16_t)(_ar)==0); flag_n=((int16_t)(_ar)<0); }
  W(d2) = (uint16_t)((uint32_t)((int32_t)W(d2) >> 1));
  { uint8_t _mv=(uint8_t)(B(d2)); WRITE8_POST(a0, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  if ((int16_t)(--d0) >= 0) goto _lb;
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_deltaphase)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _ar=(uint16_t)(READ16(a1 + (intptr_t)pv_phase) + W(d0)); WRITE16(a1 + (intptr_t)pv_phase, (uint16_t)_ar); flag_z=((int16_t)(_ar)==0); flag_n=((int16_t)(_ar)<0); }
  { int32_t _lhs=(int32_t)(READ16(a1 + (intptr_t)pv_phase)),_rhs=(int32_t)(0x100); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (flag_n!=flag_v) goto _l10;
  { uint16_t _sr=(uint16_t)(READ16(a1 + (intptr_t)pv_phase) - 0x100); WRITE16(a1 + (intptr_t)pv_phase, (uint16_t)_sr); flag_z=((int16_t)(_sr)==0); flag_n=((int16_t)(_sr)<0); }
_l10:
  return;
}

static void pp_rot(void) {
  /* Period rotation: rotate 3 period slots in voice struct
   * Original: pv_pers(A1), pv_pers+2(A1), pv_pers+4(A1) */
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_pers)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_pers + 2)); WRITE16(a1 + (intptr_t)pv_pers, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_pers + 4)); WRITE16(a1 + (intptr_t)pv_pers + 2, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(W(d0)); WRITE16(a1 + (intptr_t)pv_pers + 4, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  return;
}

static void pp_nwnt(void) {
  { uint32_t _mv=(uint32_t)(READ32((uintptr_t)pp_address)); a0 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _ar=(uint32_t)(READ32((uintptr_t)pp_address) + nt_sizeof*4); WRITE32((uintptr_t)pp_address, (uint32_t)_ar); flag_z=((int32_t)(_ar)==0); flag_n=((int32_t)(_ar)<0); }
  { uint8_t _sr=(uint8_t)(READ8((uintptr_t)pp_notecnt) - 1); WRITE8((uintptr_t)pp_notecnt, (uint8_t)_sr); flag_z=((int8_t)(_sr)==0); flag_n=((int8_t)(_sr)<0); }
  if (!flag_z) goto _l5;
_l0:
  { uint32_t _ar=(uint32_t)(READ32((uintptr_t)pp_songptr) + 2); WRITE32((uintptr_t)pp_songptr, (uint32_t)_ar); flag_z=((int32_t)(_ar)==0); flag_n=((int32_t)(_ar)<0); }
  { uint16_t _sr=(uint16_t)(READ16((uintptr_t)pp_songcnt) - 1); WRITE16((uintptr_t)pp_songcnt, (uint16_t)_sr); flag_z=((int16_t)(_sr)==0); flag_n=((int16_t)(_sr)<0); }
  if (!flag_z) goto _l1;
  { uint32_t _mv=(uint32_t)(READ32((uintptr_t)songtable)); WRITE32((uintptr_t)pp_songptr, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16((uintptr_t)songlen)); WRITE16((uintptr_t)pp_songcnt, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_l1:
  { uint32_t _mv=(uint32_t)(READ32((uintptr_t)pp_songptr)); a1 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a1)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  d0 = (uint32_t)((uint16_t)pt_sizeof * (uint16_t)W(d0));
  { uint32_t _ar=(uint32_t)(READ32((uintptr_t)patttable) + d0); d0 = (uint32_t)_ar; flag_z=((int32_t)(_ar)==0); flag_n=((int32_t)(_ar)<0); }
  { uint32_t _mv=(uint32_t)(d0); a1 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  /* ASM: move.b pt_size+1(a1),pp_notecnt — read low byte of pt_size word, store to pp_notecnt */
  { uint8_t _mv=(uint8_t)(READ8(a1 + (intptr_t)pt_size + 1)); WRITE8((uintptr_t)pp_notecnt, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(READ32(a1 + (intptr_t)pt_address)); WRITE32((uintptr_t)pp_address, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
_l5:
  WRITE16((uintptr_t)pp_tmpdmacon, 0);
  a1 = (uint32_t)(uintptr_t)pp_variables;
  pp_nnt();
  a0 = (uint32_t)((int32_t)a0 + (int32_t)(int16_t)(nt_sizeof));
  a1 = (uint32_t)((uintptr_t)pp_variables + pv_sizeof);
  pp_nnt();
  a0 = (uint32_t)((int32_t)a0 + (int32_t)(int16_t)(nt_sizeof));
  a1 = (uint32_t)((uintptr_t)pp_variables + 2*pv_sizeof);
  pp_nnt();
  a0 = (uint32_t)((int32_t)a0 + (int32_t)(int16_t)(nt_sizeof));
  a1 = (uint32_t)((uintptr_t)pp_variables + 3*pv_sizeof);
  pp_nnt();
  { uint16_t _mv=(uint16_t)(READ16((uintptr_t)pp_tmpdmacon)); WRITE16(a6 + 150, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)((DMAWAIT+-1)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_loop1:
  if ((int16_t)(--d0) >= 0) goto _loop1;
  a1 = (uint32_t)(uintptr_t)pp_variables;
  pp_scr();
  a1 = (uint32_t)((uintptr_t)pp_variables + pv_sizeof);
  pp_scr();
  a1 = (uint32_t)((uintptr_t)pp_variables + 2*pv_sizeof);
  pp_scr();
  a1 = (uint32_t)((uintptr_t)pp_variables + 3*pv_sizeof);
  pp_scr();
  /* BSET #7 on big-endian byte = bit 15 of word = DMACON SET/CLR enable flag */
  { uint16_t _v = READ16((uintptr_t)pp_tmpdmacon); WRITE16((uintptr_t)pp_tmpdmacon, _v | 0x8000); }
  { uint16_t _mv=(uint16_t)(READ16((uintptr_t)pp_tmpdmacon)); WRITE16(a6 + 150, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)((DMAWAIT+-1)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_loop2:
  if ((int16_t)(--d0) >= 0) goto _loop2;
  /* ASM lines 348-357: Write repeat sample pointers to Paula AUDxLC/AUDxLEN after DMA enable */
  { uint32_t _mv=(uint32_t)(READ32((uintptr_t)pp_variables + pv_insaddress)); WRITE32(a6 + 0xA0, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16((uintptr_t)pp_variables + pv_inslen)); WRITE16(a6 + 0xA4, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(READ32((uintptr_t)pp_variables + pv_sizeof + pv_insaddress)); WRITE32(a6 + 0xB0, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16((uintptr_t)pp_variables + pv_sizeof + pv_inslen)); WRITE16(a6 + 0xB4, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(READ32((uintptr_t)pp_variables + 2*pv_sizeof + pv_insaddress)); WRITE32(a6 + 0xC0, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16((uintptr_t)pp_variables + 2*pv_sizeof + pv_inslen)); WRITE16(a6 + 0xC4, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(READ32((uintptr_t)pp_variables + 3*pv_sizeof + pv_insaddress)); WRITE32(a6 + 0xD0, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16((uintptr_t)pp_variables + 3*pv_sizeof + pv_inslen)); WRITE16(a6 + 0xD4, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  return;
}

static void pp_scr(void) {
  { uint16_t _mv=(uint16_t)(READ16((uintptr_t)pp_tmpdmacon)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  W(d0) &= READ16(a1 + (intptr_t)pv_dmacon);
  if (flag_z) goto _l5;
  { uint32_t _mv=(uint32_t)(READ32(a1 + (intptr_t)pv_custbase)); a0 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _mv=(uint32_t)(READ32(a1 + (intptr_t)pv_insaddress)); WRITE32(a0, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_inslen)); WRITE16(a0 + 4, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_pers)); WRITE16(a0 + 6, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  flag_z = ((READ8(a1 + (intptr_t)pv_flags) & (1u << 0)) == 0);
  if (!flag_z) goto _l5;
  { uint32_t _mv=(uint32_t)(pp_nullwave); WRITE32(a1 + (intptr_t)pv_insaddress, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(1); WRITE16(a1 + (intptr_t)pv_inslen, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_l5:
  return;
}

static void pp_nnt(void) {
  { uint8_t _mv=(uint8_t)(READ8(a0)); B(d1) = (uint8_t)_mv; flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  if (flag_z) goto _l5;
  d1 &= 0x000000FF;
  { uint16_t _ar=(uint16_t)(W(d1) + W(d1)); W(d1) = (uint16_t)((uint16_t)_ar); flag_z=((int16_t)(_ar)==0); flag_n=((int16_t)(_ar)<0); }
  { uint32_t _ar=(uint32_t)((uintptr_t)pp_periods + d1 - 2); d1 = (uint32_t)_ar; flag_z=((int32_t)(_ar)==0); flag_n=((int32_t)(_ar)<0); }
  { uint32_t _mv=(uint32_t)(d1); a2 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  flag_z = ((READ8(a0 + (intptr_t)nt_speed) & (1u << 6)) == 0);
  if (flag_z) goto _l2;
  { uint16_t _mv=(uint16_t)(READ16(a2)); WRITE16(a1 + (intptr_t)pv_porlevel, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  goto _l5;
_l2:
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_dmacon)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _v = READ16((uintptr_t)pp_tmpdmacon); WRITE16((uintptr_t)pp_tmpdmacon, _v | W(d0)); }
  { uint32_t _mv=(uint32_t)(a2); WRITE32(a1 + (intptr_t)pv_peraddress, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a2)); WRITE16(a1 + (intptr_t)pv_pers, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a2)); WRITE16(a1 + (intptr_t)pv_pers + 2, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a2)); WRITE16(a1 + (intptr_t)pv_pers + 4, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  WRITE16(a1 + (intptr_t)pv_por, 0);
  { uint8_t _mv=(uint8_t)(READ8(a0 + (intptr_t)nt_instr)); B(d0) = (uint8_t)_mv; flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  W(d0) = (uint32_t)(int32_t)(int16_t)(int8_t)W(d0);
  d0 = (uint32_t)((uint16_t)it_sizeof * (uint16_t)W(d0));
  { uint32_t _ar=(uint32_t)(READ32((uintptr_t)instable) + d0); d0 = (uint32_t)_ar; flag_z=((int32_t)(_ar)==0); flag_n=((int32_t)(_ar)<0); }
  { uint32_t _mv=(uint32_t)(d0); a2 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint32_t _tst=(uint32_t)(READ32(a2 + (intptr_t)it_address)); flag_z=(_tst==0); flag_n=((int32_t)(_tst)<0); flag_c=0; flag_v=0; }
  if (!flag_z) goto _l1;
  { uint32_t _mv=(uint32_t)(pp_nullwave); WRITE32(a1 + (intptr_t)pv_insaddress, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(1); WRITE16(a1 + (intptr_t)pv_inslen, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  WRITE8(a1 + (intptr_t)pv_flags, 0);
  goto _l5;
_l1:
  { uint32_t _mv=(uint32_t)(READ32(a2 + (intptr_t)it_address)); a3 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  flag_z = ((READ8(a2 + (intptr_t)it_flags) & (1u << 1)) == 0);
  if (!flag_z) goto _l0a;
  { uint32_t _mv=(uint32_t)(READ32(a2 + (intptr_t)it_size)); d0 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  d0 >>= 1;
  { uint16_t _mv=(uint16_t)(W(d0)); WRITE16(a1 + (intptr_t)pv_inslen, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  goto _l0;
_l0a:
  { uint16_t _mv=(uint16_t)(READ16(a1)); W(d0) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  a3 = (uint32_t)((int32_t)a3 + (int32_t)(int16_t)(W(d0)));
  { uint16_t _mv=(uint16_t)(0x20); WRITE16(a1 + (intptr_t)pv_inslen, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_l0:
  { uint32_t _mv=(uint32_t)(a3); WRITE32(a1 + (intptr_t)pv_insaddress, _mv); flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint8_t _mv=(uint8_t)(READ8(a2 + (intptr_t)it_flags)); WRITE8(a1 + (intptr_t)pv_flags, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_vollevel)); WRITE16(a1 + (intptr_t)pv_vol, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_l5:
  { uint8_t _mv=(uint8_t)(READ8(a0 + (intptr_t)nt_speed)); B(d0) = (uint8_t)_mv; flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  B(d0) &= (uint8_t)(0x0F);
  if (flag_z) goto _l6;
  { uint8_t _mv=(uint8_t)(B(d0)); WRITE8((uintptr_t)pp_wait, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
_l6:
  { uint32_t _mv=(uint32_t)(READ32(a1 + (intptr_t)pv_peraddress)); a2 = _mv; flag_z=((int32_t)(_mv)==0); flag_n=((int32_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint8_t _mv=(uint8_t)(READ8(a0 + (intptr_t)nt_arpeggio)); B(d0) = (uint8_t)_mv; flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  if (flag_z) goto _l9;
  { int32_t _lhs=(int32_t)(B(d0)),_rhs=(int32_t)(0xFF); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (!flag_z) goto _l7;
  { uint16_t _mv=(uint16_t)(READ16(a2)); WRITE16(a1 + (intptr_t)pv_pers, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a2)); WRITE16(a1 + (intptr_t)pv_pers + 2, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a2)); WRITE16(a1 + (intptr_t)pv_pers + 4, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  goto _l9;
_l7:
  /* Arpeggio: low nibble → slot 2 offset, high nibble → slot 3 offset */
  B(d0) &= (uint8_t)(0x0F);
  { uint8_t _ar=(uint8_t)(B(d0) + B(d0)); B(d0) = (uint8_t)((uint8_t)_ar); flag_z=((int8_t)(_ar)==0); flag_n=((int8_t)(_ar)<0); }
  W(d0) = (uint32_t)(int32_t)(int16_t)(int8_t)W(d0);
  { uint16_t _mv=(uint16_t)(READ16(a2 + (intptr_t)(int16_t)W(d0))); WRITE16(a1 + (intptr_t)pv_pers + 2, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint8_t _mv=(uint8_t)(READ8(a0 + (intptr_t)nt_arpeggio)); B(d0) = (uint8_t)_mv; flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  B(d0) = (uint8_t)((uint32_t)(B(d0)) >> 4);
  { uint8_t _ar=(uint8_t)(B(d0) + B(d0)); B(d0) = (uint8_t)((uint8_t)_ar); flag_z=((int8_t)(_ar)==0); flag_n=((int8_t)(_ar)<0); }
  W(d0) = (uint32_t)(int32_t)(int16_t)(int8_t)W(d0);
  { uint16_t _mv=(uint16_t)(READ16(a2 + (intptr_t)(int16_t)W(d0))); WRITE16(a1 + (intptr_t)pv_pers + 4, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint16_t _mv=(uint16_t)(READ16(a2)); WRITE16(a1 + (intptr_t)pv_pers, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_l9:
  { uint8_t _mv=(uint8_t)(READ8(a0 + (intptr_t)nt_vibrato)); B(d0) = (uint8_t)_mv; flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  if (flag_z) goto _ld;
  { int32_t _lhs=(int32_t)(B(d0)),_rhs=(int32_t)(0xFF); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (!flag_z) goto _la;
  WRITE32(a1 + (intptr_t)pv_vib, 0);
  WRITE8(a1 + (intptr_t)pv_vibcnt, 0);
  goto _ld;
_la:
  WRITE16(a1 + (intptr_t)pv_vib, 0);
  B(d0) &= (uint8_t)(0x0F);
  W(d0) = (uint32_t)(int32_t)(int16_t)(int8_t)W(d0);
  { uint16_t _mv=(uint16_t)(W(d0)); WRITE16(a1 + (intptr_t)pv_deltavib, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint8_t _mv=(uint8_t)(READ8(a0 + (intptr_t)nt_vibrato)); B(d0) = (uint8_t)_mv; flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  B(d0) = (uint8_t)((uint32_t)(B(d0)) >> 4);
  { uint8_t _mv=(uint8_t)(B(d0)); WRITE8(a1 + (intptr_t)pv_vibmax, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  B(d0) = (uint8_t)((uint32_t)(B(d0)) >> 1);
  { uint8_t _mv=(uint8_t)(B(d0)); WRITE8(a1 + (intptr_t)pv_vibcnt, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
_ld:
  { uint8_t _mv=(uint8_t)(READ8(a0 + (intptr_t)nt_phase)); B(d0) = (uint8_t)_mv; flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  if (flag_z) goto _l10;
  { int32_t _lhs=(int32_t)(B(d0)),_rhs=(int32_t)(0xFF); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (!flag_z) goto _le;
  WRITE16(a1 + (intptr_t)pv_phase, 0);
  { uint16_t _mv=(uint16_t)(0xFFFF); WRITE16(a1 + (intptr_t)pv_deltaphase, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  goto _l10;
_le:
  B(d0) &= (uint8_t)(0x0F);
  W(d0) = (uint32_t)(int32_t)(int16_t)(int8_t)W(d0);
  { uint16_t _mv=(uint16_t)(W(d0)); WRITE16(a1 + (intptr_t)pv_deltaphase, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  WRITE16(a1 + (intptr_t)pv_phase, 0);
_l10:
  { uint8_t _mv=(uint8_t)(READ8(a0 + (intptr_t)nt_volume)); B(d0) = (uint8_t)_mv; flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  if (!flag_z) goto _l10a;
  flag_z = ((READ8(a0 + (intptr_t)nt_speed) & (1u << 7)) == 0);
  if (flag_z) goto _l16;
  goto _l11a;
_l10a:
  { int32_t _lhs=(int32_t)(B(d0)),_rhs=(int32_t)(0xFF); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (!flag_z) goto _l11;
  WRITE16(a1 + (intptr_t)pv_deltavol, 0);
  goto _l16;
_l11:
  flag_z = ((READ8(a0 + (intptr_t)nt_speed) & (1u << 7)) == 0);
  if (flag_z) goto _l12;
_l11a:
  { uint8_t _mv=(uint8_t)(B(d0)); WRITE8((uintptr_t)pv_vol, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  { uint8_t _mv=(uint8_t)(B(d0)); WRITE8((uintptr_t)pv_vollevel, _mv); flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  WRITE16(a1 + (intptr_t)pv_deltavol, 0);
  goto _l16;
_l12:
  d0 = d0 & ~(1u << (7 & 31));
  if (flag_z) goto _l13;
  B(d0) = (uint8_t)(-(int8_t)B(d0));
_l13:
  W(d0) = (uint32_t)(int32_t)(int16_t)(int8_t)W(d0);
  { uint16_t _mv=(uint16_t)(W(d0)); WRITE16(a1 + (intptr_t)pv_deltavol, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_l16:
  { uint8_t _mv=(uint8_t)(READ8(a0 + (intptr_t)nt_porta)); B(d0) = (uint8_t)_mv; flag_z=((int8_t)(_mv)==0); flag_n=((int8_t)(_mv)<0); flag_v=0; flag_c=0; }
  if (flag_z) goto _l1a;
  { int32_t _lhs=(int32_t)(B(d0)),_rhs=(int32_t)(0xFF); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (!flag_z) goto _l17;
  WRITE32(a1 + (intptr_t)pv_por, 0);
  goto _l1a;
_l17:
  WRITE16(a1 + (intptr_t)pv_por, 0);
  flag_z = ((READ8(a0 + (intptr_t)nt_speed) & (1u << 6)) == 0);
  if (flag_z) goto _l17a;
  { uint16_t _mv=(uint16_t)(READ16(a1 + (intptr_t)pv_porlevel)); W(d1) = (uint16_t)_mv; flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  { int32_t _lhs=(int32_t)(W(d1)),_rhs=(int32_t)(READ16(a1 + (intptr_t)pv_pers)); int32_t _cmp=_lhs-_rhs; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)_lhs<(uint32_t)_rhs); }
  if (!flag_z && (flag_n==flag_v)) goto _l17c;
  B(d0) = (uint8_t)(-(int8_t)B(d0));
  goto _l17c;
_l17a:
  d0 = d0 & ~(1u << (7 & 31));
  if (!flag_z) goto _l18;
  B(d0) = (uint8_t)(-(int8_t)B(d0));
  { uint16_t _mv=(uint16_t)(135); WRITE16(a1 + (intptr_t)pv_porlevel, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
  goto _l17c;
_l18:
  { uint16_t _mv=(uint16_t)(1019); WRITE16(a1 + (intptr_t)pv_porlevel, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_l17c:
  W(d0) = (uint32_t)(int32_t)(int16_t)(int8_t)W(d0);
_l18a:
  { uint16_t _mv=(uint16_t)(W(d0)); WRITE16(a1 + (intptr_t)pv_deltapor, _mv); flag_z=((int16_t)(_mv)==0); flag_n=((int16_t)(_mv)<0); flag_v=0; flag_c=0; }
_l1a:
  return;
  /* ** Data section *** */
}

/* TRANSPILER WARNINGS:
 * Line 68: Custom chip write $DFF006 — emitted as no-op
 * Line 70: Custom chip write $DFF180 — emitted as no-op
 * Line 72: Custom chip write $DFF180 — emitted as no-op
 * Line 73: CIA register write $BFE001 — emitted as no-op
 * Line 167: CIA register write $BFE001 — emitted as no-op
 * Line 174: Custom chip write $DFF000 — emitted as no-op
 * Line 180: CIA register write $BFE001 — emitted as no-op
 * Line 185: Custom chip write $DFF000 — emitted as no-op
 */