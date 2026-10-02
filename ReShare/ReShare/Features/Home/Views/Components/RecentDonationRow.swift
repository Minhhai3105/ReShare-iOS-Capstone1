import SwiftUI

/// Hàng hiển thị 1 món đồ quyên góp gần đây kèm Badge trạng thái chuẩn Figma
struct RecentDonationRow: View {
    let item: DonationItem

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            // Cột 1: Icon danh mục bọc trong khung vuông bo góc
            ZStack(alignment: .bottomTrailing) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.green.opacity(0.10))
                    .frame(width: 48, height: 48)

                Image(systemName: item.category.iconName)
                    .font(.system(size: 20))
                    .foregroundColor(Color(red: 0.11, green: 0.35, blue: 0.20))
                    .frame(width: 48, height: 48)

                // Chấm màu nhận diện góc dưới
                Circle()
                    .fill(item.status.color)
                    .frame(width: 8, height: 8)
                    .offset(x: -4, y: -4)
            }

            // Cột 2: Tên món đồ + Danh mục + Ngày tạo
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(Color.primary)
                    .lineLimit(1)

                Text("\(item.category.title) · \(formattedDate(item.createdAt))")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            // Cột 3: Badge trạng thái + Lời nhắn ghi chú bên dưới
            VStack(alignment: .trailing, spacing: 4) {
                // Badge trạng thái (Pending, Approved, Distributed...)
                HStack(spacing: 4) {
                    Circle()
                        .fill(item.status.color)
                        .frame(width: 6, height: 6)

                    Text(item.status.title)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(item.status.color)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(item.status.color.opacity(0.12))
                )

                // Note mô tả ngắn trạng thái từ admin
                Text(item.statusNote ?? item.status.statusDescription)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 10)
    }

    // Hàm định dạng ngày hiển thị thân thiện (Hôm nay, Hôm qua hoặc 14/10)
    private func formattedDate(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm"
            return "Hôm nay, \(formatter.string(from: date))"
        } else if calendar.isDateInYesterday(date) {
            return "Hôm qua"
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = "dd/MM"
            return formatter.string(from: date)
        }
    }
}

#Preview {
    VStack {
        RecentDonationRow(item: DonationItem.mockRecentItems[0])
        Divider()
        RecentDonationRow(item: DonationItem.mockRecentItems[1])
        Divider()
        RecentDonationRow(item: DonationItem.mockRecentItems[2])
    }
    .padding()
    .background(Color.white)
}
