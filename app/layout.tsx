import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const origin = `${host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: "Color Study | Look a little closer",
    description: "Explore subtle color with a private, in-browser photo-enhancement lab. Compare images, select surfaces, export full-resolution results, and discover archaeological targets.",
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
