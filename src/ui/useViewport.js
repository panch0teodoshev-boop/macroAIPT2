import { useEffect, useState } from "react";

// breakpoints: mobile < 768, tablet 768–1023, desktop >= 1024
export function useViewport() {
  const get = () => (typeof window === "undefined" ? 1200 : window.innerWidth);
  const [w, setW] = useState(get);
  useEffect(() => {
    const on = () => setW(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return { width: w, isMobile: w < 768, isTablet: w >= 768 && w < 1024, isDesktop: w >= 1024 };
}
