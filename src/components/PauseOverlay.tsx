import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Pause, Play, Check, Clock } from "lucide-react";

interface PauseOverlayProps {
  pausedAt: string;
  pauseDurationMinutes: number;
  readyPlayers: string[];
  allPlayerIds: string[];
  currentUserId: string;
  isHost: boolean;
  onReady: () => void;
  onResume: () => void;
}

export const PauseOverlay = ({
  pausedAt,
  pauseDurationMinutes,
  readyPlayers,
  allPlayerIds,
  currentUserId,
  isHost,
  onReady,
  onResume,
}: PauseOverlayProps) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const isReady = readyPlayers.includes(currentUserId);
  const allReady = allPlayerIds.every(id => readyPlayers.includes(id));

  useEffect(() => {
    const pauseEnd = new Date(pausedAt).getTime() + pauseDurationMinutes * 60 * 1000;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((pauseEnd - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [pausedAt, pauseDurationMinutes]);

  // When all players ready, start 5s countdown
  useEffect(() => {
    if (!allReady) {
      setResumeCountdown(null);
      return;
    }
    setResumeCountdown(5);
    const interval = setInterval(() => {
      setResumeCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          onResume();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [allReady, onResume]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-md flex items-center justify-center">
      <div className="text-center space-y-6 p-8 max-w-md">
        <div className="inline-flex p-4 rounded-full bg-primary/20 border-2 border-primary/40">
          <Pause className="w-12 h-12 text-primary" />
        </div>
        
        <h2 className="text-3xl font-bold">Game Paused</h2>
        
        <div className="flex items-center justify-center gap-2 text-xl font-mono">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <span className="text-primary font-bold">{formatTime(timeLeft)}</span>
          <span className="text-muted-foreground text-sm">remaining</span>
        </div>

        {resumeCountdown !== null ? (
          <div className="space-y-2">
            <p className="text-accent font-bold text-lg">All players ready!</p>
            <p className="text-4xl font-bold text-primary animate-pulse">{resumeCountdown}</p>
            <p className="text-muted-foreground text-sm">Resuming...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Players Ready</p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {allPlayerIds.map(id => (
                  <div
                    key={id}
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      readyPlayers.includes(id)
                        ? "bg-accent/20 border-accent text-accent"
                        : "bg-muted/30 border-border text-muted-foreground"
                    }`}
                  >
                    {readyPlayers.includes(id) ? (
                      <Check className="w-3 h-3 inline mr-1" />
                    ) : null}
                    {id === currentUserId ? "You" : id.slice(0, 4)}
                  </div>
                ))}
              </div>
            </div>

            {!isReady ? (
              <Button onClick={onReady} className="gradient-primary" size="lg">
                <Check className="w-4 h-4 mr-2" />
                Ready to Resume
              </Button>
            ) : (
              <p className="text-accent text-sm font-medium">
                ✓ You're ready! Waiting for others...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
