import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['100.81.62.2'],
  async headers() {
    return [
      {
        // Stops any page on the app (including the login/dashboard) from being
        // framed by a third-party site — including a customer's own uploaded
        // custom-hosted site. The negative lookahead exempts the embeddable
        // booking widget below so its own permissive rule wins (X-Frame-Options
        // can't be scoped to "allow any", so it must simply be absent there).
        source: '/((?!site/[^/]+/book/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
      {
        // The public booking widget is meant to be embedded in the tradie's own
        // website via <iframe>, so any origin may frame it. This does NOT open a
        // payment hole: /site/<slug>/book/<pkg> is still gated server-side by the
        // bookings_website add-on (hasAddon), so an embed on an unsubscribed
        // account 404s. No X-Frame-Options here (its presence would block framing
        // regardless of CSP).
        source: '/site/:slug/book/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
    ]
  },
};

export default nextConfig;
