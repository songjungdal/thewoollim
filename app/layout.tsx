import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://thewoollim.com"),
  title: "세상을 울리는 새로운 연결, 어울림",
  description: "과도한 소통 속에 잃어버린 진짜 관계. 어울림에서 감성적이고 깊이 있는 네트워킹을 경험하세요.",
  // 정식 오픈 — 검색 색인 허용 (index/follow). robots.txt 와 일관.
  robots: { index: true, follow: true },
  // 네이버 서치어드바이저 사이트 소유확인
  verification: {
    other: {
      "naver-site-verification": "715df841ccaf5844edf9a1122f85f9b18fad87f7",
    },
  },
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

import ClientProviders from "./components/ClientProviders";

// LoadingSpinner 제거됨 — useSearchParams 의 ref instability 로 인한 effect 무한 재실행이
// stale closure 와 결합해 spinner 가 영구 표시되는 버그가 있었음.
// 정적 export 환경(SSG)에서는 실제 라우트 전환 지연이 없어 spinner 자체가 무의미.

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
        <script src="https://cdn.iamport.kr/v1/iamport.js" async></script>
      </head>
      <body className="bg-brand-lightgray text-brand-black antialiased font-sans selection:bg-brand-point selection:text-white">
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
