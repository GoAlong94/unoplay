import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Smile } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const EMOJIS = ["😂", "😭", "🔥", "💀", "👏", "😤", "🎉", "💪", "😈", "🤡", "❤️", "💔"];
const MAX_PER_MIN = 10;

interface FloatingEmoji {
  id: string;
  emoji: string;
  x: number;
  y: number;
}

interface EmoticonThrowerProps {
  lobbyId: string;
  userId: string;
}

export const EmoticonThrower = ({ lobbyId, userId }: EmoticonThrowerProps) => {
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const resetRef = useRef<NodeJS.Timeout | null>(null);

  // Rate limit reset every 60s
  useEffect(() => {
    resetRef.current = setInterval(() => setSentCount(0), 60000);
    return () => { if (resetRef.current) clearInterval(resetRef.current); };
  }, []);

  // Listen for emoji broadcasts
  useEffect(() => {
    const channel = supabase
      .channel(`emojis-${lobbyId}`)
      .on("broadcast", { event: "emoji" }, (payload) => {
        const { emoji, senderId } = payload.payload;
        if (senderId === userId) return; // don't show own
        const id = Math.random().toString(36);
        const x = 20 + Math.random() * 60;
        const y = 20 + Math.random() * 40;
        setFloatingEmojis(prev => [...prev, { id, emoji, x, y }]);
        setTimeout(() => {
          setFloatingEmojis(prev => prev.filter(e => e.id !== id));
        }, 2500);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [lobbyId, userId]);

  const sendEmoji = useCallback((emoji: string) => {
    if (sentCount >= MAX_PER_MIN) return;
    setSentCount(prev => prev + 1);
    setIsOpen(false);

    supabase.channel(`emojis-${lobbyId}`).send({
      type: "broadcast",
      event: "emoji",
      payload: { emoji, senderId: userId },
    });

    // Show locally too
    const id = Math.random().toString(36);
    const x = 20 + Math.random() * 60;
    const y = 20 + Math.random() * 40;
    setFloatingEmojis(prev => [...prev, { id, emoji, x, y }]);
    setTimeout(() => {
      setFloatingEmojis(prev => prev.filter(e => e.id !== id));
    }, 2500);
  }, [lobbyId, userId, sentCount]);

  return (
    <>
      {/* Floating emojis */}
      {floatingEmojis.map(fe => (
        <div
          key={fe.id}
          className="fixed pointer-events-none z-[60] text-4xl animate-bounce"
          style={{
            left: `${fe.x}%`,
            top: `${fe.y}%`,
            animation: "floatUp 2.5s ease-out forwards",
          }}
        >
          {fe.emoji}
        </div>
      ))}

      {/* Trigger button */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="fixed bottom-4 left-4 h-12 w-12 rounded-full shadow-lg z-50"
          >
            <Smile className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-auto p-2" align="start">
          <div className="grid grid-cols-4 gap-1">
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => sendEmoji(emoji)}
                disabled={sentCount >= MAX_PER_MIN}
                className="text-2xl p-2 rounded hover:bg-muted/50 transition-colors disabled:opacity-30"
              >
                {emoji}
              </button>
            ))}
          </div>
          {sentCount >= MAX_PER_MIN && (
            <p className="text-xs text-destructive text-center mt-1">Rate limit reached</p>
          )}
        </PopoverContent>
      </Popover>

      <style>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-120px) scale(1.5); }
        }
      `}</style>
    </>
  );
};
