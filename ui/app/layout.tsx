import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet/WalletProvider";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Barista DEX - Decentralized Perpetuals Trading",
  description: "Trade perpetual futures on Solana with up to 10x leverage",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground`}>
        <WalletProvider>
          {children}
          <Toaster theme="dark" position="bottom-right" />
        </WalletProvider>
      </body>
    </html>
  );
}
