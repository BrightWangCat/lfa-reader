import SwiftUI
import MapKit

/// Displays Columbus, OH zip-code polygons colored by total positive cases.
struct ZipCodeMapView: View {
    /// Per-area data: { "43215": { "Positive": 2, "Positive L": 1, ... } }
    let zipData: [String: [String: Int]]

    private var maxTotal: Int {
        ZipCodeMapStyle.maximumTotal(in: zipData)
    }

    var body: some View {
        VStack(spacing: 8) {
            ZipCodePolygonMap(zipData: zipData)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay {
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color(.separator), lineWidth: 0.5)
                }

            HStack(spacing: 6) {
                Text("0")

                HStack(spacing: 0) {
                    ForEach(Array(ZipCodeMapStyle.colorScale.enumerated()), id: \.offset) { _, color in
                        Color(uiColor: color)
                            .frame(width: 18, height: 12)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 2))
                .overlay {
                    RoundedRectangle(cornerRadius: 2)
                        .stroke(Color(.separator), lineWidth: 0.5)
                }

                Text(maxTotal > 0 ? "\(maxTotal)" : "max")
                Text("(total positive cases)")
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
    }
}

private enum ZipCodeMapStyle {
    static let colorScale: [UIColor] = [
        UIColor(red: 0.969, green: 0.969, blue: 0.969, alpha: 1), // #f7f7f7
        UIColor(red: 0.992, green: 0.831, blue: 0.620, alpha: 1), // #fdd49e
        UIColor(red: 0.992, green: 0.733, blue: 0.518, alpha: 1), // #fdbb84
        UIColor(red: 0.988, green: 0.553, blue: 0.349, alpha: 1), // #fc8d59
        UIColor(red: 0.937, green: 0.396, blue: 0.282, alpha: 1), // #ef6548
        UIColor(red: 0.843, green: 0.188, blue: 0.122, alpha: 1), // #d7301f
        UIColor(red: 0.600, green: 0.000, blue: 0.000, alpha: 1), // #990000
    ]

    static func total(in categoryCounts: [String: Int]) -> Int {
        GlobalStats.positiveCategories.reduce(0) {
            $0 + max(categoryCounts[$1] ?? 0, 0)
        }
    }

    static func maximumTotal(in zipData: [String: [String: Int]]) -> Int {
        zipData.values.map(total(in:)).max() ?? 0
    }

    static func fillColor(total: Int, maximum: Int) -> UIColor {
        guard total > 0, maximum > 0 else {
            return colorScale[0]
        }
        let ratio = min(Double(total) / Double(maximum), 1)
        let index = min(
            Int(round(ratio * Double(colorScale.count - 1))),
            colorScale.count - 1
        )
        return colorScale[index]
    }

    static func categoryColor(_ category: String) -> UIColor {
        switch category {
        case "Positive":
            return UIColor(red: 0.773, green: 0.188, blue: 0.188, alpha: 1)
        case "Positive L":
            return .systemRed
        case "Positive I":
            return .systemOrange
        case "Positive L+I":
            return .systemPurple
        default:
            return .systemGray
        }
    }

    static func zeroFilled(_ categoryCounts: [String: Int]?) -> [String: Int] {
        var result = categoryCounts ?? [:]
        for category in GlobalStats.positiveCategories where result[category] == nil {
            result[category] = 0
        }
        return result
    }
}

private struct ZipCodePolygonMap: UIViewRepresentable {
    let zipData: [String: [String: Int]]

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator

        let center = CLLocationCoordinate2D(latitude: 39.96, longitude: -82.99)
        let span = MKCoordinateSpan(latitudeDelta: 0.35, longitudeDelta: 0.35)
        mapView.setRegion(MKCoordinateRegion(center: center, span: span), animated: false)

