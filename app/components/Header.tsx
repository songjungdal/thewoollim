"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  
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
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between text-white">
        <Link href="/" className="text-2xl font-black tracking-tighter cursor-pointer">
          어울림<span className="text-brand-point">.</span>
        </Link>
        
        <nav className="hidden md:flex gap-8 font-semibold text-sm">
          <Link href="/#apply" onClick={(e) => handleScroll(e, 'apply')} className="hover:text-brand-point transition-colors">참여하기</Link>
          <Link href="/#gallery" onClick={(e) => handleScroll(e, 'gallery')} className="hover:text-brand-point transition-colors">후기갤러리</Link>
          <Link href="/#participants" onClick={(e) => handleScroll(e, 'participants')} className="hover:text-brand-point transition-colors">참여자 명단</Link>
          <Link href="/#schedule" onClick={(e) => handleScroll(e, 'schedule')} className="hover:text-brand-point transition-colors">매칭파티 일정</Link>
          <Link href="/#faq" onClick={(e) => handleScroll(e, 'faq')} className="hover:text-brand-point transition-colors">FAQ</Link>
          <Link href="/login" className="text-brand-point font-bold transition-transform hover:scale-105">로그인</Link>
        </nav>

        <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          {isMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {isMenuOpen && (
        <div className="md:hidden absolute top-20 left-0 w-full bg-black border-b border-gray-800 p-6 flex flex-col gap-6 font-semibold text-white shadow-2xl">
          <Link href="/#apply" onClick={(e) => handleScroll(e, 'apply')}>참여하기</Link>
          <Link href="/#gallery" onClick={(e) => handleScroll(e, 'gallery')}>후기갤러리</Link>
          <Link href="/#schedule" onClick={(e) => handleScroll(e, 'schedule')}>매칭파티 일정</Link>
          <Link href="/#faq" onClick={(e) => handleScroll(e, 'faq')}>FAQ</Link>
          <Link href="/login" className="text-brand-point font-bold" onClick={() => setIsMenuOpen(false)}>로그인</Link>
        </div>
      )}
    </header>
  );
}
