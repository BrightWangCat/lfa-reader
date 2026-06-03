import SwiftUI

struct SettingsView: View {
    @Environment(AuthViewModel.self) private var authViewModel
    @State private var viewModel = SettingsViewModel()

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

#Preview {
    SettingsView()
        .environment(AuthViewModel())
}
