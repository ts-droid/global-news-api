import SwiftUI

struct OnboardingView: View {
    @StateObject private var prefs = PreferencesManager.shared
    @State private var currentStep = 0
    
    var body: some View {
        ZStack {
            Color(.systemGroupedBackground).ignoresSafeArea()
            
            VStack {
                // Header / Progress
                HStack {
                    ForEach(0..<3) { index in
                        Circle()
                            .fill(index == currentStep ? Color.blue : Color.gray.opacity(0.3))
                            .frame(width: 8, height: 8)
                    }
                    Spacer()
                    Button("Hoppa över") {
                        completeOnboarding()
                    }
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                }
                .padding()
                
                Spacer()
                
                // Content
                TabView(selection: $currentStep) {
                    WelcomeStep()
                        .tag(0)
                    
                    SelectionStep(
                        title: "Vad intresserar dig?",
                        subtitle: "Välj ämnen för att personanpassa ditt flöde.",
                        items: prefs.availableCategories,
                        selectedItems: prefs.selectedInterests,
                        onToggle: prefs.toggleInterest
                    )
                    .tag(1)
                    
                    SelectionStep(
                        title: "Vilka regioner följer du?",
                        subtitle: "Få nyheter från de delar av världen du bryr dig om.",
                        items: prefs.availableRegions,
                        selectedItems: prefs.selectedRegions,
                        onToggle: prefs.toggleRegion
                    )
                    .tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut, value: currentStep)
                
                Spacer()
                
                // Footer
                Button(action: nextStep) {
                    Text(currentStep == 2 ? "Kom igång" : "Nästa")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .cornerRadius(12)
                }
                .padding()
            }
        }
    }
    
    func nextStep() {
        if currentStep < 2 {
            withAnimation {
                currentStep += 1
            }
        } else {
            completeOnboarding()
        }
    }
    
    func completeOnboarding() {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
        prefs.completeOnboarding()
    }
}

struct WelcomeStep: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "globe.europe.africa.fill")
                .resizable()
                .scaledToFit()
                .frame(width: 120, height: 120)
                .foregroundColor(.blue)
                .padding(.bottom, 20)
            
            Text("Håll dig informerad,\nglobalt")
                .font(.title)
                .fontWeight(.bold)
                .multilineTextAlignment(.center)
            
            Text("Få kurerade nyheter från hela världen, sammanfattade och personanpassade för just dig.")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
    }
}

struct SelectionStep: View {
    let title: String
    let subtitle: String
    let items: [(id: String, name: String, icon: String)]
    let selectedItems: [String]
    let onToggle: (String) -> Void
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(title)
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .padding(.horizontal)
                
                Text(subtitle)
                    .font(.body)
                    .foregroundColor(.secondary)
                    .padding(.horizontal)
                    .padding(.bottom, 20)
                
                TopicSelectorView(items: items, selectedItems: selectedItems, onToggle: onToggle)
            }
            .padding(.top)
        }
    }
}
