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
  idealType: string;
};

const CART_API    = "/api/cart.php";
const PROFILE_API = "/api/profile.php";

async function fetchServerCart(email: string): Promise<CartItem[]> {
  try {
    const res = await fetch(`${CART_API}?email=${encodeURIComponent(email)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
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

            // Cart sync
            const serverCart = await fetchServerCart(parsed.email);
            if (serverCart.length > 0) {
              setCart(serverCart);
              localStorage.setItem("woollim_cart", JSON.stringify(serverCart));
            } else {
              const localRaw = localStorage.getItem("woollim_cart");
              if (localRaw) {
                const localCart: CartItem[] = JSON.parse(localRaw);
                setCart(localCart);
                if (localCart.length > 0) await saveServerCart(parsed.email, localCart);
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
          if (cartData) setCart(JSON.parse(cartData));
        }
      } catch {}
      setMounted(true);
    };
    init();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setUserEmail(email);
      userEmailRef.current = email;
      localStorage.setItem("woollim_auth", JSON.stringify({ loggedIn: true, email }));

      // Cart sync
      const serverCart = await fetchServerCart(email);
      if (serverCart.length > 0) {
        setCart(serverCart);
        localStorage.setItem("woollim_cart", JSON.stringify(serverCart));
      } else {
        const localRaw = localStorage.getItem("woollim_cart");
        if (localRaw) {
          const localCart: CartItem[] = JSON.parse(localRaw);
          if (localCart.length > 0) {
            setCart(localCart);
            await saveServerCart(email, localCart);
          }
        }
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
    setCart([]);
    setProfile(null);
    userEmailRef.current = null;
    localStorage.removeItem("woollim_auth");
    localStorage.removeItem("woollim_cart");
    localStorage.removeItem("woollim_profile");
  }, []);

  const addToCart = useCallback((partyId: string) => {
    setCart(prev => {
      if (prev.some(i => i.partyId === partyId)) return prev;
      const updated = [...prev, { partyId }];
      localStorage.setItem("woollim_cart", JSON.stringify(updated));
      if (userEmailRef.current) saveServerCart(userEmailRef.current, updated);
      return updated;
    });
  }, []);

  const removeFromCart = useCallback((partyId: string) => {
    setCart(prev => {
      const updated = prev.filter(i => i.partyId !== partyId);
      localStorage.setItem("woollim_cart", JSON.stringify(updated));
      if (userEmailRef.current) saveServerCart(userEmailRef.current, updated);
      return updated;
    });
  }, []);

  const updateProfile = useCallback(async (p: Profile) => {
    setProfile(p);
    localStorage.setItem("woollim_profile", JSON.stringify(p));
    if (userEmailRef.current) await saveServerProfile(userEmailRef.current, p);
  }, []);

  return (
    <AuthContext.Provider value={{
      mounted, isLoggedIn, userEmail,
      login, logout,
      cart, addToCart, removeFromCart,
      profile, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
