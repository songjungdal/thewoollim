"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";

export type CartItem = { partyId: string };

export type Profile = {
  name: string;
  gender: string;
  phone: string;
  location: string;
  job: string;
  mbti: string;
  interests: string;
  idealType: string;
};

const CART_API    = "/api/cart.php";
const PROFILE_API = "/api/profile.php";

async function fetchServerCart(email: string): Promise<CartItem[] | null> {
  try {
    const res = await fetch(`${CART_API}?email=${encodeURIComponent(email)}`, {
      cache: "no-store", // Prevent stale data on mobile Safari/Chrome
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
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
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  cart: CartItem[];
  addToCart: (partyId: string) => void;
  removeFromCart: (partyId: string) => void;
  refreshCart: () => Promise<void>;
  profile: Profile | null;
  updateProfile: (profile: Profile) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  mounted: false,
  isLoggedIn: false,
  userEmail: null,
  login: async () => false,
  logout: () => {},
  cart: [],
  addToCart: () => {},
  removeFromCart: () => {},
  refreshCart: async () => {},
  profile: null,
  updateProfile: async () => {},
});

const ADMIN_EMAIL    = "pletora@naver.com";
const ADMIN_PASSWORD = "wjdekf*0010";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mounted,    setMounted]    = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail,  setUserEmail]  = useState<string | null>(null);
  const [cart,       setCart]       = useState<CartItem[]>([]);
  const [profile,    setProfile]    = useState<Profile | null>(null);

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

  // Initial load
  useEffect(() => {
    const init = async () => {
      try {
        const auth = localStorage.getItem("woollim_auth");
        if (auth) {
          const parsed = JSON.parse(auth);
          if (parsed.loggedIn && parsed.email) {
            setIsLoggedIn(true);
            setUserEmail(parsed.email);
            userEmailRef.current = parsed.email;

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
                if (localRaw) setCartSync(JSON.parse(localRaw));
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
          }
        } else {
          const cartData = localStorage.getItem("woollim_cart");
          if (cartData) setCartSync(JSON.parse(cartData));
        }
      } catch {}
      setMounted(true);
    };
    init();
  }, []);

  // Real-time synchronization: refetch on focus / visibility / periodic
  useEffect(() => {
    if (isLoggedIn && mounted) {
      const onVisibility = () => {
        if (document.visibilityState === "visible") refreshCart();
      };
      window.addEventListener("focus", refreshCart);
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pageshow", refreshCart);
      const interval = setInterval(refreshCart, 15000); // 15s

      return () => {
        window.removeEventListener("focus", refreshCart);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pageshow", refreshCart);
        clearInterval(interval);
      };
    }
  }, [isLoggedIn, mounted, refreshCart]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setUserEmail(email);
      userEmailRef.current = email;
      localStorage.setItem("woollim_auth", JSON.stringify({ loggedIn: true, email }));

      // Cart sync — server is authoritative. Trust its response fully (even empty).
      const serverCart = await fetchServerCart(email);
      if (serverCart !== null) {
        setCartSync(serverCart);
        localStorage.setItem("woollim_cart", JSON.stringify(serverCart));
      } else {
        // Network error — fall back to local cache
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
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setIsLoggedIn(false);
    setUserEmail(null);
    setCartSync([]);
    setProfile(null);
    userEmailRef.current = null;
    localStorage.removeItem("woollim_auth");
    localStorage.removeItem("woollim_cart");
    localStorage.removeItem("woollim_profile");
  }, [setCartSync]);

  const addToCart = useCallback(async (partyId: string) => {
    if (cartRef.current.some(i => i.partyId === partyId)) return;

    const updated = [...cartRef.current, { partyId }];
    setCartSync(updated);
    localStorage.setItem("woollim_cart", JSON.stringify(updated));

    if (userEmailRef.current) {
      pendingSavesRef.current++;
      try {
        await saveServerCart(userEmailRef.current, updated);
      } finally {
        pendingSavesRef.current--;
      }
    }
  }, [setCartSync]);

  const removeFromCart = useCallback(async (partyId: string) => {
    const updated = cartRef.current.filter(i => i.partyId !== partyId);
    setCartSync(updated);
    localStorage.setItem("woollim_cart", JSON.stringify(updated));

    if (userEmailRef.current) {
      pendingSavesRef.current++;
      try {
        await saveServerCart(userEmailRef.current, updated);
      } finally {
        pendingSavesRef.current--;
      }
    }
  }, [setCartSync]);

  const updateProfile = useCallback(async (p: Profile) => {
    setProfile(p);
    localStorage.setItem("woollim_profile", JSON.stringify(p));
    if (userEmailRef.current) await saveServerProfile(userEmailRef.current, p);
  }, []);

  return (
    <AuthContext.Provider value={{
      mounted, isLoggedIn, userEmail,
      login, logout,
      cart, addToCart, removeFromCart, refreshCart,
      profile, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
