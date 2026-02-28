FrEd v0.90

HOW TO USE THE MUSIC MODULE:
----------------------------


   - Load the relocatible music-module anywhere into CHIP memory.
     This module contains the playroutine and the datas.

   - At the very begining of this module, there is a 'jump table'.

      1) $00000000: JMP  Init
      2) $00000004: JMP  Play
      3) $00000008: JMP  Stop
      4) $0000000C: JMP  FadeOut

   - First, you have to execute the play routine (2nd JMP)
     every vertical blanking (50 times per seconds).

               Ex:  START-IRQ
               .....
               lea   ModuleAdr,a0
               jsr   4(a0)
               .....
               END-IRQ

     Note: You may save the registers before executing the play
      routine, and restore them after it. (They are NOT saved
      in my routine).

   - To play a tune, move the tune number into the D0 register, and
     execute the init routine (1st JMP) once.

               Ex:   move.l   #0,d0
               lea   ModuleAdr,a0
               jsr   0(a0)
               rts

   - To stop a tune, simply execute the stop routine (3rd JMP).

               Ex:   lea   ModuleAdr,a0
               jsr   8(a0)
               rts

     Note: you can still execute the play routine after having stopped
           a tune. The play routine is on STANDBY mode. Just execute
      the init procedure to replay a tune.

   - To start fading-out a tune, execute the FadeOut routine (4th JMP).

               Ex:   lea   ModuleAdr,a0
               jsr   12(a0)
               rts


