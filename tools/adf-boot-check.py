#!/usr/bin/env python3
"""Boot-check Amiga player ADFs (third-party/amiga-adf, public/amiga-adf) in the Amiberry fork.

  python3 tools/adf-boot-check.py public/amiga-adf/Anders_0land.adf --purpose "DEViLBOX ADF agent N: boot check"
  python3 tools/adf-boot-check.py A.adf B.adf [--only NAME] [--failed] [--ref uade.wav] [--target a500|a1200]

Per ADF: starts ONLY the fork /Users/spot/Code/Emulators/amiberry/build/Amiberry.app (headless, small
window, never /Applications, never fs-uae), finds its IPC socket by that pid, proves the disk is inserted
with `lsof -p <pid> | grep -i adf`, then reads over IPC:
  - the stage crumb at chip $400 (4 ASCII bytes; "PLAY" when the player runs; "ADRE"/"BUSE" = crash),
  - DMACONR ($DFF002) 6 x 0.7 s starting 8 s after PLAY (audio DMA bits 0-3),
and records the Paula mix with AUDIO_RECORD, giving per-second peak and RMS.
--ref <wav> (e.g. `npx tsx tools/uade-audit/render-devilbox.ts <song> ref.wav`): onset-aligned whole-file
RMS/peak delta in dB, both folded to mono as (L+R)/2.
Verdict PASS = PLAY seen, no crash crumb, DMA bit on in >=1 poll, WAV peak > 200 in each of the last 3 s.
Results are stored per ADF name in test-data/adf-boot-check.json (resumable: finished PASS rows are
skipped unless named with --only; --failed re-runs only non-PASS rows). The kill only targets the pid
this script started. Target (a500 = 68000/KS1.3, a1200 = AGA/68020/KS3.1) comes from
public/amiga-adf/manifest.json by ADF file name, or --target.
"""
import argparse, json, os, re, subprocess, sys, tempfile, time, wave, socket
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORK = "/Users/spot/Code/Emulators/amiberry/build/Amiberry.app/Contents/MacOS/Amiberry"
KICK = "/Users/spot/Code/UpRough/Up_Rough_Demo_System/web/maker/public/puae"
RESULTS = os.path.join(ROOT, "test-data", "adf-boot-check.json")
MANIFEST = os.path.join(ROOT, "public", "amiga-adf", "manifest.json")

COMMON = """use_gui=no
cpu_speed=real
bogomem_size=2
fastmem_size=0
nr_floppies=1
floppy0type=0
floppy_speed=800
sound_output=exact
sound_volume=0
gfx_fullscreen_amiga=false
"""
CFG = {
    "a500": "kickstart_rom_file=%s/kick34005.A500\nchipset=ocs\ncpu_type=68000\ncpu_model=68000\n"
            "cpu_compatible=true\ncycle_exact=true\nchipmem_size=1\ngfx_width=360\ngfx_height=284\n" % KICK,
    "a1200": "kickstart_rom_file=%s/kick40068.A1200\nchipset=aga\ncpu_type=68020\ncpu_model=68020\n"
             "cpu_compatible=true\ncycle_exact=true\nchipmem_size=4\nsound_filter=off\nsound_interpol=none\n"
             "blitter_cycle_exact=true\ncpu_cycle_exact=true\ngfx_width=360\ngfx_height=284\n" % KICK,
}


def ipc(sock, cmd, timeout=6):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        s.settimeout(timeout); s.connect(sock); s.sendall((cmd + "\n").encode())
        return s.recv(65536).decode(errors="replace").strip()
    finally:
        s.close()


def own_socket(pid, timeout=40):
    # A second Amiberry auto-numbers its socket, so match by owning pid, never by the base path.
    end = time.time() + timeout
    while time.time() < end:
        for p in subprocess.run("ls /tmp/amiberry*.sock 2>/dev/null", shell=True, capture_output=True, text=True).stdout.split():
            if str(pid) in subprocess.run(["lsof", "-t", p], capture_output=True, text=True).stdout.split():
                return p
        time.sleep(1)
    return None


def rd(sock, addr, width):
    return int(ipc(sock, "READ_MEM\t%d\t%d" % (addr, width)).split()[-1])


def load_mono(path):
    w = wave.open(path)
    a = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64)
    a = a.reshape(-1, w.getnchannels())
    return a.mean(1) if a.shape[1] > 1 else a[:, 0], w.getframerate(), a  # (L+R)/2 mono fold


def wav_stats(path):
    mono, sr, raw = load_mono(path)
    per = []
    for i in range(0, len(mono), sr):
        seg = raw[i:i + sr]
        per.append({"peak": int(np.abs(seg).max()), "rms": round(float(np.sqrt((seg ** 2).mean())), 1)})
    return mono, sr, per


def onset(m, thr=300):
    i = np.argmax(np.abs(m) > thr)
    return int(i) if np.abs(m).max() > thr else 0


def ref_delta(mono, sr, refpath):
    ref, rsr, _ = load_mono(refpath)
    a, b = mono[onset(mono):], ref[onset(ref):]
    n = int(min(len(a) / sr, len(b) / rsr) * min(sr, rsr))
    if n <= 0:
        return None
    a = a[:int(n / min(sr, rsr) * sr)]; b = b[:int(n / min(sr, rsr) * rsr)]
    db = lambda x, y: round(20 * np.log10(max(x, 1e-9) / max(y, 1e-9)), 2)
    rms = lambda x: float(np.sqrt((x ** 2).mean()))
    return {"seconds": round(n / min(sr, rsr), 1), "rms_delta_db": db(rms(a), rms(b)),
            "peak_delta_db": db(np.abs(a).max(), np.abs(b).max())}


