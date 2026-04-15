"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

export type CartItem = { partyId: string };

type AuthContextType = {
  mounted: boolean;
  isLoggedIn: boolean;
  userEmail: string | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  cart: CartItem[];
  addToCart: (partyId: string) => void;
  removeFromCart: (partyId: string) => void;
};

const AuthContext = createContext<AuthContextType>({
  mounted: false,
  isLoggedIn: false,
  userEmail: null,
  login: () => false,
  logout: () => {},
  cart: [],
  addToCart: () => {},
  removeFromCart: () => {},
});

const ADMIN_EMAIL = "pletora@naver.com";
const ADMIN_PASSWORD = "wjdekf*0010";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const auth = localStorage.getItem("woollim_auth");
      if (auth) {
        const parsed = JSON.parse(auth);
        if (parsed.loggedIn) {
          setIsLoggedIn(true);
          setUserEmail(parsed.email);
        }
      }
      const cartData = localStorage.getItem("woollim_cart");
      if (cartData) setCart(JSON.parse(cartData));
    } catch {}
    setMounted(true);
  }, []);

  const login = useCallback((email: string, password: string): boolean => {
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setUserEmail(email);
      localStorage.setItem("woollim_auth", JSON.stringify({ loggedIn: true, email }));
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setIsLoggedIn(false);
    setUserEmail(null);
    localStorage.removeItem("woollim_auth");
  }, []);

  const addToCart = useCallback((partyId: string) => {
    setCart(prev => {
      if (prev.some(i => i.partyId === partyId)) return prev;
      const updated = [...prev, { partyId }];
      localStorage.setItem("woollim_cart", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeFromCart = useCallback((partyId: string) => {
    setCart(prev => {
      const updated = prev.filter(i => i.partyId !== partyId);
      localStorage.setItem("woollim_cart", JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ mounted, isLoggedIn, userEmail, login, logout, cart, addToCart, removeFromCart }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
