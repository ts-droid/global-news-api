import SwiftUI

struct FeedView: View {
    @StateObject private var viewModel = FeedViewModel()
    
    var body: some View {
        NavigationView {
            Group {
                if viewModel.isLoading && viewModel.articles.isEmpty {
                    ProgressView("Laddar nyheter...")
                } else if let error = viewModel.error {
                    VStack {
                        Text(error)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                        Button("Försök igen") {
                            Task {
                                await viewModel.loadNews()
                            }
                        }
                        .padding()
                    }
                } else {
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            ForEach(viewModel.articles) { article in
                                NavigationLink(destination: ArticleDetailView(article: article)) {
                                    ArticleCard(article: article)
                                }
                                .buttonStyle(PlainButtonStyle())
                            }
                        }
                        .padding()
                    }
                    .refreshable {
                        await viewModel.refresh()
                    }
                }
            }
            .navigationTitle("Global News")
            .background(Color(.systemGroupedBackground))
        }
        .task {
            await viewModel.loadNews()
        }
    }
}

// Placeholder for Detail View
struct ArticleDetailView: View {
    let article: Article
    @State private var explanation: String?
    @State private var loadingExplanation = false
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // ... Content here (Title, Summary, etc.)
                Text(article.displayTitle)
                    .font(.title)
                    .fontWeight(.bold)
                
                Text(article.displaySummary)
                    .font(.body)
                
                if let explanation = explanation {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("AI Förklaring")
                            .font(.headline)
                        Text(explanation)
                            .italic()
                    }
                    .padding()
                    .background(Color.blue.opacity(0.1))
                    .cornerRadius(12)
                } else {
                    Button(action: fetchExplanation) {
                        HStack {
                            if loadingExplanation {
                                ProgressView()
                            } else {
                                Image(systemName: "sparkles")
                                Text("Förklara ämnet")
                            }
                        }
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(loadingExplanation)
                }
            }
            .padding()
        }
    }
    
    func fetchExplanation() {
        loadingExplanation = true
        Task {
            do {
                explanation = try await NewsClient.shared.fetchExplanation(for: article.id)
            } catch {
                print("Error: \(error)")
            }
            loadingExplanation = false
        }
    }
}
