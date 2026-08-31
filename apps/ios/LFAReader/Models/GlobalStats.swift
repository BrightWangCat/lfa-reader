import Foundation

/// Response from GET /api/stats/global
struct GlobalStats: Codable {
    let total: Int
    let categoryTotals: [String: Int]
    let dimensions: [String: [String: [String: Int]]]
    let weeklyTrends: [WeeklyTrend]
    let temperatureError: String?

    enum CodingKeys: String, CodingKey {
        case total
        case categoryTotals = "category_totals"
        case dimensions
        case weeklyTrends = "weekly_trends"
        case temperatureError = "temperature_error"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        total = try container.decode(Int.self, forKey: .total)
        categoryTotals = try container.decode([String: Int].self, forKey: .categoryTotals)
        dimensions = try container.decode([String: [String: [String: Int]]].self, forKey: .dimensions)
        weeklyTrends = try container.decodeIfPresent([WeeklyTrend].self, forKey: .weeklyTrends) ?? []
        temperatureError = try container.decodeIfPresent(String.self, forKey: .temperatureError)
    }

    /// Ordered categories returned by the backend. "Positive" is the generic
    /// aggregate used by workflows such as Tick Borne.
    static let displayCategories = [
        "Negative",
        "Positive",
        "Positive L",
        "Positive I",
        "Positive L+I",
    ]
    static let positiveCategories = [
        "Positive",
        "Positive L",
        "Positive I",
        "Positive L+I",
    ]

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
        "disease_category": "Disease Category",
        "species": "Species",
        "age": "Age",
        "sex": "Sex",
        "breed": "Breed",
        "area_code": "Area Code",
        "preventive_treatment": "Preventive Treatment (6mo)",
    ]
}

/// Response from GET /api/stats/map: aggregate positive counts per area code,
/// the only statistics payload open to every signed-in role.
struct MapStats: Codable {
    let totalPositive: Int
    let positiveByAreaCode: [String: Int]

    enum CodingKeys: String, CodingKey {
        case totalPositive = "total_positive"
        case positiveByAreaCode = "positive_by_area_code"
    }
}

struct WeeklyTrend: Codable, Identifiable {
    let weekStart: String
    let weekEnd: String
    let label: String
    let positiveCounts: [String: Int]
    let avgTemperatureF: Double?

    var id: String { weekStart }

    enum CodingKeys: String, CodingKey {
        case weekStart = "week_start"
        case weekEnd = "week_end"
        case label
        case positiveCounts = "positive_counts"
        case avgTemperatureF = "avg_temperature_f"
    }
}
