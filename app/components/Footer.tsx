import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-brand-black text-white pt-20 pb-12 px-6 mt-auto">
       <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16 border-b border-gray-800 pb-16">
            
            <div className="lg:col-span-2">
              <div className="text-3xl font-black tracking-tighter mb-6">
                어울림<span className="text-brand-point">.</span>
              </div>
              <div className="text-gray-400 text-sm space-y-2 leading-relaxed">
                 <p>상호명: 어울림</p>
                 <p>대표자: 홍길동 | 사업자등록번호: 123-45-67890</p>
                 <p>주소: 서울특별시 강남구 테헤란로 123, 4층</p>
                 <p>통신판매업신고: 제2026-서울강남-1234호</p>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-6">고객센터</h4>
              <ul className="text-gray-400 space-y-3 font-medium">
                <li><Link href="/refund" target="_blank" className="hover:text-brand-point transition-colors">환불규정</Link></li>
                <li><Link href="/report" className="hover:text-brand-point transition-colors">신고센터</Link></li>
                <li><Link href="/about" className="hover:text-brand-point transition-colors">회사소개</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-6">정책안내</h4>
              <ul className="text-gray-400 space-y-3 font-medium">
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
