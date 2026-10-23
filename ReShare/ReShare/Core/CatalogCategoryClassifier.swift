import CoreML
import ImageIO
import UIKit
import Vision

/// Gợi ý một trong ba danh mục mà model ReShare v8 đã được huấn luyện.
enum CatalogCategoryClassifier {
    static let modelVersion = "ReShare_v8_baseline_01"

    struct Prediction {
        let category: DonationCategory
        let confidence: Double
        let durationMs: Double
    }

    static func suggest(from image: UIImage, completion: @escaping (String?) -> Void) {
        predict(from: image) { prediction in
            completion(prediction?.category.title)
        }
    }

    static func predict(from image: UIImage, completion: @escaping (Prediction?) -> Void) {
        guard let cgImage = image.cgImage else {
            DispatchQueue.main.async { completion(nil) }
            return
        }

        let imageOrientation = orientation(for: image.imageOrientation)

        DispatchQueue.global(qos: .userInitiated).async {
            let prediction: Prediction?

            do {
                let startedAt = ProcessInfo.processInfo.systemUptime
                let coreMLModel = try ReShare_v8_baseline_01(
                    configuration: MLModelConfiguration()
                ).model
                let visionModel = try VNCoreMLModel(for: coreMLModel)
                let request = VNCoreMLRequest(model: visionModel)
                let handler = VNImageRequestHandler(
                    cgImage: cgImage,
                    orientation: imageOrientation,
                    options: [:]
                )

                try handler.perform([request])
                let observation = (request.results as? [VNClassificationObservation])?
                    .max(by: { $0.confidence < $1.confidence })
                let category = [
                    "books": DonationCategory.books,
                    "clothing": .clothing,
                    "household_items": .household
                ][observation?.identifier ?? ""]
                if let category, let observation, observation.confidence.isFinite {
                    prediction = Prediction(
                        category: category,
                        confidence: Double(observation.confidence),
                        durationMs: (ProcessInfo.processInfo.systemUptime - startedAt) * 1000
                    )
                } else {
                    prediction = nil
                }
            } catch {
                prediction = nil
            }

            DispatchQueue.main.async {
                completion(prediction)
            }
        }
    }

    private static func orientation(
        for value: UIImage.Orientation
    ) -> CGImagePropertyOrientation {
        switch value {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}
