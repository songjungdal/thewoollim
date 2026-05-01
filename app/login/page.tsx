"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, Phone, CheckCircle, ArrowLeft, ShieldCheck, X, KeyRound, UserSearch, ChevronDown, ChevronUp } from "lucide-react";
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
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  // Registration form fields
  const [registerName, setRegisterName] = useState("");
  // 성별은 /onboarding 단계에서 수집 (가입 단계 중복 입력 방지)
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registerConsent, setRegisterConsent] = useState(false);
  const [registerConsentExpanded, setRegisterConsentExpanded] = useState(false);
  // (SNS gender modal removed — real OAuth provides gender from provider)
  // Find ID / PW modals
  const [showFindId, setShowFindId] = useState(false);
  const [showFindPw, setShowFindPw] = useState(false);
  const [findIdInput, setFindIdInput] = useState("");
  const [findPwInput, setFindPwInput] = useState("");
  const [findIdResult, setFindIdResult] = useState<string | null>(null);
  const [findPwResult, setFindPwResult] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  // 사용자 정책: 로그인 성공 시 항상 메인 페이지로 이동.
  // (이전엔 ?redirect= 쿼리에 따라 마이페이지/결제로 다시 보냈으나, 단순 일관성 우선)
  const redirectTo = "/";
  void searchParams;
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

  // 휴대폰 번호 자동 하이픈 (010-1234-5678 / 011-XXX-XXXX)
  const formatPhone = (value: string) => {
    const d = value.replace(/[^0-9]/g, "").slice(0, 11);
    if (d.length < 4)  return d;
    if (d.length < 7)  return `${d.slice(0, 3)}-${d.slice(3)}`;
    if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };

  const handleSendAuthCode = async () => {
    if (isSending || timer > 0) return;
    const phone = phoneNumber.replace(/[^0-9]/g, "");
    if (phone.length < 10 || phone.length > 11 || !phone.startsWith("01")) {
      alert("올바른 휴대폰 번호를 입력해주세요.");
      return;
    }
    setIsSending(true);
    try {
      const res = await fetch("/api/send-sms.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.ok) {
        setIsAuthSent(true);
        setTimer(data.cooldown || 60);
        setAuthCode("");
        alert("인증번호가 발송되었습니다. SMS를 확인해주세요.");
      } else {
        if (data.cooldown) setTimer(data.cooldown);
        alert(data.error || "발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } catch {
      alert("네트워크 오류로 발송에 실패했습니다.");
    } finally {
      setIsSending(false);
    }
  };

  const handleVerifyCode = async () => {
    if (isVerifying) return;
    const phone = phoneNumber.replace(/[^0-9]/g, "");
    if (!/^\d{6}$/.test(authCode)) {
      alert("6자리 인증번호를 입력해주세요.");
      return;
    }
    setIsVerifying(true);
    try {
      const res = await fetch("/api/verify-sms.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: authCode }),
      });
      const data = await res.json();
      if (data.ok) {
        setIsPhoneVerified(true);
        setTimer(0);
        alert("본인인증이 완료되었습니다.");
      } else {
        alert(data.error || "인증번호가 일치하지 않습니다.");
      }
    } catch {
      alert("네트워크 오류로 인증 확인에 실패했습니다.");
    } finally {
      setIsVerifying(false);
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPhoneVerified) {
      alert("휴대폰 번호 인증이 완료되지 않았습니다.\n인증번호 확인을 먼저 진행해 주세요.");
      return;
    }
    // 누락 항목 한 번에 모아서 안내 (사용자가 어떤 부분을 채워야 하는지 명확하게)
    const missing: string[] = [];
    if (!registerName.trim())            missing.push("이름");
    if (!registerEmail.trim())           missing.push("이메일");
    if (registerPassword.length < 8)     missing.push("비밀번호 (8자 이상)");
    if (!registerPasswordConfirm)        missing.push("비밀번호 확인");
    if (!registerConsent)                missing.push("개인정보 수집 및 이용 동의");
    if (missing.length > 0) {
      alert("다음 항목을 확인해주세요:\n\n· " + missing.join("\n· "));
      return;
    }
    if (registerPassword !== registerPasswordConfirm) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }

    setRegistering(true);
    try {
      const phone = phoneNumber.replace(/[^0-9]/g, "");
      const res = await fetch("/api/register.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:    registerEmail.trim(),
          password: registerPassword,
          name:     registerName.trim(),
          phone,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        alert("어울림 가입을 환영합니다!");
        // 서버가 세션 쿠키를 발급했으므로 메인 페이지로 이동.
        // 메인 마운트 시 AuthContext가 /api/auth/me.php로 세션을 검증하고 자동 로그인 → 헤더가 '마이페이지'로 전환됨.
        // 풀 페이지 이동으로 쿠키 즉시 전송 보장.
        window.location.href = "/";
      } else {
        alert(data.error || "가입 처리 중 오류가 발생했습니다.");
      }
    } catch {
      alert("네트워크 오류로 가입에 실패했습니다.");
    } finally {
      setRegistering(false);
    }
  };

  const handleSnsLogin = (provider: string) => {
    // 실제 OAuth: kakao/naver/google 중 하나로 매핑하여 서버 start 엔드포인트로 리다이렉트
    const providerKey = provider === "카카오" ? "kakao"
      : provider === "네이버" ? "naver"
      : provider === "구글"   ? "google"
      : null;
    if (!providerKey) { alert("지원하지 않는 소셜 로그인입니다."); return; }
    // 모바일/PC 모두 같은 탭에서 풀 페이지 리다이렉트 (OAuth 권장)
    window.location.href = `/api/auth/oauth.php?provider=${providerKey}&action=start`;
  };

  // (이전 시뮬레이션 모달은 실제 OAuth 도입으로 더 이상 사용하지 않음 — completeSnsSignup 제거)

  const socialButtons = [
    { name: "카카오", color: "bg-[#FEE500] text-[#3c1e1e] hover:brightness-95",                      logo: "/images/sns/kakao.jpg",  blendClass: "mix-blend-multiply" },
    { name: "네이버", color: "bg-[#03C75A] text-white hover:brightness-95",                          logo: "/images/sns/naver.jpg",  blendClass: "mix-blend-multiply" },
    { name: "구글",   color: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",       logo: "/images/sns/google.jpg", blendClass: "mix-blend-normal" },
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
                        className="!bg-transparent hover:!bg-transparent focus:!bg-transparent active:!bg-transparent !border-0 !outline-none focus:!ring-0 !shadow-none text-gray-400 hover:!text-brand-point cursor-pointer p-0 transition-colors duration-200 ease-out"
                      >
                        아이디 찾기
                      </button>
                      <span className="text-gray-200" aria-hidden="true">|</span>
                      <button
                        type="button"
                        onClick={() => setShowFindPw(true)}
                        className="!bg-transparent hover:!bg-transparent focus:!bg-transparent active:!bg-transparent !border-0 !outline-none focus:!ring-0 !shadow-none text-gray-400 hover:!text-brand-point cursor-pointer p-0 transition-colors duration-200 ease-out"
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
                          className={`w-full py-3 md:py-3.5 px-4 md:px-5 rounded-xl font-bold flex items-center justify-center gap-3 md:gap-3.5 transition-all hover:scale-[1.02] text-sm md:text-base ${btn.color}`}
                        >
                          <img
                            src={btn.logo}
                            alt={`${btn.name} 로고`}
                            className={`w-9 h-9 md:w-10 md:h-10 object-contain flex-shrink-0 ${btn.blendClass}`}
                          />
                          <span className="leading-none">{btn.name}로 로그인</span>
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
                        <div className="flex flex-wrap sm:flex-nowrap gap-2 mb-2">
                           <div className="relative flex-1 min-w-0 basis-full sm:basis-auto">
                              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                              <input
                                type="tel"
                                inputMode="numeric"
                                placeholder="010-0000-0000"
                                className={inputClass}
                                value={phoneNumber}
                                onChange={e => setPhoneNumber(formatPhone(e.target.value))}
                                maxLength={13}
                                readOnly={isPhoneVerified}
                                aria-label="휴대폰 번호"
                              />
                           </div>
                           <button
                             type="button"
                             onClick={handleSendAuthCode}
                             disabled={isPhoneVerified || isSending || timer > 0}
                             className="w-full sm:w-auto px-4 py-3 sm:py-0 min-h-[44px] bg-brand-black text-white rounded-xl font-bold text-sm whitespace-nowrap hover:bg-brand-point transition-colors disabled:bg-gray-200 disabled:cursor-not-allowed"
                           >
                              {isSending
                                ? "발송 중..."
                                : isPhoneVerified
                                  ? "인증완료"
                                  : timer > 0 && isAuthSent
                                    ? `재전송 (${timer}s)`
                                    : isAuthSent
                                      ? "재전송"
                                      : "인증번호 받기"}
                           </button>
                        </div>
                        {isAuthSent && (
                          <div className="flex flex-wrap sm:flex-nowrap gap-2 animate-in fade-in slide-in-from-top-1">
                            <div className="relative flex-1 min-w-0 basis-full sm:basis-auto">
                              <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="인증번호 6자리"
                                className={inputClass + (isPhoneVerified ? " bg-gray-100 text-gray-500 cursor-not-allowed" : "")}
                                maxLength={6}
                                value={authCode}
                                onChange={(e) => setAuthCode(e.target.value.replace(/[^0-9]/g, ""))}
                                readOnly={isPhoneVerified}
                                disabled={isPhoneVerified}
                                aria-label="인증번호"
                              />
                              {timer > 0 && !isPhoneVerified && (
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-point font-black text-sm">{formatTime(timer)}</span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={handleVerifyCode}
                              disabled={isVerifying || isPhoneVerified}
                              className="w-full sm:w-auto px-4 py-3 sm:py-0 min-h-[44px] bg-brand-point text-white rounded-xl font-bold text-sm whitespace-nowrap hover:brightness-110 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                              {isPhoneVerified ? "인증 완료" : (isVerifying ? "확인 중..." : "인증 확인")}
                            </button>
                          </div>
                        )}
                        {isPhoneVerified && (
                          <div className="flex items-center gap-2 text-brand-point font-bold text-sm mt-2 ml-1">
                            <CheckCircle size={16} /> 본인인증이 완료되었습니다.
                          </div>
                        )}
                      </div>

                      <div>
                        <label className={labelClass}>이름</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                          <input
                            type="text"
                            placeholder="실명을 입력해주세요"
                            className={inputClass}
                            value={registerName}
                            onChange={e => setRegisterName(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>이메일 주소 (ID)</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                          <input
                            type="email"
                            placeholder="example@thewoollim.com"
                            className={inputClass}
                            value={registerEmail}
                            onChange={e => setRegisterEmail(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>비밀번호</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                          <input
                            type="password"
                            placeholder="8자 이상의 영문/숫자 조합"
                            className={inputClass}
                            value={registerPassword}
                            onChange={e => setRegisterPassword(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      {/* 비밀번호 확인 — 실시간 일치 검증 */}
                      <div>
                        <label className={labelClass}>비밀번호 확인</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                          <input
                            type="password"
                            placeholder="비밀번호를 한 번 더 입력"
                            className={`${inputClass} ${
                              registerPasswordConfirm && registerPassword !== registerPasswordConfirm
                                ? "border-red-300 bg-red-50 focus:ring-red-300 focus:border-red-300"
                                : registerPasswordConfirm && registerPassword === registerPasswordConfirm
                                  ? "border-brand-point/40"
                                  : ""
                            }`}
                            value={registerPasswordConfirm}
                            onChange={e => setRegisterPasswordConfirm(e.target.value)}
                            required
                          />
                        </div>
                        {registerPasswordConfirm && registerPassword !== registerPasswordConfirm && (
                          <p className="text-xs text-red-500 font-bold mt-1.5 ml-1">
                            비밀번호가 일치하지 않습니다.
                          </p>
                        )}
                        {registerPasswordConfirm && registerPassword === registerPasswordConfirm && (
                          <p className="text-xs text-brand-point font-bold mt-1.5 ml-1 flex items-center gap-1">
                            <CheckCircle size={12} /> 비밀번호가 일치합니다.
                          </p>
                        )}
                      </div>

                      {/* 개인정보 수집 및 이용 동의 — 시인성 개선 */}
                      <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
                        <div className="p-5 md:p-6">
                          <div className="flex items-center justify-between mb-4 gap-3">
                            <h4 className="font-black text-gray-900 text-sm md:text-base leading-snug flex items-center gap-1.5 whitespace-nowrap">
                              <ShieldCheck size={16} className="text-brand-point flex-shrink-0" />
                              개인정보 수집 및 이용 동의
                              <span className="text-brand-point text-xs md:text-sm">(필수)</span>
                            </h4>
                            <button
                              type="button"
                              onClick={() => setRegisterConsentExpanded(v => !v)}
                              className="flex items-center gap-1 text-xs md:text-sm font-bold text-brand-point hover:brightness-90 transition-all flex-shrink-0 px-2 py-1"
                            >
                              {registerConsentExpanded ? <>접기 <ChevronUp size={14} /></> : <>자세히 <ChevronDown size={14} /></>}
                            </button>
                          </div>

                          {registerConsentExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                              className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4 whitespace-pre-line border-t border-gray-100 pt-4 pb-1 max-h-64 overflow-y-auto"
                            >
{`■ 수집 항목
이름, 이메일, 연락처(휴대전화번호), 비밀번호 (이후 프로필 카드 작성 시 거주지역·직업·MBTI·관심사·이상형 추가)

■ 수집·이용 목적
① 매칭파티 참여자 신원 확인 및 본인 인증
② 서비스 이용에 따른 고객 관리·민원 처리
③ 맞춤형 매칭 및 일정·변경사항 안내

■ 보유·이용 기간
회원 탈퇴 시 지체 없이 파기. 단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관.
 · 계약·청약 철회 기록: 5년 (전자상거래법)
 · 분쟁 처리 기록: 3년 (전자상거래법)
 · 접속 로그: 3개월 (통신비밀보호법)

위 사항에 대한 동의를 거부할 권리가 있으나, 거부 시 어울림 매칭파티 서비스 이용이 제한됩니다.`}
                            </motion.div>
                          )}

                          {/* 체크박스 영역 — 큰 터치 타겟 + 청록 강조 */}
                          <label
                            className={`flex items-center gap-3 cursor-pointer min-h-[52px] px-4 py-3 rounded-xl border-2 transition-all ${
                              registerConsent
                                ? "bg-brand-point/10 border-brand-point/40"
                                : "bg-gray-50 border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={registerConsent}
                              onChange={e => setRegisterConsent(e.target.checked)}
                              className="w-6 h-6 rounded accent-brand-point cursor-pointer flex-shrink-0"
                            />
                            <span className={`text-sm md:text-base font-bold leading-snug flex-1 ${registerConsent ? "text-brand-point" : "text-gray-700"}`}>
                              위 내용에 동의합니다.
                              <span className="ml-1 text-xs md:text-sm font-black">(필수)</span>
                            </span>
                            {registerConsent && (
                              <CheckCircle size={20} className="text-brand-point flex-shrink-0" strokeWidth={3} />
                            )}
                          </label>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={registering}
                        className="w-full bg-brand-black text-white py-4 rounded-xl font-bold text-lg hover:bg-brand-point transition-all shadow-xl disabled:bg-gray-200 disabled:shadow-none mt-4 disabled:cursor-not-allowed"
                      >
                        {registering ? "가입 중..." : "가입 완료하기"}
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
