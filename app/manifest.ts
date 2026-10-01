import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EchoVault",
    short_name: "EchoVault",
    description: "Turn verified onchain moments into cinematic, steerable memories.",
    start_url: "/",
    display: "standalone",
    background_color: "#e9e1d2",
    theme_color: "#171718",
  };
}
