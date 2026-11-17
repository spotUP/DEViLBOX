-- Logs bus writes of all NES chip register ranges, DMC-region reads, then stops.
local FRAMES = 90
local cb = emu.callbackType
local ranges = {
  {0x4000,0x4017},{0x5000,0x5015},{0x9000,0xB003},
  {0x4040,0x408A},{0x4800,0x4800},{0xF800,0xF800},{0xC000,0xC000},{0xE000,0xE000},
  {0x4023,0x4023},{0x5FF8,0x5FFF},
}
local seen = {}
local function onWrite(addr, value)
  print(string.format("W %04X %02X", addr, value & 0xFF))
end
for _, r in ipairs(ranges) do
  emu.addMemoryCallback(onWrite, cb.write, r[1], r[2])
end
-- DMC sample region: reads in $CF00-$D0FF (code lives at $F000, so no overlap)
emu.addMemoryCallback(function(addr, value)
  print(string.format("R %04X %02X", addr, value & 0xFF))
end, cb.read, 0xCF00, 0xD0FF)
local n = 0
emu.addEventCallback(function()
  n = n + 1
  if n == 1 then
    local st = emu.getState()
    local keys = {}
    for k,_ in pairs(st) do keys[#keys+1]=k end
    table.sort(keys)
    print("STATEKEYS " .. table.concat(keys, ","))
  end
  if n >= FRAMES then print("DONE"); emu.stop(0) end
end, emu.eventType.endFrame)
