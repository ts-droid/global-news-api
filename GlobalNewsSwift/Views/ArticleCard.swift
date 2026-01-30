import SwiftUI

struct ArticleCard: View {
    let article: Article
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Image removed for text-only mode
            
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(article.source)
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.blue)
                    
                    Spacer()
                    
                    Text("\(article.readingTime) min läsning")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Text(article.displayTitle)
                    .font(.headline)
                    .lineLimit(2)
                
                Text(article.displaySummary)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(3)
                
                Text(article.formattedDate)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 4)
        }
        .padding(12)
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.1), radius: 5, x: 0, y: 2)
    }
}
