import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./showcase.css";
import "./catalog.css";
import "./improvements.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const origin = `${host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: "Color Study | Look a little closer",
    description: "Explore ancient textiles, cave paintings, faded murals and painted sculpture in a searchable open photo database. Compare real photographs, try the open-source image lab, and contribute to an open photo collection.",
    icons: { icon: "/favicon.png" },
    openGraph: { title: "Color Study", description: "Look a little closer. A photo-enhancement lab.", type: "website", url: origin, images: [{ url: `${origin}/social/commons-nefertari-68.jpg`, width: 1200, height: 630, alt: "Tomb of Nefertari: source photograph and labeled false-color study." }] },
    twitter: { card: "summary_large_image", title: "Color Study", description: "Look a little closer. A photo-enhancement lab.", images: [`${origin}/social/commons-nefertari-68.jpg`] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
