"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Lock, User, ShieldCheck } from "lucide-react";

export default function AdminLoginPage() {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  // 이미 로그인되어 있으면 대시보드로 자동 이동
  useEffect(() => {
    fetch("/api/admin/me.php", { cache: "no-store", credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d?.ok) router.push("/admin8888/dashboard/"); })
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !pw) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/login.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, password: pw }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.href = "/admin8888/dashboard/";
      } else {
        alert(data.error || "로그인 실패");
        setSubmitting(false);
      }
    } catch {
      alert("네트워크 오류");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-black flex items-center justify-center p-4">
      <meta name="robots" content="noindex, nofollow" />
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 md:p-10"
      >
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 bg-brand-point/10 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck size={28} className="text-brand-point" />
          </div>
          <h1 className="text-2xl font-black mb-1">관리자 로그인</h1>
          <p className="text-sm text-gray-500 font-medium">어울림 통합 관리 시스템</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-id" className="block text-sm font-bold text-gray-700 mb-1.5">아이디</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                id="admin-id"
                type="text" value={id} onChange={e => setId(e.target.value)}
                autoComplete="username" required placeholder="아이디 입력"
                className="w-full pl-11 pr-4 py-4 rounded-xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point transition-all outline-none font-medium text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="admin-pw" className="block text-sm font-bold text-gray-700 mb-1.5">비밀번호</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                id="admin-pw"
                type="password" value={pw} onChange={e => setPw(e.target.value)}
                autoComplete="current-password" required placeholder="비밀번호 입력"
                className="w-full pl-11 pr-4 py-4 rounded-xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point transition-all outline-none font-medium text-sm"
              />
            </div>
          </div>
          <button
            type="submit" disabled={submitting}
            className="w-full bg-brand-black text-white py-4 rounded-xl font-black text-base hover:bg-brand-point transition-all shadow-lg disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
