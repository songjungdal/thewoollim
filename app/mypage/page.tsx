"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, LogOut, User, Trash2, Calendar, MapPin } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import { PARTIES } from "../lib/data";

export default function MyPage() {
  const { mounted, isLoggedIn, userEmail, logout, cart, removeFromCart } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (mounted && !isLoggedIn) {
      router.push("/login?redirect=/mypage");
    }
  }, [mounted, isLoggedIn, router]);

  if (!mounted || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-brand-black flex items-center justify-center">
        <div className="text-white font-bold text-lg">Loading...</div>
      </div>
    );
  }

  const cartParties = cart
    .map(item => PARTIES.find(p => p.id === item.partyId))
    .filter(Boolean) as typeof PARTIES;

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <div className="flex flex-col min-h-screen bg-brand-lightgray">
      <Header />
      <main className="flex-1">

        {/* Profile Banner */}
        <section className="bg-brand-black text-white py-12 md:py-20 px-4 md:px-6">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-brand-point rounded-full flex items-center justify-center flex-shrink-0">
                <User size={30} className="text-white md:hidden" />
                <User size={38} className="text-white hidden md:block" />
              </div>
              <div>
                <p className="text-gray-400 text-xs md:text-sm font-medium mb-1">관리자 계정</p>
                <h1 className="text-xl md:text-3xl font-black">안녕하세요!</h1>
                <p className="text-gray-400 text-sm mt-1">{userEmail}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-5 py-3 rounded-xl font-bold transition-all text-sm w-fit"
            >
              <LogOut size={15} /> 로그아웃
            </button>
          </div>
        </section>

        {/* Cart Section */}
        <section className="py-10 md:py-16 px-4 md:px-6">
          <div className="max-w-4xl mx-auto">

            <div className="flex items-center gap-3 mb-7 md:mb-10">
              <ShoppingBag size={22} className="text-brand-point" />
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">장바구니</h2>
              <span className="bg-brand-point text-white text-xs font-black px-2.5 py-1 rounded-full">{cart.length}</span>
            </div>

            {cartParties.length === 0 ? (
              <div className="bg-white rounded-2xl md:rounded-3xl p-10 md:p-16 text-center border border-gray-100">
                <ShoppingBag size={44} className="text-gray-200 mx-auto mb-5" />
                <p className="text-gray-400 font-bold mb-6 text-sm md:text-base">장바구니가 비어있습니다.</p>
                <Link
                  href="/#apply"
                  className="inline-block bg-brand-black text-white px-8 py-3.5 rounded-xl font-bold hover:bg-brand-point transition-colors text-sm md:text-base"
                >
                  매칭파티 보러가기
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {cartParties.map(party => (
                  <motion.div
                    key={party.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-7 border border-gray-100 flex flex-col md:flex-row md:items-center gap-4 md:gap-6"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="inline-block text-xs font-bold text-brand-point bg-brand-point/10 px-2.5 py-1 rounded-full mb-2">모집중</span>
                      <h3 className="font-black text-base md:text-xl mb-2 leading-snug">{party.title}</h3>
                      <div className="flex flex-col gap-1 text-xs md:text-sm text-gray-500 font-medium">
                        <span className="flex items-center gap-1.5"><Calendar size={13} /> {party.dateString}</span>
                        <span className="flex items-center gap-1.5"><MapPin size={13} /> {party.location}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-lg md:text-2xl text-brand-point whitespace-nowrap">₩{party.price.toLocaleString()}</span>
                      <Link
                        href={`/checkout/?id=${party.id}`}
                        className="bg-brand-black text-white px-4 md:px-6 py-3 rounded-xl font-bold text-sm hover:bg-brand-point transition-all whitespace-nowrap"
                      >
                        결제하기
                      </Link>
                      <button
                        onClick={() => removeFromCart(party.id)}
                        className="p-2.5 rounded-xl bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-400 transition-all flex-shrink-0"
                        aria-label="삭제"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </motion.div>
                ))}

                {/* Total */}
                <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-7 border border-gray-100 flex justify-between items-center">
                  <span className="font-black text-base md:text-lg">총 결제 예정금액</span>
                  <span className="font-black text-xl md:text-3xl text-brand-point">
                    ₩{cartParties.reduce((sum, p) => sum + p.price, 0).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
