/*
 * Player for packed TME-songfiles
 *
 *
 * Made December 1989 by N.J.
 *
 */

#define WaitTop() while (((*(long*)0xdff004)&0x1ff00)!=(0x30<<8))
#define LMB()     (!((*(char*)0xbfe001)&64))

quit(t) char *t;
{ if(t)printf("%s\n",t);
  MUSIC_Free();
  exit(0);
}

main(argc,argv) char *argv[];
{ register int tune=0;
  if(argc<3)quit("Usage: Play <packed song> <tunenr1> [tunenr2] ...");
  printf("TME Player V2.1  (1/1/90)\n-------------------------\n");
  if(!MUSIC_Load(argv[1])) quit("Can't load song!");
  for(tune=2;tune<argc;tune++)
  { printf("Playing tune %2ld ... (press LMB)\n",atol(argv[tune]));
    MUSIC_Play(atol(argv[tune]));
    while(!LMB())WaitTop();
    MUSIC_Stop();
    while(LMB())WaitTop();
  }
  quit(0);
}
