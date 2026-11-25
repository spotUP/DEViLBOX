# Converts the bbmp clean-room tables.txt (AXS) into axs_tables.h. Usage: python3 -I gen_tables.py tables.txt out.h
import sys, re
src, out = sys.argv[1], sys.argv[2]
tabs, cur = {}, None
for line in open(src):
    m = re.match(r'^\[(\w+)\]', line)
    if m:
        cur = m.group(1); tabs[cur] = []; continue
    if cur: tabs[cur] += line.split()
FLOATS = {'Q12', 'GAIN12', 'Q24', 'GAIN24', 'PITCH_RATIO', 'W0'}
UNS = {'PITCH_COARSE', 'PITCH_FINE', 'AMP_ATTACK', 'AMP_DECAY', 'FENV_ATTACK', 'FENV_DECAY'}
with open(out, 'w') as f:
    f.write('/* Generated from bbmp axs clean-room tables.txt (GPL-3.0-or-later) by tools/gen_tables.py. */\n#pragma once\n#include <stdint.h>\n')
    for name, vals in tabs.items():
        if name in FLOATS:
            f.write('static const uint32_t T_%s_BITS[%d] = {%s};\n' % (name, len(vals), ','.join('0x' + v for v in vals)))
        else:
            t = 'uint32_t' if name in UNS else 'int32_t'
            f.write('static const %s T_%s[%d] = {%s};\n' % (t, name, len(vals), ','.join(v + ('u' if t == 'uint32_t' else '') for v in vals)))
