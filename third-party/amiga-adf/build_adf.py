#!/usr/bin/env python3
"""Build a bootable DEViLBOX ADF: bootblock trackloader + UADE glue + player + module slot.

Run through the build queue:
  ~/.claude/bin/buildq --purpose "<who>: <task>" -- python3 build_adf.py --module x.mod --out dir

The player is the one eagleplayer.conf names for the module (prefix, then
content via uade123), or --player NAME. Output: <out>/devilbox.adf and <out>/layout.json. The layout names the module
slot's disk offset and maximum size and the disk offset of the big-endian
length word the browser patches together with the slot.
"""
import argparse, hashlib, json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
UADE_ROOT = os.path.join(HERE, '..', 'uade-3.05')
sys.path.insert(0, os.path.join(HERE, 'tools'))
import uade_lookup, uade_arena_table  # noqa: E402
ADF_SIZE = 80 * 2 * 11 * 512
IMG_DISK = 1024
# Per-target memory map: the image (code + data + slot) and its BSS go in IMG_BASE..IMG_END,
# the zeroed chip arena in CHIP_BASE..CHIP_END. Low chip below CHIP_BASE holds
# Exec/graphics/trackdisk buffers.
TARGETS = {
    # A500: 512K chip + 512K trapdoor slow RAM; Exec owns the bottom of the slow RAM at boot.
    'a500': dict(IMG_BASE=0xC18000, IMG_END=0xC80000, CHIP_BASE=0x1C000, CHIP_END=0x80000),
    # A1200: 2 MB chip, no slow RAM at $C00000; image in the upper chip megabyte.
    'a1200': dict(IMG_BASE=0x100000, IMG_END=0x200000, CHIP_BASE=0x1C000, CHIP_END=0x100000),
}
MIN_CPU_TSV = os.path.join(HERE, 'amiga', 'uade_player_min_cpu.tsv')
SLOT_BYTES = 224 * 1024       # default max module size; the chip arena is sized for it
POOL_BYTES = 65536            # for players uade_arena_sizes.tsv has not measured (PTK-Prowiz)
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


# PTK-Prowiz also parses its eagleoption "type:xxxx" from an even buffer (hunk 0
# +$8AE): `cmpi.l #'type',(a0)+ / bne / addq.l #1,a0 / cmpi.l #'st20',(a0)`, a long
# compare at the odd value (+$8B3). Reachable since the glue answers eagleoptions;
# a 68000 takes an address error (measured 2026-11-19: ADRE, PC $1D578, access
# $1D8BB). Fix: score fills the buffer through the option tag list pointer (+$896),
# so move that to +$8AF and the value lands even at +$8B4; the parse then checks
# 'ype:' at +$8B0 and the addq becomes a nop. Same lengths, relocs untouched.
PTK_OPTBUF_PTR = (bytes.fromhex('00000001000008ce000008db000008ae'), bytes.fromhex('00000001000008ce000008db000008af'))
PTK_OPTPARSE = (bytes.fromhex('41f9000008ae0c98747970656600016452880c90'),
                bytes.fromhex('41f9000008b00c987970653a660001644e710c90'))


def patch_player_for_68000(path):
    b = open(path, 'rb').read()
    for old, new, what in ((PTK_CHKFAIL_WORD, PTK_CHKFAIL_BYTE, 'pt_chkfail store'),
                           PTK_OPTBUF_PTR + ('option buffer pointer',),
                           PTK_OPTPARSE + ('type option parse',)):
        if b.count(old) == 1:
            b = b.replace(old, new)
        elif new not in b:
            sys.exit(f'{path}: PTK-Prowiz {what} not found; the player changed, re-check its 68000 safety')
    open(path, 'wb').write(b)


