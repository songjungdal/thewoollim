import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-brand-black text-white pt-14 md:pt-20 pb-8 md:pb-12 px-4 md:px-6 mt-auto">
       <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 mb-10 md:mb-16 border-b border-gray-800 pb-10 md:pb-16">

            <div className="col-span-2 lg:col-span-2">
              <div className="mb-5 md:mb-6">
                <Image src="/images/logo_white.png" alt="어울림 로고" width={140} height={45} />
              </div>
              <div className="text-gray-400 text-xs md:text-sm space-y-1.5 md:space-y-2 leading-relaxed">
                 <p>상호명: 어울림</p>
                 <p>대표자: 홍길동 | 사업자등록번호: 123-45-67890</p>
                 <p>주소: 서울특별시 강남구 테헤란로 123, 4층</p>
                 <p>통신판매업신고: 제2026-서울강남-1234호</p>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-sm md:text-lg mb-4 md:mb-6">고객센터</h4>
              <ul className="text-gray-400 space-y-2 md:space-y-3 font-medium text-sm md:text-base">
                <li><Link href="/refund" target="_blank" className="hover:text-brand-point transition-colors">환불규정</Link></li>
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
            <p>Copyright © 어울림 All rights reserved.</p>
            <div className="flex gap-4 mt-6 md:mt-0">
              <a href="#" className="hover:text-white transition-colors">Instagram</a>
              <a href="#" className="hover:text-white transition-colors">Kakao Channel</a>
            </div>
          </div>
       </div>
    </footer>
  );
}
