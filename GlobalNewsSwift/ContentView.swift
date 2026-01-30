import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            FeedView()
                .tabItem {
                    Label("Nyheter", systemImage: "newspaper")
                }
        }
    }
}

#Preview {
    ContentView()
}
