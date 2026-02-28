/*
 * This tiny little program
 * is just an example how
 * to use my music routines.
 * Link it with Zound.o
 * and it'll be able to play a song
 * This program was brought to you by
 * AJ from Activas. Enjoy it!
 *
 * Note: PlayZound now takes to arguments:
 * the first and the last part to be played.
 * specifying 0,0 means: play the song as last saved.
 * This parameter passing allows you to define
 * different tunes in one datafile
 * for example: the first tune could be
 * from part  0 to part 45  (* PlayZound(0x00,0x46); *) and the second tune
 * from part 46 to part 8e  (* PlayZound(0x46,0x8f); *)
 *
 */

main(argc,argv)int argc;char *argv[];
{ if(argc==3)
  { if(LoadZound(argv[1],argv[2]))    /* Try to Load music */
    { PlayZound(0,0);                 /* Start the music   */
      for(;(*(char *)0xbfe001)&64;);  /* Wait for LMB      */
      KillZound();                    /* Stop music        */
      QuitZound();                    /* Free memory       */
    }else AJMessage("\nIt won't work this way!\n");
  }else AJMessage("Usage:  LetsHearIt  <SongData>  <SampleDirectory>\n");
}
AJMessage(mes)char *mes;{Write(Output(),mes,strlen(mes));}
