import { Menu, X } from "lucide-react";
import { forwardRef } from "react";

interface MobileNavToggleProps {
  expanded: boolean;
  onToggle: () => void;
}

export const MobileNavToggle = forwardRef<HTMLButtonElement, MobileNavToggleProps>(
  function MobileNavToggle({ expanded, onToggle }, ref) {
    const Icon = expanded ? X : Menu;

    return (
      <button
        ref={ref}
        type="button"
        aria-label={expanded ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={expanded}
        aria-controls="primary-sidebar"
        onClick={onToggle}
        className="fixed left-4 top-4 z-50 grid size-12 place-items-center border border-[#344452] bg-[#151b21] text-[#f4f7f9] shadow-[4px_4px_0_#48d7e8] lg:hidden"
      >
        <Icon aria-hidden="true" size={22} />
      </button>
    );
  },
);