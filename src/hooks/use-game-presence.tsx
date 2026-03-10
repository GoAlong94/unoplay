import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PresenceState {
  [key: string]: Array<{ user_id: string }>;
}

interface UseGamePresenceOptions {
  roomId: string | undefined;
  userId: string | undefined;
  allPlayerIds: string[];
  isMyTurn: boolean;
  onBotPlay: () => void;
  onAfkKick?: (userId: string) => void;
}

export const useGamePresence = ({
  roomId,
  userId,
  allPlayerIds,
  isMyTurn,
  onBotPlay,
  onAfkKick,
}: UseGamePresenceOptions) => {
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<string[]>([]);
  const [disconnectedPlayerIds, setDisconnectedPlayerIds] = useState<string[]>([]);
  const afkCountRef = useRef<Record<string, number>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const botTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!roomId || !userId) return;

    const channel = supabase.channel(`game-presence:${roomId}`, {
      config: { broadcast: { self: true }, presence: { key: userId } },
    });

    const syncState = () => {
      const state = channel.presenceState() as PresenceState;
      const ids = Object.values(state).flat().map((p) => p.user_id);
      const uniqueIds = Array.from(new Set(ids));
      setOnlinePlayerIds(uniqueIds);
      const disconnected = allPlayerIds.filter((id) => !uniqueIds.includes(id));
      setDisconnectedPlayerIds(disconnected);
    };

    channel
      .on("presence", { event: "sync" }, syncState)
      .on("presence", { event: "join" }, syncState)
      .on("presence", { event: "leave" }, syncState)
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({ user_id: userId });
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [roomId, userId, allPlayerIds.join(",")]);

  const trackAfkTimeout = useCallback(
    (timedOutUserId: string) => {
      const count = (afkCountRef.current[timedOutUserId] || 0) + 1;
      afkCountRef.current[timedOutUserId] = count;
      if (count >= 3 && onAfkKick) {
        onAfkKick(timedOutUserId);
      }
    },
    [onAfkKick]
  );

  const resetAfkCount = useCallback((activeUserId: string) => {
    afkCountRef.current[activeUserId] = 0;
  }, []);

  const isPlayerOnline = useCallback(
    (playerId: string) => onlinePlayerIds.includes(playerId),
    [onlinePlayerIds]
  );

  return {
    onlinePlayerIds,
    disconnectedPlayerIds,
    isPlayerOnline,
    trackAfkTimeout,
    resetAfkCount,
  };
};
