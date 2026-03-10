import { motion } from "framer-motion";
import { UnoCard } from "./UnoCard";

interface AnimatedCardProps {
  card: string;
  onClick?: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  index?: number;
  total?: number;
  isPlayable?: boolean;
}

export const AnimatedCard = ({
  card,
  onClick,
  disabled,
  size = "sm",
  selected,
  index = 0,
  total = 1,
  isPlayable = false,
}: AnimatedCardProps) => {
  // Fan-out angle for hand cards
  const maxAngle = Math.min(total * 3, 30);
  const angle = total > 1 ? -maxAngle / 2 + (index / (total - 1)) * maxAngle : 0;
  const yOffset = Math.abs(angle) * 0.5;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 30, scale: 0.8 }}
      animate={{
        opacity: 1,
        y: isPlayable ? -4 : yOffset,
        scale: 1,
        rotate: angle,
      }}
      exit={{ opacity: 0, y: -50, scale: 0.5 }}
      whileHover={isPlayable ? { y: -16, scale: 1.1, zIndex: 50 } : {}}
      whileTap={isPlayable ? { scale: 0.95 } : {}}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      style={{ transformOrigin: "bottom center", zIndex: index }}
    >
      <UnoCard card={card} onClick={onClick} disabled={disabled} size={size} selected={selected} />
    </motion.div>
  );
};

// Animated discard pile card
export const AnimatedDiscardCard = ({ card }: { card: string }) => (
  <motion.div
    key={card + Math.random()}
    initial={{ scale: 0.3, opacity: 0, rotate: -20 }}
    animate={{ scale: 1, opacity: 1, rotate: 0 }}
    transition={{ type: "spring", stiffness: 400, damping: 20 }}
  >
    <UnoCard card={card} size="md" />
  </motion.div>
);

// Draw pile animation
export const AnimatedDrawPile = ({ onClick, disabled, deckSize }: { onClick: () => void; disabled: boolean; deckSize: number }) => (
  <motion.button
    onClick={onClick}
    disabled={disabled}
    whileHover={!disabled ? { scale: 1.08 } : {}}
    whileTap={!disabled ? { scale: 0.95 } : {}}
    className="w-16 h-24 md:w-20 md:h-28 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-600 hover:border-primary transition-colors shadow-lg flex flex-col items-center justify-center disabled:opacity-50"
  >
    <div className="text-2xl">🎴</div>
    <div className="text-xs font-bold text-primary">{deckSize}</div>
  </motion.button>
);
