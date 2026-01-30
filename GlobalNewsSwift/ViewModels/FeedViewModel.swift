import Foundation
import Combine

@MainActor
class FeedViewModel: ObservableObject {
    @Published var articles: [Article] = []
    @Published var isLoading = false
    @Published var error: String?
    
    func loadNews() async {
        isLoading = true
        error = nil
        
        do {
            self.articles = try await NewsClient.shared.fetchLatestNews()
        } catch {
            self.error = "Kunde inte ladda nyheter: \(error.localizedDescription)"
        }
        
        isLoading = false
    }
    
    func refresh() async {
        await loadNews()
    }
}
