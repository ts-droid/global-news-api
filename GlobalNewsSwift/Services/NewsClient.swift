import Foundation

class NewsClient {
    static let shared = NewsClient()
    private let baseURL = URL(string: "https://global-news-api.railway.app/api")! // Replace with actual URL
    
    enum NetworkError: Error {
        case invalidURL
        case noData
        case decodingError
        case serverError(String)
    }
    
    func fetchLatestNews(limit: Int = 20, offset: Int = 0) async throws -> [Article] {
        var components = URLComponents(url: baseURL.appendingPathComponent("news"), resolvingAgainstBaseURL: true)!
        components.queryItems = [
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "lang", value: "sv")
        ]
        
        guard let url = components.url else { throw NetworkError.invalidURL }
        
        let (data, response) = try await URLSession.shared.data(from: url)
        
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.serverError("Invalid response from server")
        }
        
        let newsResponse = try JSONDecoder().decode(NewsResponse.self, from: data)
        return newsResponse.data.articles
    }
    
    func fetchExplanation(for articleId: String) async throws -> String {
        let url = baseURL.appendingPathComponent("news").appendingPathComponent(articleId).appendingPathComponent("explain")
        
        let (data, response) = try await URLSession.shared.data(from: url)
        
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.serverError("Invalid response from server")
        }
        
        // Assuming the response is { "status": "success", "data": { "explanation": "..." } }
        struct ExplainResponse: Codable {
            struct ExplainData: Codable {
                let explanation: String
            }
            let data: ExplainData
        }
        
        let explainResponse = try JSONDecoder().decode(ExplainResponse.self, from: data)
        return explainResponse.data.explanation
    }
}
