"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Users, Ticket, Tag, Building2, LogOut, ShieldCheck, CheckCircle2, Clock, AlertTriangle, Calendar, Plus, Pencil, Trash2, ImageIcon, X, FileText, Search, StickyNote, Save } from "lucide-react";
import { useParties, broadcastPartiesUpdated } from "../../lib/useParties";
import { formatPhoneKR } from "../../lib/phone";
import { formatKST } from "../../lib/datetime";

type AdminUser = {
  id: number; email: string; name: string; gender: string; phone: string;
  location: string; job: string; mbti: string; birth_date: string;
  marital_status?: string;  // '싱글' | '돌싱' | '' (미입력) — DB 컬럼명 그대로 (admin/users.php 응답)
  interests: string; idealType: string;
  sns_provider: string | null; status: string; created_at: string;
  role?: "user" | "admin";
};
type BookingRow = {
  id: string; partyId: string; status: string; createdAt: string; total?: number;
  userEmail: string; userName: string; userGender: string; userPhone: string;
  userMbti?: string; userJob?: string; userBirthDate?: string;
  userInterests?: string; userIdealType?: string;
};
type TabKey = "members" | "bookings" | "parties" | "coupons" | "company" | "gallery" | "logs" | "memos";

type MemoItem = {
  id: number;
  content: string;
  color: string;
  author_id: string;
  created_at: string;
  updated_at: string;
};

const MEMO_COLORS = [
  "#FEF9C3", // 연한 노랑
  "#CCFBF1", // 연한 청록
  "#FCE7F3", // 연한 핑크
  "#DBEAFE", // 연한 하늘
  "#DCFCE7", // 연한 연두
  "#FED7AA", // 연한 주황
  "#E9D5FF", // 연한 보라
  "#F3F4F6", // 연한 회색
];

type GalleryItem = {
  id: number;
  image_path: string;
  alt_text: string;
  sort_order: number;
  created_at?: string;
};

type AdminLogRow = {
  id: number;
  created_at: string;
  admin_id: string;
  ip: string;
  action: "login" | "logout" | "login_fail" | "create" | "update" | "delete" | "view" | string;
  target_type: string;
  target_id: string;
  summary: string;
  before_value: any;
  after_value: any;
  user_agent: string;
};

type PartyForm = {
  id?: string;
  title: string;
  description: string;
  dateString: string;
  calendarDate: string;
  location: string;
  target: string;
  price: number;
  tag: string;
  maleStock: number;
  femaleStock: number;
  imageUrl: string;
  // 참가 자격 제한 (선택). 빈 문자열은 무제한 의미.
  minAge: string;
  maxAge: string;
  allowedMaritalStatus: "all" | "싱글" | "돌싱";
  // 메인 페이지 카테고리 (선택). 빈 문자열은 미지정.
  targetGroup: "" | "싱글" | "돌싱";
  theme: "" | "티타임" | "와인파티" | "사케파티" | "쿠킹클래스";
  locationTag: "" | "서울" | "성남" | "수원" | "인천" | "용인" | "기타";
};
const EMPTY_PARTY: PartyForm = {
  title: "", description: "", dateString: "", calendarDate: "",
  location: "", target: "", price: 0, tag: "주제별",
  maleStock: 12, femaleStock: 12, imageUrl: "",
  minAge: "", maxAge: "", allowedMaritalStatus: "all",
  targetGroup: "", theme: "", locationTag: "",
};

