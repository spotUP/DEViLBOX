-- MAME sms / gamegear write tap: SN76489 writes (Z80 I/O ports 0x40-0x7F) as "<time> Z 7F11 <val>",
-- the address tools/md-phase0/events.py decodes as the PSG, so ROM and Furnace VGM decode through one path.
local out = assert(io.open(os.getenv("TAPOUT"), "w"))
out:setvbuf("line")  -- -seconds_to_run exits without closing Lua files
taps = {}  -- global: a local table is collected after the autoboot chunk returns
local io_space = manager.machine.devices[":maincpu"].spaces["io"]
taps[1] = io_space:install_write_tap(0x40, 0x7F, "psg", function(o, d)
  out:write(string.format("%.6f Z 7F11 %02X\n", manager.machine.time:as_double(), d & 0xff))
end)
