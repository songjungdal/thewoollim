"use client";

import { Suspense, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  User, Phone, MapPin, Briefcase, Heart,
  ChevronDown, ChevronUp, CheckCircle2, ArrowLeft,
} from "lucide-react";
import { useAuth, type Profile } from "../context/AuthContext";
import Header from "../components/Header";

const REGIONS = [
  "서울특별시", "경기도", "인천광역시", "부산광역시",
  "대구광역시", "대전광역시", "광주광역시", "울산광역시",
  "세종특별자치시", "강원도", "충청북도", "충청남도",
  "전라북도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

const MBTI_TYPES = [
  "INTJ","INTP","ENTJ","ENTP",
  "INFJ","INFP","ENFJ","ENFP",
  "ISTJ","ISFJ","ESTJ","ESFJ",
  "ISTP","ISFP","ESTP","ESFP",
];

const CONSENT_DETAIL = `"어울림"(이하 '서비스')은 최적의 매칭 환경을 제공하기 위해 아래와 같이 개인정보를 수집·이용합니다.

■ 수집하는 개인정보 항목
이름, 성별, 연락처(휴대전화번호), 거주지역, 직업, MBTI, 이상형 정보

■ 개인정보의 수집·이용 목적
① 매칭파티 참여자 신원 확인 및 최적의 파티 구성
② 서비스 이용에 따른 본인 확인 및 고객 관리
③ 맞춤형 매칭 및 파티 일정·변경사항 안내

■ 개인정보의 보유 및 이용기간
회원 탈퇴 시 지체 없이 파기합니다.
단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.
 · 계약 또는 청약 철회에 관한 기록: 5년 (전자상거래법)
 · 소비자 불만 또는 분쟁 처리에 관한 기록: 3년 (전자상거래법)
 · 서비스 이용 기록, 접속 로그: 3개월 (통신비밀보호법)

위 사항에 대한 동의를 거부할 권리가 있으나,
거부 시 어울림 매칭파티 서비스 이용이 제한됩니다.`;

const EMPTY_FORM: Profile = {
  name: "", gender: "", phone: "", location: "",
  job: "", mbti: "", idealType: "",
};

function ProfileSetupContent() {
  const searchParams = useSearchParams();
  const isEditMode   = searchParams.get("edit") === "true";
  const router       = useRouter();
  const { mounted, isLoggedIn, profile, updateProfile } = useAuth();

  const [form,             setForm]             = useState<Profile>(EMPTY_FORM);
  const [agreed,           setAgreed]           = useState(false);
  const [consentExpanded,  setConsentExpanded]  = useState(false);
  const [submitting,       setSubmitting]       = useState(false);
  const [errors,           setErrors]           = useState<Partial<Profile>>({});

  /* Pre-fill on edit mode or restore pending draft */
  useEffect(() => {
    if (!mounted) return;
    if (isEditMode) {
      if (!isLoggedIn) { router.push("/login"); return; }
      if (profile) { setForm(profile); setAgreed(true); }
    } else {
      try {
        const pending = localStorage.getItem("woollim_pending_profile");
        if (pending) setForm(JSON.parse(pending));
      } catch {}
    }
  }, [mounted, isEditMode, isLoggedIn, profile, router]);

  const set = (field: keyof Profile) => (value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const validate = (): boolean => {
    const e: Partial<Profile> = {};
    const req: Array<keyof Profile> = ["name","gender","phone","location","job","mbti","idealType"];
    req.forEach(f => { if (!form[f].trim()) e[f] = "필수 입력 항목입니다."; });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      alert("모든 항목을 빠짐없이 입력해주세요.");
      return;
    }
    if (!agreed) {
      alert("개인정보 수집 및 이용 동의는 필수입니다.");
      return;
    }
    setSubmitting(true);
    try {
      localStorage.setItem("woollim_pending_profile", JSON.stringify(form));
      if (isLoggedIn) {
        await updateProfile(form);
        router.push("/mypage");
      } else {
        router.push("/mypage?newuser=true");
      }
    } catch {
      alert("저장 중 오류가 발생했습니다. 다시 시도해주세요.");
      setSubmitting(false);
    }
  };

  if (!mounted) return (
    <div className="min-h-screen bg-brand-black flex items-center justify-center">
      <p className="text-white font-bold">Loading...</p>
    </div>
  );

  const inputBase = "w-full px-4 py-4 rounded-xl border bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point transition-all outline-none font-medium text-sm";
  const inputOk  = "border-gray-100";
  const inputErr = "border-red-300 bg-red-50";
  const inp = (f: keyof Profile) => `${inputBase} ${errors[f] ? inputErr : inputOk}`;

  return (
    <div className="min-h-screen bg-brand-black relative overflow-x-hidden">
      {/* Decorative blurs */}
      <div className="absolute top-1/4 -left-24 w-96 h-96 bg-brand-point/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-24 w-96 h-96 bg-brand-point/10 rounded-full blur-[120px] pointer-events-none" />

      {isEditMode && <Header />}

      <div className="relative z-10 max-w-lg mx-auto px-4 py-10 md:py-16">

        {/* Header text */}
        {!isEditMode ? (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8 md:mb-10"
          >
            <div className="w-16 h-16 bg-brand-point rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl">
              <CheckCircle2 size={32} className="text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tight">환영합니다!</h1>
            <p className="text-gray-400 font-medium text-sm md:text-base leading-relaxed">
              어울림의 새 멤버가 되셨군요.<br />최적의 매칭을 위해 프로필을 완성해주세요.
            </p>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <button onClick={() => router.push("/mypage")}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors font-bold text-sm mb-6"
            >
              <ArrowLeft size={16} /> 마이페이지로 돌아가기
            </button>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">프로필 정보 수정</h1>
            <p className="text-gray-400 mt-1 font-medium text-sm">정보를 수정하고 저장해주세요.</p>
          </motion.div>
        )}

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: isEditMode ? 0 : 0.1 }}
          className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl overflow-hidden"
        >
          <form onSubmit={handleSubmit} noValidate>
            <div className="p-6 md:p-10 space-y-5 md:space-y-6">

              {/* Name */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  이름 <span className="text-brand-point">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                  <input type="text" value={form.name} onChange={e => set("name")(e.target.value)}
                    placeholder="실명을 입력해주세요" className={inp("name") + " pl-11"} />
                </div>
                {errors.name && <p className="text-xs text-red-500 mt-1 ml-1">{errors.name}</p>}
              </div>

              {/* Gender */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  성별 <span className="text-brand-point">*</span>
                </label>
                <div className="flex gap-2 md:gap-3">
                  {["남성", "여성", "선택 안함"].map(g => (
                    <button key={g} type="button" onClick={() => set("gender")(g)}
                      className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all ${
                        form.gender === g
                          ? "bg-brand-black text-white shadow-md"
                          : "bg-gray-50 text-gray-500 border border-gray-100 hover:border-gray-300"
                      }`}
                    >{g}</button>
                  ))}
                </div>
                {errors.gender && <p className="text-xs text-red-500 mt-1 ml-1">{errors.gender}</p>}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  연락처 <span className="text-brand-point">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                  <input type="tel" value={form.phone} onChange={e => set("phone")(e.target.value)}
                    placeholder="010-0000-0000" className={inp("phone") + " pl-11"} />
                </div>
                {errors.phone && <p className="text-xs text-red-500 mt-1 ml-1">{errors.phone}</p>}
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  거주 지역 <span className="text-brand-point">*</span>
                </label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={17} />
                  <select value={form.location} onChange={e => set("location")(e.target.value)}
                    className={inp("location") + " pl-11 appearance-none cursor-pointer"}
                  >
                    <option value="">지역을 선택해주세요</option>
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {errors.location && <p className="text-xs text-red-500 mt-1 ml-1">{errors.location}</p>}
              </div>

              {/* Job */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  직업 <span className="text-brand-point">*</span>
                </label>
                <div className="relative">
                  <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                  <input type="text" value={form.job} onChange={e => set("job")(e.target.value)}
                    placeholder="예: 소프트웨어 엔지니어, 마케터 등" className={inp("job") + " pl-11"} />
                </div>
                {errors.job && <p className="text-xs text-red-500 mt-1 ml-1">{errors.job}</p>}
              </div>

              {/* MBTI */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  MBTI <span className="text-brand-point">*</span>
                </label>
                <select value={form.mbti} onChange={e => set("mbti")(e.target.value)}
                  className={inp("mbti") + " cursor-pointer"}
                >
                  <option value="">MBTI를 선택해주세요</option>
                  {MBTI_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                {errors.mbti && <p className="text-xs text-red-500 mt-1 ml-1">{errors.mbti}</p>}
              </div>

              {/* Ideal Type */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  이상형 <span className="text-brand-point">*</span>
                </label>
                <div className="relative">
                  <Heart className="absolute left-4 top-4 text-gray-400" size={17} />
                  <textarea value={form.idealType} onChange={e => set("idealType")(e.target.value)}
                    placeholder="이상형을 자유롭게 적어주세요. (예: 유머 감각 있고 대화가 잘 통하는 분)"
                    rows={3}
                    className={`w-full pl-11 pr-4 py-4 rounded-xl border ${errors.idealType ? "border-red-300 bg-red-50" : "border-gray-100 bg-gray-50"} focus:bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point transition-all outline-none font-medium text-sm resize-none`}
                  />
                </div>
                {errors.idealType && <p className="text-xs text-red-500 mt-1 ml-1">{errors.idealType}</p>}
              </div>

            </div>

            {/* Divider */}
            <div className="h-px bg-gray-100 mx-6 md:mx-10" />

            {/* Consent */}
            <div className="p-6 md:p-10">
              <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                <div className="p-4 md:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-gray-900 text-sm">
                      개인정보 수집 및 이용 동의{" "}
                      <span className="text-brand-point">(필수)</span>
                    </h4>
                    <button type="button" onClick={() => setConsentExpanded(v => !v)}
                      className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
                    >
                      {consentExpanded ? <>접기 <ChevronUp size={13} /></> : <>자세히 보기 <ChevronDown size={13} /></>}
                    </button>
                  </div>

                  {consentExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      className="text-xs text-gray-600 leading-relaxed mb-4 whitespace-pre-line border-t border-gray-200 pt-3"
                    >
                      {CONSENT_DETAIL}
                    </motion.div>
                  )}

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                      className="mt-0.5 w-5 h-5 rounded accent-brand-point cursor-pointer flex-shrink-0"
                    />
                    <span className="text-sm text-gray-700 font-medium leading-snug">
                      개인정보 수집 및 이용에 동의합니다. <span className="text-brand-point font-bold">(필수)</span>
                    </span>
                  </label>
                </div>
              </div>

              <button type="submit" disabled={submitting}
                className="mt-5 w-full bg-brand-black text-white py-4 md:py-5 rounded-2xl font-black text-base md:text-lg hover:bg-brand-point transition-all shadow-xl hover:shadow-brand-point/30 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {submitting ? "저장 중..." : isEditMode ? "수정 완료" : "프로필 완성하기"}
              </button>
            </div>
          </form>
        </motion.div>

        {!isEditMode && (
          <Link href="/"
            className="flex items-center justify-center gap-2 text-gray-500 hover:text-white mt-8 font-bold transition-colors text-sm"
          >
            <ArrowLeft size={15} /> 메인으로 돌아가기
          </Link>
        )}
      </div>
    </div>
  );
}

export default function ProfileSetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-black flex items-center justify-center">
        <p className="text-white font-bold">Loading...</p>
      </div>
    }>
      <ProfileSetupContent />
    </Suspense>
  );
}
