"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, Phone, CheckCircle, ArrowLeft, ShieldCheck } from "lucide-react";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/mypage";
  const { login } = useAuth();

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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const success = login(loginEmail, loginPassword);
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
    alert("어울림의 회원이 되신 것을 환영합니다! 로그인을 진행해주세요.");
    setActiveTab("login");
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

                    <div className="relative my-10">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                      <div className="relative flex justify-center text-sm uppercase"><span className="bg-white px-4 text-gray-400 font-bold tracking-widest">SNS 간편 로그인</span></div>
                    </div>

                    <div className="space-y-3">
                      {socialButtons.map((btn) => (
                        <button key={btn.name} className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-transform hover:scale-[1.02] ${btn.color}`}>
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
