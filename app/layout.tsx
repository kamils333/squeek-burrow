import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Squeek Burrow — idle game powered by a real hamster",
  icons: { icon: "/favicon.svg" },
  description:
    "An idle game where Squeektoshi's real wheel on Squeekchain grows your seeds. Community project for the Squeekchain Genesis Buildooooor badge.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
