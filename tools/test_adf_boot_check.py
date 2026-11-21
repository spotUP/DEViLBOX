"""python3 tools/test_adf_boot_check.py -- savestate CRAM parser used by adf-boot-check --dump."""
import importlib.util, os, struct, tempfile, unittest, zlib

spec = importlib.util.spec_from_file_location("abc", os.path.join(os.path.dirname(__file__), "adf-boot-check.py"))
abc = importlib.util.module_from_spec(spec); spec.loader.exec_module(abc)


def chunk(name, data, comp):
    body = struct.pack(">I", len(data)) + zlib.compress(data) if comp else data
    return name + struct.pack(">II", len(body) + 12, 1 if comp else 0) + body + b"\0" * (4 - (len(body) & 3))  # save_chunk pads to 4


class CramFromState(unittest.TestCase):
    def roundtrip(self, comp):
        chip = bytes(range(256)) * 2048  # 512 KB
        blob = b"ASF \0\0\0\0" + chunk(b"CPU ", b"x" * 12, False) + chunk(b"CRAM", chip, comp) + chunk(b"BRAM", b"y" * 8, False)
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(blob)
        try:
            self.assertEqual(abc.cram_from_state(f.name), chip)
        finally:
            os.remove(f.name)

    def test_compressed(self):
        self.roundtrip(True)

    def test_uncompressed(self):
        self.roundtrip(False)


if __name__ == "__main__":
    unittest.main()