def check(adf, purpose, target, ref, keep_wav):
    work = tempfile.mkdtemp(prefix="adfbc-")
    name = os.path.basename(adf)
    cfg, wav = os.path.join(work, "run.uae"), os.path.join(work, "rec.wav")
    open(cfg, "w").write("config_description=%s\nfloppy0=%s\n" % (purpose, os.path.abspath(adf)) + COMMON + CFG[target])
    p = subprocess.Popen([FORK, "-f", cfg, "-G"], stdout=open(wav + ".log", "w"), stderr=subprocess.STDOUT)
    r = {"adf": name, "target": target, "pid": p.pid, "time": time.strftime("%Y-%m-%d %H:%M:%S")}
    try:
        sock = own_socket(p.pid)
        r["socket"] = sock
        if not sock:
            raise RuntimeError("no IPC socket for pid %d" % p.pid)
        time.sleep(4)
        lsof = subprocess.run("lsof -p %d | grep -i '[.]adf$'" % p.pid, shell=True, capture_output=True, text=True).stdout.strip()
        r["lsof"] = lsof
        print("pid %d  lsof: %s" % (p.pid, lsof or "(NOT INSERTED)"), flush=True)
        if not lsof:
            raise RuntimeError("ADF not open in the emulator pid")
        ipc(sock, "AUDIO_RECORD\t" + wav)
        t0, tplay, crumb = time.time(), None, b""
        while time.time() - t0 < 90:
            c = rd(sock, 0x400, 4).to_bytes(4, "big")
            if c != crumb:
                crumb = c; print("%.1f s crumb %r" % (time.time() - t0, c), flush=True)
            if c in (b"ADRE", b"BUSE"):
                r["crash"] = c.decode(); r["crash_pc"] = "%08x" % rd(sock, 0x40E, 4); break
            if c == b"PLAY" and tplay is None:
                tplay = time.time(); r["play_s"] = round(tplay - t0, 1)
            if tplay and time.time() - tplay > 8:
                break
            time.sleep(0.2)
        r["dmaconr"] = []
        if tplay:
            for _ in range(6):
                r["dmaconr"].append("%04X" % rd(sock, 0xDFF002, 2)); time.sleep(0.7)
        ipc(sock, "AUDIO_RECORD\toff"); time.sleep(0.5)
        mono, sr, per = wav_stats(wav)
        r["peak_rms_per_s"] = per
        if ref:
            r["ref_delta"] = ref_delta(mono, sr, ref)
        dma = any(int(x, 16) & 0xF for x in r["dmaconr"])
        loud = len(per) >= 3 and all(s["peak"] > 200 for s in per[-3:])
        r["verdict"] = "PASS" if (tplay and "crash" not in r and dma and loud) else "FAIL"
        if keep_wav:
            r["wav"] = wav
    except Exception as e:  # noqa: BLE001
        r["error"] = str(e); r["verdict"] = "FAIL"
    finally:
        p.terminate()
        try:
            p.wait(5)
        except subprocess.TimeoutExpired:
            p.kill(); p.wait()
        if not keep_wav and os.path.exists(wav):
            os.remove(wav)
    return r


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("adf", nargs="+")
    ap.add_argument("--purpose", required=True, help="window title, e.g. 'DEViLBOX ADF agent N: boot check'")
    ap.add_argument("--target", choices=sorted(CFG))
    ap.add_argument("--ref", help="UADE.wasm reference WAV (single ADF)")
    ap.add_argument("--only", help="ADF base name (with or without .adf)")
    ap.add_argument("--failed", action="store_true", help="re-run only rows that are not PASS")
    ap.add_argument("--keep-wav", action="store_true")
    a = ap.parse_args()
    res = json.load(open(RESULTS)) if os.path.exists(RESULTS) else {}
    man = {t["adf"]: t["target"] for t in json.load(open(MANIFEST))["templates"].values()}
    for adf in a.adf:
        name = os.path.basename(adf)
        if os.path.basename(os.path.dirname(os.path.abspath(adf))).lower().endswith(".adf"):
            sys.exit("parent dir must not be named *.adf: " + adf)
        if a.only and a.only.replace(".adf", "") != name.replace(".adf", ""):
            continue
        old = res.get(name, {}).get("verdict")
        if a.failed and old == "PASS":
            continue
        if not a.only and not a.failed and old == "PASS":
            print("skip %s (PASS recorded)" % name); continue
        target = a.target or man.get(name, "a500")
        r = check(adf, a.purpose, target, a.ref, a.keep_wav)
        res[name] = r
        os.makedirs(os.path.dirname(RESULTS), exist_ok=True)
        json.dump(res, open(RESULTS, "w"), indent=1)
        print(json.dumps({k: v for k, v in r.items() if k != "peak_rms_per_s"}), flush=True)
        print("peak/rms per s:", [(s["peak"], s["rms"]) for s in r.get("peak_rms_per_s", [])])
        print("VERDICT %s %s" % (name, r["verdict"]))


if __name__ == "__main__":
    main()
