import SwiftUI
import UIKit

// MARK: - Continuous Scroll Reader

struct ScrollReaderContent: View {
    @EnvironmentObject var serverManager: ServerManager
    let bookId: String
    let totalPages: Int
    let direction: ReadingDirection
    @Binding var currentPage: Int
    let onTap: () -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(1...max(totalPages, 1), id: \.self) { page in
                        PageImageView(
                            url: serverManager.apiClient?.pageURL(bookId: bookId, page: page),
                            page: page
                        )
                        .id(page)
                        .onAppear {
                            currentPage = page
                            prefetchAround(page: page)
                        }
                    }
                }
            }
            .onTapGesture { onTap() }
            .onAppear {
                if currentPage > 1 {
                    proxy.scrollTo(currentPage, anchor: .top)
                }
            }
        }
    }

    private func prefetchAround(page: Int) {
        guard let client = serverManager.apiClient else { return }
        let range = max(1, page - 1)...min(totalPages, page + 3)
        let urls = range.map { client.pageURL(bookId: bookId, page: $0) }
        Task {
            await ImageCache.shared.prefetch(urls: urls)
        }
    }
}

// MARK: - Single Page Reader

struct SinglePageReaderContent: View {
    @EnvironmentObject var serverManager: ServerManager
    let bookId: String
    let totalPages: Int
    let direction: ReadingDirection
    @Binding var currentPage: Int
    let previousBookId: String?
    let nextBookId: String?
    let onTap: () -> Void

    @State private var dragOffset: CGFloat = 0
    @GestureState private var isDragging = false

    var body: some View {
        GeometryReader { geo in
            ZStack {
                PageImageView(
                    url: serverManager.apiClient?.pageURL(bookId: bookId, page: currentPage),
                    page: currentPage
                )
                .frame(width: geo.size.width, height: geo.size.height)

                // Tap zones
                HStack(spacing: 0) {
                    // Left zone
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture {
                            if direction == .rtl {
                                advancePage()
                            } else {
                                goBackPage()
                            }
                        }

                    // Center zone (toggle overlay)
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture { onTap() }

                    // Right zone
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture {
                            if direction == .rtl {
                                goBackPage()
                            } else {
                                advancePage()
                            }
                        }
                }
            }
        }
        .gesture(swipeGesture)
        .onChange(of: currentPage) { _, page in
            prefetchAround(page: page)
        }
        .onAppear {
            prefetchAround(page: currentPage)
        }
    }

    private var swipeGesture: some Gesture {
        DragGesture(minimumDistance: 50)
            .onEnded { value in
                let horizontal = value.translation.width
                if abs(horizontal) > abs(value.translation.height) {
                    if horizontal < -50 {
                        // Swipe left
                        if direction == .rtl { advancePage() } else { goBackPage() }
                    } else if horizontal > 50 {
                        // Swipe right
                        if direction == .rtl { goBackPage() } else { advancePage() }
                    }
                }
            }
    }

    private func advancePage() {
        withAnimation(.easeInOut(duration: 0.2)) {
            if currentPage < totalPages {
                currentPage += 1
            }
        }
    }

    private func goBackPage() {
        withAnimation(.easeInOut(duration: 0.2)) {
            if currentPage > 1 {
                currentPage -= 1
            }
        }
    }

    private func prefetchAround(page: Int) {
        guard let client = serverManager.apiClient else { return }
        let range = max(1, page - 1)...min(totalPages, page + 2)
        let urls = range.map { client.pageURL(bookId: bookId, page: $0) }
        Task {
            await ImageCache.shared.prefetch(urls: urls)
        }
    }
}

// MARK: - Page Image View

struct PageImageView: View {
    let url: URL?
    let page: Int

    @State private var image: UIImage?
    @State private var isLoading = true
    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(scale)
                        .offset(offset)
                        .gesture(magnificationGesture)
                        .gesture(scale > 1 ? panGesture : nil)
                        .onTapGesture(count: 2) {
                            withAnimation(.easeInOut(duration: 0.3)) {
                                if scale > 1 {
                                    scale = 1
                                    offset = .zero
                                } else {
                                    scale = 2.5
                                }
                            }
                        }
                        .frame(width: geo.size.width, height: geo.size.height)
                } else if isLoading {
                    ProgressView()
                        .tint(.white)
                        .frame(width: geo.size.width, height: geo.size.height)
                } else {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                        .frame(width: geo.size.width, height: geo.size.height)
                }
            }
        }
        .aspectRatio(0.7, contentMode: .fit) // Approximate manga page ratio
        .task(id: url) {
            await loadImage()
        }
    }

    private var magnificationGesture: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                scale = max(1, min(value.magnification, 5))
            }
            .onEnded { _ in
                withAnimation {
                    if scale < 1.2 {
                        scale = 1
                        offset = .zero
                    }
                }
            }
    }

    private var panGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                offset = value.translation
            }
            .onEnded { _ in
                withAnimation {
                    if scale <= 1 {
                        offset = .zero
                    }
                }
            }
    }

    private func loadImage() async {
        guard let url else {
            isLoading = false
            return
        }
        isLoading = true
        image = try? await ImageCache.shared.image(for: url)
        isLoading = false
    }
}
