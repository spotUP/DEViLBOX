
*нннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннн
*
*  Soucecode:  Replayer demo for high-level-languages
*
*  й by BrainTrace Design    / Carsten Schlote, Egelseeweg 52,
*                              6302 Lich 1
*
*нннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннн
*  Offsets :   0  Hardcalculate some pointers
*        4  Set CIA B Timer B Irq as Irq-Handler
*        8  Remove Irq-Handler
*        12 Start song Nummber 'd0.l'
*        16 Stop song
*        20 Insert SynthEffect ( d0.l = note, d1.l = voice, d2.l = locktime )
*           locktime = 
*        24 Interruptroutine, if you want to bypass
*              offset 4 and 8.
*
*        28.w  VolumeLevel 1  ( 0.255)    For Equalizers
*        30.w  VolumeLevel 2  ( 0.255)
*        32.w  VolumeLevel 3  ( 0.255)
*        34.w  VolumeLevel 4  ( 0.255)
*
*        36.w  OffsetPointer to VoiceControl Flags
*         |    ( Module + OffsetPointer = Addresse des Flagfeldes )
*         |
*         -----> dc.w  VoiceOn0,VoiceOn1,VoiceOn2,VoiceOn3
*
*                 0 = Stimme aus     1 = Stimme ein
*
*        38.w  Replayerversionsnummer (akt. 117)
*        40.w  SyncValue      ( 0..255 )
*        42.w  Offsetpointer to MasterVolume.w   ( 0..64  )
*         |	( Module + OffsetPointer = Addresse des Wortes )
*         |
*         -----> dc.w (0..64)
*нннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннн

   


   SECTION  Music,CODE_C

start:
         BSR	 Module+0	; Init 32-Bit Pointers

         Bsr    Module+4	; Set Timer Irq

         moveq  #0,d0
         bsr    Module+12	; Start song zero

.wait    btst   #6,$bfe001
         beq	 .endwait

         move.w $dff016,d0
         btst	 #10,d0
         bne.s	 .wait
         
         move.l #$40020000,d0	; Insert SoundEffekt
         move.l #0,d1
         move.l #50,d2
         BSR	 Module+20

         bra.s	 .wait
.endwait         
         
         lea	 Module(pc),a0
         move	 42(a0),d0
         lea	 (a0,d0.w),a0
         
         moveq	 #63,d0	; fade out !
.loop    move.w d0,(a0)
         move.w #$8ffe,d1
.loop2   nop
         dbra	 d1,.loop2
         dbra	 d0,.loop

         bsr    Module+16	; Song stop

         bsr    Module+8	; Remove IRQ-Handler
	
         moveq #0,d0
         rts
.error   moveq #20,d0
         rts
Module:
         IncBin  "/RamboLoader.pc"      ; Change this !

         END
