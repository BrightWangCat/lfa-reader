import Foundation

/// Response from GET /api/readings/image/{id}/status
struct ClassificationStatus: Codable {
    let imageId: Int
    let readingStatus: String?
    let readingError: String?
    let cvResult: String?
    let cvConfidence: String?

    enum CodingKeys: String, CodingKey {
        case imageId = "image_id"
        case readingStatus = "reading_status"
        case readingError = "reading_error"
        case cvResult = "cv_result"
        case cvConfidence = "cv_confidence"
    }

    /// Convenience: the status string, defaulting to "idle"
    var status: String {
        readingStatus ?? "idle"
    }
}

/// Response from GET /api/readings/categories
struct CategoriesResponse: Codable {
    let categories: [String]
}
