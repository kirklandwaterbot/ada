import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: "files.mta.info",
        pathname: "/s3fs-public/**",
        protocol: "https",
      },
      {
        hostname: "www.mta.info",
        pathname: "/modules/custom/mta_article/images/**",
        protocol: "https",
      },
    ],
  },
};

export default nextConfig;
