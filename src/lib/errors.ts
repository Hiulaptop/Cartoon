// Lỗi truy vấn của Drizzle chỉ ghi "Failed query: ..."; lý do thật (sai mật khẩu, lỗi TLS...) nằm ở `cause`.
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.cause instanceof Error ? `${error.cause.message} (${error.message.split("\n")[0]})` : error.message;
  }
  return String(error);
}
