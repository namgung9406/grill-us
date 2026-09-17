import { useCallback, useRef, useState } from "react";
import { Outlet } from "react-router-dom";

import { MobileNavToggle } from "./MobileNavToggle";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const closeNavigation = useCallback(() => {
    setMobileOpen(false);
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  }, []);

  return (
    <div className="min-h-screen bg-[#101419] text-[#f4f7f9]">
      <MobileNavToggle
        ref={toggleRef}
        expanded={mobileOpen}
        onToggle={() => setMobileOpen((current) => !current)}
      />
      {mobileOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          onClick={closeNavigation}
        />
      )}
      <Sidebar mobileOpen={mobileOpen} onClose={closeNavigation} />
      <main inert={mobileOpen || undefined} className="min-h-screen px-5 pb-10 pt-24 lg:ml-60 lg:px-10 lg:pt-10">
        <Outlet />
      </main>
    </div>
  );
}