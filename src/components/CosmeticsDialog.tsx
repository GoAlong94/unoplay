import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Palette, Sparkles } from "lucide-react";

interface CosmeticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CARD_BACKS = [
  { id: "classic", label: "Classic", gradient: "from-gray-700 to-gray-900" },
  { id: "royal", label: "Royal", gradient: "from-indigo-700 to-purple-900" },
  { id: "flame", label: "Flame", gradient: "from-red-600 to-orange-800" },
  { id: "ocean", label: "Ocean", gradient: "from-cyan-600 to-blue-900" },
  { id: "forest", label: "Forest", gradient: "from-emerald-600 to-green-900" },
  { id: "gold", label: "Gold", gradient: "from-yellow-500 to-amber-800" },
];

const THEMES = [
  { id: "default", label: "Default", primary: "263 70% 50%", accent: "142 76% 36%" },
  { id: "crimson", label: "Crimson", primary: "0 84% 50%", accent: "45 93% 47%" },
  { id: "emerald", label: "Emerald", primary: "142 76% 36%", accent: "217 91% 60%" },
  { id: "ocean", label: "Ocean", primary: "217 91% 50%", accent: "142 76% 36%" },
  { id: "sunset", label: "Sunset", primary: "25 95% 53%", accent: "330 81% 60%" },
];

export const CosmeticsDialog = ({ open, onOpenChange }: CosmeticsDialogProps) => {
  const [selectedBack, setSelectedBack] = useState(() => localStorage.getItem("cardBack") || "classic");
  const [selectedTheme, setSelectedTheme] = useState(() => localStorage.getItem("appTheme") || "default");

  const applyTheme = (themeId: string) => {
    const theme = THEMES.find((t) => t.id === themeId);
    if (!theme) return;
    document.documentElement.style.setProperty("--primary", theme.primary);
    document.documentElement.style.setProperty("--accent", theme.accent);
    localStorage.setItem("appTheme", themeId);
    setSelectedTheme(themeId);
  };

  const selectBack = (backId: string) => {
    localStorage.setItem("cardBack", backId);
    setSelectedBack(backId);
  };

  useEffect(() => {
    const saved = localStorage.getItem("appTheme");
    if (saved) applyTheme(saved);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Cosmetics
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Card Backs */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Palette className="w-4 h-4" /> Card Back
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {CARD_BACKS.map((back) => (
                <button
                  key={back.id}
                  onClick={() => selectBack(back.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                    selectedBack === back.id ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <div className={`w-10 h-14 rounded bg-gradient-to-br ${back.gradient} border border-white/20`} />
                  <span className="text-xs">{back.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Color Themes */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Color Theme</h3>
            <div className="grid grid-cols-5 gap-2">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => applyTheme(theme.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                    selectedTheme === theme.id ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full border border-white/20"
                    style={{ background: `hsl(${theme.primary})` }}
                  />
                  <span className="text-[10px]">{theme.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Utility to get current card back gradient
export const getCardBackGradient = () => {
  const id = localStorage.getItem("cardBack") || "classic";
  const back = CARD_BACKS.find((b) => b.id === id);
  return back?.gradient || "from-gray-700 to-gray-900";
};
