import Foundation

typealias SingleUploadResponse = TestImage

/// Response from PUT /api/readings/image/{id}/correct
struct CorrectionResponse: Codable {
    let id: Int
    let originalFilename: String
    let cvResult: String?
    let manualCorrection: String

    enum CodingKeys: String, CodingKey {
        case id
        case originalFilename = "original_filename"
        case cvResult = "cv_result"
        case manualCorrection = "manual_correction"
    }
}
