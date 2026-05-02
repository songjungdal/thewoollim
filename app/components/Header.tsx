"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const { isLoggedIn, mounted, cart } = useAuth();
  
  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (pathname === "/") {
      e.preventDefault();
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
        setIsMenuOpen(false);
        // Cleanly update URL without duplicating #
        window.history.pushState(null, "", `/#${id}`);
      }
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-black backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-6 h-[72px] md:h-24 flex items-center justify-between text-white">
        <Link href="/" className="cursor-pointer">
          <Image src="/images/logo_white.png" alt="어울림 로고" width={120} height={39} priority />
        </Link>
        
        <nav className="hidden md:flex items-center gap-8 font-semibold text-sm">
          {/*
            navItemClass: 호버 시 1.08배 확대 + 청록 시그니처 색상 + 0.3s ease-in-out 부드러운 전환
              - inline-block: <a> 기본 inline 이라 transform 미적용 → 변환 가능 형태로
              - px-1 py-1.5: 클릭 영역 일정 확보 (확대해도 레이아웃 흔들림 없음 — transform 은 reflow 미발생)
              - transition-all: color + transform 동시 부드럽게
              - origin-center: 좌우 균등 확대
          */}
          {[
            { href: "/#apply",        id: "apply",        label: "참여하기" },
            { href: "/#gallery",      id: "gallery",      label: "후기갤러리" },
            { href: "/#participants", id: "participants", label: "실시간 참여자" },
            { href: "/#schedule",     id: "schedule",     label: "매칭파티 일정" },
            { href: "/#faq",          id: "faq",          label: "FAQ" },
          ].map(item => (
            <Link
              key={item.id}
              href={item.href}
              onClick={(e) => handleScroll(e, item.id)}
              className="inline-block px-1 py-1.5 origin-center hover:text-brand-point hover:scale-[1.2] transition-all duration-300 ease-in-out"
            >
              {item.label}
            </Link>
          ))}
          {mounted && isLoggedIn ? (
            <div className="flex items-center gap-4">
              <Link
                href="/mypage"
                className="relative inline-block p-1.5 origin-center hover:text-brand-point hover:scale-[1.2] transition-all duration-300 ease-in-out"
              >
                <ShoppingBag size={22} />
                {cart.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-point text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">{cart.reduce((s, i) => s + (i.quantity ?? 1), 0)}</span>
                )}
              </Link>
              <Link
                href="/mypage"
                className="inline-block px-1 py-1.5 origin-center text-brand-point font-bold hover:scale-[1.2] transition-all duration-300 ease-in-out"
              >
                마이페이지
              </Link>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-block px-1 py-1.5 origin-center text-brand-point font-bold hover:scale-[1.2] transition-all duration-300 ease-in-out"
            >
              로그인
            </Link>
          )}
        </nav>

        <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          {isMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {isMenuOpen && (
        <div className="md:hidden absolute top-[72px] left-0 w-full bg-black border-b border-gray-800 p-6 flex flex-col gap-6 font-semibold text-white shadow-2xl">
          <Link href="/#apply" onClick={(e) => handleScroll(e, 'apply')}>참여하기</Link>
          <Link href="/#gallery" onClick={(e) => handleScroll(e, 'gallery')}>후기갤러리</Link>
          <Link href="/#participants" onClick={(e) => handleScroll(e, 'participants')}>실시간 참여자</Link>
          <Link href="/#schedule" onClick={(e) => handleScroll(e, 'schedule')}>매칭파티 일정</Link>
          <Link href="/#faq" onClick={(e) => handleScroll(e, 'faq')}>FAQ</Link>
          {mounted && isLoggedIn ? (
            <Link href="/mypage" className="text-brand-point font-bold flex items-center gap-2" onClick={() => setIsMenuOpen(false)}>
              마이페이지 {cart.length > 0 && <span className="bg-brand-point text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">{cart.reduce((s, i) => s + (i.quantity ?? 1), 0)}</span>}
            </Link>
          ) : (
            <Link href="/login" className="text-brand-point font-bold" onClick={() => setIsMenuOpen(false)}>로그인</Link>
          )}
        </div>
      )}
    </header>
  );
}
