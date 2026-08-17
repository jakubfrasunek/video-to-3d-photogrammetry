import Foundation
import RealityKit

guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: ProcessObjectCapture <images-folder> <output.usdz> [detail] [sequential|unordered] [high|normal] [masking-on|masking-off]\n", stderr)
    exit(1)
}

let imagesURL = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let detailArg = CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : "medium"
let orderingArg = CommandLine.arguments.count > 4 ? CommandLine.arguments[4] : "unordered"
let sensitivityArg = CommandLine.arguments.count > 5 ? CommandLine.arguments[5] : "high"
let maskingArg = CommandLine.arguments.count > 6 ? CommandLine.arguments[6] : "masking-off"

guard PhotogrammetrySession.isSupported else {
    fputs("Object Capture is not supported on this Mac.\n", stderr)
    exit(1)
}

let imageCount: Int = {
    guard let files = try? FileManager.default.contentsOfDirectory(at: imagesURL, includingPropertiesForKeys: nil) else { return 0 }
    return files.filter { ["HEIC", "JPG", "JPEG"].contains($0.pathExtension.uppercased()) }.count
}()

print("Images: \(imagesURL.path) (\(imageCount) files)")
print("Detail: \(detailArg), ordering: \(orderingArg), sensitivity: \(sensitivityArg), masking: \(maskingArg)")
print("")
fflush(stdout)

var lastReportedPercent = -1
var currentStage = "starting"
let startTime = Date()

func formatElapsed(_ seconds: TimeInterval) -> String {
    let total = Int(seconds.rounded())
    let m = total / 60
    let s = total % 60
    return m > 0 ? String(format: "%dm %02ds", m, s) : String(format: "%ds", s)
}

func reportProgress(_ fraction: Double, stage: String? = nil) {
    if let stage, stage != currentStage {
        currentStage = stage
        print("\n[\(currentStage)]")
    }

    let percent = min(100, max(0, Int((fraction * 100).rounded())))
    guard percent != lastReportedPercent else { return }
    lastReportedPercent = percent

    let barWidth = 30
    let filled = Int((Double(percent) / 100.0 * Double(barWidth)).rounded())
    let bar = String(repeating: "=", count: filled) + String(repeating: "-", count: barWidth - filled)
    let elapsed = formatElapsed(Date().timeIntervalSince(startTime))
    let line = String(format: "\r[%@] %3d%%  elapsed %@", bar, percent, elapsed)
    if let data = line.data(using: .utf8) {
        FileHandle.standardOutput.write(data)
    }
}

var configuration = PhotogrammetrySession.Configuration()
configuration.sampleOrdering = orderingArg == "sequential" ? .sequential : .unordered
configuration.featureSensitivity = sensitivityArg == "normal" ? .normal : .high
configuration.isObjectMaskingEnabled = maskingArg == "masking-on"

let detail: PhotogrammetrySession.Request.Detail = switch detailArg {
case "preview": .preview
case "reduced": .reduced
case "full": .full
case "raw": .raw
default: .medium
}

do {
    let session = try PhotogrammetrySession(input: imagesURL, configuration: configuration)
    let request = PhotogrammetrySession.Request.modelFile(url: outputURL, detail: detail)
    try session.process(requests: [request])

    for try await output in session.outputs {
        switch output {
        case .processingComplete:
            reportProgress(1.0)
            print("\nDone in \(formatElapsed(Date().timeIntervalSince(startTime))): \(outputURL.path)")
            exit(0)
        case .inputComplete:
            print("\n[input loaded]")
        case .automaticDownsampling:
            print("\n[automatic downsampling]")
        case .requestError(_, let error):
            print("")
            fputs("Error: \(error.localizedDescription)\n", stderr)
            exit(1)
        case .requestComplete(_, let result):
            if case .modelFile(let url) = result {
                print("\nModel written: \(url.path)")
            }
        case .requestProgress(_, let fraction):
            reportProgress(fraction)
        case .requestProgressInfo(_, let info):
            if let remaining = info.estimatedRemainingTime {
                print(String(format: "\nETA_SEC %.1f", remaining))
                fflush(stdout)
            }
            if let stage = info.processingStage {
                let name: String
                switch stage {
                case .preProcessing: name = "preProcessing"
                case .imageAlignment: name = "imageAlignment"
                case .pointCloudGeneration: name = "pointCloudGeneration"
                case .meshGeneration: name = "meshGeneration"
                case .textureMapping: name = "textureMapping"
                case .optimization: name = "optimization"
                default: name = String(describing: stage)
                }
                print("\nSTAGE \(name)")
                fflush(stdout)
            }
        case .stitchingIncomplete:
            print("\n[stitching incomplete]")
        case .invalidSample(let id, let reason):
            print("\nInvalid sample \(id): \(reason)")
        case .skippedSample(let id):
            print("\nSkipped sample \(id)")
        case .processingCancelled:
            print("\nProcessing cancelled.")
            exit(1)
        @unknown default:
            break
        }
    }
} catch {
    fputs("Failed: \(error.localizedDescription)\n", stderr)
    exit(1)
}

fputs("Finished without completion event.\n", stderr)
exit(1)
