import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Play, Clock, Timer, Layers } from "lucide-react";

interface GameSettings {
  turnTimeSeconds: number;
  gameTimeMinutes: number;
  useDoubleDeck: boolean;
}

interface GameSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartGame: (settings: GameSettings) => void;
  playerCount: number;
  loading?: boolean;
}

export const GameSettingsDialog = ({
  open,
  onOpenChange,
  onStartGame,
  playerCount,
  loading = false,
}: GameSettingsDialogProps) => {
  const [turnTime, setTurnTime] = useState("30");
  const [gameTime, setGameTime] = useState("30");
  const [useDoubleDeck, setUseDoubleDeck] = useState(false);

  const handleStart = () => {
    onStartGame({
      turnTimeSeconds: parseInt(turnTime),
      gameTimeMinutes: parseInt(gameTime),
      useDoubleDeck,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-5 h-5 text-primary" />
            Game Settings
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-muted-foreground" />
              Turn Time (seconds)
            </Label>
            <Select value={turnTime} onValueChange={setTurnTime}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="45">45 seconds</SelectItem>
                <SelectItem value="60">60 seconds</SelectItem>
                <SelectItem value="90">90 seconds</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Time each player has to make their move
            </p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Total Game Time (minutes)
            </Label>
            <Select value={gameTime} onValueChange={setGameTime}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="20">20 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">60 minutes (no limit)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Maximum game duration before declaring winner by card count
            </p>
          </div>

          {playerCount >= 4 && (
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
              <div className="space-y-1">
                <Label className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                  Double Deck
                </Label>
                <p className="text-xs text-muted-foreground">
                  Use 2 decks for {playerCount} players
                </p>
              </div>
              <Switch
                checked={useDoubleDeck}
                onCheckedChange={setUseDoubleDeck}
              />
            </div>
          )}

          {playerCount < 4 && (
            <p className="text-xs text-muted-foreground text-center p-3 bg-muted/30 rounded-lg">
              Double deck option available with 4+ players
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleStart} className="gradient-primary" disabled={loading}>
            <Play className="w-4 h-4 mr-2" />
            {loading ? "Starting..." : "Start Game"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