        let tapGesture = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleMapTap(_:))
        )
        tapGesture.cancelsTouchesInView = false
        mapView.addGestureRecognizer(tapGesture)

        if let polygons = loadGeoJSON() {
            mapView.addOverlays(polygons)
        }
        return mapView
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        context.coordinator.update(zipData: zipData, on: mapView)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(zipData: zipData)
    }

    // MARK: - GeoJSON Loading

    private func loadGeoJSON() -> [MKPolygon]? {
        guard let url = Bundle.main.url(forResource: "columbus_zips", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let features = json["features"] as? [[String: Any]] else {
            return nil
        }

        var polygons: [MKPolygon] = []
        for feature in features {
            guard let properties = feature["properties"] as? [String: Any],
                  let zip = properties["zip"] as? String,
                  let geometry = feature["geometry"] as? [String: Any],
                  let type = geometry["type"] as? String,
                  let coordinates = geometry["coordinates"] as? [Any] else {
                continue
            }

            if type == "Polygon", let rings = coordinates as? [[[Double]]] {
                if let polygon = polygonFromRings(rings, title: zip) {
                    polygons.append(polygon)
                }
            } else if type == "MultiPolygon",
                      let multiRings = coordinates as? [[[[Double]]]] {
                polygons.append(
                    contentsOf: multiRings.compactMap {
                        polygonFromRings($0, title: zip)
                    }
                )
            }
        }
        return polygons
    }

    private func polygonFromRings(
        _ rings: [[[Double]]],
        title: String
    ) -> MKPolygon? {
        guard let outerRing = rings.first, !outerRing.isEmpty else {
            return nil
        }
        var coordinates = outerRing.compactMap { pair -> CLLocationCoordinate2D? in
            guard pair.count >= 2 else { return nil }
            return CLLocationCoordinate2D(latitude: pair[1], longitude: pair[0])
        }
        guard !coordinates.isEmpty else {
            return nil
        }

        let interiorPolygons = rings.dropFirst().compactMap { ring -> MKPolygon? in
            var interiorCoordinates = ring.compactMap { pair -> CLLocationCoordinate2D? in
                guard pair.count >= 2 else { return nil }
                return CLLocationCoordinate2D(latitude: pair[1], longitude: pair[0])
            }
            guard !interiorCoordinates.isEmpty else { return nil }
            return MKPolygon(
                coordinates: &interiorCoordinates,
                count: interiorCoordinates.count
            )
        }

        let polygon = MKPolygon(
            coordinates: &coordinates,
            count: coordinates.count,
            interiorPolygons: interiorPolygons
        )
        polygon.title = title
        return polygon
    }

    // MARK: - Coordinator

    final class Coordinator: NSObject, MKMapViewDelegate {
        private var zipData: [String: [String: Int]]
        private var maxTotal: Int
        private var detailHost: UIHostingController<ZipCodeDetailView>?

        init(zipData: [String: [String: Int]]) {
            self.zipData = zipData
            self.maxTotal = ZipCodeMapStyle.maximumTotal(in: zipData)
            super.init()
        }

        func update(zipData: [String: [String: Int]], on mapView: MKMapView) {
            guard self.zipData != zipData else {
                return
            }

            self.zipData = zipData
            maxTotal = ZipCodeMapStyle.maximumTotal(in: zipData)

            for case let polygon as MKPolygon in mapView.overlays {
                if let renderer = mapView.renderer(for: polygon) as? MKPolygonRenderer {
                    style(renderer, for: polygon)
                    renderer.setNeedsDisplay()
                }
            }

            if let selection = mapView.annotations.first(
                where: { $0 is ZipCodeSelectionAnnotation }
            ) as? ZipCodeSelectionAnnotation {
                let zip = selection.zip
                let coordinate = selection.coordinate
                mapView.removeAnnotation(selection)
                showDetails(for: zip, at: coordinate, on: mapView)
            }
        }

        func mapView(
            _ mapView: MKMapView,
            rendererFor overlay: any MKOverlay
        ) -> MKOverlayRenderer {
            guard let polygon = overlay as? MKPolygon else {
                return MKOverlayRenderer(overlay: overlay)
            }

            let renderer = MKPolygonRenderer(polygon: polygon)
            style(renderer, for: polygon)
            return renderer
        }

        func mapView(
            _ mapView: MKMapView,
            viewFor annotation: any MKAnnotation
        ) -> MKAnnotationView? {
            guard let selection = annotation as? ZipCodeSelectionAnnotation else {
                return nil
            }

            let reuseIdentifier = "ZipCodeSelection"
            let view = (mapView.dequeueReusableAnnotationView(
                withIdentifier: reuseIdentifier
            ) as? MKMarkerAnnotationView) ?? MKMarkerAnnotationView(
                annotation: selection,
                reuseIdentifier: reuseIdentifier
            )
            view.annotation = selection
            view.canShowCallout = true
            view.markerTintColor = .systemRed
            view.glyphImage = UIImage(systemName: "mappin.and.ellipse")

            let host = UIHostingController(
                rootView: ZipCodeDetailView(data: selection.categoryCounts)
            )
            host.view.backgroundColor = .clear
            let size = host.sizeThatFits(
                in: CGSize(width: 220, height: 260)
            )
            host.view.frame = CGRect(origin: .zero, size: size)
            view.detailCalloutAccessoryView = host.view
            detailHost = host
            return view
        }

        @objc func handleMapTap(_ recognizer: UITapGestureRecognizer) {
            guard recognizer.state == .ended,
                  let mapView = recognizer.view as? MKMapView else {
                return
            }

            let point = recognizer.location(in: mapView)
            if isInsideAnnotationView(mapView.hitTest(point, with: nil)) {
                return
            }

            let coordinate = mapView.convert(point, toCoordinateFrom: mapView)
            let mapPoint = MKMapPoint(coordinate)
            let selectedPolygon = mapView.overlays.reversed().compactMap {
                $0 as? MKPolygon
            }.first { polygon in
                contains(mapPoint, in: polygon, on: mapView)
            }

            guard let polygon = selectedPolygon, let zip = polygon.title else {
                clearSelection(on: mapView)
                return
            }
            showDetails(for: zip, at: coordinate, on: mapView)
        }

        private func style(
            _ renderer: MKPolygonRenderer,
            for polygon: MKPolygon
        ) {
            let zip = polygon.title ?? ""
            let total = ZipCodeMapStyle.total(in: zipData[zip] ?? [:])
            renderer.fillColor = ZipCodeMapStyle.fillColor(
                total: total,
                maximum: maxTotal
            ).withAlphaComponent(0.7)
            renderer.strokeColor = UIColor.darkGray.withAlphaComponent(0.5)
            renderer.lineWidth = 1
        }

        private func contains(
            _ mapPoint: MKMapPoint,
            in polygon: MKPolygon,
            on mapView: MKMapView
        ) -> Bool {
            guard polygon.boundingMapRect.contains(mapPoint),
                  let renderer = mapView.renderer(for: polygon) as? MKPolygonRenderer else {
                return false
            }
            if renderer.path == nil {
                renderer.createPath()
            }
            guard let path = renderer.path else {
                return false
            }
            return path.contains(
                renderer.point(for: mapPoint),
                using: .evenOdd
            )
        }

        private func showDetails(
            for zip: String,
            at coordinate: CLLocationCoordinate2D,
            on mapView: MKMapView
        ) {
            clearSelection(on: mapView)
            let annotation = ZipCodeSelectionAnnotation(
                coordinate: coordinate,
                zip: zip,
                categoryCounts: ZipCodeMapStyle.zeroFilled(zipData[zip])
            )
            mapView.addAnnotation(annotation)
            mapView.selectAnnotation(annotation, animated: true)
        }

        private func clearSelection(on mapView: MKMapView) {
            let selections = mapView.annotations.compactMap {
                $0 as? ZipCodeSelectionAnnotation
            }
            mapView.removeAnnotations(selections)
            detailHost = nil
        }

        private func isInsideAnnotationView(_ hitView: UIView?) -> Bool {
            var current = hitView
            while let view = current {
                if view is MKAnnotationView {
                    return true
                }
                current = view.superview
            }
            return false
        }
    }
}

