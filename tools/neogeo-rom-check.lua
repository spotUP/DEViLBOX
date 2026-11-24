-- YM2610 write tap on the Neo Geo Z80 io space; one line per write: "<sec> <port 0-3> <hex data>"; also sound commands from the 68k.
local out = io.open(os.getenv("TAP_OUT"), "w")
local zio = manager.machine.devices[":audiocpu"].spaces["io"]
local function now() return manager.machine.time:as_double() end
tap_ym = zio:install_write_tap(0x0000, 0xffff, "ym", function(offset, data, mask)
  local lo = offset & 0xff
  if lo >= 0x04 and lo <= 0x07 then out:write(string.format("%.5f %d %02x\n", now(), lo & 3, data & 0xff)) end
end)
tap_cmd = zio:install_write_tap(0x0000, 0xffff, "ack", function(offset, data, mask)
  if (offset & 0xff) == 0x0c and (data & 0x80) ~= 0 then out:write(string.format("%.5f C %02x\n", now(), data & 0x7f)) end
end)
emu.add_machine_stop_notifier(function() out:close() end)
