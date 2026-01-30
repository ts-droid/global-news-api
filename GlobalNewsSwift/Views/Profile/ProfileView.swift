import SwiftUI

struct ProfileView: View {
    @StateObject private var prefs = PreferencesManager.shared
    
    var body: some View {
        NavigationView {
            List {
                Section {
                    HStack {
                        Image(systemName: "person.circle.fill")
                            .resizable()
                            .frame(width: 60, height: 60)
                            .foregroundColor(.gray)
                        VStack(alignment: .leading) {
                            Text("Användare")
                                .font(.headline)
                            Text("Gratis version")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 8)
                }
                
                Section(header: Text("Mina Intressen")) {
                    NavigationLink(destination: SelectionDetailView(
                        title: "Mina Intressen",
                        items: prefs.availableCategories,
                        selectedItems: prefs.selectedInterests,
                        onToggle: prefs.toggleInterest
                    )) {
                        HStack {
                            Text("Valda ämnen")
                            Spacer()
                            Text("\(prefs.selectedInterests.count)")
                                .foregroundColor(.secondary)
                        }
                    }
                }
                
                Section(header: Text("Mina Regioner")) {
                    NavigationLink(destination: SelectionDetailView(
                        title: "Mina Regioner",
                        items: prefs.availableRegions,
                        selectedItems: prefs.selectedRegions,
                        onToggle: prefs.toggleRegion
                    )) {
                        HStack {
                            Text("Valda regioner")
                            Spacer()
                            Text("\(prefs.selectedRegions.count)")
                                .foregroundColor(.secondary)
                        }
                    }
                }
                
                Section(header: Text("Inställningar")) {
                    Toggle(isOn: $prefs.notificationsEnabled) {
                        Label("Push-notiser", systemImage: "bell.fill")
                    }
                }
                
                Section(header: Text("Om Appen")) {
                    HStack {
                        Label("Version", systemImage: "info.circle")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.secondary)
                    }
                    Link(destination: URL(string: "https://globalnews.example.com/privacy")!) {
                        Label("Integritetspolicy", systemImage: "hand.raised.fill")
                    }
                }
                
                Section {
                    Button("Återställ Onboarding (Debug)") {
                        prefs.resetOnboarding()
                    }
                    .foregroundColor(.red)
                }
            }
            .navigationTitle("Profil")
        }
    }
}

struct SelectionDetailView: View {
    let title: String
    let items: [(id: String, name: String, icon: String)]
    let selectedItems: [String]
    let onToggle: (String) -> Void
    
    var body: some View {
        ScrollView {
            TopicSelectorView(items: items, selectedItems: selectedItems, onToggle: onToggle)
        }
        .navigationTitle(title)
        .background(Color(.systemGroupedBackground))
    }
}
