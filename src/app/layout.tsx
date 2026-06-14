import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakartaSans = Plus_Jakarta_Sans({
 subsets: ["latin"],
 weight: ["400", "500", "600", "700", "800"],
 display: "swap",
 variable: "--font-jakarta",
});

export const metadata: Metadata = {
 title: "Transit Admin | Route Optimizer",
 description: "Transit Admin - Nagpur-MIHAN Corporate Route Optimizers",
 manifest: "/manifest.json",
 appleWebApp: {
 capable: true,
 statusBarStyle: "default",
 title: "TransitApp",
 },
 formatDetection: {
 telephone: false,
 },
};

export const viewport: Viewport = {
 themeColor: "#1c1b1f",
 width: "device-width",
 initialScale: 1,
 maximumScale: 1,
 userScalable: false,
};

export default function RootLayout({
 children,
}: Readonly<{
 children: React.ReactNode;
}>) {
 return (
 <html lang="en" className="h-full" suppressHydrationWarning>
 <body
 className={`${jakartaSans.variable} min-h-full flex flex-col bg-white text-[#1c1b1f] antialiased`}
 style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif" }}
 suppressHydrationWarning
 >
 {children}
 </body>
 </html>
 );
}
