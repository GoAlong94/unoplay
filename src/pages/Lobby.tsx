import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ArrowLeft, Copy, Users, MessageSquare, Play, Share2, MoreVertical, Crown, Volume2, VolumeX, UserX, Settings, Eye } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { usePresence } from "@/hooks/use-presence";
import { GameSettingsDialog } from "@/components/GameSettingsDialog";

interface LobbyData { id: string; name: string; code: string; created_by: string; status: string; max_players: number | null; }
interface Player { id: string; user_id: string; muted: boolean; profiles: { username: string }; }
interface ChatMessage { id: string; message: string; created_at: string; profiles: { username: string }; }

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
      else setUser(session.user);
    });
  }, [navigate]);

  useEffect(() => {
    if (!id || !user) return;

    const fetchLobby = async () => {
      const { data, error } = await supabase.from("lobbies").select("*").eq("id", id).single();
      if (error) { toast.error("Lobby not found"); navigate("/"); return; }
      setLobby(data as LobbyData);
      setLobbyGameStatus(data.status);

      if (data.status === "in_game") {
        const { data: gameData } = await supabase.from("games").select("id, status").eq("lobby_id", id)
          .eq("status", "in_progress").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (gameData) { hasNavigatedRef.current = true; navigate(`/game/${id}`); return; }
      }
    };

    const fetchPlayers = async () => {
      const { data, error } = await supabase.from("lobby_players").select("id, user_id, muted, profiles(username)").eq("lobby_id", id);
      if (!error && data) {
        setPlayers(data as Player[]);
        const isInLobby = data.some((p: any) => p.user_id === user.id);
        if (!isInLobby) {
          await supabase.from("lobby_players").insert({ lobby_id: id, user_id: user.id });
          fetchPlayers();
        }
      }
    };

    const fetchMessages = async () => {
      const { data, error } = await supabase.from("chat_messages").select("id, message, created_at, profiles(username)")
        .eq("lobby_id", id).order("created_at", { ascending: true });
      if (!error && data) setMessages(data as ChatMessage[]);
    };

    fetchLobby(); fetchPlayers(); fetchMessages();

    const playersChannel = supabase.channel(`lobby-players-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lobby_players", filter: `lobby_id=eq.${id}` }, () => fetchPlayers())
      .subscribe();

    const messagesChannel = supabase.channel(`lobby-messages-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `lobby_id=eq.${id}` },
        (payload) => {
          const newMsg = payload.new as any;
          setTimeout(async () => {
            const { data } = await supabase.from("chat_messages").select("id, message, created_at, profiles(username)").eq("id", newMsg.id).single();
            if (data) setMessages((prev) => [...prev, data as ChatMessage]);
          }, 0);
        })
      .subscribe();

    const lobbyChannel = supabase.channel(`lobby-status-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${id}` },
        (payload) => {
          const updated = payload.new as LobbyData;
          setLobby(updated);
          setLobbyGameStatus(updated.status);
          if (updated.status === "waiting") hasNavigatedRef.current = false;
          if (updated.status === "in_game" && !hasNavigatedRef.current) { hasNavigatedRef.current = true; navigate(`/game/${id}`); }
        })
      .subscribe();

    const gamesChannel = supabase.channel(`lobby-games-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "games", filter: `lobby_id=eq.${id}` },
        () => { if (!hasNavigatedRef.current) { hasNavigatedRef.current = true; navigate(`/game/${id}`); } })
      .subscribe();

    return () => {
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(lobbyChannel);
      supabase.removeChannel(gamesChannel);
    };
  }, [id, user, navigate]);

  // ── Host migration: if host leaves, transfer to next online player ──
  useEffect(() => {
    if (!lobby || !user || !id) return;
    const hostIsInLobby = players.some(p => p.user_id === lobby.created_by);
    const hostIsOnline = onlineUserIds.includes(lobby.created_by);

    // If host left the lobby entirely
    if (!hostIsInLobby && players.length > 0) {
      const nextHost = players.find(p => onlineUserIds.includes(p.user_id)) || players[0];
      if (nextHost.user_id === user.id) {
        // This client is the new host - take ownership
        supabase.from("lobbies").update({ created_by: user.id }).eq("id", id).then(() => {
          toast.info("You are now the host!");
        });
      }
    }
  }, [players, onlineUserIds, lobby?.created_by, user?.id, id]);

  const copyCode = () => { if (lobby) { navigator.clipboard.writeText(lobby.code); toast.success("Code copied!"); } };

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
      await supabase.from("chat_messages").insert({ lobby_id: id, user_id: user.id, message: newMessage.trim() });
      setNewMessage("");
    } catch { toast.error("Failed to send message"); }
  };

  const toggleMute = async (playerId: string, currentMuted: boolean) => {
    if (!lobby || lobby.created_by !== user?.id) return;
    await supabase.from("lobby_players").update({ muted: !currentMuted }).eq("id", playerId);
    toast.success(currentMuted ? "Player unmuted" : "Player muted");
  };

  const kickPlayer = async (playerId: string, playerUserId: string) => {
    if (!lobby || lobby.created_by !== user?.id || playerUserId === user?.id) return;
    await supabase.from("lobby_players").delete().eq("id", playerId);
    toast.success("Player kicked");
  };

  const spectateGame = () => { navigate(`/game/${id}`); };

  const startGame = async (settings: any) => {
    if (!lobby || !user || players.length < 2 || lobby.created_by !== user.id) return;
    setIsStarting(true);
    try {
      const { createDeck, shuffle, stringToCard } = await import("@/lib/unoGame");
      let orderedPlayers = [...players];
      if (settings.shuffleSeats) orderedPlayers = shuffle([...players]);
      let deck = createDeck();
      if (settings.useDoubleDeck && orderedPlayers.length >= 4) deck = [...deck, ...createDeck()];
      deck = shuffle(deck);

      const hands: { [userId: string]: string[] } = {};
      let deckIndex = 0;
      orderedPlayers.forEach((player) => { hands[player.user_id] = deck.slice(deckIndex, deckIndex + 7); deckIndex += 7; });

      let firstCard = deck[deckIndex];
      while (firstCard.startsWith('WILD')) { deckIndex++; firstCard = deck[deckIndex]; }
      deckIndex++;
      const remainingDeck = deck.slice(deckIndex);

      const firstCardObj = stringToCard(firstCard);
      let firstTurnPlayerIdx = 0;
      let direction = 1;

      if (firstCardObj.type === "skip") firstTurnPlayerIdx = 1;
      else if (firstCardObj.type === "reverse") { direction = -1; if (orderedPlayers.length === 2) firstTurnPlayerIdx = 1; }
      else if (firstCardObj.type === "draw2") {
        const victimCards = hands[orderedPlayers[0].user_id];
        for (let i = 0; i < 2 && remainingDeck.length > 0; i++) victimCards.push(remainingDeck.shift()!);
        firstTurnPlayerIdx = 1;
      }
      if (firstTurnPlayerIdx >= orderedPlayers.length) firstTurnPlayerIdx = 0;

      await supabase.from("lobbies").update({
        turn_time_seconds: settings.turnTimeSeconds, game_time_minutes: settings.gameTimeMinutes,
        use_double_deck: settings.useDoubleDeck, game_rules: settings.rules ?? null,
      }).eq("id", id);

      const { data: gameData, error: gameError } = await supabase.from("games").insert({
        lobby_id: id, status: "in_progress", current_card: firstCard, current_color: firstCardObj.color,
        direction, current_turn_user_id: orderedPlayers[firstTurnPlayerIdx].user_id,
        deck: remainingDeck, discard_pile: [firstCard],
      }).select().single();
      if (gameError) throw gameError;

      const handInserts = orderedPlayers.map((player, index) => ({
        game_id: gameData.id, user_id: player.user_id, cards: hands[player.user_id], position: index, has_said_uno: false,
      }));
      const { error: handsError } = await supabase.from("player_hands").insert(handInserts);
      if (handsError) throw handsError;

      await supabase.from("lobbies").update({ status: "in_game" }).eq("id", id);

      await supabase.from("analytics_events").insert({
        user_id: user.id, event_type: "game_started",
        metadata: { lobby_id: id, player_count: orderedPlayers.length, turn_time: settings.turnTimeSeconds, game_time: settings.gameTimeMinutes, double_deck: settings.useDoubleDeck },
      });

      toast.success("Game started!");
      hasNavigatedRef.current = true;
      setShowSettingsDialog(false);
      navigate(`/game/${id}`);
    } catch (error: any) {
      console.error("Error starting game:", error);
      toast.error("Failed to start game");
    } finally { setIsStarting(false); }
  };

  if (!lobby) return null;

  const isHost = lobby.created_by === user?.id;
  const maxPlayers = lobby.max_players ?? 10;

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />Back
          </Button>
          <div className="flex items-center gap-2">
            <code className="px-3 py-1 bg-card rounded font-mono text-lg">{lobby.code}</code>
            <Button variant="outline" size="icon" onClick={copyCode}><Copy className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon" onClick={shareWhatsApp}><Share2 className="w-4 h-4" /></Button>
          </div>
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold">{lobby.name}</h1>
          <p className="text-muted-foreground text-sm">Waiting for players...</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="gradient-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-4 h-4 text-primary" />
                Players ({players.length}/{maxPlayers})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[250px]">
                <div className="space-y-2">
                  {players.map((player) => (
                    <div key={player.id} className="p-2 rounded-lg bg-background/50 border border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {player.user_id === lobby.created_by && <Crown className="w-4 h-4 text-yellow-500" />}
                        <p className="font-medium text-sm">{player.profiles.username}</p>
                        {onlineUserIds.includes(player.user_id) ? (
                          <span className="w-2 h-2 bg-accent rounded-full" />
                        ) : (
                          <span className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                        )}
                      </div>
                      {isHost && player.user_id !== user?.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-3 h-3" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => toggleMute(player.id, player.muted)}>
                              {player.muted ? <><Volume2 className="w-4 h-4 mr-2" />Unmute</> : <><VolumeX className="w-4 h-4 mr-2" />Mute</>}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => kickPlayer(player.id, player.user_id)} className="text-destructive">
                              <UserX className="w-4 h-4 mr-2" />Kick
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
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="w-4 h-4 text-secondary" />Chat
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ScrollArea className="h-[200px] pr-4">
                <div className="space-y-2">
                  {messages.map((msg) => (
                    <div key={msg.id} className="p-2 rounded-lg bg-background/50 border border-border">
                      <p className="font-medium text-xs text-primary">{msg.profiles.username}</p>
                      <p className="text-sm">{msg.message}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <form onSubmit={sendMessage} className="flex gap-2">
                <Input placeholder="Type a message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} className="bg-background/50" />
                <Button type="submit" className="gradient-primary">Send</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center gap-3 flex-wrap">
          {lobbyGameStatus === "in_game" && (
            <>
              <Button onClick={() => navigate(`/game/${id}`)} size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10">
                🎮 Rejoin Active Game
              </Button>
              <Button onClick={spectateGame} size="lg" variant="outline" className="border-secondary text-secondary hover:bg-secondary/10">
                <Eye className="w-4 h-4 mr-2" /> Spectate
              </Button>
            </>
          )}
          {isHost && lobbyGameStatus !== "in_game" ? (
            <Button onClick={() => setShowSettingsDialog(true)} size="lg" className="gradient-primary shadow-glow" disabled={players.length < 2}>
              <Play className="w-5 h-5 mr-2" />Start Game {players.length < 2 && "(Need 2+ players)"}
            </Button>
          ) : lobbyGameStatus !== "in_game" ? (
            <p className="text-muted-foreground">Waiting for host to start the game...</p>
          ) : null}
        </div>
      </div>

      <GameSettingsDialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog} onStartGame={startGame} playerCount={players.length} loading={isStarting} />
    </div>
  );
};

export default Lobby;
