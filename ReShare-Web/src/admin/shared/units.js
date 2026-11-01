// Nhãn hiển thị cho mã đơn vị chuẩn mà API trả về (piece, kg, bag, box, set).
// Dữ liệu cũ có thể đã lưu sẵn nhãn ("chiếc"), nên giá trị lạ được giữ nguyên.
export const UNIT_LABEL = Object.freeze({ piece: 'chiếc', kg: 'kg', bag: 'túi', box: 'thùng/hộp', set: 'bộ' })
export const unitLabel = (unit) => UNIT_LABEL[unit] || unit
