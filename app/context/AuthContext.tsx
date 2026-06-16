"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { clearOnboardingSnooze } from "../lib/onboardingSnooze";

export type CartItem = { partyId: string; quantity: number };

export type AppliedCoupon = {
  code: string;
  partyId: string;
  amount: number;                              // type=amount 면 KRW, type=percent 면 % (1~100)
  discount_type?: "amount" | "percent";        // 기본 "amount" (legacy 호환)
  max_discount?: number;                       // type=percent 의 차감 한도 (KRW), 0 = 무제한
};

/** 행 단위 (수량 반영된 lineTotal) 에서 쿠폰 할인 금액 계산 — 백엔드 calcCouponDiscount 와 동일 로직 */
export function calcCouponDiscount(coupon: AppliedCoupon, lineTotal: number): number {
  if (lineTotal <= 0) return 0;
  if (coupon.discount_type === "percent") {
    let d = Math.floor(lineTotal * coupon.amount / 100);
    const cap = coupon.max_discount ?? 0;
    if (cap > 0) d = Math.min(d, cap);
    return Math.min(d, lineTotal);
  }
  return Math.min(coupon.amount, lineTotal);
}

export type Profile = {
  name: string;
  gender: string;
  phone: string;
  location: string;
  job: string;
  mbti: string;
  birthDate: string;       // ISO 'YYYY-MM-DD'
  interests: string;
  idealType: string;
  maritalStatus?: string;  // '싱글' | '돌싱' (onboarding 완료자만 채워짐)
};

export type BookingStatus = "vbank_pending" | "paid_pending_profile" | "pending_approval" | "confirmed" | "completed" | "cancel_requested" | "refund_completed" | "cancelled";

export type Booking = {
  id: string;
  partyId: string;
  status: BookingStatus;
  paymentId?: string | null;
  paymentMethod?: string | null; // 'vbank' = 무통장 입금 (v7.0). 미설정/그 외 = 카드/간편결제
  total?: number;
  createdAt: string;
  updatedAt: string;
};

export function isProfileComplete(p: Profile | null): boolean {
  if (!p) return false;
  return !!(p.name?.trim() && p.gender?.trim() && p.job?.trim() && p.mbti?.trim());
}

/**
 * 신규 가입자의 필수 회원정보 5종 입력 완료 여부.
 *  - 이름 / 성별 / 연락처 / 생년월일 / 혼인여부
 * 이 5종은 /onboarding 에서 한 번만 입력하고 이후 read-only.
 */
export function isCoreProfileComplete(p: Profile | null): boolean {
  if (!p) return false;
  const ms = (p.maritalStatus ?? "").trim();
  return !!(
    p.name?.trim() &&
    (p.gender === "남성" || p.gender === "여성") &&
    p.phone?.trim() &&
    p.birthDate?.trim() &&
    (ms === "싱글" || ms === "돌싱")
  );
}

const CART_API         = "/api/cart.php";
const PROFILE_API      = "/api/profile.php";
const BOOKINGS_API     = "/api/bookings.php";
const PARTY_COUNTS_API = "/api/party-counts.php";
const AUTH_ME_API      = "/api/auth/me.php";
const AUTH_LOGOUT_API  = "/api/auth/logout.php";

type SessionInfo = { email: string; role: "user" | "admin"; name?: string };

