import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

// Customizes the static HTML document for the web build (Expo Router). This is where the PWA
// head tags (manifest, theme color, Apple home-screen meta) and the service-worker registration
// live. Runs only at static-render time for web; native is unaffected.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no, viewport-fit=cover" />

        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2979FF" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Pricr" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="description" content="AI-powered quote tool for service businesses" />

        {/* Disables body scrolling on web so the RN ScrollViews own scrolling. */}
        <ScrollViewStyleReset />

        {/* Dark app background on every web surface so no white bar bleeds through below the app
            (html/body/#root default to white, and #root must fill the full viewport height). */}
        <style dangerouslySetInnerHTML={{ __html: `
          html, body, #root { margin: 0; padding: 0; background-color: #0A0E1A; }
          html, body { height: 100%; min-height: 100%; }
          /* iOS Safari: cover the area behind the home indicator / dynamic toolbars too. */
          html { min-height: -webkit-fill-available; }
          #root { min-height: 100vh; min-height: -webkit-fill-available; display: flex; flex-direction: column; }
        ` }} />

        {/* Register the service worker (caches the app shell; never caches API calls). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
