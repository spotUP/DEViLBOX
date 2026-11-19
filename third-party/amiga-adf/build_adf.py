#!/usr/bin/env python3
"""Build a bootable DEViLBOX ADF: bootblock trackloader + UADE glue + player + module slot.

Run through the build queue:
  ~/.claude/bin/buildq --purpose "<who>: <task>" -- python3 build_adf.py --module x.mod --out dir

Output: <out>/devilbox.adf and <out>/layout.json. The layout names the module
slot's disk offset and maximum size and the disk offset of the big-endian
length word the browser patches together with the slot.
"""
import argparse, json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
UADE_ROOT = os.path.join(HERE, '..', 'uade-3.05')
ADF_SIZE = 80 * 2 * 11 * 512
IMG_DISK = 1024
IMG_BASE = 0xC18000           # A500 trapdoor slow RAM; Exec owns the bottom of it at boot
SLOW_END = 0xC80000
CHIP_BASE = 0x1C000           # chip arena; low chip below holds Exec/graphics/trackdisk buffers
CHIP_END = 0x80000
SLOT_BYTES = 224 * 1024       # max module size; the chip arena is sized for it
POOL_BYTES = 65536
ANY_BYTES = 65536
ASM = ['vasmm68k_mot', '-Fvobj', '-nowarn=62', '-quiet', '-no-opt', '-m68000',
       '-DAMIGA=1', '-DUADE_NATIVE=1', '-DUADE_PROBE=1']


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        sys.exit(f"FAILED: {' '.join(cmd)}\n{r.stdout[-3000:]}\n{r.stderr[-3000:]}")
    return r.stdout


# PTK-Prowiz Chk (EP_PTK-Prowiz.s:90) does `move.w #-1,pt_chkfail`, but pt_chkfail
# is a dc.b at an odd offset (hunk 0 +$1F7B). UADE emulates a 68020, where that is
# legal; a 68000 takes an address error (measured: ADRE, PC $1D430, access $1EF83).
# move.b #-1 is the same length, keeps the reloc at the same offset, and is
# equivalent: the word store's second byte (pt_restart) is cleared on the next line.
PTK_CHKFAIL_WORD = bytes.fromhex('33fcffff00001f7b')
PTK_CHKFAIL_BYTE = bytes.fromhex('13fc00ff00001f7b')


