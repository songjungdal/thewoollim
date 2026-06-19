"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Header from "./components/Header";
import Footer from "./components/Footer";

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen bg-brand-lightgray text-brand-black">
      <Header />
      
      <main className="flex-1 flex items-center justify-center px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center max-w-xl"
        >
          <h1 className="text-8xl md:text-9xl font-black tracking-tighter text-gray-200 mb-4">404</h1>
          <h2 className="text-3xl md:text-4xl font-bold mb-6 tracking-tight">원하시는 페이지를 찾을 수 없습니다.</h2>
          <p className="text-lg text-gray-500 mb-12 font-medium leading-relaxed">
            찾으시는 페이지가 삭제되었거나 주소가 변경되었습니다.<br />
            아래 버튼을 눌러 어울림 메인으로 돌아가실 수 있습니다.
          </p>
          
          <Link 
            href="/" 
            className="inline-flex items-center justify-center bg-brand-point text-white px-10 py-5 rounded-full text-lg font-bold hover:brightness-110 transition-all shadow-lg hover:shadow-brand-point/30"
          >
            메인으로 돌아가기
          </Link>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