function BookingTable({ label, toneClass, rows, party, onApprove, onCancel }: {
  label: string;
  toneClass: string;
  rows: BookingRow[];
  party: { title: string; price: number } | undefined;
  onApprove: (email: string, bookingId: string) => void;
  onCancel:  (email: string, bookingId: string) => void;
}) {
  return (
    <div className="border-t border-gray-100">
      <div className={`px-5 md:px-7 py-2.5 ${toneClass} text-xs md:text-sm font-black tracking-wider`}>
        {label} ({rows.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-sm whitespace-nowrap">
          <thead className="bg-gray-50 text-gray-500 font-bold">
            <tr>
              {["취소","이름","연락처","생년월일","MBTI","직업","결제일","결제금액","상태","관리"].map(h => (
                <th key={h} className="text-left px-3 py-2.5 first:pl-5 md:first:pl-7">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={10} className="text-center text-gray-300 py-6 text-xs">신청자 없음</td></tr>
            )}
            {rows.map(b => {
              const isCancelled = b.status === "cancelled";
              const meta = STATUS_LABEL[b.status] || STATUS_LABEL.paid_pending_profile;
              const confirmed = b.status === "confirmed";
              const birth = (b.userBirthDate ?? "").slice(0, 10) || "-";
              return (
                <tr key={b.id} className={`border-t border-gray-100 transition-colors ${
                  isCancelled
                    ? "bg-gray-50 text-gray-400"
                    : "hover:bg-gray-50"
                }`}>
                  {/* 좌측 [취소] 버튼 */}
                  <td className="px-3 py-2.5 first:pl-5 md:first:pl-7">
                    {isCancelled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-black bg-red-100 text-red-700">
                        <X size={11} /> 취소 완료
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCancel(b.userEmail, b.id)}
                        className="inline-flex items-center gap-1 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 px-2.5 py-1.5 rounded-lg text-xs font-black transition-colors"
                      >
                        <X size={11} /> 취소
                      </button>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 font-bold ${isCancelled ? "line-through" : ""}`}>{b.userName}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatPhoneKR(b.userPhone)}</td>
                  <td className="px-3 py-2.5 text-gray-600 tabular-nums" title="프로필 카드 기반 (수정 불가)">{birth}</td>
                  <td className="px-3 py-2.5">{b.userMbti || "-"}</td>
                  <td className="px-3 py-2.5">{b.userJob || "-"}</td>
                  <td className="px-3 py-2.5 text-gray-500">{b.createdAt?.slice(0, 10)}</td>
                  <td className={`px-3 py-2.5 font-black ${isCancelled ? "text-gray-400 line-through" : "text-brand-point"}`}>₩{(b.total ?? party?.price ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] md:text-xs font-black ${meta.tone}`}>{meta.label}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {isCancelled ? (
                      <span className="text-xs text-gray-400 font-bold">—</span>
                    ) : confirmed ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-xs">
                        <CheckCircle2 size={13} /> 확정 완료
                      </span>
                    ) : (
                      <button onClick={() => onApprove(b.userEmail, b.id)}
                        className="inline-flex items-center gap-1 bg-brand-point text-brand-black px-2.5 md:px-3 py-1.5 rounded-lg text-xs font-black hover:brightness-95 transition-all">
                        <CheckCircle2 size={11} /> 참가확정
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, textarea }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; textarea?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-gray-700 mb-1.5">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
          className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none resize-none"/>
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none"/>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  paid_pending_profile: { label: "결제완료(프로필 대기)", tone: "bg-amber-100 text-amber-800" },
  pending_approval:     { label: "확정 대기 중",         tone: "bg-blue-100 text-blue-800" },
  confirmed:            { label: "참가 확정 완료",       tone: "bg-emerald-100 text-emerald-800" },
  cancelled:            { label: "취소됨",               tone: "bg-gray-200 text-gray-600" },
};

export default function AdminDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<TabKey>("members");
  const PARTIES = useParties();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  type Coupon = { code: string; amount: number; expiresAt: string; active: boolean; createdAt?: string };
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [company, setCompany] = useState({ name: "", ceo: "", biz_no: "", address: "", telecom: "" });
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [galleryUploading, setGalleryUploading] = useState(false);
  // 업무 메모 (포스트잇)
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [memoEditingId, setMemoEditingId] = useState<number | null>(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoNewOpen, setMemoNewOpen] = useState(false);
  const [memoNewContent, setMemoNewContent] = useState("");
  const [memoNewColor, setMemoNewColor] = useState(MEMO_COLORS[0]);
  // 호스트 이름 매핑 (관리자 전용 — partyId → host_name)
  const [hostMap, setHostMap] = useState<Record<string, string>>({});
  const [hostEditingId, setHostEditingId] = useState<string | null>(null);
  const [hostDraft, setHostDraft] = useState("");

  // 로그 관리 상태
  const [logs, setLogs]                 = useState<AdminLogRow[]>([]);
  const [logsLoading, setLogsLoading]   = useState(false);
  const [logsTotal, setLogsTotal]       = useState(0);
  const [logFromDate, setLogFromDate]   = useState("");
  const [logToDate, setLogToDate]       = useState("");
  const [logAdminFilter, setLogAdminFilter] = useState("");
  const [logActionFilter, setLogActionFilter] = useState("");
  const [logExpanded, setLogExpanded]   = useState<Set<number>>(new Set());

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (logFromDate) qs.set("from", logFromDate);
      if (logToDate) qs.set("to", logToDate);
      if (logAdminFilter.trim()) qs.set("admin", logAdminFilter.trim());
      if (logActionFilter) qs.set("action", logActionFilter);
      qs.set("limit", "300");
      const res = await fetch(`/api/admin/logs.php?${qs.toString()}`, { cache: "no-store", credentials: "include" });
      const d = await res.json();
      if (d?.ok) {
        setLogs(Array.isArray(d.rows) ? d.rows : []);
        setLogsTotal(Number(d.total) || 0);
      }
    } finally {
      setLogsLoading(false);
    }
  }, [logFromDate, logToDate, logAdminFilter, logActionFilter]);

  // 로그 탭 진입 시, 그리고 필터 변경 시 자동 로드
  useEffect(() => {
    if (tab === "logs" && authChecked) loadLogs();
  }, [tab, authChecked, loadLogs]);
  const [genderFilter, setGenderFilter] = useState<"all" | "남성" | "여성">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid_pending_profile" | "pending_approval" | "confirmed">("all");
  const [memberMaritalFilter, setMemberMaritalFilter] = useState<"all" | "싱글" | "돌싱" | "empty">("all");

  // 매칭파티 CRUD state
  const [partyForm, setPartyForm] = useState<PartyForm>(EMPTY_PARTY);
  const [partyEditMode, setPartyEditMode] = useState<"create" | "edit" | null>(null);
  const [uploading, setUploading] = useState(false);

  const openPartyCreate = () => { setPartyForm(EMPTY_PARTY); setPartyEditMode("create"); setPartyFormDirty(false); };
  const openPartyEdit = (id: string) => {
    const p = PARTIES.find(x => x.id === id);
    if (!p) return;
    const ams = (p as any).allowedMaritalStatus;
    const tg  = (p as any).targetGroup;
    const th  = (p as any).theme;
    const lt  = (p as any).locationTag;
    setPartyForm({
      id: p.id, title: p.title, description: (p as any).description ?? "",
      dateString: p.dateString, calendarDate: p.calendarDate,
      location: p.location, target: p.target, price: p.price, tag: p.tag,
      maleStock: p.maleStock, femaleStock: p.femaleStock,
      imageUrl: (p as any).imageUrl ?? "",
      minAge: p.minAge != null ? String(p.minAge) : "",
      maxAge: p.maxAge != null ? String(p.maxAge) : "",
      allowedMaritalStatus: (ams === "싱글" || ams === "돌싱") ? ams : "all",
      targetGroup: (tg === "싱글" || tg === "돌싱") ? tg : "",
      theme:       (th === "티타임" || th === "와인파티" || th === "사케파티" || th === "쿠킹클래스") ? th : "",
      locationTag: (lt === "서울" || lt === "성남" || lt === "수원" || lt === "인천" || lt === "용인" || lt === "기타") ? lt : "",
    });
    setPartyEditMode("edit");
    setPartyFormDirty(false);
  };
  const closePartyForm = () => {
    if (partyFormDirty) {
      if (!confirm("작성 중인 내용이 저장되지 않습니다.\n정말 닫으시겠습니까?")) return;
    }
    setPartyEditMode(null);
    setPartyForm(EMPTY_PARTY);
    setPartyFormDirty(false);
  };

  // 폼이 "더러워졌는지"(unsaved input) — beforeunload 가드용
  const [partyFormDirty, setPartyFormDirty] = useState(false);
  // 명시적 redirect 직전 beforeunload 가드 우회 (저장 후 dashboard 이동 시 중복 alert 방지)
  const skipBeforeUnloadRef = useRef(false);

  // 작성 중 이탈 방지 — 모달 열려있고 dirty면 새로고침/뒤로가기/탭 닫기 시 경고
  // 단, savePartyForm/deleteParty가 명시적으로 redirect할 때는 skipBeforeUnloadRef로 우회
  useEffect(() => {
    if (!partyEditMode || !partyFormDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (skipBeforeUnloadRef.current) return; // 저장 직후 의도된 navigation은 통과
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [partyEditMode, partyFormDirty]);

  const savePartyForm = async () => {
    const f = partyForm;
    if (!f.title || !f.dateString || !f.calendarDate || !f.location || !f.target) {
      alert("필수 항목(제목/일시/장소/대상)을 모두 입력해주세요.");
      return;
    }
    const action = partyEditMode === "create" ? "create" : "update";
    try {
      const res = await fetch("/api/admin/parties.php", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, party: f }),
      });
      const d = await res.json();
      if (!d?.ok) {
        alert("수정 중 오류가 발생했습니다." + (d?.error ? `\n(${d.error})` : ""));
        return; // 모달 유지 — 사용자가 입력값 보존
      }

      // 같은 브라우저 다른 탭(메인/상세 등)에 broadcast — 다음 페이지에서 갱신된 상태 노출
      broadcastPartiesUpdated();
      // beforeunload 가드 우회 + dirty 해제 (중복 confirm 차단)
      skipBeforeUnloadRef.current = true;
      setPartyFormDirty(false);

      // 단일 알림 → 확인 누르면 dashboard로 hard refresh 이동
      alert("수정되었습니다.");
      window.location.assign("/admin8888/dashboard/");
    } catch {
      alert("수정 중 오류가 발생했습니다.");
    }
  };

  const deleteParty = async (id: string) => {
    if (!confirm("이 매칭파티를 삭제하시겠습니까?\n(예약된 회원이 있으면 데이터가 어긋날 수 있습니다.)")) return;
    try {
      const res = await fetch("/api/admin/parties.php", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const d = await res.json();
      if (!d?.ok) { alert("수정 중 오류가 발생했습니다." + (d?.error ? `\n(${d.error})` : "")); return; }
      broadcastPartiesUpdated();
      skipBeforeUnloadRef.current = true;
      setPartyFormDirty(false);
      alert("삭제되었습니다.");
      window.location.assign("/admin8888/dashboard/");
    } catch {
      alert("수정 중 오류가 발생했습니다.");
    }
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/admin/upload.php", {
        method: "POST", credentials: "include", body: fd,
      });
      const d = await res.json();
      if (d?.ok) {
        setPartyForm(prev => ({ ...prev, imageUrl: d.url }));
      } else {
        alert(d?.error || "업로드 실패");
      }
    } catch {
      alert("업로드 네트워크 오류");
    } finally {
      setUploading(false);
    }
  };

  // Auth gate
  useEffect(() => {
    fetch("/api/admin/me.php", { cache: "no-store", credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (!d?.ok) { router.push("/admin8888/"); return; }
        setAuthChecked(true);
      })
      .catch(() => router.push("/admin8888/"));
  }, [router]);

  const loadAll = useCallback(async () => {
    const [u, b, c, co, g, m, p] = await Promise.all([
      fetch("/api/admin/users.php",    { cache: "no-store", credentials: "include" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/admin/bookings.php", { cache: "no-store", credentials: "include" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/admin/coupons.php",  { cache: "no-store", credentials: "include" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/admin/company.php",  { cache: "no-store", credentials: "include" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/admin/gallery.php",  { cache: "no-store", credentials: "include" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/admin/memos.php",    { cache: "no-store", credentials: "include" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/admin/parties.php",  { cache: "no-store", credentials: "include" }).then(r => r.json()).catch(() => ({})),
    ]);
    if (u?.users)    setUsers(u.users);
    if (b?.rows)     setBookings(b.rows);
    if (c?.coupons)  setCoupons(Array.isArray(c.coupons) ? c.coupons : []);
    if (co?.company) setCompany(co.company);
    if (g?.items)    setGallery(Array.isArray(g.items) ? g.items : []);
    if (m?.items)    setMemos(Array.isArray(m.items) ? m.items : []);
    // 호스트 매핑 — 관리자 전용 GET 응답에서만 host_name 노출
    if (Array.isArray(p?.items)) {
      const map: Record<string, string> = {};
      for (const it of p.items) {
        if (it && it.id != null) map[String(it.id)] = String(it.host_name ?? "");
      }
      setHostMap(map);
    }
  }, []);

  // 호스트 이름 인라인 편집 — 즉시 DB 반영
  const startEditHost = (partyId: string) => {
    setHostEditingId(partyId);
    setHostDraft(hostMap[partyId] ?? "");
  };
  const cancelEditHost = () => {
    setHostEditingId(null);
    setHostDraft("");
  };
  const saveEditHost = async () => {
    if (hostEditingId == null) return;
    const partyId = hostEditingId;
    const next = hostDraft.trim();
    // 클라이언트 1차 sanitize — 서버에서 동일 검증 재수행
    if (/[<>]/.test(next)) { alert("사용할 수 없는 문자가 포함돼있습니다."); return; }
    if (next.length > 100) { alert("호스트 이름이 너무 깁니다 (최대 100자)."); return; }
    const res = await fetch("/api/admin/parties.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_host", id: partyId, host_name: next }),
    });
    const d = await res.json();
    if (!d?.ok) { alert(d?.error || "저장 실패"); return; }
    setHostMap(prev => ({ ...prev, [partyId]: d.host_name ?? next }));
    setHostEditingId(null);
    setHostDraft("");
  };

  // 업무 메모 — CRUD
  const createMemo = async () => {
    const content = memoNewContent.trim();
    if (!content) { alert("내용을 입력해주세요."); return; }
    const res = await fetch("/api/admin/memos.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", content, color: memoNewColor }),
    });
    const d = await res.json();
    if (!d?.ok) { alert(d?.error || "저장 실패"); return; }
    setMemoNewOpen(false);
    setMemoNewContent("");
    setMemoNewColor(MEMO_COLORS[0]);
    await loadAll();
  };

  const startEditMemo = (m: MemoItem) => {
    setMemoEditingId(m.id);
    setMemoDraft(m.content);
  };

  const saveEditMemo = async () => {
    if (memoEditingId == null) return;
    const content = memoDraft.trim();
    if (!content) { alert("내용을 입력해주세요."); return; }
    const res = await fetch("/api/admin/memos.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id: memoEditingId, content }),
    });
    const d = await res.json();
    if (!d?.ok) { alert(d?.error || "저장 실패"); return; }
    setMemoEditingId(null);
    setMemoDraft("");
    await loadAll();
  };

  const updateMemoColor = async (id: number, color: string) => {
    const res = await fetch("/api/admin/memos.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, color }),
    });
    const d = await res.json();
    if (!d?.ok) { alert(d?.error || "색상 변경 실패"); return; }
    setMemos(prev => prev.map(m => m.id === id ? { ...m, color } : m));
  };

  const deleteMemo = async (id: number) => {
    if (!confirm("이 메모를 삭제하시겠습니까?")) return;
    const res = await fetch("/api/admin/memos.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const d = await res.json();
    if (!d?.ok) { alert(d?.error || "삭제 실패"); return; }
    setMemos(prev => prev.filter(m => m.id !== id));
  };

  // 후기 갤러리 — 메인페이지 즉시 동기화 broadcast 헬퍼
  const broadcastGallery = () => {
    try { new BroadcastChannel("woollim_gallery").postMessage({ at: Date.now() }); } catch {}
  };

  const uploadGalleryImage = async (file: File) => {
    setGalleryUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const upRes = await fetch("/api/admin/upload-gallery.php", {
        method: "POST", credentials: "include", body: fd,
      });
      const upD = await upRes.json();
      if (!upD?.ok) { alert(upD?.error || "업로드 실패"); return; }

      // DB 등록
      const regRes = await fetch("/api/admin/gallery.php", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", image_path: upD.url, alt_text: "" }),
      });
      const regD = await regRes.json();
      if (!regD?.ok) { alert(regD?.error || "DB 등록 실패"); return; }

      broadcastGallery();
      await loadAll();
    } catch {
      alert("업로드 네트워크 오류");
    } finally {
      setGalleryUploading(false);
    }
  };

  const deleteGalleryItem = async (id: number, alt: string) => {
    if (!confirm(`이 갤러리 이미지를 삭제하시겠습니까?\n\n${alt || `#${id}`}`)) return;
    const res = await fetch("/api/admin/gallery.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const d = await res.json();
    if (!d?.ok) { alert(d?.error || "삭제 실패"); return; }
    setGallery(prev => prev.filter(g => g.id !== id));
    broadcastGallery();
    await loadAll();
  };

  const moveGalleryItem = async (id: number, direction: -1 | 1) => {
    const idx = gallery.findIndex(g => g.id === id);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= gallery.length) return;
    // 두 항목의 sort_order 값을 swap
    const next = [...gallery];
    const a = { ...next[idx],     sort_order: gallery[swapIdx].sort_order };
    const b = { ...next[swapIdx], sort_order: gallery[idx].sort_order };
    next[idx]     = swapIdx > idx ? b : a;
    next[swapIdx] = swapIdx > idx ? a : b;
    setGallery(next.sort((x, y) => x.sort_order - y.sort_order));

    const res = await fetch("/api/admin/gallery.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reorder",
        items: [
          { id: a.id, sort_order: a.sort_order },
          { id: b.id, sort_order: b.sort_order },
        ],
      }),
    });
    const d = await res.json();
    if (!d?.ok) { alert(d?.error || "순서 변경 실패"); await loadAll(); return; }
    broadcastGallery();
  };

  const updateGalleryAlt = async (id: number, alt_text: string) => {
    const res = await fetch("/api/admin/gallery.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, alt_text }),
    });
    const d = await res.json();
    if (!d?.ok) { alert(d?.error || "수정 실패"); return; }
    setGallery(prev => prev.map(g => g.id === id ? { ...g, alt_text } : g));
    broadcastGallery();
  };

  useEffect(() => { if (authChecked) loadAll(); }, [authChecked, loadAll]);

  // 실시간 동기화: 사용자가 마이페이지에서 프로필을 수정하면 관리자 화면도 새로고침 없이 즉시 반영
  // - focus / visibilitychange: 탭 활성화 시 즉시 갱신
  // - 30초 주기 폴링: 백그라운드에서도 최대 30초 내 반영
  useEffect(() => {
    if (!authChecked) return;
    const refresh = () => loadAll();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [authChecked, loadAll]);

  const handleLogout = async () => {
    await fetch("/api/admin/logout.php", { method: "POST", credentials: "include" });
    router.push("/admin8888/");
  };

  const approveBooking = async (email: string, bookingId: string) => {
    if (!confirm("이 예약을 '참가 확정 완료'로 처리하시겠습니까?")) return;
    const res = await fetch("/api/admin/bookings.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", email, bookingId }),
    });
    const d = await res.json();
    if (d?.ok) { alert("확정 처리 완료"); await loadAll(); }
    else alert(d?.error || "처리 실패");
  };

  const cancelBooking = async (email: string, bookingId: string) => {
    if (!confirm("이 예약을 취소 처리하시겠습니까?\n\n해당 회원은 명단에서 [취소 완료]로 표시되며,\n파티의 성별 인원수가 즉시 -1 차감됩니다.")) return;
    const res = await fetch("/api/admin/bookings.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", email, bookingId }),
    });
    const d = await res.json();
    if (d?.ok) {
      // 다른 탭(메인/상세)의 partyCounts 즉시 갱신
      try { new BroadcastChannel("woollim_party_counts").postMessage({ at: Date.now() }); } catch {}
      alert("취소 처리 완료");
      await loadAll();
    } else {
      alert(d?.error || "취소 처리 실패");
    }
  };

  const deleteUser = async (email: string, name?: string) => {
    const who = name ? `${name} (${email})` : email;
    if (!confirm(`정말로 이 회원을 삭제하시겠습니까?\n\n대상: ${who}\n\n관련 데이터(예약, 프로필, 카트 등)가 모두 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`)) return;
    const res = await fetch("/api/admin/users.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", email }),
    });
    const d = await res.json();
    if (!d?.ok) { alert(d?.error || "삭제 실패"); return; }
    // 즉시 화면에서 제거 (낙관적 업데이트) + 서버 동기화
    setUsers(prev => prev.filter(u => u.email !== email));
    setBookings(prev => prev.filter(b => b.userEmail !== email));
    // 메인 페이지 '실시간 참여자' 등 다른 탭에 즉시 알림 → 캐시 무효화
    try {
      const ch = new BroadcastChannel("woollim_users");
      ch.postMessage({ type: "deleted", email, at: Date.now() });
      ch.close();
    } catch {}
    await loadAll();
    alert("회원 삭제 완료 — 홈페이지에 즉시 반영되었습니다.");
  };

  const saveCoupons = async () => {
    const res = await fetch("/api/admin/coupons.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", coupons }),
    });
    const d = await res.json();
    if (d?.ok) { alert("쿠폰 저장 완료"); setCoupons(d.coupons || []); }
    else alert("저장 실패");
  };

  const addCoupon = () => {
    setCoupons(prev => [
      { code: "", amount: 10000, expiresAt: "", active: true, createdAt: new Date().toISOString() },
      ...prev,
    ]);
  };
  const removeCoupon = (idx: number) => {
    if (!confirm("이 쿠폰을 삭제하시겠습니까?")) return;
    setCoupons(prev => prev.filter((_, i) => i !== idx));
  };
  const updateCoupon = (idx: number, patch: Partial<Coupon>) => {
    setCoupons(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const saveCompany = async () => {
    const res = await fetch("/api/admin/company.php", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company }),
    });
    const d = await res.json();
    if (d?.ok) {
      setCompany(d.company);
      // 다른 탭(메인/푸터 등)에 즉시 알림 — Footer가 BroadcastChannel + storage event를 listen 중
      try {
        const ch = new BroadcastChannel("woollim_company");
        ch.postMessage({ company: d.company, at: Date.now() });
        ch.close();
      } catch {}
      try { localStorage.setItem("woollim_company", JSON.stringify(d.company)); } catch {}
      alert("기업 정보 저장 완료 — 홈페이지에 즉시 반영되었습니다.");
    }
    else alert("저장 실패");
  };

  if (!authChecked) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="font-bold">인증 확인 중...</p></div>;
  }

  const filteredBookings = bookings.filter(b => {
    if (genderFilter !== "all" && b.userGender !== genderFilter) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    return true;
  });

  const TABS: { key: TabKey; label: string; icon: typeof Users }[] = [
    { key: "members",  label: "회원 관리",       icon: Users },
    { key: "bookings", label: "예약 / 신청 현황", icon: Ticket },
    { key: "parties",  label: "매칭파티",        icon: Calendar },
    { key: "coupons",  label: "쿠폰 관리",       icon: Tag },
    { key: "company",  label: "기업 정보",       icon: Building2 },
    { key: "gallery",  label: "후기 갤러리 관리", icon: ImageIcon },
    { key: "logs",     label: "로그 관리",        icon: FileText },
    { key: "memos",    label: "업무 메모",        icon: StickyNote },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <meta name="robots" content="noindex, nofollow" />

      {/* Header */}
      <header className="bg-brand-black text-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={20} className="text-brand-point" />
            <span className="font-black text-base md:text-lg">어울림 관리자</span>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 md:px-4 py-2 rounded-lg text-sm font-bold transition-all">
            <LogOut size={14} /> 로그아웃
          </button>
        </div>
        {/* Tabs */}
        <nav className="border-t border-white/10 overflow-x-auto">
          <div className="max-w-7xl mx-auto px-4 md:px-6 flex gap-1 md:gap-2">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-3 md:px-5 py-3 text-xs md:text-sm font-bold whitespace-nowrap transition-all border-b-2 ${
                    active ? "border-brand-point text-brand-point" : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  <Icon size={14} /> {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>

          {/* === 회원 관리 === */}
          {tab === "members" && (() => {
            const filteredUsers = users.filter(u => {
              if (memberMaritalFilter === "all")    return true;
              if (memberMaritalFilter === "empty")  return !(u.marital_status ?? "").trim();
              return u.marital_status === memberMaritalFilter;
            });
            return (
              <section>
                <div className="flex items-end justify-between mb-4 md:mb-5 flex-wrap gap-3">
                  <div>
                    <h2 className="text-xl md:text-2xl font-black">회원 관리</h2>
                    <p className="text-sm text-gray-500 font-medium mt-1">
                      전체 가입 회원 {users.length}명 · 표시 {filteredUsers.length}명
                    </p>
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500">혼인여부</span>
                    <select
                      aria-label="혼인여부 필터"
                      value={memberMaritalFilter}
                      onChange={e => setMemberMaritalFilter(e.target.value as "all" | "싱글" | "돌싱" | "empty")}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium bg-white"
                    >
                      <option value="all">전체</option>
                      <option value="싱글">싱글만</option>
                      <option value="돌싱">돌싱만</option>
                      <option value="empty">미입력</option>
                    </select>
                  </label>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead className="bg-gray-50 text-gray-600 font-bold">
                      <tr>
                        {["#","이메일","이름","성별","혼인여부","연락처","지역","직업","MBTI","생년월일","SNS","가입일","관리"].map(h => (
                          <th key={h} className="text-left px-3 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(u => {
                        // 관용성: DB legacy 값('single'/'divorced') 도 한글로 정규화
                        const rawMs = (u.marital_status ?? "").trim().toLowerCase();
                        const ms =
                          rawMs === "싱글"  || rawMs === "single"   || rawMs === "미혼" ? "싱글" :
                          rawMs === "돌싱"  || rawMs === "divorced"                     ? "돌싱" :
                          "";
                        return (
                          <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-2.5 font-bold">{u.id}</td>
                            <td className="px-3 py-2.5">
                              {u.email}
                              {u.role === "admin" && (
                                <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-700 align-middle">ADMIN</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-bold">{u.name || <span className="text-gray-400 text-xs">미입력</span>}</td>
                            <td className="px-3 py-2.5">{u.gender || <span className="text-gray-400 text-xs">미입력</span>}</td>
                            <td className="px-3 py-2.5">
                              {ms === "싱글" ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] md:text-xs font-black bg-blue-100 text-blue-800">싱글</span>
                              ) : ms === "돌싱" ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] md:text-xs font-black bg-purple-100 text-purple-800">돌싱</span>
                              ) : (
                                <span className="text-gray-400 text-xs">미입력</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums">{u.phone ? formatPhoneKR(u.phone) : <span className="text-gray-400 text-xs">미입력</span>}</td>
                            <td className="px-3 py-2.5">{u.location || "-"}</td>
                            <td className="px-3 py-2.5">{u.job || "-"}</td>
                            <td className="px-3 py-2.5">{u.mbti || "-"}</td>
                            <td className="px-3 py-2.5">{u.birth_date || <span className="text-gray-400 text-xs">미입력</span>}</td>
                            <td className="px-3 py-2.5">{u.sns_provider || "일반"}</td>
                            <td className="px-3 py-2.5 text-gray-500">{formatKST(u.created_at)}</td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => deleteUser(u.email, u.name)}
                                className="inline-flex items-center gap-1 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 px-2.5 py-1.5 rounded-lg text-xs font-black transition-colors"
                              >
                                <Trash2 size={12} /> 삭제
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredUsers.length === 0 && <tr><td colSpan={13} className="text-center text-gray-400 py-8">데이터 없음</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })()}

          {/* === 예약 / 신청 현황 (파티별 그룹화 + 성별 분리) === */}
          {tab === "bookings" && (() => {
            // 파티별로 그룹화 (status filter 적용)
            const byParty: Record<string, BookingRow[]> = {};
            for (const b of bookings) {
              if (statusFilter !== "all" && b.status !== statusFilter) continue;
              (byParty[b.partyId] = byParty[b.partyId] || []).push(b);
            }
            // 신청자 0명인 파티도 포함 — PARTIES 전체를 calendarDate 오름차순으로 노출
            const orderedPartyIds = [...PARTIES]
              .sort((a, b) => a.calendarDate.localeCompare(b.calendarDate))
              .map(p => p.id);
            return (
              <section>
                <div className="flex items-end justify-between mb-4 md:mb-5 flex-wrap gap-3">
                  <div>
                    <h2 className="text-xl md:text-2xl font-black">예약 / 신청 현황</h2>
                    <p className="text-sm text-gray-500 font-medium mt-1">
                      전체 {bookings.length}건 · 매칭파티 {orderedPartyIds.length}개
                    </p>
                  </div>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium bg-white" aria-label="상태 필터">
                    <option value="all">전체 상태</option>
                    <option value="paid_pending_profile">결제완료(프로필 대기)</option>
                    <option value="pending_approval">확정 대기 중</option>
                    <option value="confirmed">참가 확정 완료</option>
                  </select>
                </div>

                {/* 통계 요약 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-5 md:mb-6">
                  {[
                    { key: "paid_pending_profile", label: "결제완료(프로필 대기)", icon: AlertTriangle },
                    { key: "pending_approval",     label: "확정 대기 중",         icon: Clock },
                    { key: "confirmed",            label: "참가 확정 완료",       icon: CheckCircle2 },
                    { key: "all",                  label: "전체",                  icon: Ticket },
                  ].map(s => {
                    const count = s.key === "all" ? bookings.length : bookings.filter(b => b.status === s.key).length;
                    const Icon = s.icon;
                    return (
                      <div key={s.key} className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-bold mb-1.5"><Icon size={13} /> {s.label}</div>
                        <p className="text-xl md:text-2xl font-black">{count}</p>
                      </div>
                    );
                  })}
                </div>

                {orderedPartyIds.length === 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
                    등록된 매칭파티가 없습니다. [매칭파티] 탭에서 먼저 등록해주세요.
                  </div>
                )}

                <div className="space-y-6 md:space-y-8">
                  {orderedPartyIds.map(pid => {
                    const party = PARTIES.find(p => p.id === pid);
                    const partyRows = byParty[pid] || [];
                    const males   = partyRows.filter(r => r.userGender === "남성");
                    const females = partyRows.filter(r => r.userGender === "여성");
                    // 취소건 제외한 결제 합계
                    const totalRevenue = partyRows
                      .filter(r => r.status !== "cancelled")
                      .reduce((sum, r) => sum + (r.total ?? party?.price ?? 0), 0);
                    return (
                      <div key={pid} className="bg-white rounded-2xl border-2 border-brand-point/20 overflow-hidden">
                        {/* 파티 헤더 */}
                        <div className="bg-gradient-to-r from-brand-point/10 to-white px-5 md:px-7 py-4 md:py-5 border-b border-gray-100">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap min-w-0">
                              <h3 className="text-lg md:text-2xl font-black text-brand-black">{party?.title ?? `파티 #${pid}`}</h3>
                              <span className="text-xs md:text-sm text-gray-500 font-bold">{party?.dateString ?? ""}</span>
                              <span className="text-base md:text-xl font-black text-brand-black">
                                (총 결제 금액: {totalRevenue.toLocaleString()}원)
                              </span>
                            </div>
                            {/* 호스트 (관리자 전용 노출) — 인라인 편집 */}
                            {hostEditingId === pid ? (
                              <div className="inline-flex items-center gap-1 bg-white border border-brand-point rounded-lg px-2 py-1 shadow-sm">
                                <span className="text-[11px] md:text-xs font-bold text-gray-500 whitespace-nowrap">호스트:</span>
                                <input
                                  autoFocus
                                  type="text"
                                  value={hostDraft}
                                  onChange={e => setHostDraft(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") { e.preventDefault(); saveEditHost(); }
                                    if (e.key === "Escape") { e.preventDefault(); cancelEditHost(); }
                                  }}
                                  maxLength={100}
                                  placeholder="이름 입력 (비우면 '없음')"
                                  className="text-xs md:text-sm font-bold outline-none border-none bg-transparent w-32 md:w-40"
                                  aria-label={`파티 #${pid} 호스트 이름 편집`}
                                />
                                <button
                                  type="button"
                                  onClick={saveEditHost}
                                  className="p-1 bg-brand-black text-white hover:bg-brand-point rounded transition-colors"
                                  aria-label="저장"
                                  title="Enter — 저장"
                                >
                                  <Save size={11} />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditHost}
                                  className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors"
                                  aria-label="취소"
                                  title="Esc — 취소"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditHost(pid)}
                                className="inline-flex items-center gap-1 bg-white border border-gray-200 hover:border-brand-point hover:bg-brand-point/5 rounded-lg px-2.5 py-1 text-[11px] md:text-xs font-bold text-gray-700 transition-colors group"
                                title="클릭하여 호스트 이름 편집 (관리자 전용)"
                              >
                                <span className="text-gray-500">호스트:</span>
                                <span className={hostMap[pid] ? "text-brand-black" : "text-gray-400"}>
                                  {hostMap[pid] || "없음"}
                                </span>
                                <Pencil size={10} className="text-gray-300 group-hover:text-brand-point transition-colors" />
                              </button>
                            )}
                          </div>
                          <div className="flex gap-3 md:gap-4 mt-2 text-xs md:text-sm">
                            <span className="font-bold text-[#4facfe]">남성 {males.length}명</span>
                            <span className="font-bold text-rose-500">여성 {females.length}명</span>
                            <span className="font-bold text-gray-500">총 {partyRows.length}명</span>
                          </div>
                        </div>

                        {/* 남성 신청자 */}
                        <BookingTable label="남성 신청자" toneClass="bg-[#4facfe]/10 text-[#3a85d9]" rows={males} party={party} onApprove={approveBooking} onCancel={cancelBooking} />
                        {/* 여성 신청자 */}
                        <BookingTable label="여성 신청자" toneClass="bg-rose-100 text-rose-700"        rows={females} party={party} onApprove={approveBooking} onCancel={cancelBooking} />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          {/* === 매칭파티 관리 === */}
          {tab === "parties" && (
            <section>
              <div className="flex items-end justify-between mb-4 md:mb-5 flex-wrap gap-3">
                <div>
                  <h2 className="text-xl md:text-2xl font-black">매칭파티 관리</h2>
                  <p className="text-sm text-gray-500 font-medium mt-1">전체 {PARTIES.length}건 · 등록/수정/삭제 시 메인페이지·달력 즉시 반영</p>
                </div>
                <button onClick={openPartyCreate}
                  className="inline-flex items-center gap-2 bg-brand-point text-brand-black px-4 py-2.5 rounded-lg text-sm font-black hover:brightness-95 transition-all">
                  <Plus size={14} /> 신규 등록
                </button>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 text-gray-600 font-bold">
                    <tr>
                      {["#","이미지","제목","태그","일시","장소","대상","참가비","정원(남/여)","액션"].map(h => (
                        <th key={h} className="text-left px-3 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PARTIES.map(p => (
                      <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-bold text-gray-400">{p.id}</td>
                        <td className="px-3 py-2.5">
                          {(p as any).imageUrl
                            ? <img src={(p as any).imageUrl} alt="" className="w-12 h-9 object-cover rounded" />
                            : <div className="w-12 h-9 bg-gray-100 rounded flex items-center justify-center text-gray-300"><ImageIcon size={14}/></div>}
                        </td>
                        <td className="px-3 py-2.5 font-bold">{p.title}</td>
                        <td className="px-3 py-2.5"><span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{p.tag}</span></td>
                        <td className="px-3 py-2.5 text-gray-600">{p.dateString}</td>
                        <td className="px-3 py-2.5 text-gray-600">{p.location}</td>
                        <td className="px-3 py-2.5 text-gray-600">{p.target}</td>
                        <td className="px-3 py-2.5 font-black text-brand-point">₩{p.price.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-gray-600">{p.maleStock}명 / {p.femaleStock}명</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1.5">
                            <button onClick={() => openPartyEdit(p.id)} className="bg-brand-black text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-brand-point transition-all">
                              <Pencil size={11} className="inline mr-1"/>수정
                            </button>
                            <button onClick={() => deleteParty(p.id)} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition-all">
                              <Trash2 size={11} className="inline mr-1"/>삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {PARTIES.length === 0 && <tr><td colSpan={10} className="text-center text-gray-400 py-8">등록된 매칭파티 없음</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* CRUD Modal — 헤더/푸터 고정, 내부 스크롤로 상단 잘림 방지
                   외부 클릭으로는 닫히지 않음 (오직 [X]/[취소] 버튼만 onClose 트리거)
                   onInput/onChange 버블링으로 dirty 자동 추적 */}
              {partyEditMode && (
                <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-4">
                  <div
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
                    onInput={() => setPartyFormDirty(true)}
                    onChange={() => setPartyFormDirty(true)}
                  >
                    {/* 고정 헤더 */}
                    <div className="bg-white border-b border-gray-200 px-5 md:px-7 py-4 flex items-center justify-between flex-shrink-0">
                      <h3 className="font-black text-base md:text-lg">{partyEditMode === "create" ? "신규 매칭파티 등록" : `매칭파티 수정 #${partyForm.id}`}</h3>
                      <button onClick={closePartyForm} className="text-gray-400 hover:text-gray-700 p-1 -mr-1" aria-label="닫기"><X size={20}/></button>
                    </div>
                    {/* 스크롤 가능한 본문 */}
                    <div className="flex-1 overflow-y-auto overscroll-contain p-5 md:p-7 space-y-4">
                      {/* 대표 이미지 */}
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">대표 이미지</label>
                        <div className="flex items-start gap-3">
                          <div className="w-28 h-20 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
                            {partyForm.imageUrl
                              ? <img src={partyForm.imageUrl} alt="" className="w-full h-full object-cover"/>
                              : <ImageIcon size={20} className="text-gray-300"/>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <input type="file" accept="image/*" aria-label="대표 이미지"
                              onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); }}
                              className="block w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-black file:text-white file:font-bold file:cursor-pointer hover:file:bg-brand-point"/>
                            <p className="text-xs text-gray-400 mt-1.5">JPG/PNG/WebP, 최대 5MB. 권장 1200×800</p>
                            {uploading && <p className="text-xs text-brand-point mt-1">업로드 중...</p>}
                            {partyForm.imageUrl && (
                              <button onClick={() => setPartyForm(p => ({...p, imageUrl: ""}))}
                                className="text-xs text-red-500 mt-1.5 underline">이미지 제거</button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 제목 */}
                      <FormField label="제목 *" value={partyForm.title} onChange={v => setPartyForm(p => ({...p, title: v}))}/>
                      {/* 내용 */}
                      <FormField label="내용 (소개)" value={partyForm.description} onChange={v => setPartyForm(p => ({...p, description: v}))} textarea/>
                      {/* 일시 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="일시 (표시용 텍스트) *" value={partyForm.dateString} onChange={v => setPartyForm(p => ({...p, dateString: v}))} placeholder="2026. 8. 1 (토) 19:00"/>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1.5">달력 날짜 *</label>
                          <input type="date" value={partyForm.calendarDate} onChange={e => setPartyForm(p => ({...p, calendarDate: e.target.value}))}
                            className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none" aria-label="달력 날짜"/>
                        </div>
                      </div>
                      {/* 장소/대상 */}
                      <FormField label="장소 *" value={partyForm.location} onChange={v => setPartyForm(p => ({...p, location: v}))}/>
                      <FormField label="대상 *" value={partyForm.target} onChange={v => setPartyForm(p => ({...p, target: v}))} placeholder="만 25-35세 / 남녀비율 1:1"/>
                      {/* 참가비 */}
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">참가비 (원) *</label>
                        <input type="number" min={0} value={partyForm.price} onChange={e => setPartyForm(p => ({...p, price: parseInt(e.target.value || "0", 10)}))}
                          className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none" aria-label="참가비"/>
                      </div>
                      {/* 정원 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1.5">남성 정원 *</label>
                          <input type="number" min={0} max={100} value={partyForm.maleStock} onChange={e => setPartyForm(p => ({...p, maleStock: parseInt(e.target.value || "0", 10)}))}
                            className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none" aria-label="남성 정원"/>
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1.5">여성 정원 *</label>
                          <input type="number" min={0} max={100} value={partyForm.femaleStock} onChange={e => setPartyForm(p => ({...p, femaleStock: parseInt(e.target.value || "0", 10)}))}
                            className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none" aria-label="여성 정원"/>
                        </div>
                      </div>

                      {/* 참가 자격 제한 — 신규 섹션 */}
                      <div className="pt-2 mt-1 border-t border-gray-100">
                        <p className="text-sm font-black text-gray-700 mb-3">참가 자격 제한 <span className="text-gray-400 font-medium">· 비워두면 무제한</span></p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">최소 나이 (만)</label>
                            <input
                              type="number" min={0} max={120} placeholder="예: 25"
                              value={partyForm.minAge}
                              onChange={e => setPartyForm(p => ({ ...p, minAge: e.target.value.replace(/\D/g, "") }))}
                              className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none tabular-nums"
                              aria-label="최소 나이"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">최대 나이 (만)</label>
                            <input
                              type="number" min={0} max={120} placeholder="예: 35"
                              value={partyForm.maxAge}
                              onChange={e => setPartyForm(p => ({ ...p, maxAge: e.target.value.replace(/\D/g, "") }))}
                              className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none tabular-nums"
                              aria-label="최대 나이"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">혼인여부</label>
                            <select
                              value={partyForm.allowedMaritalStatus}
                              onChange={e => setPartyForm(p => ({ ...p, allowedMaritalStatus: e.target.value as "all" | "싱글" | "돌싱" }))}
                              className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none"
                              aria-label="혼인여부 제한"
                            >
                              <option value="all">무관 (모두 허용)</option>
                              <option value="싱글">싱글 전용 (돌싱 차단)</option>
                              <option value="돌싱">돌싱 환영 (싱글도 허용)</option>
                            </select>
                          </div>
                        </div>
                        {partyForm.minAge && partyForm.maxAge && parseInt(partyForm.minAge, 10) > parseInt(partyForm.maxAge, 10) && (
                          <p className="text-xs text-red-500 font-medium mt-2 ml-1">최소 나이가 최대 나이보다 큽니다.</p>
                        )}
                      </div>

                      {/* 메인 페이지 카테고리 — 3 셀렉트 */}
                      <div className="pt-2 mt-1 border-t border-gray-100">
                        <p className="text-sm font-black text-gray-700 mb-3">
                          메인 페이지 카테고리 <span className="text-gray-400 font-medium">· 비워두면 해당 필터에서 제외</span>
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">대상별</label>
                            <select
                              value={partyForm.targetGroup}
                              onChange={e => setPartyForm(p => ({ ...p, targetGroup: e.target.value as PartyForm["targetGroup"] }))}
                              className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none"
                              aria-label="대상별 카테고리"
                            >
                              <option value="">미지정</option>
                              <option value="싱글">싱글</option>
                              <option value="돌싱">돌싱</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">테마별</label>
                            <select
                              value={partyForm.theme}
                              onChange={e => setPartyForm(p => ({ ...p, theme: e.target.value as PartyForm["theme"] }))}
                              className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none"
                              aria-label="테마별 카테고리"
                            >
                              <option value="">미지정</option>
                              <option value="티타임">티타임</option>
                              <option value="와인파티">와인파티</option>
                              <option value="사케파티">사케파티</option>
                              <option value="쿠킹클래스">쿠킹클래스</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">지역별</label>
                            <select
                              value={partyForm.locationTag}
                              onChange={e => setPartyForm(p => ({ ...p, locationTag: e.target.value as PartyForm["locationTag"] }))}
                              className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none"
                              aria-label="지역별 카테고리"
                            >
                              <option value="">미지정</option>
                              <option value="서울">서울</option>
                              <option value="성남">성남</option>
                              <option value="수원">수원</option>
                              <option value="인천">인천</option>
                              <option value="용인">용인</option>
                              <option value="기타">기타</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* 고정 푸터 */}
                    <div className="bg-white border-t border-gray-200 px-5 md:px-7 py-4 flex gap-2 justify-end flex-shrink-0">
                      <button onClick={closePartyForm} className="px-4 py-2.5 rounded-lg text-sm font-bold border border-gray-200 hover:bg-gray-50">취소</button>
                      <button onClick={savePartyForm} className="px-5 py-2.5 rounded-lg text-sm font-black bg-brand-black text-white hover:bg-brand-point transition-all">
                        {partyEditMode === "create" ? "등록" : "수정 저장"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* === 쿠폰 관리 (범용 코드 방식) === */}
          {tab === "coupons" && (
            <section>
              <div className="flex items-end justify-between mb-4 md:mb-5 flex-wrap gap-3">
                <div>
                  <h2 className="text-xl md:text-2xl font-black">쿠폰 관리</h2>
                  <p className="text-sm text-gray-500 font-medium mt-1">모든 결제에 사용 가능한 범용 쿠폰 코드 · 정액 할인</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={addCoupon} className="inline-flex items-center gap-1.5 bg-brand-point text-brand-black px-4 py-2.5 rounded-lg text-sm font-black hover:brightness-95 transition-all">
                    <Plus size={14}/> 쿠폰 추가
                  </button>
                  <button onClick={saveCoupons} className="bg-brand-black text-white px-4 py-2.5 rounded-lg text-sm font-black hover:bg-brand-point transition-all">
                    저장
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 text-gray-600 font-bold">
                    <tr>
                      <th className="text-left px-3 md:px-4 py-3">쿠폰 코드</th>
                      <th className="text-left px-3 md:px-4 py-3">할인 금액 (원)</th>
                      <th className="text-left px-3 md:px-4 py-3">만료일</th>
                      <th className="text-left px-3 md:px-4 py-3">사용 상태</th>
                      <th className="text-left px-3 md:px-4 py-3">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.length === 0 && (
                      <tr><td colSpan={5} className="text-center text-gray-400 py-8">등록된 쿠폰이 없습니다. [쿠폰 추가] 버튼으로 등록하세요.</td></tr>
                    )}
                    {coupons.map((c, idx) => (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="px-3 md:px-4 py-3">
                          <input
                            type="text" value={c.code}
                            onChange={e => updateCoupon(idx, { code: e.target.value.toUpperCase() })}
                            placeholder="WELCOME2026"
                            className="w-40 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-black uppercase bg-white"
                          />
                        </td>
                        <td className="px-3 md:px-4 py-3">
                          <input
                            type="number" min={0} step={1000}
                            value={c.amount}
                            onChange={e => updateCoupon(idx, { amount: Math.max(0, parseInt(e.target.value || "0", 10)) })}
                            className="w-28 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-bold bg-white text-right" aria-label="할인 금액"
                          />
                          <span className="ml-1 text-gray-500 text-xs">원</span>
                        </td>
                        <td className="px-3 md:px-4 py-3">
                          <input
                            type="date" value={c.expiresAt}
                            onChange={e => updateCoupon(idx, { expiresAt: e.target.value })}
                            className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-medium bg-white" aria-label="만료일"
                          />
                        </td>
                        <td className="px-3 md:px-4 py-3">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox" checked={c.active}
                              onChange={e => updateCoupon(idx, { active: e.target.checked })}
                              className="w-4 h-4 accent-brand-point cursor-pointer"
                            />
                            <span className={`text-xs font-black ${c.active ? "text-emerald-600" : "text-gray-400"}`}>
                              {c.active ? "활성" : "비활성"}
                            </span>
                          </label>
                        </td>
                        <td className="px-3 md:px-4 py-3">
                          <button onClick={() => removeCoupon(idx)} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition-all">
                            <Trash2 size={11} className="inline mr-1"/>삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                · 쿠폰 코드는 대문자/숫자 조합 권장. 동일 코드 중복 시 자동 병합됩니다.<br/>
                · 만료일이 비어있으면 무기한 사용 가능. 만료일은 해당 날짜 자정까지 유효.<br/>
                · 한 사용자가 동일 쿠폰을 두 번 이상 사용할 수 없습니다.<br/>
                · 변경 후 [저장] 버튼을 눌러야 적용됩니다.
              </p>
            </section>
          )}

          {/* === 기업 정보 === */}
          {tab === "company" && (
            <section className="max-w-2xl">
              <div className="flex items-end justify-between mb-4 md:mb-5">
                <div>
                  <h2 className="text-xl md:text-2xl font-black">기업 정보</h2>
                  <p className="text-sm text-gray-500 font-medium mt-1">푸터에 노출되는 정보</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6 space-y-4">
                {([
                  ["name",    "상호명"],
                  ["ceo",     "대표자명"],
                  ["biz_no",  "사업자등록번호"],
                  ["address", "주소"],
                  ["telecom", "통신판매업신고"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">{label}</label>
                    <input
                      type="text" value={(company as any)[key] ?? ""}
                      onChange={e => setCompany(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point outline-none" aria-label={label}
                    />
                  </div>
                ))}
                <button onClick={saveCompany} className="w-full md:w-auto bg-brand-black text-white px-5 py-3 rounded-lg text-sm font-black hover:bg-brand-point transition-all mt-2">
                  저장
                </button>
                <p className="text-xs text-gray-400 leading-relaxed pt-2">변경 사항은 푸터에 자동 반영됩니다 (페이지 새로고침 후).</p>
              </div>
            </section>
          )}

          {/* === 후기 갤러리 관리 === */}
          {tab === "gallery" && (
            <section>
              <div className="flex items-end justify-between mb-4 md:mb-5 flex-wrap gap-3">
                <div>
                  <h2 className="text-xl md:text-2xl font-black tracking-tight">후기 갤러리 관리</h2>
                  <p className="text-xs md:text-sm text-gray-500 mt-1">
                    메인페이지 후기 섹션에 노출되는 이미지를 관리합니다. 변경 사항은 즉시 메인에 반영됩니다.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 bg-brand-point hover:brightness-110 text-white px-4 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all">
                  <Plus size={16} />
                  {galleryUploading ? "업로드 중..." : "이미지 추가"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={galleryUploading}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) uploadGalleryImage(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              {gallery.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
                  <ImageIcon size={32} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">등록된 갤러리 이미지가 없습니다. 우측 상단 [이미지 추가] 버튼으로 업로드하세요.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-5">
                  {gallery.map((g, idx) => (
                    <div key={g.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden group">
                      <div className="relative aspect-square bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={g.image_path}
                          alt={g.alt_text || `갤러리 #${g.id}`}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                          {idx + 1} / {gallery.length}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteGalleryItem(g.id, g.alt_text)}
                          className="absolute top-2 right-2 w-7 h-7 bg-red-500/90 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="삭제"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="p-2.5 space-y-2">
                        <input
                          type="text"
                          value={g.alt_text}
                          placeholder="alt 설명 (검색·접근성)"
                          maxLength={200}
                          onChange={e => setGallery(prev => prev.map(x => x.id === g.id ? { ...x, alt_text: e.target.value } : x))}
                          onBlur={e => updateGalleryAlt(g.id, e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:border-brand-point focus:outline-none"
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => moveGalleryItem(g.id, -1)}
                            disabled={idx === 0}
                            className="flex-1 px-2 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-300 rounded-md transition-colors"
                            title="앞으로 이동"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveGalleryItem(g.id, 1)}
                            disabled={idx === gallery.length - 1}
                            className="flex-1 px-2 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-300 rounded-md transition-colors"
                            title="뒤로 이동"
                          >
                            ↓
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate" title={g.image_path}>
                          {g.image_path.replace(/^.*\//, "")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* === 로그 관리 === */}
          {tab === "logs" && (
            <section>
              <div className="flex items-end justify-between mb-4 md:mb-5 flex-wrap gap-3">
                <div>
                  <h2 className="text-xl md:text-2xl font-black flex items-center gap-2"><FileText size={20} /> 로그 관리</h2>
                  <p className="text-sm text-gray-500 font-medium mt-1">
                    관리자 활동 이력 — 총 <span className="font-black">{logsTotal.toLocaleString()}</span>건 (최신 {logs.length}건 표시)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadLogs}
                  disabled={logsLoading}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold bg-white hover:border-brand-point hover:text-brand-point disabled:opacity-50"
                >
                  {logsLoading ? "조회 중..." : "새로고침"}
                </button>
              </div>

              {/* 필터 */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-5 mb-4 md:mb-5 grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">시작일</label>
                  <input type="date" value={logFromDate} onChange={e => setLogFromDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none" aria-label="시작일" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">종료일</label>
                  <input type="date" value={logToDate} onChange={e => setLogToDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none" aria-label="종료일" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">관리자 ID</label>
                  <input type="text" placeholder="예: admin" value={logAdminFilter}
                    onChange={e => setLogAdminFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">활동 유형</label>
                  <select value={logActionFilter} onChange={e => setLogActionFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium bg-white" aria-label="활동 유형">
                    <option value="">전체</option>
                    <option value="login">로그인</option>
                    <option value="logout">로그아웃</option>
                    <option value="login_fail">로그인 실패</option>
                    <option value="create">등록</option>
                    <option value="update">수정</option>
                    <option value="delete">삭제</option>
                    <option value="view">조회</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="button"
                    onClick={() => { setLogFromDate(""); setLogToDate(""); setLogAdminFilter(""); setLogActionFilter(""); }}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold bg-white hover:bg-gray-50">
                    초기화
                  </button>
                </div>
              </div>

              {/* 로그 테이블 */}
              <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-xs md:text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 text-gray-600 font-bold">
                    <tr>
                      {["일시","관리자","IP","활동","대상","요약","상세"].map(h => (
                        <th key={h} className="text-left px-3 py-3 first:pl-5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-gray-400 py-10">
                        {logsLoading ? "조회 중..." : "표시할 로그가 없습니다."}
                      </td></tr>
                    )}
                    {logs.map(row => {
                      const isHighlight = row.action === "delete" || row.action === "login_fail";
                      const expanded = logExpanded.has(row.id);
                      const actionMeta: Record<string, { label: string; tone: string }> = {
                        login:      { label: "로그인",      tone: "bg-blue-100 text-blue-800" },
                        logout:     { label: "로그아웃",    tone: "bg-gray-200 text-gray-700" },
                        login_fail: { label: "로그인 실패", tone: "bg-red-100 text-red-700" },
                        create:     { label: "등록",        tone: "bg-emerald-100 text-emerald-800" },
                        update:     { label: "수정",        tone: "bg-amber-100 text-amber-800" },
                        delete:     { label: "삭제",        tone: "bg-red-100 text-red-700" },
                        view:       { label: "조회",        tone: "bg-gray-100 text-gray-600" },
                      };
                      const meta = actionMeta[row.action] ?? { label: row.action, tone: "bg-gray-100 text-gray-600" };
                      return (
                        <Fragment key={row.id}>
                          <tr className={`border-t border-gray-100 ${isHighlight ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-gray-50"}`}>
                            <td className="px-3 py-2.5 first:pl-5 text-gray-600 tabular-nums">{formatKST(row.created_at)}</td>
                            <td className="px-3 py-2.5 font-bold">{row.admin_id || "-"}</td>
                            <td className="px-3 py-2.5 text-gray-500 tabular-nums">{row.ip || "-"}</td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] md:text-xs font-black ${meta.tone}`}>
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-700">
                              {row.target_type ? `${row.target_type}${row.target_id ? ` #${row.target_id}` : ""}` : "-"}
                            </td>
                            <td className={`px-3 py-2.5 max-w-[28rem] whitespace-normal ${isHighlight ? "font-bold text-red-700" : ""}`}>
                              {row.summary || "-"}
                            </td>
                            <td className="px-3 py-2.5">
                              {(row.before_value || row.after_value) ? (
                                <button type="button"
                                  onClick={() => setLogExpanded(prev => {
                                    const next = new Set(prev);
                                    if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                                    return next;
                                  })}
                                  className="text-xs font-bold text-brand-point underline">
                                  {expanded ? "닫기" : "보기"}
                                </button>
                              ) : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="border-t border-gray-100 bg-gray-50/60">
                              <td colSpan={7} className="px-5 py-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <p className="font-black text-gray-500 mb-1">변경 전</p>
                                    <pre className="bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-60 whitespace-pre-wrap break-words text-[11px] text-gray-700">
{row.before_value ? JSON.stringify(row.before_value, null, 2) : "(없음)"}
                                    </pre>
                                  </div>
                                  <div>
                                    <p className="font-black text-gray-500 mb-1">변경 후</p>
                                    <pre className="bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-60 whitespace-pre-wrap break-words text-[11px] text-gray-700">
{row.after_value ? JSON.stringify(row.after_value, null, 2) : "(없음)"}
                                    </pre>
                                  </div>
                                </div>
                                {row.user_agent && (
                                  <p className="text-[11px] text-gray-400 mt-2 truncate">UA: {row.user_agent}</p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                <Search size={11} className="inline mr-1" />
                삭제 / 로그인 실패는 붉은색으로 강조됩니다. 조회 항목은 최대 300건까지, 전체 건수는 헤더에 표시됩니다.
              </p>
            </section>
          )}

          {/* === 업무 메모 (포스트잇) === */}
          {tab === "memos" && (
            <section>
              <div className="flex items-end justify-between mb-4 md:mb-5 flex-wrap gap-3">
                <div>
                  <h2 className="text-xl md:text-2xl font-black tracking-tight">업무 메모</h2>
                  <p className="text-xs md:text-sm text-gray-500 mt-1">
                    모든 관리자 계정이 공유하는 메모판입니다. 클릭하여 수정, 색상 변경, 삭제할 수 있습니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setMemoNewOpen(true); setMemoNewContent(""); setMemoNewColor(MEMO_COLORS[0]); }}
                  className="inline-flex items-center gap-2 bg-brand-point hover:brightness-110 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
                >
                  <Plus size={16} /> 새 메모 추가
                </button>
              </div>

              {/* 새 메모 입력창 (모달 대신 인라인 카드) */}
              {memoNewOpen && (
                <div
                  className="mb-5 p-5 rounded-2xl shadow-xl border border-gray-200 transform -rotate-1"
                  style={{ background: memoNewColor }}
                >
                  <textarea
                    autoFocus
                    aria-label="새 메모 내용"
                    value={memoNewContent}
                    onChange={e => setMemoNewContent(e.target.value)}
                    placeholder="메모 내용을 입력하세요..."
                    rows={4}
                    maxLength={5000}
                    className="w-full bg-transparent border-none outline-none resize-none text-sm md:text-base text-gray-800 font-medium placeholder:text-gray-500 leading-relaxed"
                    style={{ fontFamily: "'Gaegu', 'Pretendard', sans-serif" }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-black/10">
                    <div className="flex gap-1.5">
                      {MEMO_COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setMemoNewColor(c)}
                          className={`w-6 h-6 rounded-full border transition-all ${memoNewColor === c ? "ring-2 ring-offset-2 ring-gray-700 scale-110" : "border-gray-300 hover:scale-110"}`}
                          style={{ background: c }}
                          aria-label={`색상 ${c}`}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setMemoNewOpen(false); setMemoNewContent(""); }}
                        className="px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-black/5 rounded-md transition-colors"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={createMemo}
                        className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-black bg-brand-black text-white hover:bg-brand-point rounded-md transition-colors"
                      >
                        <Save size={12} /> 저장
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 메모 그리드 */}
              {memos.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
                  <StickyNote size={32} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">등록된 메모가 없습니다. 우측 상단 [새 메모 추가] 버튼으로 시작하세요.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
                  {memos.map((m, idx) => {
                    const editing = memoEditingId === m.id;
                    // 자연스러운 포스트잇 느낌 — id 기반 약간의 회전
                    const tilt = ((m.id % 5) - 2) * 0.6; // -1.2 ~ 1.2deg
                    return (
                      <div
                        key={m.id}
                        className={`relative p-4 md:p-5 rounded-md shadow-md hover:shadow-xl transition-all duration-200 group ${editing ? "ring-2 ring-brand-point" : ""}`}
                        style={{
                          background: m.color || "#FEF9C3",
                          transform: editing ? "rotate(0deg) scale(1.02)" : `rotate(${tilt}deg)`,
                          minHeight: 180,
                        }}
                      >
                        {/* 핀 / 코너 효과 */}
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-red-500 shadow-md opacity-70 group-hover:opacity-90" />

                        {editing ? (
                          <textarea
                            autoFocus
                            aria-label={`메모 #${m.id} 수정`}
                            value={memoDraft}
                            onChange={e => setMemoDraft(e.target.value)}
                            rows={6}
                            maxLength={5000}
                            className="w-full bg-transparent border-none outline-none resize-none text-sm md:text-base text-gray-800 font-medium leading-relaxed"
                            style={{ fontFamily: "'Gaegu', 'Pretendard', sans-serif" }}
                          />
                        ) : (
                          <div
                            onClick={() => startEditMemo(m)}
                            className="cursor-text whitespace-pre-wrap break-words text-sm md:text-base text-gray-800 font-medium leading-relaxed pb-10"
                            style={{ fontFamily: "'Gaegu', 'Pretendard', sans-serif", minHeight: 100 }}
                          >
                            {m.content}
                          </div>
                        )}

                        {/* 작성/수정자 + 시각 */}
                        <p className="absolute bottom-12 left-4 text-[10px] text-gray-700/70 font-medium">
                          @{m.author_id || "?"} · {m.updated_at}
                        </p>

                        {/* 하단 액션 영역 */}
                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                          {/* 색상 팔레트 */}
                          <div className="flex gap-1">
                            {MEMO_COLORS.map(c => (
                              <button
                                key={c}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); updateMemoColor(m.id, c); }}
                                className={`w-3.5 h-3.5 rounded-full border transition-all ${m.color === c ? "ring-1 ring-offset-1 ring-gray-700" : "border-gray-400/50 hover:scale-125"}`}
                                style={{ background: c }}
                                aria-label={`색상 ${c}`}
                              />
                            ))}
                          </div>
                          {/* 수정/삭제 */}
                          <div className="flex gap-1">
                            {editing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setMemoEditingId(null); }}
                                  className="p-1.5 hover:bg-black/10 rounded text-gray-700 transition-colors"
                                  aria-label="취소"
                                >
                                  <X size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); saveEditMemo(); }}
                                  className="p-1.5 bg-brand-black text-white hover:bg-brand-point rounded transition-colors"
                                  aria-label="저장"
                                >
                                  <Save size={13} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); startEditMemo(m); }}
                                  className="p-1.5 hover:bg-black/10 rounded text-gray-700 transition-colors opacity-0 group-hover:opacity-100"
                                  aria-label="수정"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); deleteMemo(m.id); }}
                                  className="p-1.5 hover:bg-red-500 hover:text-white rounded text-gray-700 transition-colors opacity-0 group-hover:opacity-100"
                                  aria-label="삭제"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* 첫번째 카드 idx 표시 (디버깅) */}
                        <span className="sr-only">메모 #{m.id} ({idx + 1}/{memos.length})</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

        </motion.div>
      </main>
    </div>
  );
}
