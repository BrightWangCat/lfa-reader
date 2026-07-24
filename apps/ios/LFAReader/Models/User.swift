import Foundation

/// User roles matching the backend RBAC system
enum UserRole: String, Codable, CaseIterable, Identifiable {
    case user
    case admin

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .user:
            return "User"
        case .admin:
            return "Admin"
        }
    }
}

/// User response from the API
struct UserResponse: Codable, Identifiable {
    let id: Int
    let email: String
    let username: String
    let role: String
    let createdAt: String

    /// Normalizes any legacy regular-user role to the current `user` role.
    var normalizedRole: UserRole {
        role == UserRole.admin.rawValue ? .admin : .user
    }

    var displayRole: String {
        normalizedRole.displayName
    }

    enum CodingKeys: String, CodingKey {
        case id, email, username, role
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