def patch_player_for_68000(path):
    b = open(path, 'rb').read()
    if b.count(PTK_CHKFAIL_WORD) == 1:
        open(path, 'wb').write(b.replace(PTK_CHKFAIL_WORD, PTK_CHKFAIL_BYTE))
    elif PTK_CHKFAIL_BYTE not in b:
        sys.exit(f'{path}: PTK-Prowiz pt_chkfail store not found; the player changed, re-check its 68000 safety')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--module', required=True, help='module file; stage it from a directory holding only it')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    stage = os.path.join(out, 'stage')
    shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(stage)
    print(run([sys.executable, os.path.join(HERE, 'tools', 'uade_stage.py'), '--module', a.module,
               '--uade-root', UADE_ROOT, '--outdir', stage,
               '--pool-bytes', str(POOL_BYTES), '--any-bytes', str(ANY_BYTES)]).strip())

    patch_player_for_68000(os.path.join(stage, 'current.uadeplayer'))

    # The slot: UADE_MODULE_BYTES sizes the arena for the largest module the slot
    # takes; _uade_module_len carries the real length and is what the browser patches.
    mod = open(os.path.join(stage, 'current.uademod'), 'rb').read()
    if len(mod) > SLOT_BYTES:
        sys.exit(f'module is {len(mod)} B, slot holds {SLOT_BYTES} B')
    open(os.path.join(stage, 'current.uademod'), 'wb').write(mod + bytes(SLOT_BYTES - len(mod)))
    sizes = os.path.join(stage, 'uade_sizes.i')
    s = open(sizes).read()
    s, n = re.subn(r'^UADE_MODULE_BYTES\s+equ\s+\d+', f'UADE_MODULE_BYTES       equ     {SLOT_BYTES}', s, flags=re.M)
    assert n == 1, 'uade_sizes.i: no UADE_MODULE_BYTES line'
    open(sizes, 'w').write(s + f'UADE_MODULE_LEN         equ     {len(mod)}\n')

    inc = ['-I', HERE, '-I', os.path.join(HERE, 'score'), '-I', stage,
           '-I', os.path.join(UADE_ROOT, 'amigasrc', 'score')]
    objs = []
    for src in ('amiga/uade_probe.s', 'amiga/uade_glue.s', 'amiga/input_sdk.s'):
        o = os.path.join(stage, os.path.basename(src) + '.o')
        run(ASM + inc + ['-o', o, os.path.join(HERE, src)], cwd=HERE)
        objs.append(o)

    ld = os.path.join(stage, 'adf.ld')
    open(ld, 'w').write(f"""MEMORY {{
  chipram : org = 0x{CHIP_BASE:X}, len = 0x{CHIP_END - CHIP_BASE:X}
  slowram : org = 0x{IMG_BASE:X}, len = 0x{SLOW_END - IMG_BASE:X}
}}
SECTIONS {{
  chip : {{ *(uadechip) . = ALIGN(4); _chip_end = .; }} > chipram
  image : {{ *(code) *(text) *(uadesoundcore) *(data) *(uadedata) . = ALIGN(512); _img_end = .; }} > slowram
  bss : {{ *(uadelowbss) *(uadeany) *(uadestack) . = ALIGN(4); _bss_end = .; }} > slowram
}}
""")
    img = os.path.join(stage, 'image.bin')
    mapf = os.path.join(stage, 'image.map')
    run(['vlink', '-brawbin2', '-T', ld, '-M' + mapf, '-o', img] + objs)
    sym = {}
    for m in re.finditer(r'0x([0-9a-fA-F]+)\s+(\w+)', open(mapf).read()):
        sym.setdefault(m.group(2), int(m.group(1), 16))
    need = ('_start', '_uade_module_len', '_uade_module_src', '_img_end', '_bss_end', '_chip_end')
    miss = [k for k in need if k not in sym]
    if miss:
        sys.exit(f'map lacks {miss}; see {mapf}')
    image = open(img + '.image', 'rb').read()   # rawbin2: first section to <out>, the rest to <out>.<section>
    img_len = sym['_img_end'] - IMG_BASE
    image = image + bytes(img_len - len(image))
    assert len(image) == img_len, (len(image), img_len)
    if sym['_bss_end'] > SLOW_END or sym['_chip_end'] > CHIP_END:
        sys.exit(f"memory overflow: bss_end {sym['_bss_end']:#x} chip_end {sym['_chip_end']:#x}")
    if IMG_DISK + img_len > ADF_SIZE:
        sys.exit('image does not fit the disk')

    boot = os.path.join(stage, 'boot.bin')
    defs = dict(IMG_BASE=IMG_BASE, IMG_LEN=img_len, IMG_DISK=IMG_DISK,
                BSS_BASE=sym['_img_end'], BSS_LEN=sym['_bss_end'] - sym['_img_end'],
                CHIP_BASE=CHIP_BASE, CHIP_LEN=sym['_chip_end'] - CHIP_BASE, ENTRY=sym['_start'])
    run(['vasmm68k_mot', '-Fbin', '-quiet', '-m68000', '-o', boot]
        + [f'-D{k}=${v:X}' for k, v in defs.items()] + [os.path.join(HERE, 'adf', 'adf_boot.s')])
    bb = bytearray(open(boot, 'rb').read())
    assert len(bb) <= 1024, f'bootblock {len(bb)} B'
    bb += bytes(1024 - len(bb))
    c = 0
    for i in range(0, 1024, 4):
        c += int.from_bytes(bb[i:i + 4], 'big')
        if c > 0xFFFFFFFF:
            c = (c + 1) & 0xFFFFFFFF
    bb[4:8] = ((~c) & 0xFFFFFFFF).to_bytes(4, 'big')

    adf = bytearray(ADF_SIZE)
    adf[0:1024] = bb
    adf[IMG_DISK:IMG_DISK + img_len] = image
    open(os.path.join(out, 'devilbox.adf'), 'wb').write(adf)

    slot_off = IMG_DISK + sym['_uade_module_src'] - IMG_BASE
    len_off = IMG_DISK + sym['_uade_module_len'] - IMG_BASE
    assert adf[slot_off:slot_off + len(mod)] == mod
    assert int.from_bytes(adf[len_off:len_off + 4], 'big') == len(mod)
    layout = {
        'adfBytes': ADF_SIZE,
        'player': 'PTK-Prowiz',
        'moduleSlot': {'diskOffset': slot_off, 'maxBytes': SLOT_BYTES},
        'moduleLengthWord': {'diskOffset': len_off, 'bytes': 4, 'endian': 'big'},
        'bootblock': {'diskOffset': 0, 'bytes': 1024, 'checksumOffset': 4,
                      'note': 'the slot is outside the bootblock, so patching it keeps the checksum valid'},
        'memory': {k: f'0x{v:X}' for k, v in defs.items()},
        'stagedModule': {'name': os.path.basename(a.module), 'bytes': len(mod)},
    }
    json.dump(layout, open(os.path.join(out, 'layout.json'), 'w'), indent=2)
    print(json.dumps(layout, indent=2))


if __name__ == '__main__':
    main()
