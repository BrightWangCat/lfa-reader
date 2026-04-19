import Foundation

/// Errors from API calls
enum APIError: LocalizedError {
    case invalidURL
    case httpError(statusCode: Int, detail: String)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .httpError(let code, let detail):
            return "Server error (\(code)): \(detail)"
        case .decodingError(let error):
            return "Failed to parse response: \(error.localizedDescription)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        }
    }
}

#if DEBUG
/// URLSession delegate that trusts the self-signed certificate on the dev server.
/// WARNING: This bypasses TLS validation and must NEVER be used in production builds.
/// Uses the completion-handler based method for reliable callback on real devices.
final class SelfSignedCertDelegate: NSObject, URLSessionDelegate {
    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
           let serverTrust = challenge.protectionSpace.serverTrust {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else {
            completionHandler(.performDefaultHandling, nil)
        }
    }
}
#endif

/// Centralized API client for communicating with the LFA Reader backend.
actor APIClient {
    static let shared = APIClient()

    let baseURL = "https://16.59.11.102:8080/api"

    private let session: URLSession
    private let decoder: JSONDecoder

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30

        #if DEBUG
        session = URLSession(configuration: config, delegate: SelfSignedCertDelegate(), delegateQueue: nil)
        #else
        session = URLSession(configuration: config)
        #endif

        decoder = JSONDecoder()
    }

    // MARK: - Token storage (Keychain)

    private static let tokenKey = "auth_token"

    nonisolated var token: String? {
        get { KeychainService.load(key: APIClient.tokenKey) }
        set {
            if let newValue {
                KeychainService.save(key: APIClient.tokenKey, value: newValue)
            } else {
                KeychainService.delete(key: APIClient.tokenKey)
            }
        }
    }

    // MARK: - Generic request

    /// Perform a JSON-decoded request. Attaches JWT Bearer token if available.
    func request<T: Decodable>(
        _ method: String,
        path: String,
        body: Data? = nil,
        contentType: String = "application/json"
    ) async throws -> T {
        guard let url = URL(string: baseURL + path) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")

        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = body
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let detail = parseErrorDetail(from: data)
            throw APIError.httpError(statusCode: httpResponse.statusCode, detail: detail)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    // MARK: - Auth endpoints

    /// Login with username/password. Backend expects OAuth2 form-encoded body.
    func login(username: String, password: String) async throws -> TokenResponse {
        let formBody = "username=\(formEncode(username))&password=\(formEncode(password))"
        let bodyData = Data(formBody.utf8)

        let response: TokenResponse = try await request(
            "POST",
            path: "/users/login",
            body: bodyData,
            contentType: "application/x-www-form-urlencoded"
        )

        token = response.accessToken
        return response
    }

    /// Register a new user account.
    func register(username: String, email: String, password: String) async throws -> UserResponse {
        let body = RegisterRequest(email: email, username: username, password: password)
        let bodyData = try JSONEncoder().encode(body)

        return try await request("POST", path: "/users/register", body: bodyData)
    }

    /// Fetch the current user's profile.
    func fetchCurrentUser() async throws -> UserResponse {
        try await request("GET", path: "/users/me")
    }

    /// Clear stored token.
    func logout() {
        token = nil
    }

    // MARK: - Upload endpoints

    /// Upload a single image with optional patient info.
    func uploadSingle(
        imageData: Data,
        filename: String,
        diseaseCategory: String,
        shareInfo: Bool,
        age: String?,
        sex: String?,
        breed: String?,
        areaCode: String?,
        preventiveTreatment: Bool?
    ) async throws -> SingleUploadResponse {
        var form = MultipartFormData()
        form.addFile(name: "file", filename: filename, mimeType: "image/jpeg", data: imageData)
        form.addField(name: "disease_category", value: diseaseCategory)
        form.addField(name: "share_info", value: shareInfo ? "true" : "false")

        if shareInfo {
            if let age, !age.isEmpty { form.addField(name: "age", value: age) }
            if let sex, !sex.isEmpty { form.addField(name: "sex", value: sex) }
            if let breed, !breed.isEmpty { form.addField(name: "breed", value: breed) }
            if let areaCode, !areaCode.isEmpty { form.addField(name: "area_code", value: areaCode) }
            if let preventiveTreatment {
                form.addField(
                    name: "preventive_treatment",
                    value: preventiveTreatment ? "true" : "false"
                )
            }
        }

        return try await uploadRequest(path: "/upload/single", form: form)
    }

    /// List images. Admin sees all images; regular users see only their own.
    func fetchImages() async throws -> [TestImageSummary] {
        try await request("GET", path: "/upload/images")
    }

    /// Fetch a single image with its patient info and classification metadata.
    func fetchImage(id: Int) async throws -> TestImage {
        try await request("GET", path: "/upload/image/\(id)")
    }

    /// Delete an image and its associated files.
    func deleteImage(id: Int) async throws {
        try await rawDataRequest("DELETE", path: "/upload/image/\(id)")
    }

    // MARK: - Classification endpoints

    /// Start CV classification for a single image.
    func startClassification(imageId: Int) async throws {
        try await rawDataRequest("POST", path: "/readings/image/\(imageId)/classify")
    }

    /// Poll classification progress for a single image.
    func fetchClassificationStatus(imageId: Int) async throws -> ClassificationStatus {
        try await request("GET", path: "/readings/image/\(imageId)/status")
    }

    /// Cancel a running classification.
    func cancelClassification(imageId: Int) async throws {
        try await rawDataRequest("POST", path: "/readings/image/\(imageId)/cancel")
    }

    /// Submit a manual correction for an image.
    func correctImage(imageId: Int, correction: String) async throws -> CorrectionResponse {
        let body = try JSONEncoder().encode(["manual_correction": correction])
        return try await request("PUT", path: "/readings/image/\(imageId)/correct", body: body)
    }

    /// Fetch valid classification categories.
    func fetchCategories() async throws -> [String] {
        let response: CategoriesResponse = try await request("GET", path: "/readings/categories")
        return response.categories
    }

    // MARK: - Statistics

    /// Fetch global statistics across all users.
    func fetchGlobalStats(diseaseCategory: String? = nil) async throws -> GlobalStats {
        var path = "/stats/global"
        if let diseaseCategory,
           var components = URLComponents(string: "https://placeholder\(path)") {
            components.queryItems = [
                URLQueryItem(name: "disease_category", value: diseaseCategory)
            ]
            path = components.percentEncodedQuery.map { "\(path)?\($0)" } ?? path
        }
        return try await request("GET", path: path)
    }

    // MARK: - Image download

    /// Download image data for a given image ID.
    func fetchImageData(imageId: Int, original: Bool = false) async throws -> Data {
        let query = original ? "?original=true" : ""
        return try await rawDataRequest("GET", path: "/upload/image/\(imageId)\(query)")
    }

    // MARK: - Raw data request helper

    /// Perform a request that returns raw Data (no JSON decoding).
    @discardableResult
    private func rawDataRequest(_ method: String, path: String, body: Data? = nil) async throws -> Data {
        guard let url = URL(string: baseURL + path) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let detail = parseErrorDetail(from: data)
            throw APIError.httpError(statusCode: httpResponse.statusCode, detail: detail)
        }

        return data
    }

    /// Generic multipart upload helper.
    private func uploadRequest<T: Decodable>(path: String, form: MultipartFormData) async throws -> T {
        guard let url = URL(string: baseURL + path) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = form.finalize()

        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let detail = parseErrorDetail(from: data)
            throw APIError.httpError(statusCode: httpResponse.statusCode, detail: detail)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    // MARK: - Helpers

    private func formEncode(_ string: String) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        // Per RFC, these must be percent-encoded in form values
        allowed.remove(charactersIn: "+&=")
        return string.addingPercentEncoding(withAllowedCharacters: allowed) ?? string
    }

    private func parseErrorDetail(from data: Data) -> String {
        // Backend returns {"detail": "..."} on errors
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let detail = json["detail"] as? String {
            return detail
        }
        return String(data: data, encoding: .utf8) ?? "Unknown error"
    }
}

// MARK: - Multipart form-data builder

/// Builds a multipart/form-data body for file uploads.
struct MultipartFormData {
    let boundary = "Boundary-\(UUID().uuidString)"
    private var body = Data()

    var contentType: String {
        "multipart/form-data; boundary=\(boundary)"
    }

    mutating func addField(name: String, value: String) {
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
        body.append("\(value)\r\n")
    }

    mutating func addFile(name: String, filename: String, mimeType: String, data: Data) {
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n")
        body.append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(data)
        body.append("\r\n")
    }

    func finalize() -> Data {
        var result = body
        result.append("--\(boundary)--\r\n")
        return result
    }
}

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) {
            append(data)
        }
    }
}

// MARK: - Request body types

private struct RegisterRequest: Encodable {
    let email: String
    let username: String
    let password: String
}
