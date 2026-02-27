import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX } from "lucide-react";
import { setSoundEnabled, isSoundEnabled } from "@/lib/sounds";

export const SoundToggle = () => {
  const [enabled, setEnabled] = useState(isSoundEnabled());

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setSoundEnabled(next);
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      className="h-9 w-9"
      title={enabled ? "Mute sounds" : "Unmute sounds"}
    >
      {enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
    </Button>
  );
};
