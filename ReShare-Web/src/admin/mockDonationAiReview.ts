export type ReviewStatus = 'pending' | 'confirmed' | 'rejected';
export type DonationCategory = 'Quần áo' | 'Sách' | 'Đồ gia dụng';

export const donationCategories: DonationCategory[] = ['Quần áo', 'Sách', 'Đồ gia dụng'];

export interface AiPrediction {
  available: boolean;
  category: DonationCategory | null;
  confidence: number | null;
  reason: string | null;
}

export interface DonorConfirmation {
  method: 'ai' | 'manual';
  category: DonationCategory | null;
  status: ReviewStatus;
  summary: string;
}

export interface StaffConfirmation {
  canConfirm: boolean;
  category: DonationCategory | null;
  status: ReviewStatus;
  note: string;
}

export interface DonationAiReviewItem {
  id: string;
  donationId: string;
  warehouseId: 'hai-chau' | 'son-tra';
  createdAt: string;
  staffConfirmedAt?: string;
  staffName?: string;
  title: string;
  donorName: string;
  donorPhone?: string;
  donorEmail?: string;
  description?: string;
  condition?: string;
  category: string;
  donorInput: string;
  aiPrediction: AiPrediction;
  donorConfirmation: DonorConfirmation;
  staffConfirmation: StaffConfirmation;
}

