import type { Metadata } from "next";

/**
 * 검색엔진용 공통 설정.
 *  - canonical·og:url 은 항상 이 주소(www 없음) + 끝에 "/" (next.config 의 trailingSlash: true 와 같음)
 *  - 페이지별 metadata 는 pageMetadata() 로 만든다. Next 는 openGraph·twitter 를 부모와 "통째로" 바꾸므로
 *    (얕은 병합) 이미지·사이트 이름까지 매번 함께 넣는다.
 */
export const SITE_ORIGIN = "https://thewoollim.com";
export const SITE_NAME = "어울림";

const OG_IMAGE = {
  url: "/images/og-main.jpg",
  width: 1024,
  height: 559,
  alt: "어울림 — 세상을 울리는 새로운 연결",
};

/** "/about" → "https://thewoollim.com/about/" (끝 "/" 보장) */
export function absoluteUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${p.endsWith("/") ? p : `${p}/`}`;
}

type PageMetaInput = {
  title: string;
  description: string;
  /** 사이트 안 경로 (예: "/about/") */
  path: string;
  /** 검색 결과에 넣지 않을 페이지 */
  noindex?: boolean;
  /** 공유 이미지 (없으면 대표 이미지) — "/uploads/..." 같은 사이트 경로나 절대 URL */
  image?: { url: string; alt: string };
};

export function pageMetadata({ title, description, path, noindex, image }: PageMetaInput): Metadata {
  const url = absoluteUrl(path);
  const images = image ? [{ url: image.url, alt: image.alt }] : [OG_IMAGE];
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images,
      locale: "ko_KR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map(i => i.url),
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** <script type="application/ld+json"> 내용 — "<" 를 이스케이프해 스크립트 주입을 막는다 (Next JSON-LD 가이드) */
export function jsonLdHtml(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
