import { Gamepad2, Home, LockKeyhole, LogIn, LogOut } from "lucide-react";
import { useEffect } from "react";
import { NavLink } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-12 items-center gap-3 border-l-4 px-4 font-mono text-sm font-bold transition-colors ${
    isActive
      ? "border-[#48d7e8] bg-[#26313b] text-white"
      : "border-transparent text-[#aab8c2] hover:bg-[#202931] hover:text-white"
  }`;

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { login, logout, status, user } = useAuth();

  useEffect(() => {
    if (!mobileOpen) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mobileOpen, onClose]);

  const isAuthenticated = status === "authenticated";

  return (
    <aside
      id="primary-sidebar"
      aria-label="주 메뉴"
      aria-modal={mobileOpen || undefined}
      className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[#344452] bg-[#151b21] pt-20 transition-transform lg:translate-x-0 lg:pt-6 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="px-5 pb-8">
        <p className="font-mono text-xs font-bold text-[#ffbd45]">GRILL US</p>
        <p className="mt-1 font-mono text-xl font-black text-white">PIXEL ARCADE</p>
      </div>

      <nav className="grid gap-1 px-2">
        <NavLink to="/" end className={linkClass} onClick={onClose}>
          <Home aria-hidden="true" size={19} />
          홈
        </NavLink>
        {isAuthenticated ? (
          <NavLink to="/games" className={linkClass} onClick={onClose}>
            <Gamepad2 aria-hidden="true" size={19} />
            게임
          </NavLink>
        ) : (
          <button
            type="button"
            aria-label="게임 - 로그인 필요"
            onClick={() => {
              onClose();
              void login("/games");
            }}
            className="flex min-h-12 items-center gap-3 border-l-4 border-transparent px-4 text-left font-mono text-sm font-bold text-[#7f909c] hover:bg-[#202931]"
          >
            <LockKeyhole aria-hidden="true" size={19} />
            게임
          </button>
        )}
      </nav>

      <div className="mt-auto border-t border-[#344452] p-4">
        {user !== null && (
          <div className="mb-4 min-w-0">
            <p className="truncate text-sm font-bold text-white">{user.displayName}</p>
            {user.email !== null && <p className="truncate text-xs text-[#aab8c2]">{user.email}</p>}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (isAuthenticated) {
              void logout();
            } else {
              void login();
            }
          }}
          className="flex min-h-11 w-full items-center justify-center gap-2 border border-[#344452] bg-[#202931] px-3 font-mono text-xs font-bold text-white hover:border-[#48d7e8]"
        >
          {isAuthenticated ? <LogOut aria-hidden="true" size={17} /> : <LogIn aria-hidden="true" size={17} />}
          {isAuthenticated ? "로그아웃" : "로그인"}
        </button>
      </div>
    </aside>
  );
}