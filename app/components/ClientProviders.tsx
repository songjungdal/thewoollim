"use client";

import { AuthProvider } from "../context/AuthContext";
import OnboardingGuard from "./OnboardingGuard";
import { ReactNode } from "react";

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <OnboardingGuard />
      {children}
    </AuthProvider>
  );
}
