import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SpectatorBannerProps {
  onLeave: () => void;
}

export const SpectatorBanner = ({ onLeave }: SpectatorBannerProps) => (
  <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 bg-primary/90 text-primary-foreground backdrop-blur-sm">
    <div className="flex items-center gap-2">
      <Eye className="w-4 h-4" />
      <span className="text-sm font-medium">Spectator Mode</span>
    </div>
    <Button size="sm" variant="secondary" onClick={onLeave}>
      Leave
    </Button>
  </div>
);
