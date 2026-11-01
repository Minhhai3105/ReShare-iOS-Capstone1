// Thân phản hồi lỗi. Lỗi 500 là lỗi nội bộ (Firestore, Auth, bug) nên chỉ trả câu chung:
// `code`/`details` của chúng chứa mã gRPC và link console kèm project id, không được lộ ra client.
function errorBody(error, status) {
  if (status === 500) return { message: 'Internal server error' };
  const body = { message: error.message };
  if (error.code) body.code = error.code;
  if (error.details) body.details = error.details;
  return body;
}

module.exports = { errorBody };
