import Foundation
import ModelIO

guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: ExportModelPreview <input.usdz> <output.obj>\n", stderr)
    exit(1)
}

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)

let asset = MDLAsset(url: input)
asset.loadTextures()
guard asset.count > 0 else {
    fputs("USDZ neobsahuje žádnou geometrii.\n", stderr)
    exit(1)
}

do {
    try asset.export(to: output)
    print("Exported \(output.path)")
} catch {
    fputs("ModelIO nedokázal exportovat OBJ náhled: \(error.localizedDescription)\n", stderr)
    exit(1)
}
