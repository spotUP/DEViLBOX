; Explicit XDEF for EaglePlayer entry points that aren't XDEF'd in the source
; This causes the transpiler to promote them to top-level C functions.
    XDEF    InitPlayer
    XDEF    EndPlayer
    XDEF    InitSound
    XDEF    EndSound
    XDEF    Interrupt
    XDEF    Check2
    XDEF    ExtLoad
    XDEF    NewModuleInfo
    XDEF    SetVolume
    XDEF    SetBalance
    XDEF    SetVoices
    XDEF    StructInit
