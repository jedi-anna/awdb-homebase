import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "External Post Launch",
  description: "Turn reviews from niche platforms into social posts, sent through Buffer, that bring people back to your profile.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
