import SwiftUI
import UIKit

extension View {
    /// Áp dụng tại màn gốc để bao phủ cả các form và sheet của app.
    func dismissKeyboardOnInteraction() -> some View {
        self
            // Chỉ cử chỉ kéo xuống bên dưới đóng bàn phím; cuộn ngang vẫn giữ ô nhập.
            .scrollDismissesKeyboard(.never)
            .background(KeyboardDismissalInstaller().frame(width: 0, height: 0))
    }
}

private struct KeyboardDismissalInstaller: UIViewRepresentable {
    func makeUIView(context: Context) -> KeyboardDismissalView {
        KeyboardDismissalView()
    }

    func updateUIView(_ uiView: KeyboardDismissalView, context: Context) {}

    static func dismantleUIView(_ uiView: KeyboardDismissalView, coordinator: ()) {
        uiView.detachGestures()
    }
}

private final class KeyboardDismissalView: UIView, UIGestureRecognizerDelegate {
    private weak var attachedWindow: UIWindow?

    private lazy var outsideTap = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
    private lazy var downwardPan: UIPanGestureRecognizer = {
        let gesture = UIPanGestureRecognizer(target: self, action: #selector(handleDownwardPan))
        gesture.maximumNumberOfTouches = 1
        return gesture
    }()

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard attachedWindow !== window else { return }
        detachGestures()
        guard let window else { return }
        attachedWindow = window

        for gesture in [outsideTap, downwardPan] {
            gesture.delegate = self
            gesture.cancelsTouchesInView = false
            gesture.delaysTouchesBegan = false
            gesture.delaysTouchesEnded = false
            window.addGestureRecognizer(gesture)
        }
    }

    func detachGestures() {
        attachedWindow?.removeGestureRecognizer(outsideTap)
        attachedWindow?.removeGestureRecognizer(downwardPan)
        attachedWindow = nil
    }

    @objc private func dismissKeyboard() {
        attachedWindow?.endEditing(true)
    }

    @objc private func handleDownwardPan(_ gesture: UIPanGestureRecognizer) {
        if gesture.state == .began { dismissKeyboard() }
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === downwardPan else { return true }
        let velocity = downwardPan.velocity(in: attachedWindow)
        return velocity.y > 0 && velocity.y > abs(velocity.x)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // Giữ nguyên việc đặt con trỏ, chọn chữ, chuyển ô và bấm các control UIKit.
        var view = touch.view
        while let current = view {
            if current is UITextField || current is UITextView || current is UIControl {
                return false
            }
            view = current.superview
        }
        return true
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }
}
