/*
 * This tiny program is a
 * little demonstration
 * how to deal with Guru Meditations
 * Link with GuruGoodBye.o or AJ.Lib
 * This usefull programming help was
 * made up, designed, programmed,
 * and finally brought to you by AJ
 * from ACTIVAS !
 * It also is  (a) AWC 1988
 */

quit(mes)char *mes;                    /* You'll get a string */
{ Write(Output(),mes,strlen(mes));       /* Which tells you */
  FreeGurus();                            /* what happened */
  exit(0);
}
main()
{ CatchGurus(quit);  /* Trap 3,4,5,6,7,9,10 and 11 will cause */
#asm                               ; a call to quit
  jmp 1                 ; Show that it works, Generate a TRAP 3
#endasm
  Delay(200);           /* program will never reach this point */
}
