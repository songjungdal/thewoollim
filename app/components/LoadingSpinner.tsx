"use client";

import { useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function LoadingSpinner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    // Start loading state on path/search change
    setIsLoading(true);
    setShouldShow(false);

    // Initial check: if already loaded, we might not need this
    // But in Next.js App Router, this is called when the route transition begins
    
    const delayTimer = setTimeout(() => {
      // If still loading after 800ms, show the spinner
      if (isLoading) {
        setShouldShow(true);
      }
    }, 800); // 0.8s delay as requested

    // This is a simplified way to detect transition completion in App Router.
    // In a real app with data fetching, you might use a more complex signal.
    // For now, we simulate completion after a short mount time or when pathname stabilizes.
    const finishTimer = setTimeout(() => {
      setIsLoading(false);
      setShouldShow(false);
    }, 100);

    return () => {
      clearTimeout(delayTimer);
      clearTimeout(finishTimer);
    };
  }, [pathname, searchParams]);

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/70 backdrop-blur-sm"
        >
          <div className="relative">
            <div className="w-16 h-16 border-4 border-gray-100 rounded-full"></div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="absolute top-0 left-0 w-16 h-16 border-4 border-brand-point border-t-transparent rounded-full"
            ></motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
