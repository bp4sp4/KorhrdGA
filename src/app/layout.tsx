import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Eduvisor GA System",
  description: "1인 GA 담당자용 고객·매출 관리 CRM",
};

// Supabase(서울, ap-northeast-2)와 같은 리전에서 서버 함수 실행 → 인증/DB 왕복 지연 최소화
export const preferredRegion = "icn1";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
