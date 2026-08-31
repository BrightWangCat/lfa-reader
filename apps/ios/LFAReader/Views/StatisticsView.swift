import SwiftUI
import Charts

struct StatisticsView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Aggregated results from all users' tests with patient information")
                        Text("Choose a disease workflow to view statistics.")
                    }
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 4)
                }

                ForEach(DiseaseWorkflow.groupedByCategory(), id: \.category) { group in
                    Section(group.category) {
                        ForEach(group.items) { workflow in
                            NavigationLink {
                                WorkflowStatisticsDetailView(workflow: workflow)
                            } label: {
                                workflowRow(workflow)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Global Test Statistics")
            .listStyle(.insetGrouped)
        }
    }

    private func workflowRow(_ workflow: DiseaseWorkflow) -> some View {
        HStack(spacing: 12) {
            Image(systemName: workflowIcon(for: workflow))
                .font(.title3)
                .foregroundStyle(.tint)
                .frame(width: 30)

            VStack(alignment: .leading, spacing: 4) {
                Text(workflow.label)
                    .font(.headline)
                Text(workflow.species.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }

    private func workflowIcon(for workflow: DiseaseWorkflow) -> String {
        switch workflow.id {
        case "fiv_felv":
            return "cross.case.fill"
        case "tick_borne":
            return "pawprint.fill"
        case "canine_urothelial_carcinoma":
            return "drop.fill"
        default:
            return "chart.pie"
        }
    }
}

private struct WorkflowStatisticsDetailView: View {
    let workflow: DiseaseWorkflow
    @State private var viewModel: StatisticsViewModel

    private let pieCategories = GlobalStats.positiveCategories

    private var pieDimensions: [String] {
        var dimensions = ["species", "age", "sex", "breed", "area_code"]
        if workflow.needsPreventiveTreatment {
            dimensions.append("preventive_treatment")
        }
        return dimensions
    }

    init(workflow: DiseaseWorkflow) {
        self.workflow = workflow
        _viewModel = State(initialValue: StatisticsViewModel(workflow: workflow))
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.stats == nil {
                ProgressView("Loading statistics...")
            } else if let error = viewModel.errorMessage {
                ContentUnavailableView {
                    Label("Unable to Load Statistics", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Retry") {
                        Task { await viewModel.loadStats() }
                    }
                    .buttonStyle(.borderedProminent)
                }
            } else if let stats = viewModel.stats {
                if stats.total == 0 {
                    ContentUnavailableView("No Data", systemImage: "chart.pie", description: Text("No test results with patient information are available for this workflow."))
                } else {
                    statsContent(stats)
                }
            } else {
                ProgressView("Loading statistics...")
            }
        }
        .navigationTitle(workflow.label)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.loadStats()
        }
        .refreshable {
            await viewModel.loadStats()
        }
    }

    private func statsContent(_ stats: GlobalStats) -> some View {
        ScrollView {
            VStack(spacing: 24) {
                workflowHeader
                overviewSection(stats)
                weeklyTrendSection(stats)
                distributionChart(stats)
                dimensionSections(stats)
                geographicSection(stats)
            }
            .padding()
        }
    }

    private var workflowHeader: some View {
        HStack(spacing: 8) {
            Text(workflow.label)
                .font(.subheadline.weight(.semibold))
            Text(workflow.species.displayName)
                .font(.caption)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color(.systemGray5), in: Capsule())
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func overviewSection(_ stats: GlobalStats) -> some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "flask")
                    .font(.title3)
                    .foregroundStyle(.tint)
                Text("Total Samples")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(stats.total)")
                    .font(.title2.weight(.bold))
            }
            .padding()
            .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(GlobalStats.displayCategories, id: \.self) { category in
                    let count = stats.categoryTotals[category] ?? 0
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(category)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                            Text("\(count)")
                                .font(.title3.weight(.bold))
                                .foregroundStyle(categoryColor(category))
                        }
                        Spacer()
                    }
                    .padding()
                    .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
                }
            }
        }
    }

    @ViewBuilder
    private func weeklyTrendSection(_ stats: GlobalStats) -> some View {
        if !stats.weeklyTrends.isEmpty {
            let positiveRows = weeklyPositiveRows(stats)
            let temperatureRows = weeklyTemperatureRows(stats)

            VStack(alignment: .leading, spacing: 10) {
                Text("Weekly Positive Results and Columbus Temperature")
                    .font(.headline)
                Text("Last 12 Sunday-Saturday weeks, Columbus, OH average temperature in °F")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Chart(positiveRows) { row in
                    BarMark(
                        x: .value("Week", row.weekLabel),
                        y: .value("Positive tests", row.count)
                    )
                    .foregroundStyle(by: .value("Result", row.category))
                    .position(by: .value("Result", row.category))
                }
                .chartForegroundStyleScale(
                    domain: GlobalStats.positiveCategories,
                    range: GlobalStats.positiveCategories.map { categoryColor($0) }
                )
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 6))
                }
                .chartYAxisLabel("Positive tests")
                .frame(height: 220)

                if !temperatureRows.isEmpty {
                    Chart(temperatureRows) { row in
                        LineMark(
                            x: .value("Week", row.weekLabel),
                            y: .value("Avg Temp °F", row.temperature)
                        )
                        .foregroundStyle(Color(red: 0.392, green: 0.455, blue: 0.545))
                        .symbol(Circle())
                        .interpolationMethod(.catmullRom)
                    }
                    .chartXAxis {
                        AxisMarks(values: .automatic(desiredCount: 6))
                    }
                    .chartYAxisLabel("Avg Temp °F")
                    .frame(height: 120)
                }

                if let temperatureError = stats.temperatureError {
                    Label(temperatureError, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
            .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    /// Result totals as directly labeled horizontal bars. Shares compare by
    /// length on a common baseline, replacing the former donut chart.
    private func distributionChart(_ stats: GlobalStats) -> some View {
        let rows = GlobalStats.displayCategories.map { category in
            (category: category, count: stats.categoryTotals[category] ?? 0)
        }
        return VStack(alignment: .leading, spacing: 8) {
            Text("Result Distribution")
                .font(.headline)

            Chart(rows, id: \.category) { row in
                BarMark(
                    x: .value("Count", row.count),
                    y: .value("Category", row.category)
                )
                .foregroundStyle(categoryColor(row.category))
                .cornerRadius(3)
                .annotation(position: .trailing) {
                    Text("\(row.count)")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
            .chartXAxis(.hidden)
            .frame(height: CGFloat(rows.count) * 34 + 12)
        }
        .padding()
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
    }

    private func dimensionSections(_ stats: GlobalStats) -> some View {
        ForEach(pieDimensions, id: \.self) { key in
            if let dimData = stats.dimensions[key], hasPositiveData(dimData) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(GlobalStats.dimensionTitles[key] ?? key)
                        .font(.headline)

                    ForEach(pieCategories, id: \.self) { category in
                        if let valueCounts = dimData[category],
                           valueCounts.values.contains(where: { $0 > 0 }) {
                            categoryBarCard(category: category, data: valueCounts)
                        }
                    }
                }
            }
        }
    }

    /// Sorted horizontal bars in the parent category's single hue, each row
    /// labeled directly. Long tails collapse into an "Other" row.
    private func categoryBarCard(category: String, data: [String: Int]) -> some View {
        let sorted = data.filter { $0.value > 0 }.sorted { $0.value > $1.value }
        let total = sorted.reduce(0) { $0 + $1.value }
        let shown = Array(sorted.prefix(8))
        let restCount = sorted.dropFirst(8).reduce(0) { $0 + $1.value }
        let rows = shown.map { (key: $0.key, value: $0.value) }
            + (restCount > 0 ? [(key: "Other", value: restCount)] : [])

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(category)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(categoryColor(category))
                Text("(n=\(total))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Chart(rows, id: \.key) { row in
                BarMark(
                    x: .value("Count", row.value),
                    y: .value("Value", row.key)
                )
                .foregroundStyle(categoryColor(category))
                .cornerRadius(3)
                .annotation(position: .trailing) {
                    let pct = Double(row.value) / Double(max(total, 1)) * 100
                    Text("\(row.value) · \(String(format: "%.0f%%", pct))")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
            .chartXAxis(.hidden)
            .frame(height: CGFloat(rows.count) * 30 + 12)
        }
        .padding()
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func geographicSection(_ stats: GlobalStats) -> some View {
        if let areaData = stats.dimensions["area_code"], hasPositiveData(areaData) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Geographic Distribution (Columbus, OH)")
                    .font(.headline)

                Text("Click on a zip code area to view positive case details")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                ZipCodeMapView(zipData: transformAreaData(areaData))
                    .frame(height: 400)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func transformAreaData(_ data: [String: [String: Int]]) -> [String: [String: Int]] {
        var result: [String: [String: Int]] = [:]
        for category in GlobalStats.positiveCategories {
            if let valueCounts = data[category] {
                for (areaCode, count) in valueCounts {
                    result[areaCode, default: [:]][category] = count
                }
            }
        }
        for areaCode in result.keys {
            for category in GlobalStats.positiveCategories where result[areaCode]?[category] == nil {
                result[areaCode]?[category] = 0
            }
        }
        return result
    }

    private func hasPositiveData(_ data: [String: [String: Int]]) -> Bool {
        pieCategories.contains { category in
            data[category]?.values.contains(where: { $0 > 0 }) == true
        }
    }

    private func weeklyPositiveRows(_ stats: GlobalStats) -> [WeeklyPositiveRow] {
        stats.weeklyTrends.flatMap { trend in
            GlobalStats.positiveCategories.map { category in
                WeeklyPositiveRow(
                    weekLabel: trend.label,
                    category: category,
                    count: trend.positiveCounts[category] ?? 0
                )
            }
        }
    }

    private func weeklyTemperatureRows(_ stats: GlobalStats) -> [WeeklyTemperatureRow] {
        stats.weeklyTrends.compactMap { trend in
            guard let temperature = trend.avgTemperatureF else { return nil }
            return WeeklyTemperatureRow(weekLabel: trend.label, temperature: temperature)
        }
    }

    /// Result-status palette shared with the web client: negative stays calm
    /// green, positive families use a warm ramp from light to severe.
    private func categoryColor(_ category: String) -> Color {
        switch category {
        case "Negative":
            return Color(red: 0.118, green: 0.478, blue: 0.314)
        case "Positive":
            return Color(red: 0.749, green: 0.243, blue: 0.169)
        case "Positive L":
            return Color(red: 0.788, green: 0.439, blue: 0.247)
        case "Positive I":
            return Color(red: 0.651, green: 0.271, blue: 0.149)
        case "Positive L+I":
            return Color(red: 0.486, green: 0.176, blue: 0.071)
        default:
            return .gray
        }
    }
}

private struct WeeklyPositiveRow: Identifiable {
    let weekLabel: String
    let category: String
    let count: Int

    var id: String { "\(weekLabel)-\(category)" }
}

private struct WeeklyTemperatureRow: Identifiable {
    let weekLabel: String
    let temperature: Double

    var id: String { weekLabel }
}

#Preview {
    StatisticsView()
}
