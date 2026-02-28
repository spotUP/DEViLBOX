#ifdef LATTICE
LONG __asm InitPlayer(void);
void __asm RemPlayer(void);
void __asm PlayModule(register __a0 struct MMD0 *);
void __asm ContModule(register __a0 struct MMD0 *);
void __asm StopPlayer(void);
void __asm DimOffPlayer(register __d0 UWORD);
void __asm ResetMIDI(void);
void __asm SetTempo(register __d0 UWORD);
struct MMD0 * __asm LoadModule(register __a0 char *);
void __asm RelocModule(register __a0 struct MMD0 *);
void __asm UnLoadModule(register __a0 struct MMD0 *);
#endif