private final class ZipCodeSelectionAnnotation: NSObject, MKAnnotation {
    @objc dynamic var coordinate: CLLocationCoordinate2D
    let zip: String
    let categoryCounts: [String: Int]

    var title: String? {
        "Area / Zip Code: \(zip)"
    }

    init(
        coordinate: CLLocationCoordinate2D,
        zip: String,
        categoryCounts: [String: Int]
    ) {
        self.coordinate = coordinate
        self.zip = zip
        self.categoryCounts = categoryCounts
        super.init()
    }
}

/// Callout detail for a selected Columbus area / zip-code polygon.
struct ZipCodeDetailView: View {
    let data: [String: Int]

    private var total: Int {
        ZipCodeMapStyle.total(in: data)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(GlobalStats.positiveCategories, id: \.self) { category in
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color(uiColor: ZipCodeMapStyle.categoryColor(category)))
                        .frame(width: 8, height: 8)
                    Text(category)
                        .font(.caption)
                    Spacer(minLength: 12)
                    Text("\(data[category] ?? 0)")
                        .font(.caption.weight(.semibold))
                }
            }

            Divider()

            HStack {
                Text("Total Positive")
                    .font(.caption.weight(.bold))
                Spacer(minLength: 12)
                Text("\(total)")
                    .font(.caption.weight(.bold))
            }
        }
        .frame(width: 200)
        .padding(.vertical, 4)
    }
}

