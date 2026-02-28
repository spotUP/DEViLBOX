;*******************************************
;*                                         *
;*              STRUCTURES                 *
;*                                         *
;*******************************************

STRLEN     equ  32
MAXTUNE    equ  16
MAXINSTR   equ  32
MAXFX      equ  256
ARPLEN     equ  9
MAXARPS    equ  64
MAXLFOS    equ  16
LFOLEN     equ  128
TRACKLEN   equ  32
VOICE_OFF  equ  127
RELEASE    equ  126

samp_start   equ  0
samp_len     equ  4
samp_stlen   equ  8
samp_restoff equ  12
samp_restlen equ  16
samp_offlen  equ  20
samp_flags   equ  22
samp_SIZE    equ  24

tune_start   equ  0
tune_end     equ  1
tune_speed   equ  2
tune_mask    equ  3
tune_SIZE    equ  4

inuc_ins   equ 0
inuc_value equ 1
inuc_time  equ 2
inuc_SIZE  equ 4

envl_rate  equ 0
envl_level equ 3
envl_SIZE  equ 6

even_note   equ 0
even_sample equ 1
even_fx     equ 2
even_vol    equ 3
even_flags  equ 4
even_par    equ 5
even_SIZE   equ 6

entr_v0track   equ 0
entr_v0instadd equ 1
entr_v0noteadd equ 2
entr_v1track   equ 3
entr_v1instadd equ 4
entr_v1noteadd equ 5
entr_v2track   equ 6
entr_v2instadd equ 7
entr_v2noteadd equ 8
entr_v3track   equ 9
entr_v3instadd equ 10
entr_v3noteadd equ 11
entr_SIZE      equ 12

inst_sample equ 0
inst_name   equ samp_SIZE
inst_volume equ samp_SIZE+STRLEN
inst_eg     equ inst_volume+2
inst_fxmem  equ inst_eg+envl_SIZE
inst_SIZE   equ inst_fxmem+inuc_SIZE*16

song_len          equ 0
song_tune         equ song_len+4
song_instr        equ song_tune+tune_SIZE*MAXTUNE
song_arpeggio     equ song_instr+inst_SIZE*MAXINSTR
song_lfo          equ song_arpeggio+MAXARPS*ARPLEN
song_tableentries equ song_lfo+MAXLFOS*LFOLEN
song_events       equ song_tableentries+2
song_instructions equ song_events+2
song_name         equ song_instructions+2
song_SIZE         equ song_name+STRLEN

audi_start  equ 0
audi_len    equ 4
audi_period equ 6
audi_volume equ 8
audi_data   equ 10
audi_pad    equ 12
audi_SIZE   equ 16

fxda_src        equ 0
fxda_dst        equ 2
fxda_tolevel    equ 4
fxda_level      equ 5
fxda_tospeed    equ 6
fxda_speed      equ 7
fxda_pointer    equ 8
fxda_levelcount equ 12
fxda_speedcount equ 14
fxda_lfo        equ 16
fxda_SIZE       equ 20

voic_shadow       equ 0
voic_vibrato      equ audi_SIZE
voic_tremolo      equ voic_vibrato+fxda_SIZE
voic_special      equ voic_tremolo+fxda_SIZE
voic_instr        equ voic_special+fxda_SIZE
voic_event        equ voic_instr+4
voic_insp         equ voic_event+4
voic_egphase      equ voic_insp+4
voic_startphase   equ voic_egphase+2
voic_arpat        equ voic_startphase+2
voic_fxcount      equ voic_arpat+2
voic_gldcount     equ voic_fxcount+2
voic_egcount      equ voic_gldcount+4
voic_toperiod     equ voic_egcount+4
voic_egvolume     equ voic_toperiod+2
voic_basevolume   equ voic_egvolume+2
voic_egtovolume   equ voic_basevolume+2
voic_simplegldadd equ voic_egtovolume+2
voic_dma          equ voic_simplegldadd+2
voic_add          equ voic_dma+2
voic_arpeggio     equ voic_add+4
voic_arplen       equ voic_arpeggio+4
voic_nouse        equ voic_arplen+2
voic_doarpeggio   equ voic_nouse+1
voic_arpblow      equ voic_doarpeggio+1
voic_waitforfx    equ voic_arpblow+1
voic_basearpnote  equ voic_waitforfx+1
voic_arpcount     equ voic_basearpnote+1
voic_arponce      equ voic_arpcount+1
voic_arpspeed     equ voic_arponce+1
voic_SIZE         equ voic_arpspeed+1


;*******************************************
;*                                         *
;*                DEFINES                  *
;*                                         *
;*******************************************

BIT_ARPEGGIO    equ 0
BIT_SIMPLEGLIDE equ 1
BIT_NONOTEADD   equ 2
BIT_NOINSTADD   equ 3
BIT_SUPERGLIDE  equ 4
BIT_ARPONCE     equ 5
BIT_ARPBLOW     equ 6

ATT_PHASE equ 0
DEC_PHASE equ 1
REL_PHASE equ 2
SUS_PHASE equ 3

STARTSAMPLE equ 2
REPSAMPLE   equ 1
KILLSAMPLE  equ 0

BIT_SPECIAL equ 0
