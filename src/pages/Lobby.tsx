import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { ArrowLeft, Copy, Users, MessageSquare, Play } from "lucide-react";
import type { User } from "@supabase/supabase-js";

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
    if (!id) return;

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
    };

    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from("lobby_players")
        .select("id, user_id, profiles(username)")
        .eq("lobby_id", id);

      if (!error && data) setPlayers(data as Player[]);
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

    return () => {
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [id, navigate]);

  const copyCode = () => {
    if (lobby) {
      navigator.clipboard.writeText(lobby.code);
      toast.success("Code copied to clipboard!");
    }
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

  const startGame = async () => {
    if (!lobby || !user || players.length < 2) return;

    try {
      // Create a new game with initial state
      const { createDeck, shuffle, cardToString, stringToCard } = await import("@/lib/unoGame");
      
      const deck = shuffle(createDeck());
      
      // Deal 7 cards to each player
      const hands: { [userId: string]: string[] } = {};
      let deckIndex = 0;
      
      players.forEach((player) => {
        hands[player.user_id] = deck.slice(deckIndex, deckIndex + 7);
        deckIndex += 7;
      });
      
      // Get first card for discard pile (ensure it's not a wild card)
      let firstCard = deck[deckIndex];
      while (firstCard.startsWith('WILD')) {
        deckIndex++;
        firstCard = deck[deckIndex];
      }
      deckIndex++;
      
      const remainingDeck = deck.slice(deckIndex);
      
      // Create game record
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

      // Create player hands
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

      // Update lobby status
      await supabase
        .from("lobbies")
        .update({ status: "in_game" })
        .eq("id", id);

      toast.success("Game started!");
      navigate(`/game/${id}`);
    } catch (error: any) {
      console.error("Error starting game:", error);
      toast.error("Failed to start game");
    }
  };

  if (!lobby) return null;

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
                      className="p-3 rounded-lg bg-background/50 border border-border"
                    >
                      <p className="font-medium">{player.profiles.username}</p>
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

        <div className="flex justify-center">
          <Button
            onClick={startGame}
            size="lg"
            className="gradient-primary shadow-glow"
            disabled={players.length < 2}
          >
            <Play className="w-5 h-5 mr-2" />
            Start Game
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
