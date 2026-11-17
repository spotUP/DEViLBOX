// One-off macOS rasterizer for the hardware player screens: renders ASCII 0x20-0x5F into 8x8 1-bit glyphs and the brand text into a 32x16 logo
// bitmap, from a TrueType font file (default ProggyClean from the vendored Furnace sources). Output is the source data for assets.ts:
//   swift tools/hwplayer/rasterize-font.swift > tools/hwplayer/font8x8.json
// Glyph rows are bytes, bit 7 = leftmost pixel. Coverage threshold and baseline are the only knobs below.
import CoreText
import CoreGraphics
import Foundation

let fontPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "third-party/furnace-master/res/fonts/ProggyClean.ttf"
let GLYPH_PT: CGFloat = 10, LOGO_PT: CGFloat = 14, THRESHOLD: UInt8 = 110, BASELINE = 1

let url = URL(fileURLWithPath: fontPath) as CFURL
let descs = CTFontManagerCreateFontDescriptorsFromURL(url) as! [CTFontDescriptor]
func render(_ text: String, size: CGFloat, w: Int, h: Int, baseline: Int) -> [[Bool]] {
  let font = CTFontCreateWithFontDescriptor(descs[0], size, nil)
  var buf = [UInt8](repeating: 0, count: w * h)
  let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
  ctx.setShouldAntialias(true); ctx.setFillColor(CGColor(gray: 1, alpha: 1))
  let attr = NSAttributedString(string: text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font, NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String): true])
  ctx.textPosition = CGPoint(x: 0, y: baseline)
  CTLineDraw(CTLineCreateWithAttributedString(attr), ctx)
  return (0..<h).map { y in (0..<w).map { x in buf[(h - 1 - y) * w + x] >= THRESHOLD } }
}
func rows(_ px: [[Bool]], x0: Int, w: Int) -> [Int] { px.map { r in (0..<w).reduce(0) { $0 | (r[x0 + $1] ? 0x80 >> $1 : 0) } } }
// Calibrate on "H": pick the point size whose cap height is 7 rows, then crop every glyph so H's top row lands on row 0 (row 7 stays blank).
func ink(_ px: [[Bool]]) -> (top: Int, bottom: Int)? { let r = px.indices.filter { px[$0].contains(true) }; return r.isEmpty ? nil : (r.first!, r.last!) }
var pt: CGFloat = 8, top = 0
for cand in stride(from: 6.0, through: 20.0, by: 0.5) {
  if let b = ink(render("H", size: CGFloat(cand), w: 16, h: 16, baseline: 4)), b.bottom - b.top + 1 == 7 { pt = CGFloat(cand); top = b.top; break }
}
var glyphs: [[Int]] = []
for c in 0x20...0x5F {
  let px = render(String(UnicodeScalar(UInt8(c))), size: pt, w: 16, h: 16, baseline: 4)
  glyphs.append(rows(Array(px[top..<(top + 8)]), x0: 0, w: 8))
}
let logoPx = render("DEVIL", size: LOGO_PT, w: 32, h: 16, baseline: 4)
var logo: [[Int]] = []
for ty in 0..<2 { for tx in 0..<4 { logo.append(rows(Array(logoPx[(ty * 8)..<(ty * 8 + 8)]), x0: tx * 8, w: 8)) } }
let out: [String: Any] = ["font": fontPath, "glyphPt": Double(pt), "glyphs": glyphs, "logo": logo, "logoText": "DEVIL"]
print(String(data: try! JSONSerialization.data(withJSONObject: out, options: [.sortedKeys]), encoding: .utf8)!)