def source_hashes(player):
    """sha256 of everything a template is built from: this tool tree (glue, score,
    boot, stager, tables) plus UADE's score includes, and the player binary.
    tools/amiga-adf-staleness.py recomputes these against public/amiga-adf/manifest.json."""
    h = hashlib.sha256()
    for top in (HERE, os.path.join(UADE_ROOT, 'amigasrc', 'score')):
        for d, dirs, files in sorted(os.walk(top)):
            dirs[:] = sorted(x for x in dirs if x != '__pycache__')
            for f in sorted(files):
                if f == 'README.md' or f.endswith('.pyc'):
                    continue
                path = os.path.join(d, f)
                h.update(os.path.relpath(path, top).encode() + b'\0')
                h.update(hashlib.sha256(open(path, 'rb').read()).digest())
    ply = hashlib.sha256(open(os.path.join(UADE_ROOT, 'players', player), 'rb').read()).hexdigest()
    return {'tool': h.hexdigest(), 'player': ply}


def publish(adf_path, layout, pub_dir, name=None):
    """Copy the ADF to <pub_dir>/<name or player>.adf and upsert its manifest.json entry.
    A second build of one player (another target) needs a name; the entry then records its `player`."""
    os.makedirs(pub_dir, exist_ok=True)
    key = name or layout['player']
    name = key + '.adf'
    shutil.copyfile(adf_path, os.path.join(pub_dir, name))
    man_path = os.path.join(pub_dir, 'manifest.json')
    man = json.load(open(man_path)) if os.path.exists(man_path) else {'templates': {}}
    mem = layout['memory']
    man['templates'][key] = {
        **({'player': layout['player']} if key != layout['player'] else {}),
        'adf': name,
        'adfSha256': hashlib.sha256(open(adf_path, 'rb').read()).hexdigest(),
        'target': layout['target'],
        'cpu': '68020' if layout['target'] == 'a1200' else '68000',
        'moduleSlot': layout['moduleSlot'],
        'moduleLengthWord': layout['moduleLengthWord'],
        'chipArenaBytes': int(mem['CHIP_LEN'], 16),
        'memory': mem,
        'provenWith': layout['stagedModule'],
        'sources': source_hashes(layout['player']),
    }
    man['templates'] = dict(sorted(man['templates'].items()))
    with open(man_path, 'w') as fh:
        json.dump(man, fh, indent=2)
        fh.write('\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--module', required=True, help='module file; stage it from a directory holding only it')
    ap.add_argument('--out', required=True)
    ap.add_argument('--player', help='eagleplayer.conf player name; default: what the module matches')
    ap.add_argument('--slot-bytes', type=int, default=SLOT_BYTES)
    ap.add_argument('--publish', metavar='DIR', help='also copy the ADF to DIR/<player>.adf and update DIR/manifest.json '
                    '(only for templates proven on the target)')
    ap.add_argument('--publish-name', help='manifest key and file stem when it is not the player name (MED-A1200)')
    ap.add_argument('--target', choices=sorted(TARGETS),
                    help='default: a1200 for players in uade_player_min_cpu.tsv, else a500')
    a = ap.parse_args()
    entry = uade_lookup.lookup(a.module, UADE_ROOT, a.player)
    player = entry['player']
    # UADE ignores the end report of these players (SONG_END_NOT_POSSIBLE -> $12C = 0); match it.
    asm = ASM + (['-DUADE_NO_SONG_END=1'] if {'broken_song_end', 'no_ep_end_detect'} & set(entry.get('flags', [])) else [])
    # EMS / EMS-6 modules have no magic and no text fields: screen.s must not print the MOD layout.
    asm += ['-DNOTEXT=1'] if player in ('EMS', 'EMS-6') else []
    needs_020 = {l.split('\t')[0] for l in open(MIN_CPU_TSV) if l.strip() and not l.startswith('#')}
    target = a.target or ('a1200' if player in needs_020 else 'a500')
    t = TARGETS[target]
    IMG_BASE, IMG_END, CHIP_BASE, CHIP_END = t['IMG_BASE'], t['IMG_END'], t['CHIP_BASE'], t['CHIP_END']
    slot_bytes = a.slot_bytes
    # A measured player gets the stager's per-player sizes (high-water + margin);
    # an unmeasured one keeps the phase-1 64K/64K, which PTK-Prowiz was proven with.
    sizes_args = [] if player in uade_arena_table.load() else [
        '--pool-bytes', str(POOL_BYTES), '--any-bytes', str(ANY_BYTES)]
    out = os.path.abspath(a.out)
    stage = os.path.join(out, 'stage')
    shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(stage)
    print(run([sys.executable, os.path.join(HERE, 'tools', 'uade_stage.py'), '--module', a.module,
               '--uade-root', UADE_ROOT, '--outdir', stage]
              + (['--player', a.player] if a.player else []) + sizes_args).strip())

    if player == 'PTK-Prowiz':
        patch_player_for_68000(os.path.join(stage, 'current.uadeplayer'))

    # The slot: UADE_MODULE_BYTES sizes the arena for the largest module the slot
    # takes; _uade_module_len carries the real length and is what the browser patches.
    mod = open(os.path.join(stage, 'current.uademod'), 'rb').read()
    if len(mod) > slot_bytes:
        sys.exit(f'module is {len(mod)} B, slot holds {slot_bytes} B')
    open(os.path.join(stage, 'current.uademod'), 'wb').write(mod + bytes(slot_bytes - len(mod)))
    sizes = os.path.join(stage, 'uade_sizes.i')
    s = open(sizes).read()
    s, n = re.subn(r'^UADE_MODULE_BYTES\s+equ\s+\d+', f'UADE_MODULE_BYTES       equ     {slot_bytes}', s, flags=re.M)
    assert n == 1, 'uade_sizes.i: no UADE_MODULE_BYTES line'
    open(sizes, 'w').write(s + f'UADE_MODULE_LEN         equ     {len(mod)}\n')

    inc = ['-I', HERE, '-I', os.path.join(HERE, 'score'), '-I', stage,
           '-I', os.path.join(UADE_ROOT, 'amigasrc', 'score')]
    objs = []
    for src in ('amiga/uade_probe.s', 'amiga/uade_glue.s', 'amiga/input_sdk.s', 'amiga/screen.s'):
        o = os.path.join(stage, os.path.basename(src) + '.o')
        run(asm + inc + ['-o', o, os.path.join(HERE, src)], cwd=HERE)
        objs.append(o)

    ld = os.path.join(stage, 'adf.ld')
    open(ld, 'w').write(f"""MEMORY {{
  chipram : org = 0x{CHIP_BASE:X}, len = 0x{CHIP_END - CHIP_BASE:X}
  imgram : org = 0x{IMG_BASE:X}, len = 0x{IMG_END - IMG_BASE:X}
}}
SECTIONS {{
  chip : {{ *(uadechip) . = ALIGN(4); _chip_end = .; }} > chipram
  image : {{ *(code) *(text) *(uadesoundcore) *(data) *(uadedata) . = ALIGN(512); _img_end = .; }} > imgram
  bss : {{ *(uadelowbss) *(uadeany) *(uadestack) . = ALIGN(4); _bss_end = .; }} > imgram
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
    # vlink merges the (zero) bss into .image when _img_end lands exactly on a 512 boundary
    assert not any(image[img_len:]), 'non-zero bytes past _img_end'
    image = image[:img_len] + bytes(max(0, img_len - len(image)))
    assert len(image) == img_len, (len(image), img_len)
    if sym['_bss_end'] > IMG_END or sym['_chip_end'] > CHIP_END:
        sys.exit(f"memory overflow ({target}): bss_end {sym['_bss_end']:#x} chip_end {sym['_chip_end']:#x}"
                 + ('; try --target a1200' if target == 'a500' else ''))
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
        'player': player,
        'target': target,
        'moduleSlot': {'diskOffset': slot_off, 'maxBytes': slot_bytes},
        'moduleLengthWord': {'diskOffset': len_off, 'bytes': 4, 'endian': 'big'},
        'bootblock': {'diskOffset': 0, 'bytes': 1024, 'checksumOffset': 4,
                      'note': 'the slot is outside the bootblock, so patching it keeps the checksum valid'},
        'memory': {k: f'0x{v:X}' for k, v in defs.items()},
        'stagedModule': {'name': os.path.basename(a.module), 'bytes': len(mod)},
    }
    json.dump(layout, open(os.path.join(out, 'layout.json'), 'w'), indent=2)
    print(json.dumps(layout, indent=2))
    if a.publish:
        publish(os.path.join(out, 'devilbox.adf'), layout, a.publish, a.publish_name)


if __name__ == '__main__':
    main()
