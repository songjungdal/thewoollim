"use client";

import { Suspense, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  User, Phone, MapPin, Briefcase, Heart, Cake,
  ChevronDown, ChevronUp, CheckCircle2, ArrowLeft, Lock,
} from "lucide-react";
import { useAuth, type Profile } from "../context/AuthContext";
import { isTestUser } from "../lib/testUsers";
import Header from "../components/Header";
import { LOCATIONS, SIDO_LIST } from "../lib/locations";

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
  job: "", mbti: "", birthDate: "", interests: "", idealType: "",
  maritalStatus: "",
};

const INTEREST_TAGS = [
  "결혼",   "연애",   "와인",   "위스키",
  "맛집",   "요리",   "베이킹", "카페",
  "여행",   "독서",   "영화",   "공연",
  "전시회", "사진",   "음악",   "패션",
  "골프",   "테니스", "러닝",   "필라테스",
  "요가",   "헬스",   "등산",   "자전거",
];

const MAX_INTERESTS = 5;

function ProfileSetupContent() {
  // 페이지 통합: ?edit=true 유무와 무관하게 항상 편집 모드 UI/로직 사용
  const searchParams = useSearchParams();
  const isEditMode   = true;
  const router       = useRouter();
  const { mounted, isLoggedIn, userEmail, profile, updateProfile } = useAuth();
  const testUser = isTestUser(userEmail);
  // searchParams는 향후 확장(섹션 점프 등)을 위해 유지
  void searchParams;

  const [form,             setForm]             = useState<Profile>(EMPTY_FORM);
  const [sido,             setSido]             = useState("");
  const [sigungu,          setSigungu]          = useState("");
  const [agreed,           setAgreed]           = useState(false);
  const [consentExpanded,  setConsentExpanded]  = useState(false);
  const [submitting,       setSubmitting]       = useState(false);
  const [errors,           setErrors]           = useState<Partial<Profile>>({});

  /**
   * 본인인증 5종(이름·성별·연락처·생년월일·혼인여부)의 lock 상태.
   * 프리필 시점에 *이미 저장된 값이 있는 필드*만 set에 추가.
   *  - 신규 입력은 허용 (form 값을 키 입력 시 즉시 잠그지 않음)
   *  - 한 번 저장된 값은 다음 진입 시 lock으로 노출
   */
  const [lockedFields, setLockedFields] = useState<Set<keyof Profile>>(new Set());
  const isLocked = (f: keyof Profile) => lockedFields.has(f);

  /* Parse stored "시도 시군구" string into 2 dropdowns */
  const parseLocation = (loc: string) => {
    if (!loc) return;
    const matched = SIDO_LIST.find(s => loc.startsWith(s));
    if (matched) {
      setSido(matched);
      setSigungu(loc.slice(matched.length).trim());
    }
  };

  /* Pre-fill on edit mode or restore pending draft.
     Always spread EMPTY_FORM so older saved profiles missing new fields
     (e.g. `interests`) don't render undefined into inputs / crash validate. */
  useEffect(() => {
    if (!mounted) return;
    if (isEditMode) {
      if (!isLoggedIn) { router.push("/login"); return; }
      if (profile) {
        const merged = { ...EMPTY_FORM, ...profile };
        setForm(merged);
        parseLocation(merged.location);
        setAgreed(true);
        // 저장된 값이 있는 본인인증 필드만 lock 대상으로 등록 (최초 입력은 허용)
        // 테스트 회원(a1~a10, b1~b10@naver.com)은 잠금 우회 — 자유 수정 허용
        const locked = new Set<keyof Profile>();
        if (!testUser) {
          if (profile.name?.trim())                                                locked.add("name");
          if (profile.gender === "남성" || profile.gender === "여성")                 locked.add("gender");
          if (profile.phone?.trim())                                               locked.add("phone");
          if (profile.birthDate?.trim())                                           locked.add("birthDate");
          if (profile.maritalStatus === "싱글" || profile.maritalStatus === "돌싱") locked.add("maritalStatus");
        }
        setLockedFields(locked);
      }
    } else {
      try {
        const pending = localStorage.getItem("woollim_pending_profile");
        if (pending) {
          const merged = { ...EMPTY_FORM, ...JSON.parse(pending) };
          setForm(merged);
          parseLocation(merged.location);
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isEditMode, isLoggedIn, profile, router]);

  /* Keep form.location in sync with the two dropdowns */
  useEffect(() => {
    const combined = sigungu ? `${sido} ${sigungu}` : sido;
    setForm(prev => prev.location === combined ? prev : { ...prev, location: combined });
  }, [sido, sigungu]);

  const set = (field: keyof Profile) => (value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const validate = (): boolean => {
    const e: Partial<Profile> = {};
    const req: Array<keyof Profile> = ["name","gender","phone","job","mbti","birthDate","interests","idealType"];
    req.forEach(f => {
      const v = form[f];
      if (!v || !v.trim()) e[f] = "필수 입력 항목입니다.";
    });
    // Location: sido required; if sido has subdivisions, sigungu also required
    if (!sido) {
      e.location = "거주 지역을 선택해주세요.";
    } else if ((LOCATIONS[sido]?.length ?? 0) > 0 && !sigungu) {
      e.location = "시/군/구까지 선택해주세요.";
    }
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
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mb-7 md:mb-9">
            <button onClick={() => router.push("/mypage")}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors font-bold text-sm mb-5 md:mb-6"
            >
              <ArrowLeft size={16} /> 마이페이지로 돌아가기
            </button>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-snug">프로필 카드 정보 수정</h1>
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

              {/* 본인인증 안내 — 5종 중 하나라도 이미 잠겨 있을 때 노출 */}
              {(isLocked("name") || isLocked("gender") || isLocked("phone") || isLocked("birthDate") || isLocked("maritalStatus")) && (
                <div className="flex items-start gap-2.5 bg-brand-point/5 border border-brand-point/20 rounded-xl p-3.5">
                  <Lock size={15} className="text-brand-point flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-600 leading-relaxed">
                    <span className="font-bold text-brand-point">본인인증 정보</span>(이름·성별·연락처·생년월일·혼인여부)는
                    최초 저장 후 보안상 수정이 제한됩니다. 변경이 필요하면 고객센터로 문의해주세요.
                  </p>
                </div>
              )}

              {testUser && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-black flex-shrink-0 mt-0.5">T</span>
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <span className="font-bold text-amber-700">테스트 계정</span>으로 로그인되어 있어 본인인증 정보(이름·성별·연락처·생년월일·혼인여부)를 자유롭게 수정할 수 있습니다.
                  </p>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                  이름 <span className="text-brand-point">*</span>
                  {isLocked("name") && <Lock size={12} className="text-gray-400" />}
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => set("name")(e.target.value)}
                    placeholder="실명을 입력해주세요"
                    className={inp("name") + " pl-11" + (isLocked("name") ? " bg-gray-100 text-gray-500 cursor-not-allowed" : "")}
                    readOnly={isLocked("name")}
                    tabIndex={isLocked("name") ? -1 : 0}
                  />
                </div>
                {errors.name && <p className="text-xs text-red-500 mt-1 ml-1">{errors.name}</p>}
              </div>

              {/* Gender */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                  성별 <span className="text-brand-point">*</span>
                  {isLocked("gender") && <Lock size={12} className="text-gray-400" />}
                </label>
                <div className="flex gap-2 md:gap-3">
                  {["남성", "여성"].map(g => {
                    const isSelected = form.gender === g;
                    const locked = isLocked("gender");
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => !locked && set("gender")(g)}
                        disabled={locked}
                        className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all ${
                          isSelected
                            ? locked
                              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                              : "bg-brand-black text-white shadow-md"
                            : locked
                              ? "bg-gray-50 text-gray-300 cursor-not-allowed border border-gray-100"
                              : "bg-gray-50 text-gray-500 border border-gray-100 hover:border-gray-300"
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
                {errors.gender && <p className="text-xs text-red-500 mt-1 ml-1">{errors.gender}</p>}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                  연락처 <span className="text-brand-point">*</span>
                  {isLocked("phone") && <Lock size={12} className="text-gray-400" />}
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => set("phone")(e.target.value)}
                    placeholder="010-0000-0000"
                    className={inp("phone") + " pl-11" + (isLocked("phone") ? " bg-gray-100 text-gray-500 cursor-not-allowed" : "")}
                    readOnly={isLocked("phone")}
                    tabIndex={isLocked("phone") ? -1 : 0}
                  />
                </div>
                {errors.phone && <p className="text-xs text-red-500 mt-1 ml-1">{errors.phone}</p>}
              </div>

              {/* Birth Date — onboarding에서 입력된 값은 lock */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                  생년월일 <span className="text-brand-point">*</span>
                  {isLocked("birthDate") && <Lock size={12} className="text-gray-400" />}
                </label>
                <div className="relative">
                  <Cake className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={17} />
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={e => set("birthDate")(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    min="1900-01-01"
                    className={inp("birthDate") + " pl-11" + (isLocked("birthDate") ? " bg-gray-100 text-gray-500 cursor-not-allowed" : "")}
                    readOnly={isLocked("birthDate")}
                    tabIndex={isLocked("birthDate") ? -1 : 0}
                    aria-label="생년월일"
                  />
                </div>
                {errors.birthDate && <p className="text-xs text-red-500 mt-1 ml-1">{errors.birthDate}</p>}
              </div>

              {/* Marital status — 최초 입력은 허용, 저장된 값은 read-only로 lock */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                  혼인여부 <span className="text-brand-point">*</span>
                  {isLocked("maritalStatus") && <Lock size={12} className="text-gray-400" />}
                </label>
                <div className="flex gap-2 md:gap-3">
                  {(["싱글", "돌싱"] as const).map(m => {
                    const sel = form.maritalStatus === m;
                    const locked = isLocked("maritalStatus");
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => !locked && set("maritalStatus")(m)}
                        disabled={locked}
                        className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all ${
                          sel
                            ? locked
                              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                              : "bg-brand-black text-white shadow-md"
                            : locked
                              ? "bg-gray-50 text-gray-300 cursor-not-allowed border border-gray-100"
                              : "bg-gray-50 text-gray-500 border border-gray-100 hover:border-gray-300"
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
                {!isLocked("maritalStatus") && (
                  <p className="text-xs text-gray-400 mt-1.5 ml-1 leading-relaxed">
                    혼인여부는 최초 1회만 선택 가능하며, 저장 후에는 변경이 제한됩니다.
                  </p>
                )}
              </div>

              {/* Location — cascading 시/도 → 시/군/구 */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  거주 지역 <span className="text-brand-point">*</span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={17} />
                    <select
                      value={sido}
                      onChange={e => { setSido(e.target.value); setSigungu(""); }}
                      className={inp("location") + " pl-11 appearance-none cursor-pointer"}
                      aria-label="시/도 선택"
                    >
                      <option value="">시/도 선택</option>
                      {SIDO_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="relative">
                    <select
                      value={sigungu}
                      onChange={e => setSigungu(e.target.value)}
                      disabled={!sido || (LOCATIONS[sido]?.length ?? 0) === 0}
                      className={inp("location") + " appearance-none cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"}
                      aria-label="시/군/구 선택"
                    >
                      <option value="">
                        {!sido
                          ? "시/도를 먼저 선택"
                          : (LOCATIONS[sido]?.length ?? 0) === 0
                            ? "선택 불필요"
                            : "시/군/구 선택"}
                      </option>
                      {sido && LOCATIONS[sido]?.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
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
                  aria-label="MBTI 선택"
                >
                  <option value="">MBTI를 선택해주세요</option>
                  {MBTI_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                {errors.mbti && <p className="text-xs text-red-500 mt-1 ml-1">{errors.mbti}</p>}
              </div>

              {/* Interests — multi-select tag buttons (최대 5개) */}
              {(() => {
                const selectedInterests = new Set(
                  form.interests
                    ? form.interests.split(",").map(s => s.trim()).filter(Boolean)
                    : []
                );
                const toggleInterest = (tag: string) => {
                  const next = new Set(selectedInterests);
                  if (next.has(tag)) {
                    next.delete(tag);
                  } else {
                    if (next.size >= MAX_INTERESTS) {
                      alert(`관심사는 최대 ${MAX_INTERESTS}개까지 선택할 수 있습니다.`);
                      return;
                    }
                    next.add(tag);
                  }
                  // 정의된 태그 순서대로 직렬화 → DB에 일관된 형식으로 저장
                  const ordered = INTEREST_TAGS.filter(t => next.has(t));
                  set("interests")(ordered.join(","));
                };
                return (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center justify-between">
                      <span>
                        관심사 <span className="text-brand-point">*</span>
                      </span>
                      <span className={`text-xs font-bold ${
                        selectedInterests.size >= MAX_INTERESTS ? "text-brand-point" : "text-gray-400"
                      }`}>
                        {selectedInterests.size} / {MAX_INTERESTS}
                      </span>
                    </label>
                    <div className={`flex flex-wrap gap-2 md:gap-2.5 p-3 md:p-4 rounded-xl border ${errors.interests && selectedInterests.size === 0 ? "border-red-300 bg-red-50" : "border-gray-100 bg-gray-50"}`}>
                      {INTEREST_TAGS.map(tag => {
                        const sel = selectedInterests.has(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleInterest(tag)}
                            className={`px-3.5 md:px-4 py-2.5 md:py-3 rounded-full text-sm md:text-base font-bold transition-all min-h-[40px] ${
                              sel
                                ? "bg-brand-point text-brand-black shadow-md"
                                : "bg-white text-gray-500 border border-gray-200 hover:border-brand-point hover:text-brand-point"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5 ml-1 leading-relaxed">
                      마음에 드는 키워드를 1~{MAX_INTERESTS}개 선택해주세요. 매칭 추천에 활용됩니다.
                    </p>
                    {errors.interests && (
                      <p className="text-xs text-red-500 mt-1 ml-1">{errors.interests}</p>
                    )}
                  </div>
                );
              })()}

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
