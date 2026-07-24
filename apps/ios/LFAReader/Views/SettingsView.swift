import SwiftUI

struct SettingsView: View {
    @Environment(AuthViewModel.self) private var authViewModel

    var body: some View {
        NavigationStack {
            List {
                // Account section
                if let user = authViewModel.currentUser {
                    Section("Account") {
                        LabeledContent("Username", value: user.username)
                        LabeledContent("Email", value: user.email)
                        LabeledContent("Role", value: user.displayRole)
                    }
                }

                // App section (placeholder for future settings)
                Section("App") {
                    LabeledContent("Version", value: "1.0")
                    LabeledContent("API Server", value: "16.59.11.102:8080")
                }

                // Sign out
                Section {
                    Button(role: .destructive) {
                        authViewModel.logout()
                    } label: {
                        HStack {
                            Spacer()
                            Text("Sign Out")
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}

struct UserManagementView: View {
    let currentUserId: Int

    @State private var viewModel = SettingsViewModel()

    var body: some View {
        NavigationStack {
            List {
                if let loadError = viewModel.loadError, !viewModel.users.isEmpty {
                    Section {
                        VStack(alignment: .leading, spacing: 10) {
                            Label(loadError, systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)

                            Button("Retry") {
                                Task { await viewModel.loadUsers() }
                            }
                        }
                    }
                }

                if viewModel.isLoading && viewModel.users.isEmpty {
                    Section {
                        HStack(spacing: 12) {
                            ProgressView()
                            Text("Loading users...")
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 24)
                    }
                } else if let loadError = viewModel.loadError, viewModel.users.isEmpty {
                    Section {
                        ContentUnavailableView {
                            Label("Unable to Load Users", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(loadError)
                        } actions: {
                            Button("Try Again") {
                                Task { await viewModel.loadUsers() }
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                } else if viewModel.users.isEmpty {
                    Section {
                        ContentUnavailableView(
                            "No Users",
                            systemImage: "person.3",
                            description: Text("No user accounts are available.")
                        )
                    }
                } else {
                    Section {
                        ForEach(viewModel.users) { user in
                            userRow(user)
                        }
                    } header: {
                        Text("\(viewModel.users.count) Users")
                    } footer: {
                        Text("Changing a role or deleting an account requires administrator access.")
                    }
                }
            }
            .navigationTitle("Users")
            .refreshable {
                await viewModel.loadUsers()
            }
            .overlay(alignment: .top) {
                if viewModel.isLoading && !viewModel.users.isEmpty {
                    ProgressView()
                        .padding(10)
                        .background(.regularMaterial, in: Capsule())
                        .padding(.top, 8)
                }
            }
            .alert(
                "Action Failed",
                isPresented: Binding(
                    get: { viewModel.actionError != nil },
                    set: { isPresented in
                        if !isPresented {
                            viewModel.actionError = nil
                        }
                    }
                )
            ) {
                Button("OK") { viewModel.actionError = nil }
            } message: {
                Text(viewModel.actionError ?? "")
            }
            .confirmationDialog(
                "Delete User?",
                isPresented: Binding(
                    get: { viewModel.deleteTarget != nil },
                    set: { isPresented in
                        if !isPresented {
                            viewModel.deleteTarget = nil
                        }
                    }
                ),
                titleVisibility: .visible
            ) {
                Button("Delete User", role: .destructive) {
                    if let target = viewModel.deleteTarget {
                        viewModel.deleteTarget = nil
                        Task {
                            await viewModel.confirmDelete(
                                target,
                                currentUserId: currentUserId
                            )
                        }
                    }
                }
                Button("Cancel", role: .cancel) {
                    viewModel.deleteTarget = nil
                }
            } message: {
                if let user = viewModel.deleteTarget {
                    Text(
                        "Deleting \(user.username) permanently deletes this account "
                        + "and all images owned by the user. This cannot be undone."
                    )
                }
            }
            .task {
                await viewModel.loadUsers()
            }
        }
    }

    private func userRow(_ user: UserResponse) -> some View {
        let isCurrentUser = user.id == currentUserId
        let isOperating = viewModel.isOperating(userId: user.id)

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(user.username)
                        .font(.headline)
                    Text(user.email)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                Spacer(minLength: 8)

                roleBadge(user.normalizedRole)
            }

            VStack(spacing: 6) {
                LabeledContent("ID", value: "\(user.id)")
                LabeledContent("Registered", value: user.createdAt.formattedDate)
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            Divider()

            HStack {
                if isCurrentUser {
                    Label("Current User", systemImage: "person.crop.circle.badge.checkmark")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Menu {
                        ForEach(UserRole.allCases) { role in
                            Button {
                                Task {
                                    await viewModel.updateRole(
                                        for: user,
                                        to: role,
                                        currentUserId: currentUserId
                                    )
                                }
                            } label: {
                                if user.normalizedRole == role {
                                    Label(role.displayName, systemImage: "checkmark")
                                } else {
                                    Text(role.displayName)
                                }
                            }
                            .disabled(user.normalizedRole == role)
                        }
                    } label: {
                        Label("Change Role", systemImage: "person.badge.key")
                    }
                    .disabled(isOperating)
                }

                Spacer()

                if isOperating {
                    ProgressView()
                        .controlSize(.small)
                }

                Button(role: .destructive) {
                    viewModel.requestDelete(user, currentUserId: currentUserId)
                } label: {
                    Label("Delete", systemImage: "trash")
                }
                .disabled(isCurrentUser || isOperating)
            }
            .font(.subheadline)
        }
        .padding(.vertical, 6)
    }

    private func roleBadge(_ role: UserRole) -> some View {
        Text(role.displayName)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .foregroundStyle(role == .admin ? Color.orange : Color.secondary)
            .background(
                (role == .admin ? Color.orange : Color.gray).opacity(0.14),
                in: Capsule()
            )
    }
}

#Preview {
    SettingsView()
        .environment(AuthViewModel())
}
