;; Placeholder for the `tad-compiler ca65-export --lorom` output: same symbols, same LoadAudioData
;; code (copied from the compiler's export), a zero-filled audio region instead of the real .bin.
;; tools/build-tad-player.sh assembles this; tadPlayerRom.ts overwrites the region at export time.
.setcpu "65816"
.export LoadAudioData: Far
.export Tad_Loader_Bin := __Tad_AudioData_0 + 0
.export Tad_Loader_SIZE = TAD_LOADER_SIZE
.export Tad_AudioDriver_Bin := __Tad_AudioData_0 + TAD_LOADER_SIZE
.export Tad_AudioDriver_SIZE = TAD_DRIVER_SIZE
Tad_DataTable := __Tad_AudioData_0 + TAD_LOADER_SIZE + TAD_DRIVER_SIZE
N_DATA_ITEMS = SENTINEL_DATA_ITEMS
AUDIO_DATA_BANK = .bankbyte(__Tad_AudioData_0)
.import TAD_IO_VERSION
.assert TAD_IO_VERSION = 20, lderror, "TAD_IO_VERSION in audio driver does not match TAD_IO_VERSION in tad-audio.s"

.segment "RODATA2"
.a8
.i16
;; DB unknown
.proc LoadAudioData
    .assert .not .defined(HIROM), error, "HIROM is defined in code designed for LOROM"

    .assert N_DATA_ITEMS > 1, error, "No common audio data"

    cmp     #N_DATA_ITEMS
    bcc     @ValidInput
        ; return false
        clc
        rtl
@ValidInput:

    rep     #$30
.a16
    and     #$ff

    pha

    asl
    ; carry clear
    adc     1,s
    tax

    ; Calculate data size
    ; ASSUMES data size > 0 and <= $ffff
    lda     f:Tad_DataTable+3,x
    sec
    sbc     f:Tad_DataTable,x
    tay

    lda     f:Tad_DataTable,x
    cmp     #$8000
    ora     #$8000
    sta     1,s

    ; carry = bit 0 of bank byte

    sep     #$20
.a8
    lda     f:Tad_DataTable+2,x
    rol
    clc
    adc     #AUDIO_DATA_BANK

    plx

    sec
    rtl
.endproc

__Tad_AudioData_0: .incbin "zero.bin", 0, $8000 - 51
.assert .sizeof(LoadAudioData) = 51, error

.segment "RODATA3"
  .incbin "zero.bin", 0, $8000
.segment "RODATA4"
  .incbin "zero.bin", 0, $8000
.segment "RODATA5"
  .incbin "zero.bin", 0, $8000
.segment "RODATA6"
  .incbin "zero.bin", 0, $8000
.segment "RODATA7"
  .incbin "zero.bin", 0, $8000
