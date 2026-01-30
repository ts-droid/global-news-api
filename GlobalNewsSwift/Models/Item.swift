import Foundation

// Dummy Item class to allow build if not yet removed
class Item: Identifiable {
    let id = UUID()
    var timestamp: Date = Date()
}
