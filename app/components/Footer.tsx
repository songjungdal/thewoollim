"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import COMPANY_SNAPSHOT from "../lib/company-snapshot.json";

type Company = { name: string; ceo: string; biz_no: string; address: string; telecom: string };

const STORAGE_KEY = "woollim_company";
const CHANNEL_NAME = "woollim_company";

/**
 * 빌드 타임에 production /api/admin/company.php 응답을 가져와
 * app/lib/company-snapshot.json 으로 박아둠 (scripts/sync-company.mjs).
 *
 * useState 초기값 = 그 스냅샷 → SSR HTML과 client hydration이 동일 값으로 렌더 →
 * hydration mismatch / 텍스트 점프(layout shift) 0.
 *
 * 마운트 후 BroadcastChannel + storage + focus 이벤트로 실시간 동기화 유지.
 */
export default function Footer() {
  const [company, setCompany] = useState<Company>(COMPANY_SNAPSHOT as Company);

  const fetchCompany = useCallback(() => {
    fetch("/api/admin/company.php", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.company) return;
        setCompany(prev => {
          // 동일 값이면 setState skip → 리렌더 0
          if (JSON.stringify(prev) === JSON.stringify(d.company)) return prev;
          return d.company;
        });
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d.company)); } catch {}
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // 빌드 이후 변경분 한 번 동기화 (대부분 스냅샷과 동일 → 변화 없음)
    fetchCompany();

    // 같은 브라우저 다른 탭(관리자 화면)의 즉시 알림
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener("message", fetchCompany);
    } catch {}

    // localStorage 변경 알림 (BroadcastChannel 미지원 폴백)
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) fetchCompany(); };
    // 탭 활성화 시 새로고침 (다른 디바이스 변경분 반영)
    const onVisibility = () => { if (document.visibilityState === "visible") fetchCompany(); };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", fetchCompany);
    window.addEventListener("pageshow", fetchCompany);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      channel?.removeEventListener("message", fetchCompany);
      channel?.close();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", fetchCompany);
      window.removeEventListener("pageshow", fetchCompany);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchCompany]);

  return (
    <footer className="bg-brand-black text-white pt-14 md:pt-20 pb-8 md:pb-12 px-4 md:px-6 mt-auto">
       <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 mb-10 md:mb-16 border-b border-gray-800 pb-10 md:pb-16">

            <div className="col-span-2 lg:col-span-2">
              <div className="mb-5 md:mb-6">
                <Image src="/images/logo_white.png" alt="어울림 로고" width={129} height={41} />
              </div>
              <div className="text-gray-400 text-xs md:text-sm space-y-1.5 md:space-y-2 leading-relaxed">
                 <p>상호명: {company.name}</p>
                 <p>대표자: {company.ceo} | 사업자등록번호: {company.biz_no}</p>
                 <p>주소: {company.address}</p>
                 <p>통신판매업신고: {company.telecom}</p>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-sm md:text-lg mb-4 md:mb-6">고객센터</h4>
              <ul className="text-gray-400 space-y-2 md:space-y-3 font-medium text-sm md:text-base">
                <li><Link href="/refund" className="hover:text-brand-point transition-colors">환불규정</Link></li>
                <li><Link href="/report" className="hover:text-brand-point transition-colors">신고센터</Link></li>
                <li><Link href="/about" className="hover:text-brand-point transition-colors">회사소개</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-sm md:text-lg mb-4 md:mb-6">정책안내</h4>
              <ul className="text-gray-400 space-y-2 md:space-y-3 font-medium text-sm md:text-base">
                <li><Link href="/terms" className="hover:text-brand-point transition-colors">이용약관</Link></li>
                <li><Link href="/privacy" className="hover:text-brand-point transition-colors">개인정보처리방침</Link></li>
                <li><Link href="/partnership" className="hover:text-brand-point transition-colors">협업 및 제휴문의</Link></li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center text-gray-500 text-sm font-medium">
            <p>Copyright © {company.name} All rights reserved.</p>
            <div className="flex gap-4 mt-6 md:mt-0">
              <a href="#" className="hover:text-white transition-colors">Instagram</a>
              <a href="#" className="hover:text-white transition-colors">Kakao Channel</a>
            </div>
          </div>
       </div>
    </footer>
  );
}
