import Foundation
import RealityKit

var payload: [String: Any] = [
    "supported": PhotogrammetrySession.isSupported,
]

if PhotogrammetrySession.isSupported {
    let limits = PhotogrammetrySession.limits
    payload["maximumNumberOfInputImages"] = limits.maximumNumberOfInputImages
    payload["maximumInputImageDimension"] = limits.maximumInputImageDimension
    var fields: [String: String] = [:]
    for child in Mirror(reflecting: limits).children {
        if let label = child.label {
            fields[label] = String(describing: child.value)
        }
    }
    payload["fields"] = fields
}

let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
if let text = String(data: data, encoding: .utf8) {
    print(text)
}
