import SwiftUI

struct ContentView: View {
    @StateObject private var prefs = PreferencesManager.shared
    
    var body: some View {
        if !prefs.hasCompletedOnboarding {
            OnboardingView()
        } else {
            MainTabView()
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            FeedView()
                .tabItem {
                    Label("Nyheter", systemImage: "newspaper")
                }
            
            ProfileView()
                .tabItem {
                    Label("Profil", systemImage: "person")
                }
        }
    }
}
