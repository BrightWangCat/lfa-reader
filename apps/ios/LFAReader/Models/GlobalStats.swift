import Foundation

/// Response from GET /api/stats/global
struct GlobalStats: Codable {
    let total: Int
    let categoryTotals: [String: Int]
    let dimensions: [String: [String: [String: Int]]]

    enum CodingKeys: String, CodingKey {
        case total
        case categoryTotals = "category_totals"
        case dimensions
    }

    /// Ordered categories for display
    static let displayCategories = ["Negative", "Positive L", "Positive I", "Positive L+I"]

    /// Ordered dimension keys for display
    static let dimensionKeys = [
        "disease_category",
        "species",
        "age",
        "sex",
        "breed",
        "area_code",
        "preventive_treatment",
    ]

    /// Human-readable dimension titles
    static let dimensionTitles: [String: String] = [
        "disease_category": "Disease",
        "species": "Species",
        "age": "Age",
        "sex": "Sex",
        "breed": "Breed",
        "area_code": "Area Code",
        "preventive_treatment": "Preventive Treatment",
    ]
}
