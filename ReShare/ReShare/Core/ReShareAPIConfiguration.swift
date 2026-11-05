import Foundation

enum ReShareAPIConfiguration {
    nonisolated static var allowsLocalHTTP: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }

    nonisolated static func configuredBaseURL() -> URL? {
        let configured = (Bundle.main.object(forInfoDictionaryKey: "RESHARE_IMAGE_API_BASE_URL") as? String)
            ?? "https://reshare-ios-capstone1-1.onrender.com"
        #if DEBUG
        let raw = ProcessInfo.processInfo.environment["RESHARE_IMAGE_API_BASE_URL"] ?? configured
        #else
        let raw = configured
        #endif
        return baseURL(raw, allowLocalHTTP: allowsLocalHTTP)
    }

    nonisolated static func baseURL(_ raw: String, allowLocalHTTP: Bool) -> URL? {
        guard let parts = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = parts.host?.lowercased(), !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.port.map({ (1...65535).contains($0) }) ?? true,
              let url = parts.url else { return nil }
        if parts.scheme?.lowercased() == "https" { return url }
        guard allowLocalHTTP, parts.scheme?.lowercased() == "http" else { return nil }
        if host == "localhost" || host == "[::1]" || host == "::1" || host.hasSuffix(".local") { return url }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        let address = labels.compactMap { Int($0) }
        guard labels.count == 4, address.count == 4, address.allSatisfy({ (0...255).contains($0) }) else { return nil }
        let local = address[0] == 127 || address[0] == 10 ||
            (address[0] == 172 && (16...31).contains(address[1])) ||
            (address[0] == 192 && address[1] == 168)
        return local ? url : nil
    }
}
