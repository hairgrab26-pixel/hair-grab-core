import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

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