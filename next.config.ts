import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Xuất bản build độc lập để image Docker nhỏ gọn (.next/standalone).
  output: "standalone",
};

export default nextConfig;
