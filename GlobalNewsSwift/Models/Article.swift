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
        // Basic ISO8601 parsing logic or simple string manipulation
        return pubDate.prefix(10).description // Simplification for demo
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
