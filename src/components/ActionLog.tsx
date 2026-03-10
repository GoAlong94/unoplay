import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";

interface ActionLogProps {
  lobbyId: string;
}

interface LogEntry {
  id: string;
  message: string;
  created_at: string;
  profiles: { username: string };
}

export const ActionLog = ({ lobbyId }: ActionLogProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Use chat_messages with a prefix convention for action logs
    const fetch = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, message, created_at, profiles(username)")
        .eq("lobby_id", lobbyId)
        .like("message", "[ACTION]%")
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setLogs(data as LogEntry[]);
    };
    fetch();

    const channel = supabase
      .channel(`action-log-${lobbyId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `lobby_id=eq.${lobbyId}`,
      }, async (payload) => {
        const msg = (payload.new as any).message;
        if (typeof msg === "string" && msg.startsWith("[ACTION]")) {
          const { data } = await supabase
            .from("chat_messages")
            .select("id, message, created_at, profiles(username)")
            .eq("id", (payload.new as any).id)
            .single();
          if (data) setLogs((prev) => [data as LogEntry, ...prev].slice(0, 50));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [lobbyId]);

  const formatLog = (msg: string) => msg.replace("[ACTION] ", "");

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-4 left-4 h-10 w-10 rounded-full shadow-lg z-50"
        >
          <History className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" /> Action Log
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-80px)] p-4">
          <div className="space-y-2">
            {logs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No actions yet</p>
            )}
            {logs.map((log) => (
              <div key={log.id} className="text-xs p-2 rounded bg-muted/30 border border-border">
                <span className="text-primary font-medium">{log.profiles.username}</span>{" "}
                <span className="text-muted-foreground">{formatLog(log.message)}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
