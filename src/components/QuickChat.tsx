import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const PHRASES = [
  "Hurry up! ⏰",
  "Good game! 👍",
  "Oops! 😅",
  "Nice one! 🔥",
  "No way! 😱",
  "Thanks! 😊",
  "Sorry! 🙏",
  "Let's go! 💪",
];

interface QuickChatProps {
  lobbyId: string;
  userId: string;
}

export const QuickChat = ({ lobbyId, userId }: QuickChatProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const sendPhrase = async (phrase: string) => {
    setIsOpen(false);
    await supabase.from("chat_messages").insert({
      lobby_id: lobbyId,
      user_id: userId,
      message: phrase,
    });
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-20 left-4 h-10 w-10 rounded-full shadow-lg z-50"
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-52 p-1" align="start">
        <div className="space-y-0.5">
          {PHRASES.map(phrase => (
            <button
              key={phrase}
              onClick={() => sendPhrase(phrase)}
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted/50 transition-colors"
            >
              {phrase}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
