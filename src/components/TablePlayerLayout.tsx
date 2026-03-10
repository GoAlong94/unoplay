import { RotateCw, RotateCcw, Crown, Bot, User, Wifi, WifiOff } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getCardBackGradient } from "./CosmeticsDialog";

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
  onlinePlayerIds?: string[];
  isSpectator?: boolean;
}

export const TablePlayerLayout = ({
  players,
  currentUserId,
  currentTurnUserId,
  direction,
  hostId,
  autoPlayEnabled = false,
  onlinePlayerIds = [],
  isSpectator = false,
}: TablePlayerLayoutProps) => {
  const currentUserIndex = players.findIndex((p) => p.user_id === currentUserId);
  const reorderedPlayers = isSpectator
    ? players
    : [
        ...players.slice(currentUserIndex + 1),
        ...players.slice(0, currentUserIndex),
      ];

  const otherPlayers = reorderedPlayers.filter((p) => p.user_id !== currentUserId);
  const currentUserData = isSpectator ? null : players.find((p) => p.user_id === currentUserId);
  const cardBackGradient = getCardBackGradient();

  const PlayerCard = ({
    player,
    isCurrentTurn,
    isHost,
    isCurrentUser = false,
  }: {
    player: Player;
    isCurrentTurn: boolean;
    isHost: boolean;
    isCurrentUser?: boolean;
  }) => {
    const isOnline = onlinePlayerIds.includes(player.user_id);
    return (
      <div
        className={`relative flex flex-col items-center transition-all duration-300 ${
          isCurrentTurn ? "scale-110" : ""
        }`}
      >
        {isCurrentTurn && !isCurrentUser && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-10">
            <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[14px] border-l-transparent border-r-transparent border-t-primary animate-bounce" />
          </div>
        )}

        <div
          className={`relative p-1 rounded-2xl transition-all ${
            isCurrentTurn
              ? "bg-gradient-to-br from-primary/40 to-primary/20 shadow-lg shadow-primary/40"
              : "bg-gradient-to-br from-card/80 to-muted/40"
          }`}
        >
          <div
            className={`relative flex flex-col items-center p-3 rounded-xl border-2 backdrop-blur-sm ${
              isCurrentTurn
                ? "border-primary bg-card/90"
                : "border-border/50 bg-card/70"
            }`}
          >
            {isHost && (
              <Crown className="absolute -top-3 -right-3 w-5 h-5 text-yellow-500 drop-shadow-lg" />
            )}

            {/* Connection indicator */}
            <div className="absolute -top-1 -left-1">
              {isOnline ? (
                <div className="w-3 h-3 rounded-full bg-accent border border-background" title="Online" />
              ) : (
                <div className="w-3 h-3 rounded-full bg-destructive border border-background animate-pulse" title="Offline" />
              )}
            </div>

            {isCurrentUser && autoPlayEnabled && (
              <div className="absolute -top-2 -left-2 p-1 rounded-full bg-primary">
                <Bot className="w-3 h-3 text-primary-foreground" />
              </div>
            )}

            <Avatar
              className={`w-10 h-10 md:w-12 md:h-12 border-2 ${
                isCurrentTurn
                  ? "border-primary ring-2 ring-primary/50"
                  : isOnline
                  ? "border-muted"
                  : "border-destructive/50 opacity-60"
              }`}
            >
              <AvatarFallback
                className={`text-lg font-bold ${
                  isCurrentTurn
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {player.profiles.username.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div
              className={`mt-1 px-2 py-0.5 rounded-full text-xs font-semibold truncate max-w-[80px] ${
                isCurrentTurn
                  ? "bg-primary/20 text-primary"
                  : "bg-muted/50 text-foreground"
              }`}
            >
              {player.profiles.username}
            </div>

            <div className="relative mt-1 flex items-center justify-center">
              <div className="flex -space-x-2">
                {[...Array(Math.min(player.cards.length, 4))].map((_, i) => (
                  <div
                    key={i}
                    className={`w-5 h-7 rounded bg-gradient-to-br ${cardBackGradient} border border-white/20 shadow-sm`}
                    style={{ transform: `rotate(${(i - 1.5) * 8}deg)` }}
                  />
                ))}
              </div>
              <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 text-[10px] font-bold bg-primary text-primary-foreground rounded-full shadow">
                {player.cards.length}
              </span>
            </div>

            {player.has_said_uno && player.cards.length === 1 && (
              <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-black bg-gradient-to-r from-red-500 to-yellow-500 text-white rounded-full shadow-lg animate-pulse">
                UNO!
              </span>
            )}

            {!isOnline && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/40 rounded-xl">
                <WifiOff className="w-4 h-4 text-destructive" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full">
      <div className="relative mx-auto w-full max-w-4xl">
        <div className="relative bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 rounded-[30px] border-[6px] border-amber-900 shadow-2xl overflow-hidden">
          <div className="absolute inset-0 rounded-[24px] border-4 border-amber-800/30" />
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `radial-gradient(circle at 50% 50%, transparent 0%, rgba(0,0,0,0.3) 100%)`,
            }}
          />

          <div className="relative p-4 md:p-8 min-h-[200px] md:min-h-[280px]">
            <div className="absolute inset-0 flex items-start justify-center pt-3 md:pt-5">
              <div className="flex items-start justify-center gap-3 md:gap-6 flex-wrap">
                {otherPlayers.map((player) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    isCurrentTurn={player.user_id === currentTurnUserId}
                    isHost={player.user_id === hostId}
                  />
                ))}
              </div>
            </div>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
              <div className="p-3 rounded-full bg-black/30 border-2 border-white/20 backdrop-blur-sm">
                {direction === 1 ? (
                  <RotateCw className="w-8 h-8 text-white animate-[spin_3s_linear_infinite]" />
                ) : (
                  <RotateCcw className="w-8 h-8 text-white animate-[spin_3s_linear_infinite_reverse]" />
                )}
              </div>
              <span className="text-xs font-medium text-white/80 bg-black/30 px-2 py-0.5 rounded-full">
                {direction === 1 ? "CW" : "CCW"}
              </span>
            </div>
          </div>
        </div>

        {currentUserData && (
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-20">
            <div
              className={`px-4 py-1.5 rounded-full font-bold text-sm shadow-lg ${
                currentTurnUserId === currentUserId
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-foreground border border-border"
              }`}
            >
              {currentTurnUserId === currentUserId ? (
                <span className="flex items-center gap-1">
                  {autoPlayEnabled && <Bot className="w-3 h-3" />}
                  Your Turn!
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  Waiting...
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
