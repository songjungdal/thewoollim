import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "세상을 울리는 새로운 연결, 어울림",
  description: "과도한 소통 속에 잃어버린 진짜 관계. 어울림에서 감성적이고 깊이 있는 네트워킹을 경험하세요.",
  // ⚠️ 정식 오픈 시 아래 robots 줄을 삭제하세요
  robots: { index: false, follow: false },
  openGraph: {
    title: "어울림 | 새로운 연결",
    description: "진정성 있는 오프라인 매칭과 네트워킹의 시작.",
    url: "https://thewoollim.com",
    siteName: "어울림",
    images: [{ url: "/og-image.jpg" }],
    type: "website",
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
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
        <script src="https://cdn.portone.io/v2/browser-sdk.js" async></script>
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
