"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { User, Phone, Cake, Heart } from "lucide-react";
import Image from "next/image";
import { useAuth, isCoreProfileComplete } from "../context/AuthContext";
import { snoozeOnboarding } from "../lib/onboardingSnooze";

const inputClass =
  "w-full pl-12 pr-4 py-4 rounded-xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point transition-all outline-none font-medium text-base";
const labelClass = "block text-sm font-bold text-gray-700 mb-2 ml-1";

/** 010-0000-0000 자동 하이픈 포맷 */
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

export default function OnboardingPage() {
  const { mounted, isLoggedIn, userEmail, profile, refreshProfile } = useAuth();
  const router = useRouter();

  const [name,          setName]          = useState("");
  const [gender,        setGender]        = useState<"" | "남성" | "여성">("");
  const [phone,         setPhone]         = useState("");
  const [birthDate,     setBirthDate]     = useState("");
  const [maritalStatus, setMaritalStatus] = useState<"" | "미혼" | "돌싱">("");
  const [submitting,    setSubmitting]    = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  // 미인증 → 로그인으로 보냄
  useEffect(() => {
    if (mounted && !isLoggedIn) router.push("/login");
  }, [mounted, isLoggedIn, router]);

  // 기존 가입 정보를 기본값으로 prefill (이름은 보통 SNS 가입 시 들어옴)
  useEffect(() => {
    if (!profile) return;
    if (profile.name && !name)             setName(profile.name);
    if ((profile.gender === "남성" || profile.gender === "여성") && !gender) setGender(profile.gender);
    if (profile.phone && !phone)           setPhone(formatPhone(profile.phone));
    if (profile.birthDate && !birthDate)   setBirthDate(profile.birthDate);
    if ((profile.maritalStatus === "미혼" || profile.maritalStatus === "돌싱") && !maritalStatus) setMaritalStatus(profile.maritalStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // 이미 onboarding이 완료된 사용자는 메인으로
  useEffect(() => {
    if (mounted && isLoggedIn && isCoreProfileComplete(profile)) {
      router.replace("/");
    }
  }, [mounted, isLoggedIn, profile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim())                                  { alert("이름을 입력해주세요."); return; }
    if (gender !== "남성" && gender !== "여성")           { alert("성별을 선택해주세요."); return; }
    if (!birthDate)                                    { alert("생년월일을 선택해주세요."); return; }
    if (!/^\d{3}-\d{4}-\d{4}$/.test(phone))            { alert("연락처를 010-0000-0000 형식으로 입력해주세요."); return; }
    if (maritalStatus !== "미혼" && maritalStatus !== "돌싱") { alert("혼인여부를 선택해주세요."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          name:  name.trim(),
          gender,
          phone,
          birthDate,
          maritalStatus,
        }),
      });
      const d = await res.json();
      if (!d?.ok) { alert(d?.error || "저장 실패"); return; }
      await refreshProfile();
      router.replace("/");
    } catch {
      alert("네트워크 오류로 저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-brand-black flex items-center justify-center">
        <p className="text-white font-bold">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-black relative overflow-x-hidden flex items-center justify-center py-10 px-4">
      {/* 배경 블러 */}
      <div className="absolute top-1/4 -left-24 w-96 h-96 bg-brand-point/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-24 w-96 h-96 bg-brand-point/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10 bg-white rounded-3xl shadow-2xl p-8 md:p-12"
      >
        <div className="text-center mb-8 md:mb-10">
          <div className="inline-flex items-center justify-center mb-5">
            <Image src="/images/logo_black.png" alt="어울림" width={108} height={36} priority />
          </div>
          <h1 className="text-2xl md:text-3xl font-black mb-2 tracking-tight">필수 회원정보</h1>
          <p className="text-gray-500 font-medium text-sm md:text-base leading-relaxed">
            매칭파티 신청 전,<br className="sm:hidden" /> 아래 정보를 한 번만 입력해주세요.
          </p>
        </div>

        <form className="space-y-5 md:space-y-6" onSubmit={handleSubmit} noValidate>
          {/* 이름 */}
          <div>
            <label className={labelClass}>이름 <span className="text-brand-point">*</span></label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="실명을 입력해주세요"
                value={name}
                onChange={e => setName(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          </div>

          {/* 성별 */}
          <div>
            <label className={labelClass}>성별 <span className="text-brand-point">*</span></label>
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              {(["남성", "여성"] as const).map(g => {
                const sel = gender === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`py-3.5 rounded-xl font-bold text-sm md:text-base transition-all ${
                      sel
                        ? "bg-brand-black text-white shadow-md"
                        : "bg-gray-50 text-gray-500 border border-gray-100 hover:border-gray-300"
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 생년월일 */}
          <div>
            <label className={labelClass}>생년월일 <span className="text-brand-point">*</span></label>
            <div className="relative">
              <Cake className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
              <input
                type="date"
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                max={todayStr}
                min="1900-01-01"
                className={inputClass}
                aria-label="생년월일"
                required
              />
            </div>
          </div>

          {/* 연락처 */}
          <div>
            <label className={labelClass}>연락처 <span className="text-brand-point">*</span></label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="tel"
                inputMode="numeric"
                placeholder="010-0000-0000"
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                maxLength={13}
                className={inputClass}
                required
              />
            </div>
          </div>

          {/* 혼인여부 */}
          <div>
            <label className={labelClass}>
              <span className="inline-flex items-center gap-1.5"><Heart size={13} className="text-brand-point" /> 혼인여부 <span className="text-brand-point">*</span></span>
            </label>
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              {(["미혼", "돌싱"] as const).map(m => {
                const sel = maritalStatus === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMaritalStatus(m)}
                    className={`py-3.5 rounded-xl font-bold text-sm md:text-base transition-all ${
                      sel
                        ? "bg-brand-black text-white shadow-md"
                        : "bg-gray-50 text-gray-500 border border-gray-100 hover:border-gray-300"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary CTA — 청록 강조로 입력을 우선 유도 */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-point text-white py-4 md:py-4.5 rounded-xl font-black text-base md:text-lg hover:brightness-110 transition-all shadow-xl hover:shadow-brand-point/40 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {submitting ? "저장 중..." : "저장하고 시작하기"}
          </button>

          {/* Secondary — outline 톤으로 선택권 제공 */}
          <button
            type="button"
            onClick={() => {
              snoozeOnboarding();
              router.push("/");
            }}
            disabled={submitting}
            className="w-full bg-white text-gray-500 py-3.5 md:py-4 rounded-xl font-bold text-sm md:text-base border border-gray-200 hover:border-gray-400 hover:text-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            나중에 입력하기
          </button>

          <p className="text-[11px] md:text-xs text-gray-400 font-medium text-center leading-relaxed pt-1">
            필수 정보는 프로필 카드 작성 시 반드시 필요합니다.<br className="sm:hidden" />
            저장 후에는 이름·성별·생년월일이 본인인증 정보로 잠깁니다.
          </p>
        </form>
      </motion.div>
    </div>
  );
}
