import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Named *-raw: globals.css's @theme inline maps these to Tailwind's
// --font-display/--font-sans utility vars — same names would self-reference.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display-raw",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-body-raw",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "PersonalAssistant",
  description: "Courses, deadlines, tasks, notes, and a voice-driven assistant with cited knowledge lookup.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg-void text-text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
