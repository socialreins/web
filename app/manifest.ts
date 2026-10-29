import type { MetadataRoute } from "next";

// Home-screen and Android icons. The maskable one keeps the mark inside the central safe circle.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SocialReins",
    short_name: "SocialReins",
    start_url: "/app",
    display: "standalone",
    background_color: "#faf8f6",
    theme_color: "#121212",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
