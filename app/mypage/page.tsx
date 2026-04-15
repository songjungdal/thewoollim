"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, LogOut, User, Trash2, Calendar, MapPin, CheckSquare, Square, CreditCard, Pencil, Phone, Briefcase, Heart, Sparkles } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import { PARTIES } from "../lib/data";

export default function MyPage() {
  const { mounted, isLoggedIn, userEmail, logout, cart, removeFromCart, profile } = useAuth();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const cartParties = cart
    .map(item => PARTIES.find(p => p.id === item.partyId))
    .filter(Boolean) as typeof PARTIES;

  useEffect(() => {
    if (mounted && !isLoggedIn) {
      router.push("/login?redirect=/mypage");
    }
  }, [mounted, isLoggedIn, router]);

  useEffect(() => {
    setSelectedIds(new Set(cart.map(c => c.partyId)));
  }, [cart]);

  if (!mounted || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-brand-black flex items-center justify-center">
        <div className="text-white font-bold text-lg">Loading...</div>
      </div>
    );
  }

  const allSelected = cartParties.length > 0 && selectedIds.size === cartParties.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(cartParties.map(p => p.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedParties = cartParties.filter(p => selectedIds.has(p.id));
  const selectedTotal = selectedParties.reduce((sum, p) => sum + p.price, 0);

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
            <div className="flex gap-2.5">
              <button
                onClick={() => router.push("/profile-setup?edit=true")}
                className="flex items-center gap-2 bg-brand-point hover:brightness-110 text-white px-4 md:px-5 py-3 rounded-xl font-bold transition-all text-sm w-fit"
              >
                <Pencil size={14} /> 정보수정
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 md:px-5 py-3 rounded-xl font-bold transition-all text-sm w-fit"
              >
                <LogOut size={15} /> 로그아웃
              </button>
            </div>
          </div>
        </section>

        {/* Profile Info Section */}
        {profile ? (
          <section className="px-4 md:px-6 pt-8 md:pt-12">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-3 mb-5 md:mb-6">
                <User size={20} className="text-brand-point" />
                <h2 className="text-xl md:text-2xl font-black tracking-tight">내 프로필</h2>
              </div>
              <div className="bg-white rounded-2xl md:rounded-3xl p-6 md:p-8 border border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                {[
                  { icon: User, label: "이름",     value: profile.name },
                  { icon: User, label: "성별",     value: profile.gender },
                  { icon: Phone, label: "연락처",  value: profile.phone },
                  { icon: MapPin, label: "거주 지역", value: profile.location },
                  { icon: Briefcase, label: "직업",  value: profile.job },
                  { icon: Sparkles, label: "MBTI",   value: profile.mbti },
                ].map(row => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label} className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-point/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Icon size={16} className="text-brand-point" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400 font-medium mb-0.5">{row.label}</p>
                        <p className="font-bold text-sm md:text-base truncate">{row.value || "-"}</p>
                      </div>
                    </div>
                  );
                })}
                <div className="md:col-span-2 border-t border-gray-100 pt-5 md:pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={14} className="text-brand-point" />
                    <p className="text-xs text-gray-400 font-bold">관심사</p>
                  </div>
                  <p className="text-sm md:text-base font-medium text-gray-700 leading-relaxed">{profile.interests || "-"}</p>
                </div>
                <div className="md:col-span-2 border-t border-gray-100 pt-5 md:pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Heart size={14} className="text-brand-point" />
                    <p className="text-xs text-gray-400 font-bold">이상형</p>
                  </div>
                  <p className="text-sm md:text-base font-medium text-gray-700 leading-relaxed">{profile.idealType || "-"}</p>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="px-4 md:px-6 pt-8 md:pt-12">
            <div className="max-w-4xl mx-auto">
              <div className="bg-brand-point/5 border-2 border-dashed border-brand-point/30 rounded-2xl md:rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="font-black text-base md:text-lg mb-1">프로필을 완성해주세요</p>
                  <p className="text-sm text-gray-500 font-medium">매칭파티 참여 전 프로필 정보 입력이 필요합니다.</p>
                </div>
                <button
                  onClick={() => router.push("/profile-setup")}
                  className="bg-brand-black text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-brand-point transition-all whitespace-nowrap w-fit"
                >
                  프로필 작성하기
                </button>
              </div>
            </div>
          </section>
        )}

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
                {/* Select All */}
                <div className="flex items-center gap-3 px-2">
                  <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-brand-point transition-colors">
                    {allSelected
                      ? <CheckSquare size={20} className="text-brand-point" />
                      : <Square size={20} />
                    }
                    전체선택 ({selectedIds.size}/{cartParties.length})
                  </button>
                </div>

                {cartParties.map(party => {
                  const isSelected = selectedIds.has(party.id);
                  return (
                    <motion.div
                      key={party.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-white rounded-2xl md:rounded-3xl p-5 md:p-7 border-2 flex flex-col md:flex-row md:items-center gap-4 md:gap-6 transition-colors ${isSelected ? "border-brand-point/30" : "border-gray-100"}`}
                    >
                      <button onClick={() => toggleOne(party.id)} className="flex-shrink-0 self-start md:self-center">
                        {isSelected
                          ? <CheckSquare size={22} className="text-brand-point" />
                          : <Square size={22} className="text-gray-300" />
                        }
                      </button>
                      <Link href={`/party/${party.id}`} className="flex-1 min-w-0 group cursor-pointer">
                        <span className="inline-block text-xs font-bold text-brand-point bg-brand-point/10 px-2.5 py-1 rounded-full mb-2">모집중</span>
                        <h3 className="font-black text-base md:text-xl mb-2 leading-snug group-hover:text-brand-point transition-colors">{party.title}</h3>
                        <div className="flex flex-col gap-1 text-xs md:text-sm text-gray-500 font-medium">
                          <span className="flex items-center gap-1.5"><Calendar size={13} /> {party.dateString}</span>
                          <span className="flex items-center gap-1.5"><MapPin size={13} /> {party.location}</span>
                        </div>
                      </Link>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-lg md:text-2xl text-brand-point whitespace-nowrap">₩{party.price.toLocaleString()}</span>
                        <button
                          onClick={() => removeFromCart(party.id)}
                          className="p-2.5 rounded-xl bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-400 transition-all flex-shrink-0"
                          aria-label="삭제"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Total + Checkout for selected */}
                <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-7 border border-gray-100">
                  <div className="flex justify-between items-center mb-5">
                    <span className="font-black text-base md:text-lg">
                      {allSelected ? "전체 결제금액" : "선택 결제금액"}{" "}
                      <span className="text-brand-point">({selectedParties.length}건)</span>
                    </span>
                    <span className="font-black text-xl md:text-3xl text-brand-point">
                      ₩{selectedTotal.toLocaleString()}
                    </span>
                  </div>

                  {/* Primary: Pay all */}
                  <Link
                    href={`/checkout/?ids=${cartParties.map(p => p.id).join(",")}`}
                    className="flex items-center justify-center gap-2 w-full bg-brand-black text-white py-4 rounded-xl font-black text-base md:text-lg hover:bg-brand-point transition-all text-center mb-3"
                  >
                    <CreditCard size={20} />
                    전체 결제하기 ({cartParties.length}건) · ₩{cartParties.reduce((s, p) => s + p.price, 0).toLocaleString()}
                  </Link>

                  {/* Secondary: Pay selected (only if partial selection) */}
                  {!allSelected && selectedParties.length > 0 && (
                    <Link
                      href={`/checkout/?ids=${selectedParties.map(p => p.id).join(",")}`}
                      className="flex items-center justify-center gap-2 w-full bg-white border-2 border-brand-black text-brand-black py-3.5 rounded-xl font-black text-sm md:text-base hover:bg-brand-point hover:text-white hover:border-brand-point transition-all text-center"
                    >
                      선택 항목만 결제하기 ({selectedParties.length}건)
                    </Link>
                  )}
                  {selectedParties.length === 0 && (
                    <p className="text-center text-xs text-gray-400 font-medium">
                      일부 항목만 결제하려면 체크박스로 선택해주세요.
                    </p>
                  )}
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
