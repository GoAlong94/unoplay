import { getCardDisplay } from "@/lib/unoGame";
import { cn } from "@/lib/utils";

interface UnoCardProps {
  card: string;
  onClick?: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
}

export const UnoCard = ({ card, onClick, disabled, size = "md", selected }: UnoCardProps) => {
  const { display, bgClass } = getCardDisplay(card);
  
  const sizeClasses = {
    sm: "w-16 h-24 text-lg",
    md: "w-20 h-28 text-2xl",
    lg: "w-24 h-36 text-3xl",
  };
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg font-bold text-white shadow-lg transition-all flex items-center justify-center border-4 border-white/20",
        sizeClasses[size],
        bgClass,
        onClick && !disabled && "hover:scale-110 hover:shadow-xl cursor-pointer active:scale-95",
        disabled && "opacity-50 cursor-not-allowed",
        selected && "ring-4 ring-accent scale-105"
      )}
    >
      {display}
    </button>
  );
};
