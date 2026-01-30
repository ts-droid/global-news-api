import SwiftUI

struct OnboardingView: View {
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @AppStorage("selectedInterests") private var selectedInterestsData: Data = Data()
    
    @State private var currentPage = 0
    @State private var selectedInterests: Set<String> = []
    
    let availableInterests = [
        "🌍 Världen", "💼 Ekonomi", "⚽️ Sport", 
        "🎬 Kultur", "🔬 Vetenskap", "💻 Tech",
        "🏛️ Politik", "🌱 Miljö", "🏥 Hälsa"
    ]
    
    var body: some View {
        VStack(spacing: 0) {
            if currentPage == 0 {
                welcomePage
            } else if currentPage == 1 {
                interestsPage
            }
        }
        .background(
            LinearGradient(
                colors: [Color.blue.opacity(0.6), Color.purple.opacity(0.4)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        )
    }
    
    private var welcomePage: some View {
        VStack(spacing: 30) {
            Spacer()
            
            Image(systemName: "newspaper.fill")
                .font(.system(size: 80))
                .foregroundColor(.white)
            
            Text("Välkommen till NewsLens")
                .font(.largeTitle)
                .fontWeight(.bold)
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
            
            Text("Din personliga nyhetskälla med AI-översättningar och sammanfattningar")
                .font(.title3)
                .foregroundColor(.white.opacity(0.9))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            
            Spacer()
            
            Button(action: {
                withAnimation {
                    currentPage = 1
                }
            }) {
                Text("Kom igång")
                    .font(.headline)
                    .foregroundColor(.blue)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.white)
                    .cornerRadius(15)
            }
            .padding(.horizontal, 40)
            .padding(.bottom, 50)
        }
    }
    
    private var interestsPage: some View {
        VStack(spacing: 30) {
            VStack(spacing: 10) {
                Text("Välj dina intressen")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                
                Text("Vi anpassar ditt nyhetsflöde baserat på vad du väljer")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.9))
                    .multilineTextAlignment(.center)
            }
            .padding(.top, 60)
            .padding(.horizontal, 30)
            
            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 15) {
                ForEach(availableInterests, id: \.self) { interest in
                    InterestCard(
                        title: interest,
                        isSelected: selectedInterests.contains(interest),
                        action: {
                            if selectedInterests.contains(interest) {
                                selectedInterests.remove(interest)
                            } else {
                                selectedInterests.insert(interest)
                            }
                        }
                    )
                }
            }
            .padding(.horizontal, 30)
            
            Spacer()
            
            Button(action: {
                saveAndComplete()
            }) {
                Text(selectedInterests.isEmpty ? "Hoppa över" : "Fortsätt")
                    .font(.headline)
                    .foregroundColor(.blue)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.white)
                    .cornerRadius(15)
            }
            .padding(.horizontal, 40)
            .padding(.bottom, 50)
        }
    }
    
    private func saveAndComplete() {
        // Save selected interests to AppStorage
        if let encoded = try? JSONEncoder().encode(Array(selectedInterests)) {
            selectedInterestsData = encoded
        }
        
        withAnimation {
            hasCompletedOnboarding = true
        }
    }
}

struct InterestCard: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.headline)
                .foregroundColor(isSelected ? .blue : .white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(isSelected ? Color.white : Color.white.opacity(0.2))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white, lineWidth: isSelected ? 0 : 1)
                )
        }
    }
}

#Preview {
    OnboardingView()
}
