import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PresenceState {
  [key: string]: Array<{ user_id: string }>; // keyed by presence key
}

export const usePresence = (roomId: string | undefined, userId: string | undefined) => {
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!roomId || !userId) return;

    const channel = supabase.channel(`presence:${roomId}`, {
      config: { broadcast: { self: true }, presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as PresenceState;
        const ids = Object.values(state).flat().map((p) => p.user_id);
        setOnlineUserIds(Array.from(new Set(ids)));
      })
      .on("presence", { event: "join" }, () => {
        const state = channel.presenceState() as PresenceState;
        const ids = Object.values(state).flat().map((p) => p.user_id);
        setOnlineUserIds(Array.from(new Set(ids)));
      })
      .on("presence", { event: "leave" }, () => {
        const state = channel.presenceState() as PresenceState;
        const ids = Object.values(state).flat().map((p) => p.user_id);
        setOnlineUserIds(Array.from(new Set(ids)));
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({ user_id: userId });
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [roomId, userId]);

  return { onlineUserIds };
};
