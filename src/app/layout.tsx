import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "External Post Launch",
  description: "Turn your Untappd check-ins into Buffer drafts that send people back to your profile.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
