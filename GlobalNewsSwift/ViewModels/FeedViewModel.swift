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
            let allArticles = try await NewsClient.shared.fetchLatestNews()
            
            // Filter locally based on preferences
            let selectedInterests = PreferencesManager.shared.selectedInterests
            
            if selectedInterests.contains("world") && selectedInterests.count == 1 {
                // If only 'world' is selected (default), show everything
                self.articles = allArticles
            } else {
                // Otherwise filter by category matching
                // Note: This matches the 'category' field from API which should map to our IDs
                self.articles = allArticles.filter { article in
                    // If article has no category, show it? Or hide? Let's show if 'world' is selected
                    guard !article.category.isEmpty else { return selectedInterests.contains("world") }
                    return selectedInterests.contains(article.category.lowercased()) || selectedInterests.contains("world")
                }
            }
        } catch {
            self.error = "Kunde inte ladda nyheter: \(error.localizedDescription)"
        }
        
        isLoading = false
    }
    
    func refresh() async {
        await loadNews()
    }
}
