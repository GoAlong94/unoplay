import { Bot, User } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AutoPlayToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export const AutoPlayToggle = ({ enabled, onToggle }: AutoPlayToggleProps) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
            enabled 
              ? "border-primary bg-primary/10" 
              : "border-border bg-card"
          }`}>
            {enabled ? (
              <Bot className="w-4 h-4 text-primary" />
            ) : (
              <User className="w-4 h-4 text-muted-foreground" />
            )}
            <Label htmlFor="auto-play" className="text-sm cursor-pointer">
              Auto
            </Label>
            <Switch
              id="auto-play"
              checked={enabled}
              onCheckedChange={onToggle}
              className="scale-90"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Let AI play for you automatically</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
