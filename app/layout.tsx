import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://thewoollim.com"),
  title: "세상을 울리는 새로운 연결, 어울림",
  description: "과도한 소통 속에 잃어버린 진짜 관계. 어울림에서 감성적이고 깊이 있는 네트워킹을 경험하세요.",
  // ⚠️ 정식 오픈 시 아래 robots 줄을 삭제하세요
  robots: { index: false, follow: false },
  openGraph: {
    title: "어울림 | 세상을 울리는 새로운 연결",
    description: "진정성 있는 오프라인 매칭과 네트워킹의 시작. 어울림에서 감성적이고 깊이 있는 만남을 경험하세요.",
    url: "https://thewoollim.com",
    siteName: "어울림",
    images: [
      {
        url: "/images/og-main.jpg",
        width: 1024,
        height: 559,
        alt: "어울림 — 세상을 울리는 새로운 연결",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "어울림 | 세상을 울리는 새로운 연결",
    description: "진정성 있는 오프라인 매칭과 네트워킹의 시작.",
    images: ["/images/og-main.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

import LoadingSpinner from "./components/LoadingSpinner";
import ClientProviders from "./components/ClientProviders";
import { Suspense } from "react";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`font-sans`}>
      <head>
        <meta name="format-detection" content="telephone=no" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
        <script src="https://js.tosspayments.com/v1/payment" async></script>
      </head>
      <body className="bg-brand-lightgray text-brand-black antialiased font-sans selection:bg-brand-point selection:text-white">
        <ClientProviders>
          <Suspense fallback={null}>
            <LoadingSpinner />
          </Suspense>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
