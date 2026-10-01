import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  title: "EchoVault — Cinematic memory for onchain life",
  description:
    "Turn verified Base transactions into prompt-steerable cinematic memories with Visko Orbis on Reactor.",
  openGraph: {
    title: "EchoVault",
    description: "Blockchain records what happened. EchoVault remembers what it felt like.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
