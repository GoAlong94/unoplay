import { Trophy, Medal, Clock, ArrowLeft, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Player {
  id: string;
  user_id: string;
  cards: string[];
  position: number;
  has_said_uno: boolean;
  profiles: { username: string };
}

interface GameRankingScreenProps {
  players: Player[];
  winnerId?: string | null;
  gameEndReason: "winner" | "timeout";
  autoRestartCountdown: number;
  onBackToLobby: () => void;
  loading: boolean;
  roundScore?: number | null;
}

export const GameRankingScreen = ({
  players, winnerId, gameEndReason, autoRestartCountdown, onBackToLobby, loading, roundScore,
}: GameRankingScreenProps) => {
  const rankedPlayers = [...players].sort((a, b) => {
    if (a.user_id === winnerId) return -1;
    if (b.user_id === winnerId) return 1;
    return a.cards.length - b.cards.length;
  });

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-8 h-8 text-yellow-500" />;
    if (index === 1) return <Medal className="w-7 h-7 text-gray-400" />;
    if (index === 2) return <Medal className="w-6 h-6 text-amber-600" />;
    return <span className="w-6 h-6 flex items-center justify-center text-lg font-bold text-muted-foreground">{index + 1}</span>;
  };

  const getRankBg = (index: number) => {
    if (index === 0) return "bg-gradient-to-r from-yellow-500/20 via-yellow-400/10 to-yellow-500/20 border-yellow-500/50";
    if (index === 1) return "bg-gradient-to-r from-gray-400/20 via-gray-300/10 to-gray-400/20 border-gray-400/50";
    if (index === 2) return "bg-gradient-to-r from-amber-600/20 via-amber-500/10 to-amber-600/20 border-amber-600/50";
    return "bg-card/50 border-border";
  };

  return (
    <div className="min-h-screen p-6 flex items-center justify-center">
      <Card className="gradient-card border-border shadow-glow max-w-lg w-full">
        <CardHeader className="text-center pb-2">
          {gameEndReason === "timeout" ? (
            <>
              <div className="text-5xl mb-2">⏱️</div>
              <CardTitle className="text-2xl md:text-3xl">Time's Up!</CardTitle>
              <p className="text-muted-foreground mt-2">Rankings based on cards remaining</p>
            </>
          ) : (
            <>
              <div className="text-5xl mb-2">🏆</div>
              <CardTitle className="text-2xl md:text-3xl">Game Over!</CardTitle>
              {roundScore != null && roundScore > 0 && (
                <p className="text-primary font-bold mt-1">Round Score: +{roundScore} pts</p>
              )}
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            {rankedPlayers.map((player, index) => (
              <div key={player.id} className={`flex items-center gap-4 p-3 rounded-xl border-2 transition-all ${getRankBg(index)}`}>
                <div className="flex-shrink-0">{getRankIcon(index)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                      index === 0 ? "bg-yellow-500 text-yellow-950" : "bg-muted text-muted-foreground"
                    }`}>
                      {player.profiles.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate ${index === 0 ? "text-yellow-500" : "text-foreground"}`}>
                        {player.profiles.username}
                        {player.user_id === winnerId && gameEndReason === "winner" && <span className="ml-2 text-sm">🎉 Winner!</span>}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className={`text-lg font-bold ${
                    player.cards.length === 0 ? "text-accent" : player.cards.length <= 2 ? "text-yellow-500" : "text-muted-foreground"
                  }`}>{player.cards.length}</span>
                  <span className="text-xs text-muted-foreground ml-1">cards</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 text-muted-foreground py-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Returning to lobby in <strong className="text-primary">{autoRestartCountdown}s</strong></span>
          </div>

          <div className="flex justify-center">
            <Button onClick={onBackToLobby} className="gradient-primary" disabled={loading}>
              <ArrowLeft className="w-4 h-4 mr-2" />{loading ? "Returning..." : "Back to Lobby Now"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
