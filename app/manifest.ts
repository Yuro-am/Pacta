import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "PACTA",
    short_name: "PACTA",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f8fb",
    theme_color: "#245db3",
    icons: [192, 512].map((size) => ({
      src: `/app-icon/${size}`,
      sizes: `${size}x${size}`,
      type: "image/png",
    })),
  };
}
