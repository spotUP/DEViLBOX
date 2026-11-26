-- MAME genesis write tap: YM2612 + SN76489 writes from both CPUs, one line per byte: "<time> <cpu> <addr> <val>".
local out = assert(io.open(os.getenv("TAPOUT"), "w"))
out:setvbuf("line")  -- -seconds_to_run exits without closing Lua files; unflushed tail was lost
taps = {}  -- global: a local table is collected after the autoboot chunk returns and the taps vanish (~0.5 s in)
local function now() return manager.machine.time:as_double() end
local m = manager.machine.devices[":maincpu"].spaces["program"]
local function w16(tag) return function(o, d, mk)
  if (mk & 0xff00) ~= 0 then out:write(string.format("%.6f M %X %02X\n", now(), o & ~1, (d >> 8) & 0xff)) end
  if (mk & 0x00ff) ~= 0 then out:write(string.format("%.6f M %X %02X\n", now(), o | 1, d & 0xff)) end
end end
taps[#taps+1] = m:install_write_tap(0xA04000, 0xA04003, "ym68k", w16())
taps[#taps+1] = m:install_write_tap(0xC00010, 0xC00011, "psg68k", w16())
local zd = manager.machine.devices[":genesis_snd_z80"]
if zd then
  local z = zd.spaces["program"]
  local function w8(o, d) out:write(string.format("%.6f Z %X %02X\n", now(), o, d & 0xff)) end
  taps[#taps+1] = z:install_write_tap(0x4000, 0x4003, "ymz80", w8)
  taps[#taps+1] = z:install_write_tap(0x7F11, 0x7F11, "psgz80", w8)
  taps[#taps+1] = z:install_write_tap(0x0E02, 0x0E1F, "pcmz80", function(o, d) out:write(string.format("%.6f P %X %02X\n", now(), o, d & 0xff)) end)
else out:write("# no :genesis_snd_z80 device\n") end
taps[#taps+1] = m:install_write_tap(0xA00E02, 0xA00E1F, "pcm68k", function(o, d, mk)
  if (mk & 0xff00) ~= 0 then out:write(string.format("%.6f Q %X %02X\n", now(), o & ~1, (d >> 8) & 0xff)) end
  if (mk & 0x00ff) ~= 0 then out:write(string.format("%.6f Q %X %02X\n", now(), o | 1, d & 0xff)) end
end)
