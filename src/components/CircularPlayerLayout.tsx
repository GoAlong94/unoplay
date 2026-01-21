import { RotateCw, RotateCcw, Crown } from "lucide-react";

interface Player {
  id: string;
  user_id: string;
  cards: string[];
  position: number;
  has_said_uno: boolean;
  profiles: {
    username: string;
  };
}

interface CircularPlayerLayoutProps {
  players: Player[];
  currentUserId: string;
  currentTurnUserId: string;
  direction: number;
  hostId?: string;
}

export const CircularPlayerLayout = ({
  players,
  currentUserId,
  currentTurnUserId,
  direction,
  hostId,
}: CircularPlayerLayoutProps) => {
  // Reorder players so current user is at bottom
  const currentUserIndex = players.findIndex((p) => p.user_id === currentUserId);
  const reorderedPlayers = [
    ...players.slice(currentUserIndex + 1),
    ...players.slice(0, currentUserIndex),
  ];

  const otherPlayers = reorderedPlayers.filter((p) => p.user_id !== currentUserId);
  const playerCount = otherPlayers.length;

  // Calculate positions around a semi-circle (top half)
  const getPosition = (index: number, total: number) => {
    // Spread players from left to right at the top
    const angle = Math.PI - (Math.PI * (index + 1)) / (total + 1);
    const radius = 42; // percentage
    const x = 50 + radius * Math.cos(angle);
    const y = 45 - radius * Math.sin(angle) * 0.6; // Flatten the arc
    return { x, y };
  };

  return (
    <div className="relative w-full h-64 md:h-80">
      {/* Direction indicator in center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
        <div className="p-3 rounded-full bg-primary/20 border border-primary">
          {direction === 1 ? (
            <RotateCw className="w-8 h-8 text-primary animate-[spin_3s_linear_infinite]" />
          ) : (
            <RotateCcw className="w-8 h-8 text-primary animate-[spin_3s_linear_infinite_reverse]" />
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {direction === 1 ? "Clockwise" : "Counter-clockwise"}
        </span>
      </div>

      {/* Players around the circle */}
      {otherPlayers.map((player, index) => {
        const pos = getPosition(index, playerCount);
        const isCurrentTurn = player.user_id === currentTurnUserId;
        const isHost = player.user_id === hostId;

        return (
          <div
            key={player.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
            }}
          >
            <div
              className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                isCurrentTurn
                  ? "border-primary bg-primary/20 shadow-lg shadow-primary/30 scale-110"
                  : "border-border bg-card/80 backdrop-blur-sm"
              }`}
            >
              {/* Turn indicator arrow */}
              {isCurrentTurn && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                  <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[12px] border-l-transparent border-r-transparent border-t-primary animate-bounce" />
                </div>
              )}

              {/* Host crown */}
              {isHost && (
                <Crown className="absolute -top-3 -right-3 w-5 h-5 text-yellow-500" />
              )}

              {/* Player avatar/initial */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                  isCurrentTurn
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {player.profiles.username.charAt(0).toUpperCase()}
              </div>

              {/* Username */}
              <span className="mt-1 text-sm font-medium truncate max-w-[80px]">
                {player.profiles.username}
              </span>

              {/* Card count */}
              <div className="flex items-center gap-1 mt-1">
                <span className="text-lg font-bold text-primary">
                  {player.cards.length}
                </span>
                <span className="text-xs text-muted-foreground">cards</span>
              </div>

              {/* UNO indicator */}
              {player.has_said_uno && player.cards.length === 1 && (
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs font-bold bg-yellow-500 text-black rounded-full">
                  UNO!
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Current user indicator at bottom */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 ${
            currentTurnUserId === currentUserId
              ? "border-primary bg-primary/20 animate-pulse"
              : "border-border bg-card"
          }`}
        >
          {currentTurnUserId === currentUserId && (
            <span className="text-primary font-bold">Your Turn!</span>
          )}
          {currentTurnUserId !== currentUserId && (
            <span className="text-muted-foreground">Waiting...</span>
          )}
        </div>
      </div>
    </div>
  );
};
