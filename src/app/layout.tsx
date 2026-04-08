import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Commerce OS",
  description: "Amazon FBA analytics & operations platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          {/* Prevent FOUC: apply persisted theme before first paint */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=JSON.parse(localStorage.getItem('commerce-os-ui')||'{}');if(t.state&&t.state.theme==='light')document.documentElement.classList.add('light')}catch(e){}})()`,
            }}
          />
        </head>
        <body className={`${inter.variable} ${ibmPlexMono.variable} font-sans`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
