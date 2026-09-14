import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  redirect,
} from "react-router";

import type { LoaderFunctionArgs } from "react-router";

const RAILWAY_PRODUCTION_HOST =
  "hair-grab-core-production.up.railway.app";
const SELLER_CANONICAL_ORIGIN =
  "https://seller.hairgrab.com";

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  if (
    url.hostname === RAILWAY_PRODUCTION_HOST &&
    (url.pathname === "/seller" ||
      url.pathname.startsWith("/seller/"))
  ) {
    return redirect(
      `${SELLER_CANONICAL_ORIGIN}${url.pathname}${url.search}`,
      308,
    );
  }

  return null;
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1"
        />

        <link
          rel="icon"
          type="image/png"
          href="/hg-bag-favicon.png?v=1"
        />

        <link
          rel="shortcut icon"
          type="image/png"
          href="/hg-bag-favicon.png?v=1"
        />

        <link
          rel="apple-touch-icon"
          href="/hg-bag-favicon.png?v=1"
        />

        <meta
          name="theme-color"
          content="#4B1678"
        />

        <link
          rel="preconnect"
          href="https://cdn.shopify.com/"
        />

        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />

        <Meta />
        <Links />
      </head>

      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
