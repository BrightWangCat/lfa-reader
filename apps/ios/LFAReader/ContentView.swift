import SwiftUI

struct ContentView: View {
    @Environment(AuthViewModel.self) private var authViewModel

    var body: some View {
        Group {
            if authViewModel.isLoading && !authViewModel.isAuthenticated {
                // Restoring session — show a brief splash
                ProgressView("Loading...")
            } else if authViewModel.isAuthenticated {
                TabView {
                    NewTestView()
                        .tabItem {
                            Label("New Test", systemImage: "camera.fill")
                        }

                    ResultsView()
                        .tabItem {
                            Label("Results", systemImage: "list.bullet.clipboard")
                        }

                    StatisticsView()
                        .tabItem {
                            Label("Statistics", systemImage: "chart.pie.fill")
                        }

                    if let currentUser = authViewModel.currentUser,
                       currentUser.normalizedRole == .admin {
                        UserManagementView(currentUserId: currentUser.id)
                            .tabItem {
                                Label("Users", systemImage: "person.3.fill")
                            }
                    }

                    SettingsView()
                        .tabItem {
                            Label("Settings", systemImage: "gearshape.fill")
                        }
                }
            } else {
                LoginView()
            }
        }
    }
}

#Preview("Authenticated") {
    ContentView()
        .environment({
            let vm = AuthViewModel()
            vm.isAuthenticated = true
            return vm
        }())
}

#Preview("Unauthenticated") {
    ContentView()
        .environment(AuthViewModel())
}
