"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, Phone, CheckCircle, ArrowLeft, ShieldCheck, X, KeyRound, UserSearch } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";

import { Suspense } from "react";

function LoginContent() {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [timer, setTimer] = useState(0);
  const [isAuthSent, setIsAuthSent] = useState(false);
  const [isAuthVerified, setIsAuthVerified] = useState(false);
  const [authCode, setAuthCode] = useState("");
  // Find ID / PW modals
  const [showFindId, setShowFindId] = useState(false);
  const [showFindPw, setShowFindPw] = useState(false);
  const [findIdInput, setFindIdInput] = useState("");
  const [findPwInput, setFindPwInput] = useState("");
  const [findIdResult, setFindIdResult] = useState<string | null>(null);
  const [findPwResult, setFindPwResult] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/mypage";
  const { login } = useAuth();

  const maskEmail = (email: string) => {
    const [local, domain] = email.split("@");
    if (!domain) return email;
    const shown = local.slice(0, Math.min(2, local.length));
    return `${shown}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
  };

  const handleFindId = (e: React.FormEvent) => {
    e.preventDefault();
    const phone = findIdInput.replace(/[^0-9]/g, "");
    // Simulated lookup — registered admin phone: 010-0000-0010
    if (phone === "01000000010") {
      setFindIdResult(`회원님의 이메일 아이디는 ${maskEmail("pletora@naver.com")} 입니다.`);
    } else if (phone.length >= 10) {
      setFindIdResult("일치하는 회원 정보를 찾을 수 없습니다.");
    } else {
      setFindIdResult("올바른 휴대폰 번호를 입력해주세요.");
    }
  };

  const handleFindPw = (e: React.FormEvent) => {
    e.preventDefault();
    const email = findPwInput.trim().toLowerCase();
    if (email === "pletora@naver.com") {
      setFindPwResult(`${email} 으로 임시 비밀번호가 발송되었습니다.\n로그인 후 반드시 비밀번호를 변경해주세요.`);
    } else if (email.includes("@")) {
      setFindPwResult("일치하는 회원 정보를 찾을 수 없습니다.");
    } else {
      setFindPwResult("올바른 이메일 주소를 입력해주세요.");
    }
  };

  const closeFindModals = () => {
    setShowFindId(false);
    setShowFindPw(false);
    setFindIdInput("");
    setFindPwInput("");
    setFindIdResult(null);
    setFindPwResult(null);
  };

  // Authentication Timer Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleSendAuthCode = () => {
    setIsAuthSent(true);
    setTimer(180); // 3 minutes
    alert("인증번호가 발송되었습니다. (테스트용: 123456)");
  };

  const handleVerifyCode = () => {
    if (authCode === "123456") {
      setIsAuthVerified(true);
      setTimer(0);
      alert("본인인증이 완료되었습니다.");
    } else {
      alert("인증번호가 일치하지 않습니다. 다시 확인해주세요.");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(loginEmail, loginPassword);
    if (success) {
      router.push(redirectTo);
    } else {
      alert("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthVerified) {
      alert("본인인증을 먼저 완료해주세요.");
      return;
    }
    router.push("/profile-setup");
  };

  const handleSnsLogin = (provider: string) => {
    // SNS 로그인 시뮬레이션: 최초 가입자로 간주하고 프로필 입력으로 이동
    try { localStorage.setItem("woollim_sns_provider", provider); } catch {}
    router.push("/profile-setup");
  };

  const socialButtons = [
    { name: "카카오", color: "bg-[#FEE500] text-[#3c1e1e]", logo: "K" },
    { name: "네이버", color: "bg-[#03C75A] text-white", logo: "N" },
    { name: "구글", color: "bg-white text-gray-700 border border-gray-200", logo: "G" },
  ];

  const inputClass = "w-full pl-12 pr-4 py-4 rounded-xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point transition-all outline-none font-medium";
  const labelClass = "block text-sm font-bold text-gray-700 mb-2 ml-1";

  return (
    <div className="flex flex-col min-h-screen bg-brand-black">
      <Header />

      <main className="flex-1 flex items-center justify-center px-6 py-20 relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-brand-point/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-brand-point/10 rounded-full blur-[100px]" />

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md z-10"
        >
          {/* Main Card */}
          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">
            {/* Tab Switcher */}
            <div className="flex bg-gray-100 p-2 m-6 rounded-2xl">
              <button 
                onClick={() => setActiveTab("login")}
                className={`flex-1 py-3 rounded-xl font-bold transition-all ${activeTab === "login" ? "bg-white text-brand-black shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
              >
                로그인
              </button>
              <button 
                onClick={() => setActiveTab("register")}
                className={`flex-1 py-3 rounded-xl font-bold transition-all ${activeTab === "register" ? "bg-white text-brand-black shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
              >
                회원가입
              </button>
            </div>

            <div className="p-8 pt-0">
              <AnimatePresence mode="wait">
                {activeTab === "login" ? (
                  <motion.div 
                    key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h2 className="text-3xl font-black mb-2 tracking-tight">반가워요!</h2>
                    <p className="text-gray-500 mb-10 font-medium">어울림의 새로운 소식을 확인해보세요.</p>

                    <form className="space-y-6" onSubmit={handleLogin}>
                      <div>
                        <label className={labelClass}>이메일 주소</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                          <input type="email" placeholder="example@thewoollim.com" className={inputClass} required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>비밀번호</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                          <input type="password" placeholder="••••••••" className={inputClass} required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                        </div>
                      </div>
                      <button type="submit" className="w-full bg-brand-black text-white py-4 rounded-xl font-bold text-lg hover:bg-brand-point transition-all shadow-xl hover:shadow-brand-point/20">
                        로그인하기
                      </button>
                    </form>

                    {/* Find ID / PW links */}
                    <div className="flex justify-center items-center gap-4 md:gap-6 mt-5 text-xs md:text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => setShowFindId(true)}
                        style={{ background: "transparent", border: "none", padding: 0, transition: "color 0.2s ease" }}
                        className="!bg-transparent hover:!bg-transparent focus:!bg-transparent active:!bg-transparent !border-0 !outline-none focus:!ring-0 !shadow-none text-gray-400 hover:!text-brand-point cursor-pointer"
                      >
                        아이디 찾기
                      </button>
                      <span className="text-gray-200" aria-hidden="true">|</span>
                      <button
                        type="button"
                        onClick={() => setShowFindPw(true)}
                        style={{ background: "transparent", border: "none", padding: 0, transition: "color 0.2s ease" }}
                        className="!bg-transparent hover:!bg-transparent focus:!bg-transparent active:!bg-transparent !border-0 !outline-none focus:!ring-0 !shadow-none text-gray-400 hover:!text-brand-point cursor-pointer"
                      >
                        비밀번호 찾기
                      </button>
                    </div>

                    <div className="relative my-10">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                      <div className="relative flex justify-center text-sm uppercase"><span className="bg-white px-4 text-gray-400 font-bold tracking-widest">SNS 간편 로그인</span></div>
                    </div>

                    <div className="space-y-3">
                      {socialButtons.map((btn) => (
                        <button
                          key={btn.name}
                          type="button"
                          onClick={() => handleSnsLogin(btn.name)}
                          className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-transform hover:scale-[1.02] ${btn.color}`}
                        >
                          <span className="w-6 h-6 rounded-full flex items-center justify-center font-black text-sm">{btn.logo}</span>
                          {btn.name} 계정으로 로그인
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h2 className="text-3xl font-black mb-2 tracking-tight">함께해요!</h2>
                    <p className="text-gray-500 mb-10 font-medium">세상을 울리는 새로운 연결의 시작.</p>

                    <form className="space-y-6" onSubmit={handleRegister}>
                      <div>
                        <label className={labelClass}>본인인증</label>
                        <div className="flex gap-2 mb-2">
                           <div className="relative flex-1">
                              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                              <input type="tel" placeholder="010-0000-0000" className={inputClass} disabled={isAuthVerified} />
                           </div>
                           <button 
                             type="button" onClick={handleSendAuthCode} disabled={isAuthVerified}
                             className="px-4 bg-brand-black text-white rounded-xl font-bold text-sm whitespace-nowrap hover:bg-brand-point transition-colors disabled:bg-gray-200"
                           >
                              {isAuthSent ? "재발송" : "인증번호 받기"}
                           </button>
                        </div>
                        {isAuthSent && !isAuthVerified && (
                          <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                            <div className="relative flex-1">
                              <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                              <input 
                                type="text" 
                                placeholder="인증번호 6자리" 
                                className={inputClass} 
                                maxLength={6} 
                                value={authCode}
                                onChange={(e) => setAuthCode(e.target.value)}
                              />
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-point font-black text-sm">{formatTime(timer)}</span>
                            </div>
                            <button 
                              type="button" onClick={handleVerifyCode}
                              className="px-4 bg-brand-point text-white rounded-xl font-bold text-sm whitespace-nowrap hover:brightness-110 transition-all"
                            >
                              인증 확인
                            </button>
                          </div>
                        )}
                        {isAuthVerified && (
                          <div className="flex items-center gap-2 text-brand-point font-bold text-sm mt-2 ml-1">
                            <CheckCircle size={16} /> 본인인증이 완료되었습니다.
                          </div>
                        )}
                      </div>

                      <div>
                        <label className={labelClass}>이름</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                          <input type="text" placeholder="실명을 입력해주세요" className={inputClass} required />
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>이메일 주소 (ID)</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                          <input type="email" placeholder="example@thewoollim.com" className={inputClass} required />
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>비밀번호</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                          <input type="password" placeholder="8자 이상의 영문/숫자 조합" className={inputClass} required />
                        </div>
                      </div>

                      <button 
                        type="submit" 
                        disabled={!isAuthVerified}
                        className="w-full bg-brand-black text-white py-4 rounded-xl font-bold text-lg hover:bg-brand-point transition-all shadow-xl disabled:bg-gray-200 disabled:shadow-none mt-4"
                      >
                        가입 완료하기
                      </button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <Link href="/" className="flex items-center justify-center gap-2 text-gray-400 hover:text-white mt-10 font-bold transition-colors">
            <ArrowLeft size={18} /> 메인으로 돌아가기
          </Link>
        </motion.div>
      </main>

      <Footer />

      {/* Find ID / PW Modals */}
      <AnimatePresence>
        {(showFindId || showFindPw) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeFindModals}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md p-7 md:p-9 relative"
            >
              <button
                onClick={closeFindModals}
                className="absolute top-4 right-4 text-gray-300 hover:text-gray-600 transition-colors"
                aria-label="닫기"
              >
                <X size={22} />
              </button>

              {/* Find ID */}
              {showFindId && (
                <>
                  <div className="flex flex-col items-center text-center mb-6">
                    <div className="w-14 h-14 md:w-16 md:h-16 bg-brand-point/10 rounded-full flex items-center justify-center mb-4">
                      <UserSearch size={26} className="text-brand-point md:hidden" />
                      <UserSearch size={30} className="text-brand-point hidden md:block" />
                    </div>
                    <h3 className="text-lg md:text-xl font-black mb-1.5">아이디 찾기</h3>
                    <p className="text-xs md:text-sm text-gray-500 font-medium">가입 시 인증하신 휴대폰 번호를 입력해주세요.</p>
                  </div>

                  <form onSubmit={handleFindId} className="space-y-4">
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="tel"
                        value={findIdInput}
                        onChange={e => { setFindIdInput(e.target.value); setFindIdResult(null); }}
                        placeholder="010-0000-0000"
                        className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point transition-all outline-none font-medium text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-brand-black text-white py-4 rounded-xl font-black text-sm md:text-base hover:bg-brand-point transition-all shadow-lg"
                    >
                      아이디 찾기
                    </button>
                  </form>

                  {findIdResult && (
                    <div className={`mt-5 p-4 rounded-xl border text-sm leading-relaxed ${
                      findIdResult.includes("입니다")
                        ? "bg-brand-point/5 border-brand-point/30 text-gray-800 font-medium"
                        : "bg-red-50 border-red-100 text-red-700"
                    }`}>
                      {findIdResult}
                    </div>
                  )}
                </>
              )}

              {/* Find Password */}
              {showFindPw && (
                <>
                  <div className="flex flex-col items-center text-center mb-6">
                    <div className="w-14 h-14 md:w-16 md:h-16 bg-brand-point/10 rounded-full flex items-center justify-center mb-4">
                      <KeyRound size={26} className="text-brand-point md:hidden" />
                      <KeyRound size={30} className="text-brand-point hidden md:block" />
                    </div>
                    <h3 className="text-lg md:text-xl font-black mb-1.5">비밀번호 찾기</h3>
                    <p className="text-xs md:text-sm text-gray-500 font-medium">가입 시 등록하신 이메일로 임시 비밀번호를 보내드립니다.</p>
                  </div>

                  <form onSubmit={handleFindPw} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="email"
                        value={findPwInput}
                        onChange={e => { setFindPwInput(e.target.value); setFindPwResult(null); }}
                        placeholder="example@thewoollim.com"
                        className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point transition-all outline-none font-medium text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-brand-black text-white py-4 rounded-xl font-black text-sm md:text-base hover:bg-brand-point transition-all shadow-lg"
                    >
                      임시 비밀번호 받기
                    </button>
                  </form>

                  {findPwResult && (
                    <div className={`mt-5 p-4 rounded-xl border text-sm leading-relaxed whitespace-pre-line ${
                      findPwResult.includes("발송")
                        ? "bg-brand-point/5 border-brand-point/30 text-gray-800 font-medium"
                        : "bg-red-50 border-red-100 text-red-700"
                    }`}>
                      {findPwResult}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-black flex items-center justify-center text-white font-bold">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
