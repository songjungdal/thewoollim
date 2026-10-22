"use client";

import { AuthProvider } from "../context/AuthContext";
import OnboardingGuard from "./OnboardingGuard";
import NavigationTracker from "./NavigationTracker";
import { ReactNode } from "react";

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <NavigationTracker />
      <OnboardingGuard />
      {children}
    </AuthProvider>
  );
}
