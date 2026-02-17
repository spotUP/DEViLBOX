#!/usr/bin/env python3
"""Generate a minimal silent MP3 file for iOS audio unlock."""
import base64
import os

# Minimal valid silent MP3 - MPEG1 Layer3 frame with LAME tag
b64 = "//uQxAAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ=="

data = base64.b64decode(b64)
out = os.path.join(os.path.dirname(__file__), "..", "public", "silent.mp3")
with open(out, "wb") as f:
    f.write(data)
print(f"Created {out} ({len(data)} bytes)")
