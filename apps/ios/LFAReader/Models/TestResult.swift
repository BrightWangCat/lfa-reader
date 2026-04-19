import Foundation
import SwiftUI

/// Classification categories matching the backend CV pipeline
enum ClassificationCategory: String, Codable, CaseIterable {
    case negative = "Negative"
    case positiveL = "Positive L"
    case positiveI = "Positive I"
    case positiveLI = "Positive L+I"
    case invalid = "Invalid"

    var color: Color {
        switch self {
        case .negative: .green
        case .positiveL, .positiveI, .positiveLI: .red
        case .invalid: .orange
        }
    }
}

/// Returns the display color for a classification result string.
func resultColor(for result: String) -> Color {
    if let category = ClassificationCategory(rawValue: result) {
        return category.color
    }
    return .secondary
}

/// Represents a single test image returned by the detail endpoint.
struct TestImage: Codable, Identifiable {
    let id: Int
    let userId: Int
    let originalFilename: String
    let storedFilename: String
    let fileSize: Int
    let isPreprocessed: Bool
    var cvResult: String?
    var cvConfidence: String?
    var manualCorrection: String?
    var readingStatus: String?
    var readingError: String?
    let warnings: [String]
    var patientInfo: PatientInfo?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case originalFilename = "original_filename"
        case storedFilename = "stored_filename"
        case fileSize = "file_size"
        case isPreprocessed = "is_preprocessed"
        case cvResult = "cv_result"
        case cvConfidence = "cv_confidence"
        case manualCorrection = "manual_correction"
        case readingStatus = "reading_status"
        case readingError = "reading_error"
        case warnings
        case patientInfo = "patient_info"
        case createdAt = "created_at"
    }

    /// The final result: manual correction takes priority over CV result
    var finalResult: String? {
        manualCorrection ?? cvResult
    }
}

/// Patient metadata attached to a test image
struct PatientInfo: Codable, Identifiable {
    let id: Int
    let diseaseCategory: String
    var species: String?
    var age: String?
    var sex: String?
    var breed: String?
    var areaCode: String?
    var preventiveTreatment: Bool?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, species, age, sex, breed
        case diseaseCategory = "disease_category"
        case areaCode = "area_code"
        case preventiveTreatment = "preventive_treatment"
        case createdAt = "created_at"
    }
}

/// Compact list item returned by the history endpoint.
struct TestImageSummary: Codable, Identifiable {
    let id: Int
    let userId: Int
    let originalFilename: String
    let cvResult: String?
    let manualCorrection: String?
    let readingStatus: String?
    let diseaseCategory: String?
    let createdAt: String
    let username: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case originalFilename = "original_filename"
        case cvResult = "cv_result"
        case manualCorrection = "manual_correction"
        case readingStatus = "reading_status"
        case diseaseCategory = "disease_category"
        case createdAt = "created_at"
        case username
    }

    var finalResult: String? {
        manualCorrection ?? cvResult
    }
}

enum SpeciesKind: String, Codable {
    case cat
    case dog

    var displayName: String {
        switch self {
        case .cat:
            return "Cats"
        case .dog:
            return "Dogs"
        }
    }
}

struct DiseaseWorkflow: Identifiable, Hashable {
    let id: String
    let label: String
    let category: String
    let species: SpeciesKind
    let needsPreventiveTreatment: Bool

    static let all: [DiseaseWorkflow] = [
        DiseaseWorkflow(
            id: "fiv_felv",
            label: "FIV/FeLV",
            category: "Infectious",
            species: .cat,
            needsPreventiveTreatment: false
        ),
        DiseaseWorkflow(
            id: "tick_borne",
            label: "Tick Borne",
            category: "Infectious",
            species: .dog,
            needsPreventiveTreatment: true
        ),
        DiseaseWorkflow(
            id: "canine_urothelial_carcinoma",
            label: "Canine Urothelial Carcinoma",
            category: "Cancer",
            species: .dog,
            needsPreventiveTreatment: false
        ),
    ]

    static let categoryOrder = ["Infectious", "Cancer"]

    static func workflow(id: String) -> DiseaseWorkflow? {
        all.first { $0.id == id }
    }

    static func groupedByCategory() -> [(category: String, items: [DiseaseWorkflow])] {
        categoryOrder.map { category in
            (
                category: category,
                items: all.filter { $0.category == category }
            )
        }
    }
}

enum PatientSexOption: String, CaseIterable, Identifiable {
    case male = "M"
    case female = "F"
    case castratedMale = "CM"
    case castratedFemale = "CF"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .male:
            return "Male"
        case .female:
            return "Female"
        case .castratedMale:
            return "Castrated Male"
        case .castratedFemale:
            return "Castrated Female"
        }
    }
}

let ageOptionsBySpecies: [SpeciesKind: [String]] = [
    .cat: [
        "1-3m", "3-6m", "6m-1y", "2y", "3y", "4y", "5y", "6y", "7y",
        "8y", "9y", "10y", "11y", "12y", "13y", "14y", "15y", "16y",
        "17y", "18y", "19y",
    ],
    .dog: [
        ">1y", "1y", "2y", "3y", "4y", "5y", "6y", "7y", "8y", "9y",
        "10y", "11y", "12y", "13y", "14y", "15y", "16y", "17y", "18y",
        "19y",
    ],
]

let breedOptionsBySpecies: [SpeciesKind: [String]] = [
    .cat: [
        "DSH", "DMH", "DLH", "Siamese", "Maine Coon", "Ragdoll",
        "Russian Blue", "Bombay", "Bengal", "Siberian", "Other",
    ],
    .dog: [
        "American Eskimo", "Australian Shepherd Dog", "Beagle",
        "Bernese Mountain Dog", "Bichon Frise", "Bloodhound",
        "Border Collie", "Boston Terrier", "Boxer", "Bulldog", "Chihuahua",
        "Cocker Spaniel", "Great Dane", "Dachshund", "Doberman",
        "French Bulldog", "German Shepherd Dog",
        "German Shorthaired Pointer", "Golden Retriever",
        "Labrador Retriever", "Mix Breed", "Poodle", "Pug", "Rottweiler",
        "Samoyed", "Scottish Terrier", "Shetland Sheepdog", "Shih Tzu",
        "Siberian Husky", "West Highland White Terrier",
        "Yorkshire Terrier", "Other",
    ],
]

func resolveWarning(_ key: String) -> String {
    switch key {
    case "young_cat_false_negative":
        return "Younger cats may have false negative results, it is recommended to repeat the test in 6 months."
    default:
        return key
    }
}
