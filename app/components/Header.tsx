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
          <Link href="/#apply" onClick={(e) => handleScroll(e, 'apply')} className="hover:text-brand-point transition-colors">참여하기</Link>
          <Link href="/#gallery" onClick={(e) => handleScroll(e, 'gallery')} className="hover:text-brand-point transition-colors">후기갤러리</Link>
          <Link href="/#participants" onClick={(e) => handleScroll(e, 'participants')} className="hover:text-brand-point transition-colors">실시간 참여자</Link>
          <Link href="/#schedule" onClick={(e) => handleScroll(e, 'schedule')} className="hover:text-brand-point transition-colors">매칭파티 일정</Link>
          <Link href="/#faq" onClick={(e) => handleScroll(e, 'faq')} className="hover:text-brand-point transition-colors">FAQ</Link>
          {mounted && isLoggedIn ? (
            <div className="flex items-center gap-4">
              <Link href="/mypage" className="relative hover:text-brand-point transition-colors">
                <ShoppingBag size={22} />
                {cart.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-brand-point text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">{cart.reduce((s, i) => s + (i.quantity ?? 1), 0)}</span>
                )}
              </Link>
              <Link href="/mypage" className="text-brand-point font-bold transition-transform hover:scale-105">마이페이지</Link>
            </div>
          ) : (
            <Link href="/login" className="text-brand-point font-bold transition-transform hover:scale-105">로그인</Link>
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