export const mockDonationAiReviewItems: DonationAiReviewItem[] = [
  {
    id: 'ai-01',
    donationId: 'D-2048',
    warehouseId: 'hai-chau',
    createdAt: '2026-08-20T08:42:00+07:00',
    title: 'Bộ quần áo trẻ em',
    donorName: 'Nguyễn Minh',
    category: 'Quần áo',
    donorInput: 'AI suggestion was shown, donor chose a different category before staff review.',
    aiPrediction: {
      available: true,
      category: 'Quần áo',
      confidence: 0.92,
      reason: 'Hình ảnh cho thấy bộ quần áo trẻ em với kiểu dáng mịn, khả năng phân loại quần áo cao.'
    },
    donorConfirmation: {
      method: 'manual',
      category: 'Sách',
      status: 'pending',
      summary: 'Người cho đã nhập thủ công “Sách” để thể hiện lựa chọn riêng, khác với AI.'
    },
    staffConfirmation: {
      canConfirm: true,
      category: null,
      status: 'pending',
      note: 'Staff cần chọn danh mục cuối cùng trước khi xác nhận.'
    }
  },
  {
    id: 'ai-02',
    donationId: 'D-2104',
    warehouseId: 'hai-chau',
    createdAt: '2026-08-21T10:18:00+07:00',
    title: 'Nồi cơm điện cũ',
    donorName: 'Lê Thành',
    category: 'Đồ gia dụng',
    donorInput: 'No AI model available for this donation; donor entered category manually.',
    aiPrediction: {
      available: false,
      category: null,
      confidence: null,
      reason: null
    },
    donorConfirmation: {
      method: 'manual',
      category: 'Đồ gia dụng',
      status: 'pending',
      summary: 'Người cho đã nhập thủ công “Đồ gia dụng” vì không có AI hỗ trợ.'
    },
    staffConfirmation: {
      canConfirm: true,
      category: null,
      status: 'pending',
      note: 'Không có AI, cần staff xác nhận danh mục dựa trên dữ liệu người cho.'
    }
  },
  {
    id: 'ai-03',
    donationId: 'D-2161',
    warehouseId: 'hai-chau',
    createdAt: '2026-08-23T09:06:00+07:00',
    title: 'Bó sách thiếu nhi',
    donorName: 'Trần Hà',
    category: 'Sách',
    donorInput: 'AI prediction was low-confidence, donor used manual override.',
    aiPrediction: {
      available: true,
      category: 'Sách',
      confidence: 0.58,
      reason: 'Độ tin cậy thấp do hình ảnh có thể chứa sách và đồ chơi kết hợp trong cùng khối.'
    },
    donorConfirmation: {
      method: 'manual',
      category: 'Quần áo',
      status: 'confirmed',
      summary: 'Người cho ghi đè AI và chọn “Quần áo” thủ công, thể hiện quyết định độc lập.'
    },
    staffConfirmation: {
      canConfirm: true,
      category: null,
      status: 'pending',
      note: 'Mức tin cậy AI thấp, cần staff kiểm tra lại trước khi chốt danh mục.'
    }
  },
  {
    id: 'ai-04',
    donationId: 'D-2190',
    warehouseId: 'son-tra',
    createdAt: '2026-08-24T15:27:00+07:00',
    title: 'Đèn bàn cũ',
    donorName: 'Phạm Quí',
    category: 'Đồ gia dụng',
    donorInput: 'Staff confirmation blocked due to permission rules.',
    aiPrediction: {
      available: true,
      category: 'Đồ gia dụng',
      confidence: 0.89,
      reason: 'Hình ảnh cho thấy vật dụng gia dụng điện, hình dạng dễ nhận diện với dụng cụ nội thất.'
    },
    donorConfirmation: {
      method: 'ai',
      category: 'Quần áo',
      status: 'confirmed',
      summary: 'Người cho chọn danh mục khác với AI để minh họa rằng donor luôn có quyết định riêng.'
    },
    staffConfirmation: {
      canConfirm: false,
      category: null,
      status: 'pending',
      note: 'Tài khoản hiện tại không có quyền xác nhận danh mục donation này.'
    }
  },
  {
    id: 'ai-05', donationId: 'D-1501', warehouseId: 'hai-chau', createdAt: '2025-05-04T09:20:00+07:00', staffConfirmedAt: '2025-05-05T14:10:00+07:00', staffName: 'Nguyễn Văn An',
    title: 'Bộ sách thiếu nhi', donorName: 'Trần Ngọc Hà', donorPhone: '0900 123 401', donorEmail: 'ha.demo@reshare.local', description: 'Sách còn đầy đủ trang, bìa đã qua sử dụng.', condition: 'Còn tốt', category: 'Sách', donorInput: 'Donor xác nhận Sách sau khi xem gợi ý AI.',
    aiPrediction: { available: true, category: 'Sách', confidence: 0.94, reason: 'Ảnh có gáy và bìa của nhiều cuốn sách.' },
    donorConfirmation: { method: 'ai', category: 'Sách', status: 'confirmed', summary: 'Người gửi đồng ý với danh mục Sách do AI gợi ý.' },
    staffConfirmation: { canConfirm: true, category: 'Sách', status: 'confirmed', note: 'Staff kiểm tra và xác nhận Sách.' }
  },
  {
    id: 'ai-06', donationId: 'D-1502', warehouseId: 'hai-chau', createdAt: '2025-05-08T10:15:00+07:00', staffConfirmedAt: '2025-05-09T09:30:00+07:00', staffName: 'Nguyễn Văn An',
    title: 'Áo khoác trẻ em', donorName: 'Lê Mai', description: 'Áo sạch, khóa kéo hoạt động tốt.', condition: 'Còn tốt', category: 'Quần áo', donorInput: 'Donor nhập thủ công danh mục khác với AI.',
    aiPrediction: { available: true, category: 'Quần áo', confidence: 0.88, reason: 'Hình ảnh cho thấy áo khoác trẻ em.' },
    donorConfirmation: { method: 'manual', category: 'Sách', status: 'confirmed', summary: 'Donor chọn Sách thủ công, khác gợi ý AI.' },
    staffConfirmation: { canConfirm: true, category: 'Quần áo', status: 'confirmed', note: 'Staff xác nhận danh mục thực tế là Quần áo.' }
  },
  {
    id: 'ai-07', donationId: 'D-1503', warehouseId: 'hai-chau', createdAt: '2025-05-12T11:40:00+07:00', staffConfirmedAt: '2025-05-13T13:05:00+07:00', staffName: 'Nguyễn Văn An',
    title: 'Nồi cơm điện', donorName: 'Phạm Huy', condition: 'Đã qua sử dụng', category: 'Đồ gia dụng', donorInput: 'Donor đồng ý với gợi ý AI.',
    aiPrediction: { available: true, category: 'Đồ gia dụng', confidence: 0.91, reason: 'Ảnh thể hiện một thiết bị điện gia dụng.' },
    donorConfirmation: { method: 'ai', category: 'Đồ gia dụng', status: 'confirmed', summary: 'Donor chọn Đồ gia dụng từ gợi ý AI.' },
    staffConfirmation: { canConfirm: true, category: 'Đồ gia dụng', status: 'confirmed', note: 'Staff xác nhận đúng danh mục.' }
  },
  {
    id: 'ai-08', donationId: 'D-1504', warehouseId: 'hai-chau', createdAt: '2025-05-17T08:30:00+07:00', staffConfirmedAt: '2025-05-18T16:00:00+07:00', staffName: 'Nguyễn Văn An',
    title: 'Đồ chơi vải và sách', donorName: 'Võ Thảo', category: 'Quần áo', donorInput: 'Ảnh nhiều loại vật phẩm, AI không chắc chắn.',
    aiPrediction: { available: true, category: 'Sách', confidence: 0.52, reason: 'Ảnh gồm nhiều loại vật phẩm, cần staff xem trực tiếp.' },
    donorConfirmation: { method: 'manual', category: 'Quần áo', status: 'confirmed', summary: 'Donor nhập thủ công Quần áo.' },
    staffConfirmation: { canConfirm: true, category: 'Quần áo', status: 'confirmed', note: 'Staff chọn Quần áo; AI không trùng staff.' }
  },
  {
    id: 'ai-09', donationId: 'D-1505', warehouseId: 'hai-chau', createdAt: '2025-05-21T14:25:00+07:00', staffConfirmedAt: '2025-05-22T10:20:00+07:00', staffName: 'Nguyễn Văn An',
    title: 'Ấm đun nước', donorName: 'Đặng Phúc', category: 'Đồ gia dụng', donorInput: 'Không có model, donor tự nhập danh mục.',
    aiPrediction: { available: false, category: null, confidence: null, reason: null },
    donorConfirmation: { method: 'manual', category: 'Đồ gia dụng', status: 'confirmed', summary: 'Donor nhập Đồ gia dụng vì không có model AI.' },
    staffConfirmation: { canConfirm: true, category: 'Đồ gia dụng', status: 'confirmed', note: 'Staff xác nhận khi không có gợi ý AI.' }
  },
  {
    id: 'ai-10', donationId: 'D-1506', warehouseId: 'hai-chau', createdAt: '2025-05-29T09:40:00+07:00', staffConfirmedAt: '2025-05-30T11:10:00+07:00', staffName: 'Nguyễn Văn An',
    title: 'Bộ quần áo mùa hè', donorName: 'Ngô Bình', category: 'Quần áo', donorInput: 'Donor chấp nhận AI.',
    aiPrediction: { available: true, category: 'Quần áo', confidence: 0.9, reason: 'Hình ảnh chứa áo và quần.' },
    donorConfirmation: { method: 'ai', category: 'Quần áo', status: 'confirmed', summary: 'Donor chấp nhận gợi ý Quần áo.' },
    staffConfirmation: { canConfirm: true, category: 'Quần áo', status: 'confirmed', note: 'Staff xác nhận Quần áo.' }
  },
  {
    id: 'ai-11', donationId: 'D-1507', warehouseId: 'son-tra', createdAt: '2025-05-14T08:10:00+07:00', staffConfirmedAt: '2025-05-15T11:15:00+07:00', staffName: 'Trần Minh Quân',
    title: 'Áo len người lớn', donorName: 'Hoàng Nam', category: 'Quần áo', donorInput: 'Đơn thuộc kho Sơn Trà.',
    aiPrediction: { available: true, category: 'Quần áo', confidence: 0.84, reason: 'Ảnh cho thấy áo len.' },
    donorConfirmation: { method: 'ai', category: 'Quần áo', status: 'confirmed', summary: 'Donor chọn Quần áo.' },
    staffConfirmation: { canConfirm: true, category: 'Quần áo', status: 'confirmed', note: 'Staff Sơn Trà xác nhận.' }
  },
  {
    id: 'ai-12', donationId: 'D-1508', warehouseId: 'son-tra', createdAt: '2025-05-26T15:35:00+07:00', staffConfirmedAt: '2025-05-27T09:40:00+07:00', staffName: 'Trần Minh Quân',
    title: 'Hộp sách và đồ dùng', donorName: 'Đỗ My', category: 'Đồ gia dụng', donorInput: 'Đơn thuộc kho Sơn Trà, donor chọn thủ công.',
    aiPrediction: { available: true, category: 'Sách', confidence: 0.61, reason: 'Ảnh có sách và đồ dùng gia đình.' },
    donorConfirmation: { method: 'manual', category: 'Đồ gia dụng', status: 'confirmed', summary: 'Donor chọn Đồ gia dụng thủ công.' },
    staffConfirmation: { canConfirm: true, category: 'Đồ gia dụng', status: 'confirmed', note: 'Staff xác nhận Đồ gia dụng.' }
  }
];
