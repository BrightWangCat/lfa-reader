import Foundation

@Observable
class SettingsViewModel {
    var users: [UserResponse] = []
    var isLoading = false
    var loadError: String?
    var actionError: String?
    var deleteTarget: UserResponse?
    var operatingUserIds: Set<Int> = []

    private let api = APIClient.shared
    private var userListRevision = 0

    func isOperating(userId: Int) -> Bool {
        operatingUserIds.contains(userId)
    }

    @MainActor
    func loadUsers() async {
        guard !isLoading, operatingUserIds.isEmpty else { return }

        let revision = userListRevision
        isLoading = true
        loadError = nil
        defer { isLoading = false }

        do {
            let fetchedUsers = try await api.fetchUsers()
            guard revision == userListRevision,
                  operatingUserIds.isEmpty else {
                return
            }
            users = fetchedUsers
        } catch {
            if revision == userListRevision {
                loadError = error.localizedDescription
            }
        }
    }

    @MainActor
    func updateRole(
        for user: UserResponse,
        to role: UserRole,
        currentUserId: Int
    ) async {
        guard user.id != currentUserId,
              user.normalizedRole != role,
              !operatingUserIds.contains(user.id) else {
            return
        }

        userListRevision &+= 1
        operatingUserIds.insert(user.id)
        actionError = nil
        defer { operatingUserIds.remove(user.id) }

        do {
            let updated = try await api.updateUserRole(userId: user.id, role: role)
            if let index = users.firstIndex(where: { $0.id == updated.id }) {
                users[index] = updated
            }
        } catch {
            actionError = "Failed to update \(user.username): \(error.localizedDescription)"
        }
    }

    @MainActor
    func decideApplication(
        for user: UserResponse,
        approve: Bool,
        currentUserId: Int
    ) async {
        guard user.doctorApplicationStatus == "pending",
              !operatingUserIds.contains(user.id) else {
            return
        }

        userListRevision &+= 1
        operatingUserIds.insert(user.id)
        actionError = nil
        defer { operatingUserIds.remove(user.id) }

        do {
            let updated = try await api.decideDoctorApplication(
                userId: user.id,
                approve: approve
            )
            if let index = users.firstIndex(where: { $0.id == updated.id }) {
                users[index] = updated
            }
        } catch {
            actionError = "Failed to decide application for \(user.username): \(error.localizedDescription)"
        }
    }

    func requestDelete(_ user: UserResponse, currentUserId: Int) {
        guard user.id != currentUserId,
              !operatingUserIds.contains(user.id) else {
            return
        }
        deleteTarget = user
    }

    @MainActor
    func confirmDelete(_ user: UserResponse, currentUserId: Int) async {
        guard user.id != currentUserId,
              !operatingUserIds.contains(user.id) else {
            return
        }

        userListRevision &+= 1
        operatingUserIds.insert(user.id)
        actionError = nil
        defer { operatingUserIds.remove(user.id) }

        do {
            try await api.deleteUser(userId: user.id)
            users.removeAll { $0.id == user.id }
        } catch {
            actionError = "Failed to delete \(user.username): \(error.localizedDescription)"
        }
    }
}