async function fetchSessionInfo(): Promise<SessionInfo | null> {
  try {
    const res = await fetch(AUTH_ME_API, { cache: "no-store", credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok || !data?.email) return null;
    const role: "user" | "admin" = data.role === "admin" ? "admin" : "user";
    return { email: String(data.email), role, name: typeof data.name === "string" ? data.name : "" };
  } catch { return null; }
}

// 하위 호환 alias — 기존 호출자
async function fetchSessionEmail(): Promise<string | null> {
  const info = await fetchSessionInfo();
  return info?.email ?? null;
}

export type PartyCount = { male: number; female: number };
export type PartyCounts = Record<string, PartyCount>;

async function fetchPartyCounts(): Promise<PartyCounts | null> {
  try {
    const res = await fetch(PARTY_COUNTS_API, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === "object" ? data : null;
  } catch { return null; }
}

async function fetchServerBookings(email: string): Promise<Booking[] | null> {
  try {
    const res = await fetch(`${BOOKINGS_API}?email=${encodeURIComponent(email)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

/** 로컬 캐시 키 — 사용자 단위 분리 (회원 전환 시 다른 사용자 데이터 노출 방지) */
function bookingsCacheKey(email: string): string {
  return `woollim_bookings:${email.toLowerCase().trim()}`;
}
function readBookingsCache(email: string): Booking[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(bookingsCacheKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
function writeBookingsCache(email: string, bookings: Booking[]): void {
  try { localStorage.setItem(bookingsCacheKey(email), JSON.stringify(bookings)); } catch {}
}
async function postBookings(email: string, payload: Record<string, unknown>): Promise<Booking[] | null> {
  try {
    const res = await fetch(BOOKINGS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ...payload }),
    });
    const data = await res.json();
    return data?.bookings ?? null;
  } catch { return null; }
}

/** 레거시 cart 항목(quantity 누락) 보정 — 항상 quantity 정수 보장 */
function normalizeCart(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(item => item && typeof item === "object" && typeof (item as any).partyId === "string")
    .map(item => {
      const i = item as any;
      const qRaw = Number(i.quantity);
      const q = Number.isFinite(qRaw) && qRaw >= 1 ? Math.floor(qRaw) : 1;
      return { partyId: String(i.partyId), quantity: q };
    });
}

async function fetchServerCart(email: string): Promise<CartItem[] | null> {
  try {
    const res = await fetch(`${CART_API}?email=${encodeURIComponent(email)}`, {
      cache: "no-store", // Prevent stale data on mobile Safari/Chrome
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? normalizeCart(data) : null;
  } catch { return null; }
}
async function saveServerCart(email: string, cart: CartItem[]): Promise<void> {
  try {
    await fetch(CART_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, cart }),
    });
  } catch {}
}

async function fetchServerProfile(email: string): Promise<Profile | null> {
  try {
    const res = await fetch(`${PROFILE_API}?email=${encodeURIComponent(email)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === "object" && data.name ? (data as Profile) : null;
  } catch { return null; }
}
async function saveServerProfile(email: string, profile: Profile): Promise<void> {
  try {
    await fetch(PROFILE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, profile }),
    });
  } catch {}
}

type AuthContextType = {
  mounted: boolean;
  isLoggedIn: boolean;
  userEmail: string | null;
  userRole: "user" | "admin" | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  cart: CartItem[];
  addToCart: (partyId: string) => void;
  removeFromCart: (partyId: string) => void;
  setItemQuantity: (partyId: string, quantity: number) => void;
  refreshCart: () => Promise<void>;
  profile: Profile | null;
  updateProfile: (profile: Profile) => Promise<void>;
  refreshProfile: () => Promise<void>;
  deleteAccount: () => Promise<boolean>;
  bookings: Booking[];
  createBookings: (partyIds: string[], paymentId?: string, total?: number, couponCode?: string, couponPartyId?: string) => Promise<{ ok: boolean; error?: string; soldOutPartyIds?: string[]; finalTotal?: number; discount?: number }>;
  refreshBookings: () => Promise<void>;
  partyCounts: PartyCounts;
  refreshPartyCounts: () => Promise<void>;
  appliedCoupon: AppliedCoupon | null;
  applyCoupon: (partyId: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  clearCoupon: () => void;
};

const AuthContext = createContext<AuthContextType>({
  mounted: false,
  isLoggedIn: false,
  userEmail: null,
  userRole: null,
  login: async () => false,
  logout: () => {},
  cart: [],
  addToCart: () => {},
  removeFromCart: () => {},
  setItemQuantity: () => {},
  refreshCart: async () => {},
  profile: null,
  updateProfile: async () => {},
  refreshProfile: async () => {},
  deleteAccount: async () => false,
  bookings: [],
  createBookings: async () => ({ ok: false }),
  refreshBookings: async () => {},
  partyCounts: {},
  refreshPartyCounts: async () => {},
  appliedCoupon: null,
  applyCoupon: async () => ({ ok: false }),
  clearCoupon: () => {},
});

const ADMIN_EMAIL    = "pletora@naver.com";
const ADMIN_PASSWORD = "wjdekf*0010";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mounted,    setMounted]    = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail,  setUserEmail]  = useState<string | null>(null);
  const [userRole,   setUserRole]   = useState<"user" | "admin" | null>(null);
  const [cart,       setCart]       = useState<CartItem[]>([]);
  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [bookings,   setBookings]   = useState<Booking[]>([]);
  const [partyCounts, setPartyCounts] = useState<PartyCounts>({});
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);

  // profile 최신값을 동기적으로 참조하기 위한 ref
  const profileRef = useRef<Profile | null>(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const userEmailRef = useRef<string | null>(null);
  useEffect(() => { userEmailRef.current = userEmail; }, [userEmail]);

  // cartRef mirrors cart state synchronously. Required because React's
  // setCart(updater) runs the updater async during reconciliation, so we
  // cannot read the new value from within the same function scope.
  const cartRef = useRef<CartItem[]>([]);
  const setCartSync = useCallback((next: CartItem[]) => {
    cartRef.current = next;
    setCart(next);
  }, []);

  // Counter of in-flight cart saves. refreshCart skips while >0 so a
  // background refetch can't overwrite a just-made local mutation with
  // pre-save server state.
  const pendingSavesRef = useRef(0);

  const refreshCart = useCallback(async () => {
    if (pendingSavesRef.current > 0) return;
    if (userEmailRef.current) {
      const serverCart = await fetchServerCart(userEmailRef.current);
      if (serverCart !== null) {
        setCartSync(serverCart);
        localStorage.setItem("woollim_cart", JSON.stringify(serverCart));
      }
    }
  }, [setCartSync]);

  // 쿠폰 hydrate (localStorage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("woollim_coupon");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.code === "string" && typeof parsed.amount === "number" && typeof parsed.partyId === "string") {
          setAppliedCoupon(parsed);
        }
      }
    } catch {}
  }, []);

  // 적용된 쿠폰의 대상 파티가 장바구니에서 빠지면 자동 해제
  useEffect(() => {
    if (!appliedCoupon) return;
    if (!cart.some(c => c.partyId === appliedCoupon.partyId)) {
      setAppliedCoupon(null);
      try { localStorage.removeItem("woollim_coupon"); } catch {}
    }
  }, [cart, appliedCoupon]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      try {
        // OAuth 세션 우선 확인 (HTTP-only 쿠키 기반)
        const sessionInfo = await fetchSessionInfo();
        const sessionEmail = sessionInfo?.email ?? null;
        if (sessionEmail) {
          setIsLoggedIn(true);
          setUserEmail(sessionEmail);
          setUserRole(sessionInfo?.role ?? "user");
          userEmailRef.current = sessionEmail;
          localStorage.setItem("woollim_auth", JSON.stringify({ loggedIn: true, email: sessionEmail }));

          // ── 즉시 hydration: localStorage 캐시 → 페이지가 열리는 순간 데이터 노출 (체감 SSR)
          const cachedBookings = readBookingsCache(sessionEmail);
          if (cachedBookings) setBookings(cachedBookings);

          // ⚠️ profile 즉시 hydration — OnboardingGuard / 마이페이지 등이
          //    mounted=true 직후 profile===null 을 "incomplete" 로 오판하여
          //    /onboarding → / 로 잘못 튕기는 race 차단
          try {
            const localProfileRaw = localStorage.getItem("woollim_profile");
            if (localProfileRaw) {
              const cachedProfile: Profile = JSON.parse(localProfileRaw);
              if (cachedProfile && typeof cachedProfile === "object") {
                setProfile(cachedProfile);
              }
            }
          } catch {}

          // mounted = true 를 가능한 빨리 → 첫 페인트 차단 해제
          setMounted(true);

          // ── 서버 데이터 동기화 (백그라운드, 변경분 있을 때만 setState)
          const [serverCart, serverProfile, serverBookings] = await Promise.all([
            fetchServerCart(sessionEmail),
            fetchServerProfile(sessionEmail),
            fetchServerBookings(sessionEmail),
          ]);
          if (serverCart !== null) setCartSync(serverCart);
          if (serverProfile) {
            setProfile(serverProfile);
            // localStorage 동기화 — 다음 새로고침 즉시 hydration 가능
            try { localStorage.setItem("woollim_profile", JSON.stringify(serverProfile)); } catch {}
          }
          if (serverBookings !== null) {
            setBookings(serverBookings);
            writeBookingsCache(sessionEmail, serverBookings);
          }
          const counts = await fetchPartyCounts();
          if (counts) setPartyCounts(counts);
          return;
        }

        const auth = localStorage.getItem("woollim_auth");
        if (auth) {
          const parsed = JSON.parse(auth);
          if (parsed.loggedIn && parsed.email) {
            setIsLoggedIn(true);
            setUserEmail(parsed.email);
            userEmailRef.current = parsed.email;

            // ⚠️ profile localStorage 즉시 hydration — 동일 race 차단 (cookie-session 경로 주석 참조)
            try {
              const localProfileRaw = localStorage.getItem("woollim_profile");
              if (localProfileRaw) {
                const cachedProfile: Profile = JSON.parse(localProfileRaw);
                if (cachedProfile && typeof cachedProfile === "object") {
                  setProfile(cachedProfile);
                }
              }
            } catch {}

            // Cart sync — server is authoritative. If server returns a valid
            // array (even empty), trust it. Only fall back to local on network error.
            // Skip overwrite if user already mutated cart during this init.
            const serverCart = await fetchServerCart(parsed.email);
            if (pendingSavesRef.current === 0 && cartRef.current.length === 0) {
              if (serverCart !== null) {
                setCartSync(serverCart);
                localStorage.setItem("woollim_cart", JSON.stringify(serverCart));
              } else {
                const localRaw = localStorage.getItem("woollim_cart");
                if (localRaw) setCartSync(normalizeCart(JSON.parse(localRaw)));
              }
            }

            // Profile sync
            const serverProfile = await fetchServerProfile(parsed.email);
            if (serverProfile) {
              setProfile(serverProfile);
              localStorage.setItem("woollim_profile", JSON.stringify(serverProfile));
            } else {
              const localRaw = localStorage.getItem("woollim_profile");
              if (localRaw) {
                const localProfile: Profile = JSON.parse(localRaw);
                setProfile(localProfile);
                await saveServerProfile(parsed.email, localProfile);
              }
            }

            // Bookings: 캐시 즉시 hydration → 빠른 첫 페인트, 서버 응답으로 동기화
            const cachedBookings = readBookingsCache(parsed.email);
            if (cachedBookings) setBookings(cachedBookings);
            const serverBookings = await fetchServerBookings(parsed.email);
            if (serverBookings !== null) {
              setBookings(serverBookings);
              writeBookingsCache(parsed.email, serverBookings);
            }
          }
        } else {
          const cartData = localStorage.getItem("woollim_cart");
          if (cartData) setCartSync(normalizeCart(JSON.parse(cartData)));
        }
      } catch {}

      // 모든 사용자(로그인 여부 무관)에게 실시간 카운트 노출
      const counts = await fetchPartyCounts();
      if (counts) setPartyCounts(counts);

      setMounted(true);
    };
    init();
  }, []);

  // 실시간 동기화: 로그인 무관, 메인/상세 모두 적용
  useEffect(() => {
    if (!mounted) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchPartyCounts().then(d => { if (d) setPartyCounts(d); });
      }
    };
    const refresh = () => fetchPartyCounts().then(d => { if (d) setPartyCounts(d); });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [mounted]);

  // Real-time synchronization: refetch cart + bookings on focus / visibility / periodic
  useEffect(() => {
    if (isLoggedIn && mounted) {
      const refreshAll = () => {
        refreshCart();
        if (userEmailRef.current) {
          const email = userEmailRef.current;
          fetchServerBookings(email).then(b => {
            if (b !== null) {
              setBookings(b);
              writeBookingsCache(email, b);
            }
          });
        }
      };
      const onVisibility = () => {
        if (document.visibilityState === "visible") refreshAll();
      };
      window.addEventListener("focus", refreshAll);
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pageshow", refreshAll);
      const interval = setInterval(refreshAll, 15000); // 15s — 관리자 확정 즉시 반영용

      return () => {
        window.removeEventListener("focus", refreshAll);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pageshow", refreshAll);
        clearInterval(interval);
      };
    }
  }, [isLoggedIn, mounted, refreshCart]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    // DB 기반 일반 회원 인증 — /api/auth/login.php 가 role='user' AND status='active' 만 통과시킴
    // 관리자는 본 엔드포인트로 인증 불가 (role='admin' 거부) — 별도 /admin8888/ 사용
    let serverOk = false;
    try {
      const res = await fetch("/api/auth/login.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      serverOk = !!data?.ok;
    } catch {
      serverOk = false;
    }

    // 백업 — 하드코딩 admin (다음 turn 에서 제거 예정, DB 마이그레이션 후 안전망 역할)
    const adminFallback = email === ADMIN_EMAIL && password === ADMIN_PASSWORD;

    if (!serverOk && !adminFallback) return false;

    setIsLoggedIn(true);
    setUserEmail(email);
    setUserRole(serverOk ? "user" : "admin");
    userEmailRef.current = email;
    localStorage.setItem("woollim_auth", JSON.stringify({ loggedIn: true, email }));

    // Cart sync — server is authoritative
    const serverCart = await fetchServerCart(email);
    if (serverCart !== null) {
      setCartSync(serverCart);
      localStorage.setItem("woollim_cart", JSON.stringify(serverCart));
    } else {
      const localRaw = localStorage.getItem("woollim_cart");
      if (localRaw) setCartSync(JSON.parse(localRaw));
    }

    // Profile sync
    const serverProfile = await fetchServerProfile(email);
    if (serverProfile) {
      setProfile(serverProfile);
      localStorage.setItem("woollim_profile", JSON.stringify(serverProfile));
    } else {
      const localRaw = localStorage.getItem("woollim_profile");
      if (localRaw) {
        const localProfile: Profile = JSON.parse(localRaw);
        setProfile(localProfile);
        await saveServerProfile(email, localProfile);
      }
    }

    // Bookings 즉시 hydration
    const serverBookings = await fetchServerBookings(email);
    if (serverBookings !== null) {
      setBookings(serverBookings);
      writeBookingsCache(email, serverBookings);
    }
    return true;
  }, []);

  const logout = useCallback(() => {
    const prevEmail = userEmailRef.current;
    // 1) 로컬 세션/캐시 즉시 정리 (서버 응답 기다리지 않음)
    setIsLoggedIn(false);
    setUserEmail(null);
    setUserRole(null);
    setCartSync([]);
    setProfile(null);
    setBookings([]);
    setAppliedCoupon(null);
    userEmailRef.current = null;
    try {
      localStorage.removeItem("woollim_auth");
      localStorage.removeItem("woollim_cart");
      localStorage.removeItem("woollim_profile");
      localStorage.removeItem("woollim_coupon");
      if (prevEmail) localStorage.removeItem(bookingsCacheKey(prevEmail));
    } catch {}
    clearOnboardingSnooze();
    // 2) 서버 세션 쿠키 파기 (fire-and-forget — 응답 대기 X)
    fetch(AUTH_LOGOUT_API, { method: "POST", credentials: "include", keepalive: true }).catch(() => {});
    // 3) 메인으로 풀 페이지 리로드 → React 상태/가드/로딩 인디케이터 모두 초기화
    //    (router.push는 SPA navigation이라 mypage useEffect의 !isLoggedIn 분기와 race 발생 가능 →
    //     로그인 페이지로 redirect되거나 무한 로딩 인디케이터가 남는 문제 차단)
    if (typeof window !== "undefined") {
      window.location.replace("/");
    }
  }, [setCartSync]);

  const persistCart = useCallback(async (next: CartItem[]) => {
    setCartSync(next);
    localStorage.setItem("woollim_cart", JSON.stringify(next));
    if (userEmailRef.current) {
      pendingSavesRef.current++;
      try { await saveServerCart(userEmailRef.current, next); }
      finally { pendingSavesRef.current--; }
    }
  }, [setCartSync]);

  // 동일 partyId 가 이미 있으면 no-op — 중복 추가 차단, quantity 항상 1.
  // (수량 개념 제거 — 한 사용자는 같은 파티에 1회만 신청)
  const addToCart = useCallback(async (partyId: string) => {
    if (cartRef.current.some(i => i.partyId === partyId)) return;
    const updated = [...cartRef.current, { partyId, quantity: 1 }];
    await persistCart(updated);
  }, [persistCart]);

  const removeFromCart = useCallback(async (partyId: string) => {
    const updated = cartRef.current.filter(i => i.partyId !== partyId);
    await persistCart(updated);
  }, [persistCart]);

  /** 수량 직접 설정 — 0 이하이면 항목 삭제 */
  const setItemQuantity = useCallback(async (partyId: string, quantity: number) => {
    const q = Math.floor(Number(quantity) || 0);
    if (q <= 0) {
      const updated = cartRef.current.filter(i => i.partyId !== partyId);
      await persistCart(updated);
      return;
    }
    const updated = cartRef.current.map(i => i.partyId === partyId ? { ...i, quantity: q } : i);
    await persistCart(updated);
  }, [persistCart]);

  const updateProfile = useCallback(async (p: Profile) => {
    setProfile(p);
    localStorage.setItem("woollim_profile", JSON.stringify(p));
    if (userEmailRef.current) {
      await saveServerProfile(userEmailRef.current, p);
      // 프로필이 완전해지면 paid_pending_profile → pending_approval로 자동 전환
      if (isProfileComplete(p)) {
        const updated = await postBookings(userEmailRef.current, { action: "advance" });
        if (updated) {
          setBookings(updated);
          writeBookingsCache(userEmailRef.current, updated);
        }
      }
    }
  }, []);

  const refreshBookings = useCallback(async () => {
    if (!userEmailRef.current) return;
    const data = await fetchServerBookings(userEmailRef.current);
    if (data !== null) {
      setBookings(data);
      writeBookingsCache(userEmailRef.current, data);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!userEmailRef.current) return;
    const fresh = await fetchServerProfile(userEmailRef.current);
    if (fresh) {
      setProfile(fresh);
      localStorage.setItem("woollim_profile", JSON.stringify(fresh));
    }
  }, []);

  const createBookings = useCallback(async (partyIds: string[], paymentId?: string, total?: number, couponCode?: string, couponPartyId?: string) => {
    if (!userEmailRef.current || partyIds.length === 0) {
      return { ok: false, error: "예약 정보가 없습니다." };
    }
    const gender = profileRef.current?.gender;
    if (!gender) {
      return { ok: false, error: "프로필 정보(성별)가 필요합니다." };
    }
    try {
      const res = await fetch(BOOKINGS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmailRef.current,
          action: "create",
          partyIds,
          paymentId: paymentId ?? null,
          total: total ?? 0,
          gender,
          couponCode: couponCode ?? "",
          couponPartyId: couponPartyId ?? "",
        }),
      });
      const data = await res.json();
      if (!data?.ok) {
        return { ok: false, error: data?.error || "예약 처리 실패", soldOutPartyIds: data?.soldOutPartyIds };
      }
      if (Array.isArray(data.bookings)) setBookings(data.bookings);
      if (data.counts && typeof data.counts === "object") setPartyCounts(data.counts);
      return { ok: true, finalTotal: data.finalTotal, discount: data.discount };
    } catch {
      return { ok: false, error: "네트워크 오류" };
    }
  }, []);

  const refreshPartyCounts = useCallback(async () => {
    const data = await fetchPartyCounts();
    if (data) setPartyCounts(data);
  }, []);

  const applyCoupon = useCallback(async (partyId: string, code: string): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return { ok: false, error: "쿠폰 코드를 입력해주세요." };
    if (!userEmailRef.current) return { ok: false, error: "로그인이 필요합니다." };
    try {
      const res = await fetch("/api/coupons-validate.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, email: userEmailRef.current }),
      });
      const d = await res.json();
      if (d?.ok && d?.coupon) {
        const c = d.coupon;
        const next: AppliedCoupon = {
          code:          c.code,
          partyId,
          amount:        Number(c.amount) || 0,
          discount_type: c.discount_type === "percent" ? "percent" : "amount",
          max_discount:  Number(c.max_discount) || 0,
        };
        setAppliedCoupon(next);
        try { localStorage.setItem("woollim_coupon", JSON.stringify(next)); } catch {}
        return { ok: true };
      }
      return { ok: false, error: d?.error || "쿠폰 적용에 실패했습니다." };
    } catch {
      return { ok: false, error: "네트워크 오류" };
    }
  }, []);

  const clearCoupon = useCallback(() => {
    setAppliedCoupon(null);
    try { localStorage.removeItem("woollim_coupon"); } catch {}
  }, []);

  const deleteAccount = useCallback(async (): Promise<boolean> => {
    const email = userEmailRef.current;
    if (!email) return false;
    try {
      const res = await fetch("/api/delete-account.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!data.ok) return false;
    } catch {
      return false;
    }
    // Clear all local session + SNS markers
    setIsLoggedIn(false);
    setUserEmail(null);
    setCartSync([]);
    setProfile(null);
    setAppliedCoupon(null);
    userEmailRef.current = null;
    try {
      localStorage.removeItem("woollim_auth");
      localStorage.removeItem("woollim_cart");
      localStorage.removeItem("woollim_profile");
      localStorage.removeItem("woollim_pending_profile");
      localStorage.removeItem("woollim_sns_provider");
      localStorage.removeItem("woollim_coupon");
    } catch {}
    clearOnboardingSnooze();
    return true;
  }, [setCartSync]);

  return (
    <AuthContext.Provider value={{
      mounted, isLoggedIn, userEmail, userRole,
      login, logout,
      cart, addToCart, removeFromCart, setItemQuantity, refreshCart,
      profile, updateProfile, refreshProfile,
      deleteAccount,
      bookings, createBookings, refreshBookings,
      partyCounts, refreshPartyCounts,
      appliedCoupon, applyCoupon, clearCoupon,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
