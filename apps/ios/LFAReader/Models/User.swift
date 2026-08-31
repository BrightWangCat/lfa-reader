import Foundation

/// User roles matching the backend RBAC system
enum UserRole: String, Codable, CaseIterable, Identifiable {
    case user
    case doctor
    case admin

    var id: String { rawValue }

    /// Display names match the account types offered at registration.
    var displayName: String {
        switch self {
        case .user:
            return "Pet Owner"
        case .doctor:
            return "Veterinarian"
        case .admin:
            return "Admin"
        }
    }

    /// Clinical means doctor or admin: full visibility over all readings.
    /// Mirrors CLINICAL_ROLES in the backend role_utils.
    var isClinical: Bool {
        self == .doctor || self == .admin
    }
}

/// User response from the API
struct UserResponse: Codable, Identifiable {
    let id: Int
    let email: String
    let username: String
    let role: String
    /// nil = never applied, "pending" = awaiting review, "rejected" = declined.
    let doctorApplicationStatus: String?
    let createdAt: String

    /// Normalizes any legacy regular-user role to the current `user` role.
    var normalizedRole: UserRole {
        UserRole(rawValue: role) ?? .user
    }

    var displayRole: String {
        normalizedRole.displayName
    }

    var isClinical: Bool {
        normalizedRole.isClinical
    }

    enum CodingKeys: String, CodingKey {
        case id, email, username, role
        case doctorApplicationStatus = "doctor_application_status"
        case createdAt = "created_at"
    }
}

/// Login response containing JWT token
struct TokenResponse: Codable {
    let accessToken: String
    let tokenType: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case tokenType = "token_type"
    }
}
