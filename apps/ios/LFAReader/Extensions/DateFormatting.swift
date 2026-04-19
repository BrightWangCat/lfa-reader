import Foundation

private enum EasternDateFormatting {
    static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static let displayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "MMM d, yyyy, h:mm a"
        return formatter
    }()
}

extension String {
    /// Formats an ISO 8601 date string for ET display (e.g. "Mar 31, 2026, 2:30 PM ET").
    var formattedDate: String {
        if let date = EasternDateFormatting.iso8601WithFractionalSeconds.date(from: self) {
            return "\(EasternDateFormatting.displayFormatter.string(from: date)) ET"
        }

        if let date = EasternDateFormatting.iso8601.date(from: self) {
            return "\(EasternDateFormatting.displayFormatter.string(from: date)) ET"
        }

        return self
    }
}
