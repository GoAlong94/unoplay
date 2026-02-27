import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Clock, Timer, Layers, BookOpen, Cog, Wrench } from "lucide-react";

export interface GameRules {
  catch_uno_penalty: boolean;
  stacking: boolean;
  force_play: boolean;
  seven_zero_rule: boolean;
  jump_in: boolean;
  end_with_power_card: boolean;
  draw_penalty_skip: boolean;
}

export interface GameSettings {
  turnTimeSeconds: number;
  gameTimeMinutes: number;
  useDoubleDeck: boolean;
  rules: GameRules;
  shuffleSeats: boolean;
}

interface GameSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartGame: (settings: GameSettings) => void;
  playerCount: number;
  loading?: boolean;
}

const defaultRules: GameRules = {
  catch_uno_penalty: true,
  stacking: false,
  force_play: true,
  seven_zero_rule: false,
  jump_in: false,
  end_with_power_card: true,
  draw_penalty_skip: true,
};

const RuleToggle = ({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
    <div className="space-y-0.5 pr-4">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

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
  const [rules, setRules] = useState<GameRules>(defaultRules);
  const [shuffleSeats, setShuffleSeats] = useState(false);

  const updateRule = (key: keyof GameRules, value: boolean) => {
    setRules(prev => ({ ...prev, [key]: value }));
  };

  const handleStart = () => {
    onStartGame({
      turnTimeSeconds: parseInt(turnTime),
      gameTimeMinutes: parseInt(gameTime),
      useDoubleDeck,
      rules,
      shuffleSeats,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-5 h-5 text-primary" />
            Game Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="rules" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="rules" className="text-xs sm:text-sm">
              <BookOpen className="w-3 h-3 mr-1" />
              Rules
            </TabsTrigger>
            <TabsTrigger value="logic" className="text-xs sm:text-sm">
              <Cog className="w-3 h-3 mr-1" />
              Logic
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs sm:text-sm">
              <Wrench className="w-3 h-3 mr-1" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* RULES TAB */}
          <TabsContent value="rules" className="space-y-3 mt-4">
            <RuleToggle
              label="UNO Catch Penalty"
              description="Other players can catch you if you forget to say UNO (+2 cards)"
              checked={rules.catch_uno_penalty}
              onChange={(v) => updateRule("catch_uno_penalty", v)}
            />
            <RuleToggle
              label="Stacking +2/+4"
              description="Stack Draw cards on top of each other instead of drawing"
              checked={rules.stacking}
              onChange={(v) => updateRule("stacking", v)}
            />
            <RuleToggle
              label="Force Play"
              description="Must play drawn card immediately if playable (vs. keep in hand)"
              checked={rules.force_play}
              onChange={(v) => updateRule("force_play", v)}
            />
            <RuleToggle
              label="7-0 Rule"
              description="Playing 7 swaps hands with chosen player; playing 0 rotates all hands"
              checked={rules.seven_zero_rule}
              onChange={(v) => updateRule("seven_zero_rule", v)}
            />
            <RuleToggle
              label="Jump-In"
              description="Play an identical card out of turn (same color + same number/action)"
              checked={rules.jump_in}
              onChange={(v) => updateRule("jump_in", v)}
            />
            <RuleToggle
              label="End with Power Card"
              description="Allow winning by playing a power/action card as last card"
              checked={rules.end_with_power_card}
              onChange={(v) => updateRule("end_with_power_card", v)}
            />
            <RuleToggle
              label="Draw Penalty Skips Turn"
              description="After drawing from +2/+4, the victim's turn is skipped"
              checked={rules.draw_penalty_skip}
              onChange={(v) => updateRule("draw_penalty_skip", v)}
            />
          </TabsContent>

          {/* LOGIC TAB */}
          <TabsContent value="logic" className="space-y-3 mt-4">
            <RuleToggle
              label="Shuffle Seats Between Games"
              description="Randomize player seating positions when starting a new match"
              checked={shuffleSeats}
              onChange={setShuffleSeats}
            />
          </TabsContent>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-4 mt-4">
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
                  <SelectItem value="60">60 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {playerCount >= 4 && (
              <RuleToggle
                label="Double Deck"
                description={`Use 2 decks for ${playerCount} players`}
                checked={useDoubleDeck}
                onChange={setUseDoubleDeck}
              />
            )}

            {playerCount < 4 && (
              <p className="text-xs text-muted-foreground text-center p-3 bg-muted/30 rounded-lg">
                Double deck option available with 4+ players
              </p>
            )}
          </TabsContent>
        </Tabs>

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
