import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ArrowLeft, Copy, Users, MessageSquare, Play, Share2, MoreVertical, Crown, Volume2, VolumeX, UserX, Settings } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { usePresence } from "@/hooks/use-presence";
import { GameSettingsDialog } from "@/components/GameSettingsDialog";

interface LobbyData {
  id: string;
  name: string;
  code: string;
  created_by: string;
  status: string;
}

interface Player {
  id: string;
  user_id: string;
  muted: boolean;
  profiles: {
    username: string;
  };
}

interface ChatMessage {
  id: string;
  message: string;
  created_at: string;
  profiles: {
    username: string;
  };
}

const Lobby = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const { onlineUserIds } = usePresence(id, user?.id);
  const hasNavigatedRef = useRef(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [lobbyGameStatus, setLobbyGameStatus] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (!id || !user) return;

    const fetchLobby = async () => {
      const { data, error } = await supabase
        .from("lobbies")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        toast.error("Lobby not found");
        navigate("/");
        return;
      }
      setLobby(data);
      setLobbyGameStatus(data.status);

      // Check if there is an active (in_progress) game - redirect if so
      if (data.status === "in_game") {
        const { data: gameData } = await supabase
          .from("games")
          .select("id, status")
          .eq("lobby_id", id)
          .eq("status", "in_progress")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (gameData) {
          setActiveGameId(gameData.id);
          hasNavigatedRef.current = true;
          navigate(`/game/${id}`);
          return;
        }
      }
    };

    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from("lobby_players")
        .select("id, user_id, muted, profiles(username)")
        .eq("lobby_id", id);

      if (!error && data) {
        setPlayers(data as Player[]);
        
        // Ensure current user is in lobby
        const isInLobby = data.some((p: any) => p.user_id === user.id);
        if (!isInLobby) {
          await supabase.from("lobby_players").insert({
            lobby_id: id,
            user_id: user.id,
          });
          fetchPlayers();
        }
      }
    };

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, message, created_at, profiles(username)")
        .eq("lobby_id", id)
        .order("created_at", { ascending: true });

      if (!error && data) setMessages(data as ChatMessage[]);
    };

    fetchLobby();
    fetchPlayers();
    fetchMessages();

    const playersChannel = supabase
      .channel(`lobby-players-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lobby_players",
          filter: `lobby_id=eq.${id}`,
        },
        () => fetchPlayers()
      )
      .subscribe();

    const messagesChannel = supabase
      .channel(`lobby-messages-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `lobby_id=eq.${id}`,
        },
        (payload) => {
          const newMsg = payload.new as any;
          setTimeout(async () => {
            const { data } = await supabase
              .from("chat_messages")
              .select("id, message, created_at, profiles(username)")
              .eq("id", newMsg.id)
              .single();
            if (data) setMessages((prev) => [...prev, data as ChatMessage]);
          }, 0);
        }
      )
      .subscribe();

    // Subscribe to lobby status changes
    const lobbyChannel = supabase
      .channel(`lobby-status-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lobbies",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as LobbyData;
          setLobby(updated);
          setLobbyGameStatus(updated.status);
          // Reset flag when game returns to waiting so next match navigation works
          if (updated.status === "waiting") {
            hasNavigatedRef.current = false;
          }
          if (updated.status === "in_game" && !hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
            navigate(`/game/${id}`);
          }
        }
      )
      .subscribe();

    // Fallback: if lobby status update fails, still navigate when a game is created
    const gamesChannel = supabase
      .channel(`lobby-games-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "games",
          filter: `lobby_id=eq.${id}`,
        },
        () => {
          if (!hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
            navigate(`/game/${id}`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(lobbyChannel);
      supabase.removeChannel(gamesChannel);
    };
  }, [id, user, navigate]);

  const copyCode = () => {
    if (lobby) {
      navigator.clipboard.writeText(lobby.code);
      toast.success("Code copied to clipboard!");
    }
  };

  const shareWhatsApp = () => {
    if (!lobby) return;
    const url = window.location.href;
    const message = `Join my game lobby "${lobby.name}"! Code: ${lobby.code}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    try {
      await supabase.from("chat_messages").insert({
        lobby_id: id,
        user_id: user.id,
        message: newMessage.trim(),
      });
      setNewMessage("");
    } catch (error: any) {
      toast.error("Failed to send message");
    }
  };

  const toggleMute = async (playerId: string, currentMuted: boolean) => {
    if (!lobby || lobby.created_by !== user?.id) return;
    
    await supabase
      .from("lobby_players")
      .update({ muted: !currentMuted })
      .eq("id", playerId);
    
    toast.success(currentMuted ? "Player unmuted" : "Player muted");
  };

  const kickPlayer = async (playerId: string, playerUserId: string) => {
    if (!lobby || lobby.created_by !== user?.id || playerUserId === user?.id) return;
    
    await supabase
      .from("lobby_players")
      .delete()
      .eq("id", playerId);
    
    toast.success("Player kicked");
  };

  const startGame = async (settings: { turnTimeSeconds: number; gameTimeMinutes: number; useDoubleDeck: boolean }) => {
    if (!lobby || !user || players.length < 2 || lobby.created_by !== user.id) return;

    setIsStarting(true);
    try {
      const { createDeck, shuffle, stringToCard } = await import("@/lib/unoGame");
      
      // Create deck(s) based on settings
      let deck = createDeck();
      if (settings.useDoubleDeck && players.length >= 4) {
        deck = [...deck, ...createDeck()];
      }
      deck = shuffle(deck);
      
      const hands: { [userId: string]: string[] } = {};
      let deckIndex = 0;
      
      players.forEach((player) => {
        hands[player.user_id] = deck.slice(deckIndex, deckIndex + 7);
        deckIndex += 7;
      });
      
      let firstCard = deck[deckIndex];
      while (firstCard.startsWith('WILD')) {
        deckIndex++;
        firstCard = deck[deckIndex];
      }
      deckIndex++;
      
      const remainingDeck = deck.slice(deckIndex);
      
      // Update lobby settings
      await supabase
        .from("lobbies")
        .update({
          turn_time_seconds: settings.turnTimeSeconds,
          game_time_minutes: settings.gameTimeMinutes,
          use_double_deck: settings.useDoubleDeck,
        })
        .eq("id", id);
      
      const { data: gameData, error: gameError } = await supabase
        .from("games")
        .insert({
          lobby_id: id,
          status: "in_progress",
          current_card: firstCard,
          current_color: stringToCard(firstCard).color,
          direction: 1,
          current_turn_user_id: players[0].user_id,
          deck: remainingDeck,
          discard_pile: [firstCard],
        })
        .select()
        .single();

      if (gameError) throw gameError;

      const handInserts = players.map((player, index) => ({
        game_id: gameData.id,
        user_id: player.user_id,
        cards: hands[player.user_id],
        position: index,
        has_said_uno: false,
      }));

      const { error: handsError } = await supabase
        .from("player_hands")
        .insert(handInserts);

      if (handsError) throw handsError;

       const { error: lobbyUpdateError } = await supabase
         .from("lobbies")
         .update({ status: "in_game" })
         .eq("id", id);

       if (lobbyUpdateError) {
         console.error("Failed to update lobby status:", lobbyUpdateError);
       }

      // Track analytics
      await supabase.from("analytics_events").insert({
        user_id: user.id,
        event_type: "game_started",
        metadata: { 
          lobby_id: id, 
          player_count: players.length,
          turn_time: settings.turnTimeSeconds,
          game_time: settings.gameTimeMinutes,
          double_deck: settings.useDoubleDeck,
        },
      });

      toast.success("Game started!");
      hasNavigatedRef.current = true;
      setShowSettingsDialog(false);
      navigate(`/game/${id}`);
    } catch (error: any) {
      console.error("Error starting game:", error);
      toast.error("Failed to start game");
    } finally {
      setIsStarting(false);
    }
  };

  if (!lobby) return null;

  const isHost = lobby.created_by === user?.id;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">Lobby Code:</span>
            <code className="px-3 py-1 bg-card rounded font-mono text-lg">{lobby.code}</code>
            <Button variant="outline" size="icon" onClick={copyCode}>
              <Copy className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={shareWhatsApp}>
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">{lobby.name}</h1>
          <p className="text-muted-foreground">Waiting for players...</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="gradient-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Players ({players.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {players.map((player) => (
                    <div
                      key={player.id}
                      className="p-3 rounded-lg bg-background/50 border border-border flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        {player.user_id === lobby.created_by && (
                          <Crown className="w-4 h-4 text-yellow-500" />
                        )}
                        <p className="font-medium">{player.profiles.username}</p>
                        {onlineUserIds.includes(player.user_id) && (
                          <span className="w-2 h-2 bg-green-500 rounded-full" />
                        )}
                      </div>
                      {isHost && player.user_id !== user?.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => toggleMute(player.id, player.muted)}>
                              {player.muted ? (
                                <>
                                  <Volume2 className="w-4 h-4 mr-2" />
                                  Unmute
                                </>
                              ) : (
                                <>
                                  <VolumeX className="w-4 h-4 mr-2" />
                                  Mute
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => kickPlayer(player.id, player.user_id)}
                              className="text-destructive"
                            >
                              <UserX className="w-4 h-4 mr-2" />
                              Kick
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 gradient-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-secondary" />
                Chat
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="h-[250px] pr-4">
                <div className="space-y-2">
                  {messages.map((msg) => (
                    <div key={msg.id} className="p-3 rounded-lg bg-background/50 border border-border">
                      <p className="font-medium text-sm text-primary">{msg.profiles.username}</p>
                      <p className="text-sm">{msg.message}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <form onSubmit={sendMessage} className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="bg-background/50"
                />
                <Button type="submit" className="gradient-primary">
                  Send
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center gap-3 flex-wrap">
          {/* Rejoin button if game is active */}
          {lobbyGameStatus === "in_game" && (
            <Button
              onClick={() => navigate(`/game/${id}`)}
              size="lg"
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10"
            >
              🎮 Rejoin Active Game
            </Button>
          )}
          {isHost && lobbyGameStatus !== "in_game" ? (
            <Button
              onClick={() => setShowSettingsDialog(true)}
              size="lg"
              className="gradient-primary shadow-glow"
              disabled={players.length < 2}
            >
              <Play className="w-5 h-5 mr-2" />
              Start Game {players.length < 2 && "(Need 2+ players)"}
            </Button>
          ) : lobbyGameStatus !== "in_game" ? (
            <p className="text-muted-foreground">Waiting for host to start the game...</p>
          ) : null}
        </div>
      </div>
      
      {/* Game Settings Dialog */}
      <GameSettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        onStartGame={startGame}
        playerCount={players.length}
        loading={isStarting}
      />
    </div>
  );
};

export default Lobby;
