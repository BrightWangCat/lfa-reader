import Foundation

/// User roles matching the backend RBAC system
enum UserRole: String, Codable {
    case single
    case admin
}

/// User response from the API
struct UserResponse: Codable, Identifiable {
    let id: Int
    let email: String
    let username: String
    let role: String
    let createdAt: String

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
