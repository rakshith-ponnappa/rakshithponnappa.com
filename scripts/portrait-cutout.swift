import Foundation
import CoreImage
import CoreImage.CIFilterBuiltins
import Vision
import ImageIO
import UniformTypeIdentifiers

// Real-pixel portrait: crop + person segmentation + background swap. No generative edits.
let args = CommandLine.arguments
let input = URL(fileURLWithPath: args[1]), output = URL(fileURLWithPath: args[2])
// crop rect in top-left image coordinates: x y w h
let cx = Double(args[3])!, cy = Double(args[4])!, cw = Double(args[5])!, ch = Double(args[6])!
let scale = Double(args[7]) ?? 3.0

let src = CIImage(contentsOf: input, options: [.applyOrientationProperty: true])!
let H = src.extent.height
let req = VNGeneratePersonSegmentationRequest()
req.qualityLevel = .accurate
req.outputPixelFormat = kCVPixelFormatType_OneComponent8
let handler = VNImageRequestHandler(ciImage: src, options: [:])
try handler.perform([req])
let maskPB = req.results!.first!.pixelBuffer
var mask = CIImage(cvPixelBuffer: maskPB)
mask = mask.transformed(by: CGAffineTransform(scaleX: src.extent.width / mask.extent.width, y: src.extent.height / mask.extent.height))
// Union with the subject-lifting mask, which keeps clothing details like the collar.
let fg = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([fg])
if let obs = fg.results?.first {
  let fgPB = try obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler)
  var fgMask = CIImage(cvPixelBuffer: fgPB)
  fgMask = fgMask.transformed(by: CGAffineTransform(scaleX: src.extent.width / fgMask.extent.width, y: src.extent.height / fgMask.extent.height))
  // keep only the region around the person so the tree/gifts aren't lifted
  let personBox = mask.applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: 6])
  let fgNear = fgMask.applyingFilter("CIMultiplyCompositing", parameters: [kCIInputBackgroundImageKey: personBox])
  mask = fgNear.applyingFilter("CIMaximumCompositing", parameters: [kCIInputBackgroundImageKey: mask])
}
// Erode 1px to remove the bright halo from the original background, then feather.
mask = mask.applyingFilter("CIMorphologyMinimum", parameters: [kCIInputRadiusKey: Double(args.count > 8 ? args[8] : "1.2")!])
mask = mask.applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 0.9]).cropped(to: src.extent)

// Background: deep slate radial gradient with faint teal/azure rim glow, matching the site.
let center = CIVector(x: src.extent.width * 0.5 , y: H - (cy + ch * 0.35))
let base = CIImage(color: CIColor(red: 0.051, green: 0.067, blue: 0.090)).cropped(to: src.extent)
let glow = CIFilter.radialGradient()
glow.center = CGPoint(x: center.x, y: center.y); glow.radius0 = 0; glow.radius1 = Float(cw * 0.9)
glow.color0 = CIColor(red: 0.13, green: 0.20, blue: 0.27, alpha: 1); glow.color1 = CIColor(red: 0.051, green: 0.067, blue: 0.090, alpha: 1)
let bg = glow.outputImage!.cropped(to: src.extent).composited(over: base)

let blend = CIFilter.blendWithMask()
blend.inputImage = src; blend.backgroundImage = bg; blend.maskImage = mask
var out = blend.outputImage!.cropped(to: CGRect(x: cx, y: H - cy - ch, width: cw, height: ch))
out = out.transformed(by: CGAffineTransform(translationX: -cx, y: -(H - cy - ch)))
let lz = CIFilter.lanczosScaleTransform(); lz.inputImage = out; lz.scale = Float(scale); lz.aspectRatio = 1
out = lz.outputImage!

let ctx = CIContext()
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
try ctx.writePNGRepresentation(of: out, to: output, format: .RGBA8, colorSpace: cs)
// also write the raw mask for inspection
try ctx.writePNGRepresentation(of: mask.cropped(to: src.extent), to: output.deletingLastPathComponent().appendingPathComponent("mask.png"), format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())
print("ok", out.extent)
