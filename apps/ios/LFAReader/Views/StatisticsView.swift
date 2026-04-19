import SwiftUI
import Charts

struct StatisticsView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Choose a disease workflow to view aggregated statistics.")
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
            .navigationTitle("Statistics")
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

    private let pieCategories = ["Positive L", "Positive I", "Positive L+I"]
    private let pieDimensions = ["species", "age", "sex", "breed", "preventive_treatment"]

    private let slicePalette: [Color] = [
        .blue, .orange, .green, .red, .purple,
        .cyan, .pink, .yellow, .mint, .indigo,
        .brown, .teal, .gray, Color(.systemRed), Color(.systemTeal),
    ]

    init(workflow: DiseaseWorkflow) {
        self.workflow = workflow
        _viewModel = State(initialValue: StatisticsViewModel(workflow: workflow))
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.stats == nil {
                ProgressView("Loading statistics...")
            } else if let error = viewModel.errorMessage {
                ContentUnavailableView("Error", systemImage: "exclamationmark.triangle", description: Text(error))
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

    private func distributionChart(_ stats: GlobalStats) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Result Distribution")
                .font(.headline)

            Chart(GlobalStats.displayCategories, id: \.self) { category in
                let count = stats.categoryTotals[category] ?? 0
                SectorMark(
                    angle: .value("Count", count),
                    innerRadius: .ratio(0.55),
                    angularInset: 1.5
                )
                .foregroundStyle(categoryColor(category))
                .annotation(position: .overlay) {
                    if count > 0 {
                        Text("\(count)")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                    }
                }
            }
            .frame(height: 220)

            HStack(spacing: 16) {
                ForEach(GlobalStats.displayCategories, id: \.self) { category in
                    HStack(spacing: 4) {
                        Circle()
                            .fill(categoryColor(category))
                            .frame(width: 8, height: 8)
                        Text(category)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding()
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
    }

    private func dimensionSections(_ stats: GlobalStats) -> some View {
        ForEach(pieDimensions, id: \.self) { key in
            if let dimData = stats.dimensions[key], !isDimensionEmpty(dimData) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(GlobalStats.dimensionTitles[key] ?? key)
                        .font(.headline)

                    ForEach(pieCategories, id: \.self) { category in
                        if let valueCounts = dimData[category], !valueCounts.isEmpty {
                            categoryPieCard(category: category, data: valueCounts)
                        }
                    }
                }
            }
        }
    }

    private func categoryPieCard(category: String, data: [String: Int]) -> some View {
        let total = data.values.reduce(0, +)
        let sorted = data.sorted { $0.value > $1.value }

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(category)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(categoryColor(category))
                Text("(n=\(total))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Chart(Array(sorted.enumerated()), id: \.element.key) { index, item in
                SectorMark(
                    angle: .value("Count", item.value),
                    innerRadius: .ratio(0.55),
                    angularInset: 0.5
                )
                .foregroundStyle(slicePalette[index % slicePalette.count])
                .annotation(position: .overlay) {
                    let pct = Double(item.value) / Double(max(total, 1)) * 100
                    if pct >= 5 {
                        Text(String(format: "%.0f%%", pct))
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                    }
                }
            }
            .frame(height: 200)

            FlowLayout(spacing: 8) {
                ForEach(Array(sorted.enumerated()), id: \.element.key) { index, item in
                    HStack(spacing: 4) {
                        Circle()
                            .fill(slicePalette[index % slicePalette.count])
                            .frame(width: 8, height: 8)
                        Text(item.key)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func geographicSection(_ stats: GlobalStats) -> some View {
        if let areaData = stats.dimensions["area_code"], !isDimensionEmpty(areaData) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Geographic Distribution")
                    .font(.headline)

                ZipCodeMapView(zipData: transformAreaData(areaData))
                    .frame(height: 350)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func transformAreaData(_ data: [String: [String: Int]]) -> [String: [String: Int]] {
        var result: [String: [String: Int]] = [:]
        for category in pieCategories {
            if let valueCounts = data[category] {
                for (areaCode, count) in valueCounts {
                    result[areaCode, default: [:]][category] = count
                }
            }
        }
        for areaCode in result.keys {
            for category in pieCategories where result[areaCode]?[category] == nil {
                result[areaCode]?[category] = 0
            }
        }
        return result
    }

    private func isDimensionEmpty(_ data: [String: [String: Int]]) -> Bool {
        data.values.allSatisfy { $0.isEmpty }
    }

    private func categoryColor(_ category: String) -> Color {
        switch category {
        case "Negative":
            return .green
        case "Positive L":
            return .red
        case "Positive I":
            return .orange
        case "Positive L+I":
            return .purple
        default:
            return .gray
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(
            proposal: ProposedViewSize(width: bounds.width, height: bounds.height),
            subviews: subviews
        )
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: .unspecified
            )
        }
    }

    private func arrange(
        proposal: ProposedViewSize,
        subviews: Subviews
    ) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }

        return (CGSize(width: maxWidth, height: y + rowHeight), positions)
    }
}

#Preview {
    StatisticsView()
}
