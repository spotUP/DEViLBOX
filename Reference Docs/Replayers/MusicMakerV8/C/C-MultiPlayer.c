
/* C sample program for using the mmv8 songs in your own programs.
   Written by Dire Cracks Inc., Thomas Winischhofer

   Demonstrates multi song handling facility of mmv8.library.
   >>: mmv88.library and mmvx.library DO NOT FEATURE THIS (YET).

*/

#include <exec/types.h>
#include <exec/libraries.h>

#include "MMV8:Developer/C/mmv8.h" /* MusicMaker - include file. */

 int i;
 long fileerr;

 struct Library *MMV8Base;   /* This is a DECLARED name. This spelling
                                necessarily required ! */

main()
 {
 printf("MusicMakerV8 C-Example: Multi-song handling.\n");

/* Version 16 of the library is the lowest number supported from this point
*/

 if ( (MMV8Base = (struct Library *)OpenLibrary("mmv8.library",16L)) == 0 )
    {
    printf("Error in opening v16 of mmv8.library ! Exiting ...\n");
    exit(20);
    }


/* locks audio.device to avoid disturbance */
   if (!(i=LockAudio())) printf("WARNING: Could not lock audio.device!\n");

/*  Routines start counting from 0. So, song #1 is to be handled
    as song #0, etc. !
    The songs loaded here do not exist on MusicMaker-Disk!
*/

 printf("Loading song 1...");
 if ((fileerr = (long)NewLoadAndInit("sd:song-01\0",ONESHOT,0L,0L)) != 0)
    {
    printf("\nError: %ld",fileerr);
    UnlockAudio();
    CloseLibrary(MMV8Base);
    exit(20);
    }
 printf("\nLoading song 2...");
 if ((fileerr = (long)NewLoadAndInit("sd:song-02\0",ONESHOT,0L,1L)) != 0)
    {
    printf("\nError: %ld",fileerr);
    RemoveAllSongs();
    UnlockAudio();
    CloseLibrary(MMV8Base);
    exit(20);
    }
 printf("\nLoading song 3...");
 if ((fileerr = (long)NewLoadAndInit("sd:song-03\0",ONESHOT,0L,2L)) != 0)
    {
    printf("\nError: %ld",fileerr);
    RemoveAllSongs();
    UnlockAudio();
    CloseLibrary(MMV8Base);
    exit(20);
    }

/* Note: NewLoadAndInit(), beside loading, also sets up the interrupt-handler,
   so a special function call doing that is not required. Otherwise, when you
   are NOT using (New)LoadAndInit(), "GeneralSndInit()" or "NewSndInit()" do
   that for you. (eg. if you load the sound files via trackdisk.device...!)
   By using the NEW...() functions you are supposed to use
   .  RemoveAllSongs() to remove all songs (no, really!?)
   .  NewRemoveSong(songnum) to remove a single song from memory
   . AND, additionally, to remove the interrupt handler,
   .  GeneralSndRemove()
   .
   and NO MORE RemoveLoaded(), which is ONLY considered a counterpart
   to "old" LoadAndInit().

   When using multi songs, each single song must be notified to the player
   by either calling NewLoadAndInit or NewSndInit!
*/

 printf("\nPlaying song 1...");
 NewSndReset(0L);      /* Set up song #x to play, use oneshot-value given */
 SoundOn();            /* to NewLoadAndInit */
 while (!(i=WaitOneShotFin())) {}
 SoundOff();

 printf("\nPlaying song 2...");
 NewSndReset(1L);
 SoundOn();
 while (!(i=WaitOneShotFin())) {}
 SoundOff();

 printf("\nPlaying song 3...");
 NewSndReset(2L);
 SoundOn();
 while (!(i=WaitOneShotFin())) {}
 SoundOff();
 
 printf("\nPlaying song 2 for 2 seconds...");
 NewSndResetOneshot(LOOP,1L);   /* Overrule oneshot value given to NewLoadAndINit() */
 SoundOn();                     /* for THIS time only! */
 Delay(50*2);
 FadeSnd(120);                  /* fade out ...                 */
 printf("\nFading...");
 while (!(i=WaitFade())) {}     /* wait for fade to finish      */
 SoundOff();

 printf("\n");

 RemoveAllSongs();     /* free memory of all songs     */
 GeneralSndRemove();   /* remove interrupt handler     */
 UnlockAudio();        /* unlock audio.device */

 CloseLibrary(MMV8Base);

}

