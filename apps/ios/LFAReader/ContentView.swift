import SwiftUI

/// Shared theme constants for the two experience shells. The owner shell uses
/// the warm palette with the rounded system face; the clinic shell uses the
/// cool palette with the default face. Result-status colors stay semantic and
/// shared (see resultColor in TestResult.swift).
enum ShellTheme {
    /// Owner accent, terracotta #C0532B
    static let ownerAccent = Color(red: 0.753, green: 0.325, blue: 0.169)
    /// Owner secondary accent, teal #00897B
    static let ownerTeal = Color(red: 0.0, green: 0.537, blue: 0.482)
    /// Warm tinted card background for the owner hero card, #F4E5D6
    static let ownerHeroBackground = Color(red: 0.957, green: 0.898, blue: 0.839)
    /// Clinic accent, blue #1D5FBF
    static let clinicAccent = Color(red: 0.114, green: 0.373, blue: 0.749)
}

struct ContentView: View {
    @Environment(AuthViewModel.self) private var authViewModel

    var body: some View {
        Group {
            if authViewModel.isLoading && !authViewModel.isAuthenticated {
                // Restoring session — show a brief splash
                ProgressView("Loading...")
            } else if authViewModel.isAuthenticated {
                // One login, two shells: pet owners get the owner experience,
                // doctors and admins share the clinic experience.
                if authViewModel.currentUser?.isClinical == true {
                    ClinicRootView()
                } else {
                    OwnerRootView()
                }
            } else {
                LoginView()
            }
        }
    }
}

// MARK: - Owner shell

private enum OwnerTab: Hashable {
    case home
    case newTest
    case results
    case map
    case settings
}

struct OwnerRootView: View {
    @State private var selection: OwnerTab = .home

    var body: some View {
        TabView(selection: $selection) {
            OwnerHomeView(
                onStartTest: { selection = .newTest },
                onOpenResults: { selection = .results },
                onOpenMap: { selection = .map }
            )
            .tabItem { Label("Home", systemImage: "house.fill") }
            .tag(OwnerTab.home)

            NewTestView()
                .tabItem { Label("New Test", systemImage: "camera.fill") }
                .tag(OwnerTab.newTest)

            ResultsView()
                .tabItem { Label("Results", systemImage: "list.bullet.clipboard") }
                .tag(OwnerTab.results)

            CommunityMapPageView()
                .tabItem { Label("Map", systemImage: "map.fill") }
                .tag(OwnerTab.map)

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
                .tag(OwnerTab.settings)
        }
        .tint(ShellTheme.ownerAccent)
        .fontDesign(.rounded)
    }
}

struct OwnerHomeView: View {
    @Environment(AuthViewModel.self) private var authViewModel

    let onStartTest: () -> Void
    let onOpenResults: () -> Void
    let onOpenMap: () -> Void

    @State private var recentImages: [TestImageSummary] = []
    @State private var isLoadingRecent = true

    private let api = APIClient.shared
    private let recentLimit = 3

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    applicationBanner
                    heroCard
                    recentSection
                    communityCard
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Home")
            .navigationDestination(for: Int.self) { imageId in
                ImageDetailView(imageId: imageId)
            }
            .task {
                await loadRecent()
            }
            .refreshable {
                await loadRecent()
            }
        }
    }

    @ViewBuilder
    private var applicationBanner: some View {
        switch authViewModel.currentUser?.doctorApplicationStatus {
        case "pending":
            bannerLabel(
                text: "Your doctor account application is being reviewed by an administrator.",
                symbol: "hourglass",
                tint: .blue
            )
        case "rejected":
            bannerLabel(
                text: "Your doctor account application was declined. You can keep using your regular account.",
                symbol: "info.circle",
                tint: .orange
            )
        default:
            EmptyView()
        }
    }

    private func bannerLabel(text: String, symbol: String, tint: Color) -> some View {
        Label(text, systemImage: symbol)
            .font(.subheadline)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let username = authViewModel.currentUser?.username {
                Text("HI \(username.uppercased())")
                    .font(.caption.weight(.bold))
                    .kerning(1.2)
                    .foregroundStyle(.secondary)
            }

            Text("Check a new test")
                .font(.title.weight(.bold))

            Text("Take a photo of the test cassette and get a plain answer in about a minute.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Button(action: onStartTest) {
                Label("Start a test", systemImage: "camera.fill")
                    .font(.headline)
                    .padding(.horizontal, 6)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(ShellTheme.ownerHeroBackground, in: RoundedRectangle(cornerRadius: 22))
    }

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Recent results")
                    .font(.headline)
                Spacer()
                Button("All results", action: onOpenResults)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ShellTheme.ownerTeal)
            }

            if isLoadingRecent {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
            } else if recentImages.isEmpty {
                Text("No tests yet. Your results will appear here after your first scan.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
            } else {
                ForEach(recentImages) { image in
                    NavigationLink(value: image.id) {
                        recentRow(image)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func recentRow(_ image: TestImageSummary) -> some View {
        let plain = plainResult(workflow: image.diseaseCategory, result: image.finalResult)
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(image.diseaseCategory ?? "Test")
                    .font(.subheadline.weight(.semibold))
                Text(image.createdAt.formattedDate)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text(plainChipLabel(plain.tone))
                .font(.caption.weight(.bold))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(plain.tone.color.opacity(0.13), in: Capsule())
                .foregroundStyle(plain.tone.color)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func plainChipLabel(_ tone: PlainResult.Tone) -> String {
        switch tone {
        case .good:
            return "Negative"
        case .attention:
            return "Positive"
        case .pending:
            return "Pending"
        case .invalid, .neutral:
            return "Unreadable"
        }
    }

    private var communityCard: some View {
        Button(action: onOpenMap) {
            HStack(spacing: 12) {
                Image(systemName: "map.fill")
                    .font(.title3)
                    .foregroundStyle(ShellTheme.ownerTeal)
                    .frame(width: 40, height: 40)
                    .background(ShellTheme.ownerTeal.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 3) {
                    Text("Around Columbus")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("Positive cases reported near you, from anonymized community results")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(14)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }

    @MainActor
    private func loadRecent() async {
        do {
            let images = try await api.fetchImages()
            recentImages = Array(images.prefix(recentLimit))
        } catch {
            recentImages = []
        }
        isLoadingRecent = false
    }
}

// MARK: - Clinic shell

struct ClinicRootView: View {
    @Environment(AuthViewModel.self) private var authViewModel

    var body: some View {
        TabView {
            NewTestView()
                .tabItem {
                    Label("New Test", systemImage: "camera.fill")
                }

            ResultsView()
                .tabItem {
                    Label("Submissions", systemImage: "list.bullet.clipboard")
                }

            StatisticsView()
                .tabItem {
                    Label("Statistics", systemImage: "chart.bar.fill")
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
        .tint(ShellTheme.clinicAccent)
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
