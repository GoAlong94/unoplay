import { RotateCw, RotateCcw, Crown, Bot, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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

interface TablePlayerLayoutProps {
  players: Player[];
  currentUserId: string;
  currentTurnUserId: string;
  direction: number;
  hostId?: string;
  autoPlayEnabled?: boolean;
}

export const TablePlayerLayout = ({
  players,
  currentUserId,
  currentTurnUserId,
  direction,
  hostId,
  autoPlayEnabled = false,
}: TablePlayerLayoutProps) => {
  // Reorder players so current user is at bottom
  const currentUserIndex = players.findIndex((p) => p.user_id === currentUserId);
  const reorderedPlayers = [
    ...players.slice(currentUserIndex + 1),
    ...players.slice(0, currentUserIndex),
  ];

  const otherPlayers = reorderedPlayers.filter((p) => p.user_id !== currentUserId);
  const currentUserData = players.find((p) => p.user_id === currentUserId);

  // Position players around a virtual table
  const getPlayerPosition = (index: number, total: number) => {
    // For 1-3 other players, position them at top-left, top-center, top-right
    if (total === 1) return { position: "top", x: 50 };
    if (total === 2) return { position: "top", x: index === 0 ? 25 : 75 };
    if (total === 3) {
      if (index === 0) return { position: "left", x: 10 };
      if (index === 1) return { position: "top", x: 50 };
      return { position: "right", x: 90 };
    }
    // For 4+ players, distribute around the table
    const positions = ["left", "top", "top", "right"];
    const xPositions = [10, 35, 65, 90];
    return { position: positions[index] || "top", x: xPositions[index] || 50 };
  };

  const PlayerCard = ({ player, isCurrentTurn, isHost, isCurrentUser = false }: {
    player: Player;
    isCurrentTurn: boolean;
    isHost: boolean;
    isCurrentUser?: boolean;
  }) => (
    <div
      className={`relative flex flex-col items-center transition-all duration-300 ${
        isCurrentTurn ? "scale-110" : ""
      }`}
    >
      {/* Turn indicator arrow */}
      {isCurrentTurn && !isCurrentUser && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-10">
          <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[14px] border-l-transparent border-r-transparent border-t-primary animate-bounce" />
        </div>
      )}

      {/* Player seat/chair visual */}
      <div
        className={`relative p-1 rounded-2xl transition-all ${
          isCurrentTurn
            ? "bg-gradient-to-br from-primary/40 to-primary/20 shadow-lg shadow-primary/40"
            : "bg-gradient-to-br from-card/80 to-muted/40"
        }`}
      >
        <div
          className={`relative flex flex-col items-center p-4 rounded-xl border-2 backdrop-blur-sm ${
            isCurrentTurn
              ? "border-primary bg-card/90"
              : "border-border/50 bg-card/70"
          }`}
        >
          {/* Host crown */}
          {isHost && (
            <Crown className="absolute -top-3 -right-3 w-6 h-6 text-yellow-500 drop-shadow-lg" />
          )}

          {/* Auto-play indicator */}
          {isCurrentUser && autoPlayEnabled && (
            <div className="absolute -top-2 -left-2 p-1 rounded-full bg-primary">
              <Bot className="w-3 h-3 text-primary-foreground" />
            </div>
          )}

          {/* Player avatar */}
          <Avatar className={`w-14 h-14 border-3 ${
            isCurrentTurn
              ? "border-primary ring-2 ring-primary/50"
              : "border-muted"
          }`}>
            <AvatarFallback className={`text-xl font-bold ${
              isCurrentTurn
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}>
              {player.profiles.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Username badge */}
          <div className={`mt-2 px-3 py-1 rounded-full text-sm font-semibold truncate max-w-[100px] ${
            isCurrentTurn
              ? "bg-primary/20 text-primary"
              : "bg-muted/50 text-foreground"
          }`}>
            {player.profiles.username}
          </div>

          {/* Cards indicator - looks like stacked cards */}
          <div className="relative mt-2 flex items-center justify-center">
            <div className="flex -space-x-3">
              {[...Array(Math.min(player.cards.length, 5))].map((_, i) => (
                <div
                  key={i}
                  className="w-6 h-8 rounded bg-gradient-to-br from-gray-700 to-gray-900 border border-gray-600 shadow-sm"
                  style={{ transform: `rotate(${(i - 2) * 8}deg)` }}
                />
              ))}
            </div>
            <span className="absolute -bottom-1 -right-1 px-2 py-0.5 text-xs font-bold bg-primary text-primary-foreground rounded-full shadow">
              {player.cards.length}
            </span>
          </div>

          {/* UNO indicator */}
          {player.has_said_uno && player.cards.length === 1 && (
            <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-black bg-gradient-to-r from-red-500 to-yellow-500 text-white rounded-full shadow-lg animate-pulse">
              UNO!
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative w-full">
      {/* Table surface */}
      <div className="relative mx-auto w-full max-w-4xl">
        {/* The green felt table */}
        <div className="relative bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 rounded-[40px] border-8 border-amber-900 shadow-2xl overflow-hidden">
          {/* Wood grain border effect */}
          <div className="absolute inset-0 rounded-[32px] border-4 border-amber-800/30" />
          
          {/* Table felt pattern */}
          <div className="absolute inset-0 opacity-20" 
            style={{
              backgroundImage: `radial-gradient(circle at 50% 50%, transparent 0%, rgba(0,0,0,0.3) 100%)`
            }}
          />

          <div className="relative p-6 md:p-10 min-h-[280px] md:min-h-[340px]">
            {/* Other players around the table */}
            <div className="absolute inset-0 flex items-start justify-center pt-4 md:pt-6">
              <div className="flex items-start justify-center gap-4 md:gap-8 flex-wrap">
                {otherPlayers.map((player) => {
                  const isCurrentTurn = player.user_id === currentTurnUserId;
                  const isHost = player.user_id === hostId;

                  return (
                    <PlayerCard
                      key={player.id}
                      player={player}
                      isCurrentTurn={isCurrentTurn}
                      isHost={isHost}
                    />
                  );
                })}
              </div>
            </div>

            {/* Direction indicator in center */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
              <div className="p-4 rounded-full bg-black/30 border-2 border-white/20 backdrop-blur-sm">
                {direction === 1 ? (
                  <RotateCw className="w-10 h-10 text-white animate-[spin_3s_linear_infinite]" />
                ) : (
                  <RotateCcw className="w-10 h-10 text-white animate-[spin_3s_linear_infinite_reverse]" />
                )}
              </div>
              <span className="text-sm font-medium text-white/80 bg-black/30 px-3 py-1 rounded-full">
                {direction === 1 ? "Clockwise" : "Counter-clockwise"}
              </span>
            </div>
          </div>
        </div>

        {/* Current user at bottom */}
        {currentUserData && (
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-20">
            <div className={`flex flex-col items-center ${
              currentTurnUserId === currentUserId
                ? "animate-pulse"
                : ""
            }`}>
              <div className={`px-6 py-2 rounded-full font-bold text-lg shadow-lg ${
                currentTurnUserId === currentUserId
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-foreground border border-border"
              }`}>
                {currentTurnUserId === currentUserId ? (
                  <span className="flex items-center gap-2">
                    {autoPlayEnabled && <Bot className="w-4 h-4" />}
                    Your Turn!
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Waiting...
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

