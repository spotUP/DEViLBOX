/* Audio Sculpture Amiga */
/* Example on how to use the replay routines from C */
/* Link this with ASREPLAY.O */
/* By Bjorn Wesen / The Synchron Assembly */

#include "exec/types.h"

main()
{

	APTR module,module2;
	APTR file,file2;
	
	module = (APTR)AllocMem(95110,2);	/* CHIP */
	module2 = (APTR)AllocMem(8336,0);	/* PUBLIC */

	file = (APTR)
	  Open("Audio Sculpture:Modules/mod.hardrock forever",1005);
	file2 = (APTR)
	  Open("Audio Sculpture:Modules/mod.hardrock forever.AS",1005);
	Read(file,module,95110);
	Read(file2,module2,8336);
	Close(file);
	Close(file2);

	StartReplay(module,module2);
	
	Delay(1000);
	
	EndReplay();
	
	FreeMem(module,95110);
	FreeMem(module2,8336);
	
}


