import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Learn AWS · SAA-C03",
    short_name: "Learn AWS",
    description: "Estudio diario para AWS Solutions Architect Associate",
    start_url: "/",
    display: "standalone",
    background_color: "#111110",
    theme_color: "#111110",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
