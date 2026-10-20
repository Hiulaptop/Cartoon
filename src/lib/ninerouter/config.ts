import "server-only";

// Chỉ import file này từ code chạy trên server (Server Component, route handler, server action).
export const NINE_ROUTER_BASE_URL = process.env.NINE_ROUTER_BASE_URL ?? "";
export const NINE_ROUTER_API_KEY = process.env.NINE_ROUTER_API_KEY ?? "";