// MARK: - Community map page

/// Full-page community map backed by the aggregate-only /stats/map endpoint,
/// which is open to every signed-in role. Shown as the Map tab in the owner
/// shell; the clinic shell keeps its map inside the statistics detail.
struct CommunityMapPageView: View {
    private static let allFilter = "__all__"

    /// The under-development workflow is excluded, same as the web client's
    /// diseaseAvailability gating.
    private let activeWorkflows = DiseaseWorkflow.all.filter {
        $0.id != "canine_urothelial_carcinoma"
    }

    @State private var filter = CommunityMapPageView.allFilter
    @State private var mapStats: MapStats?
    @State private var loadedFilter: String?
    @State private var errorMessage: String?

    private let api = APIClient.shared

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Positive cases around Columbus, OH, aggregated by ZIP code from anonymized results. No individual records are shown.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Picker("Workflow", selection: $filter) {
                        Text("All").tag(CommunityMapPageView.allFilter)
                        ForEach(activeWorkflows) { workflow in
                            Text(workflow.label).tag(workflow.label)
                        }
                    }
                    .pickerStyle(.segmented)

                    if let errorMessage {
                        ContentUnavailableView {
                            Label("Unable to Load Map", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(errorMessage)
                        } actions: {
                            Button("Retry") {
                                Task { await loadStats() }
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    } else if let mapStats, loadedFilter == filter {
                        Text("\(mapStats.totalPositive) positive result\(mapStats.totalPositive == 1 ? "" : "s") in total for this selection.")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        ZipCodeMapView(zipData: zipData(from: mapStats))
                            .frame(height: 420)
                    } else {
                        ProgressView("Loading map...")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 60)
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Community Map")
            .task(id: filter) {
                await loadStats()
            }
            .refreshable {
                await loadStats()
            }
        }
    }

    private func zipData(from stats: MapStats) -> [String: [String: Int]] {
        stats.positiveByAreaCode.mapValues { ["Positive": $0] }
    }

    @MainActor
    private func loadStats() async {
        errorMessage = nil
        do {
            let requested = filter
            let stats = try await api.fetchMapStats(
                diseaseCategory: requested == CommunityMapPageView.allFilter ? nil : requested
            )
            guard requested == filter else { return }
            mapStats = stats
            loadedFilter = requested
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
