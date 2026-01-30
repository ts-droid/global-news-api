import Foundation
import SwiftUI

class PreferencesManager: ObservableObject {
    static let shared = PreferencesManager()
    
    @AppStorage("hasCompletedOnboarding") var hasCompletedOnboarding: Bool = false
    @AppStorage("notificationsEnabled") var notificationsEnabled: Bool = false
    
    // We use raw strings for arrays since @AppStorage doesn't support arrays directly
    @AppStorage("selectedInterestsRaw") private var selectedInterestsRaw: String = "world,tech"
    @AppStorage("selectedRegionsRaw") private var selectedRegionsRaw: String = "europe"
    
    var selectedInterests: [String] {
        get { selectedInterestsRaw.components(separatedBy: ",").filter { !$0.isEmpty } }
        set { selectedInterestsRaw = newValue.joined(separator: ",") }
    }
    
    var selectedRegions: [String] {
        get { selectedRegionsRaw.components(separatedBy: ",").filter { !$0.isEmpty } }
        set { selectedRegionsRaw = newValue.joined(separator: ",") }
    }
    
    // Predefined constants matching the React Native app
    let availableCategories: [(id: String, name: String, icon: String)] = [
        ("world", "Världen", "globe"),
        ("politics", "Politik", "building.columns"),
        ("business", "Ekonomi", "chart.bar"),
        ("tech", "Teknik", "laptopcomputer"),
        ("science", "Vetenskap", "flask"),
        ("health", "Hälsa", "heart.text.square"),
        ("sports", "Sport", "sportscourt"),
        ("entertainment", "Kultur", "theatermasks")
    ]
    
    let availableRegions: [(id: String, name: String, icon: String)] = [
        ("europe", "Europa", "eurosign"),
        ("usa", "USA", "star"),
        ("asia", "Asien", "sun.max"),
        ("americas", "Övriga Amerika", "map"),
        ("africa", "Afrika", "safari"),
        ("oceania", "Oceanien", "water.waves")
    ]
    
    func toggleInterest(_ id: String) {
        if selectedInterests.contains(id) {
            selectedInterests.removeAll { $0 == id }
        } else {
            selectedInterests.append(id)
        }
        // Ensure at least one is selected? Maybe not required but good UX
        if selectedInterests.isEmpty {
            selectedInterests.append("world")
        }
    }
    
    func toggleRegion(_ id: String) {
        if selectedRegions.contains(id) {
            selectedRegions.removeAll { $0 == id }
        } else {
            selectedRegions.append(id)
        }
        if selectedRegions.isEmpty {
            selectedRegions.append("europe")
        }
    }
    
    func completeOnboarding() {
        hasCompletedOnboarding = true
    }
    
    func resetOnboarding() { // For debugging
        hasCompletedOnboarding = false
    }
}
