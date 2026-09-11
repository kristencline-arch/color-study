import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./showcase.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const origin = `${host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: "Color Study | Look a little closer",
    description: "Look closer at cave paintings, faded murals and painted marble. Compare real photographs, try the open-source image lab, and contribute to an open photo collection.",
    icons: { icon: "/favicon.png" },
    openGraph: { title: "Color Study", description: "Look a little closer. A photo-enhancement lab.", type: "website", url: origin, images: [{ url: `${origin}/og.png`, width: 1536, height: 1024, alt: "Color Study. Look a little closer. A photo-enhancement lab." }] },
    twitter: { card: "summary_large_image", title: "Color Study", description: "Look a little closer. A photo-enhancement lab.", images: [`${origin}/og.png`] },
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
