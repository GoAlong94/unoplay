import { Timer, Clock } from "lucide-react";

interface GameTimersProps {
  turnTimeLeft: number;
  turnTimeTotal: number;
  gameTimeLeft: number;
  isMyTurn: boolean;
}

export const GameTimers = ({
  turnTimeLeft,
  turnTimeTotal,
  gameTimeLeft,
  isMyTurn,
}: GameTimersProps) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const turnProgress = turnTimeTotal > 0 ? (turnTimeLeft / turnTimeTotal) * 100 : 100;
  const isLowTime = turnTimeLeft <= 10;

  return (
    <div className="flex items-center gap-4">
      {/* Turn Timer */}
      <div 
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
          isMyTurn 
            ? isLowTime 
              ? "border-red-500 bg-red-500/10 animate-pulse" 
              : "border-primary bg-primary/10"
            : "border-border bg-card"
        }`}
      >
        <Timer className={`w-4 h-4 ${isMyTurn && isLowTime ? "text-red-500" : "text-primary"}`} />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Turn</span>
          <span className={`font-mono font-bold ${isMyTurn && isLowTime ? "text-red-500" : "text-foreground"}`}>
            {formatTime(turnTimeLeft)}
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-1000 ${
              isLowTime ? "bg-red-500" : "bg-primary"
            }`}
            style={{ width: `${turnProgress}%` }}
          />
        </div>
      </div>

      {/* Game Timer */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Game</span>
          <span className="font-mono font-bold text-foreground">
            {formatTime(gameTimeLeft)}
          </span>
        </div>
      </div>
    </div>
  );
};
