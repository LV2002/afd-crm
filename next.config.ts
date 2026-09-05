import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        /**
         * `X-Robots-Tag` on every response, HTML or not.
         *
         * The `noindex` metadata in the root layout only reaches things
         * that render a `<head>`. A crawler that fetches a PDF, a JSON
         * route or a signed file URL directly never sees it — this header
         * does, and it is the layer that covers them.
         *
         * Together with `robots.ts` that is three independent ways of
         * saying the same thing, which is the right number for a system
         * holding students' phone numbers and fee records.
         */
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
          // Nothing here should ever be framed by another site: this is an
          // internal tool, and a page that can be framed can be clickjacked.
          { key: "X-Frame-Options", value: "DENY" },
          // Stops a browser second-guessing a content type, which is how a
          // text upload becomes an executed script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // A CRM URL carries lead ids and search terms. Send the origin
          // only, never the full path, when a user follows a link out.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
