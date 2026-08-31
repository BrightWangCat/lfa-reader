import Foundation

@Observable
class AuthViewModel {
    var isAuthenticated = false
    var currentUser: UserResponse?
    var errorMessage: String?
    var isLoading = false

    private let api = APIClient.shared

    init() {
        // If we have a stored token, try to restore the session
        if api.token != nil {
            Task { await restoreSession() }
        }
    }

    /// Attempt to restore a previous session using a stored token.
    @MainActor
    private func restoreSession() async {
        isLoading = true
        defer { isLoading = false }

        do {
            currentUser = try await api.fetchCurrentUser()
            isAuthenticated = true
        } catch {
            // Token is expired or invalid — clear it
            await api.logout()
            isAuthenticated = false
            currentUser = nil
        }
    }

    /// Log in with username and password.
    @MainActor
    func login(username: String, password: String) async {
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }

        do {
            _ = try await api.login(username: username, password: password)
            currentUser = try await api.fetchCurrentUser()
            isAuthenticated = true
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Register a new account, optionally applying for the doctor role.
    @MainActor
    func register(
        username: String,
        email: String,
        password: String,
        applyDoctor: Bool = false
    ) async {
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }

        do {
            _ = try await api.register(
                username: username,
                email: email,
                password: password,
                applyDoctor: applyDoctor
            )
            // Auto-login after successful registration
            _ = try await api.login(username: username, password: password)
            currentUser = try await api.fetchCurrentUser()
            isAuthenticated = true
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Log out and clear stored credentials.
    @MainActor
    func logout() {
        Task { await api.logout() }
        isAuthenticated = false
        currentUser = nil
        errorMessage = nil
    }
}
