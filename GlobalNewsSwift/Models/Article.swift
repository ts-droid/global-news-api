import Foundation

struct Article: Codable, Identifiable {
    let id: String
    let title: String
    let titleSv: String?
    let summarySv: String?
    let description: String?
    let link: String
    let pubDate: String
    let source: String
    let category: String
    let readingTime: Int
    let imageUrl: String?
    let isBreaking: Bool?
    
    // Computed properties for localized content
    var displayTitle: String {
        return titleSv ?? title
    }
    
    var displaySummary: String {
        return summarySv ?? description ?? ""
    }
    
    var formattedDate: String {
        // Parse ISO string (UTC) to Date
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        let date = isoFormatter.date(from: pubDate) ?? ISO8601DateFormatter().date(from: pubDate) ?? Date()
        
        // Format to User's Local Timezone
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        formatter.locale = Locale.current
        formatter.timeZone = TimeZone.current
        
        return formatter.string(from: date)
    }
}

struct NewsResponse: Codable {
    let status: String
    let data: NewsData
}

struct NewsData: Codable {
    let articles: [Article]
    let pagination: PaginationInfo
}

struct PaginationInfo: Codable {
    let total: Int
    let limit: Int
    let offset: Int
    let hasMore: Bool
}
