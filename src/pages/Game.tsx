import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, RotateCcw, RotateCw } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { UnoCard } from "@/components/UnoCard";
import { canPlayCard, shuffle, createDeck, cardToString, stringToCard, type CardColor } from "@/lib/unoGame";

interface GameState {
  id: string;
  lobby_id: string;
  status: string;
  current_card: string;
  current_color: string | null;
  direction: number;
  current_turn_user_id: string;
  deck: string[];
  discard_pile: string[];
  winner_id: string | null;
}

interface PlayerHand {
  id: string;
  user_id: string;
  cards: string[];
  position: number;
  has_said_uno: boolean;
  profiles: {
    username: string;
  };
}

const Game = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [myHand, setMyHand] = useState<PlayerHand | null>(null);
  const [allPlayers, setAllPlayers] = useState<PlayerHand[]>([]);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

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

    let gameChannel: any;
    let handsChannel: any;
    let mounted = true;

    const init = async () => {
      setInitError(null);

      // 1) Get the latest game for this lobby
      const { data: gameData, error: gameError } = await supabase
        .from("games")
        .select("*")
        .eq("lobby_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!mounted) return;

      if (gameError) {
        console.error("Error fetching game:", gameError);
        setInitError("Failed to load game state.");
        return;
      }

      if (!gameData) {
        toast.error("No game found for this lobby");
        navigate(`/lobby/${id}`);
        return;
      }

      setGame(gameData as GameState);

      const gameId = gameData.id as string;

      // 2) Wait until my hand exists
      const fetchMyHand = async () => {
        const { data: my, error: myErr } = await supabase
          .from("player_hands")
          .select("*")
          .eq("game_id", gameId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (myErr) {
          console.warn("fetchMyHand error:", myErr);
          return null;
        }

        return my ? ({ ...my, profiles: { username: "" } } as PlayerHand) : null;
      };

      // Retry for up to 10s (20 x 500ms)
      let retries = 20;
      let my: PlayerHand | null = await fetchMyHand();
      while (mounted && !my && retries-- > 0) {
        await new Promise((r) => setTimeout(r, 500));
        my = await fetchMyHand();
      }

      if (!mounted) return;

      if (!my) {
        console.error("My hand did not load (not found or blocked by policies)");
        setInitError("Couldn't load your hand. Please go back to the lobby and start again.");
        return;
      }

      setMyHand(my);

      // Now load everyone (best-effort; fallback if join fails)
      const loadAllHands = async () => {
        const { data: handsJoined, error: joinedErr } = await supabase
          .from("player_hands")
          .select("*, profiles(username)")
          .eq("game_id", gameId)
          .order("position");

        if (!mounted) return;

        if (!joinedErr && handsJoined) {
          setAllPlayers(handsJoined as PlayerHand[]);
          const mine = handsJoined.find((h) => h.user_id === user.id);
          if (mine) setMyHand(mine as PlayerHand);
          return;
        }

        console.warn("loadAllHands join failed, falling back:", joinedErr);

        const { data: handsRaw, error: rawErr } = await supabase
          .from("player_hands")
          .select("*")
          .eq("game_id", gameId)
          .order("position");

        if (!mounted) return;

        if (rawErr || !handsRaw) {
          console.error("loadAllHands raw failed:", rawErr);
          return;
        }

        const userIds = Array.from(new Set(handsRaw.map((h: any) => h.user_id)));
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", userIds);

        const usernameById = new Map((profiles ?? []).map((p: any) => [p.id, p.username]));
        const enriched = handsRaw.map((h: any) => ({
          ...h,
          profiles: { username: usernameById.get(h.user_id) ?? "Player" },
        }));

        setAllPlayers(enriched as PlayerHand[]);
        const mine = enriched.find((h: any) => h.user_id === user.id);
        if (mine) setMyHand(mine as PlayerHand);
      };

      await loadAllHands();

      // 3) Realtime updates – scope to this lobby/game
      gameChannel = supabase
        .channel(`game-${id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "games", filter: `lobby_id=eq.${id}` },
          (payload) => {
            if (!mounted) return;
            setGame(payload.new as GameState);
          }
        )
        .subscribe();

      handsChannel = supabase
        .channel(`hands-${gameId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "player_hands", filter: `game_id=eq.${gameId}` },
          async () => {
            await loadAllHands();
          }
        )
        .subscribe();
    };

    init();

    return () => {
      mounted = false;
      if (gameChannel) supabase.removeChannel(gameChannel);
      if (handsChannel) supabase.removeChannel(handsChannel);
    };
  }, [id, user, navigate]);

  const isMyTurn = game?.current_turn_user_id === user?.id;

  const playCard = async (card: string, chosenColor?: CardColor) => {
    if (!game || !myHand || !isMyTurn || loading) return;

    const cardObj = stringToCard(card);
    const isWild = cardObj.type === "wild" || cardObj.type === "wild_draw4";

    // If it's a wild card and no color chosen yet, show picker
    if (isWild && !chosenColor) {
      setSelectedCard(card);
      setShowColorPicker(true);
      return;
    }

    // Validate move
    if (!canPlayCard(card, game.current_card, game.current_color)) {
      toast.error("You can't play that card!");
      return;
    }

    setLoading(true);

    try {
      // Remove card from hand
      const newHand = myHand.cards.filter((c) => c !== card);
      
      // Check if player wins
      const playerWins = newHand.length === 0;

      // Determine next player
      const currentPlayerIndex = allPlayers.findIndex((p) => p.user_id === user?.id);
      let nextPlayerIndex = currentPlayerIndex + game.direction;
      
      // Handle reverse and skip
      let newDirection = game.direction;
      let skipNext = false;
      
      if (cardObj.type === "reverse") {
        newDirection = -game.direction;
        // In 2 player game, reverse acts like skip
        if (allPlayers.length === 2) {
          skipNext = true;
        } else {
          nextPlayerIndex = currentPlayerIndex + newDirection;
        }
      } else if (cardObj.type === "skip") {
        skipNext = true;
        nextPlayerIndex = currentPlayerIndex + (game.direction * 2);
      }
      
      // Wrap around player list
      if (nextPlayerIndex >= allPlayers.length) nextPlayerIndex = nextPlayerIndex % allPlayers.length;
      if (nextPlayerIndex < 0) nextPlayerIndex = allPlayers.length + nextPlayerIndex;
      
      const nextPlayer = allPlayers[nextPlayerIndex];

      // Update player hand
      await supabase
        .from("player_hands")
        .update({ 
          cards: newHand,
          has_said_uno: newHand.length === 1 ? myHand.has_said_uno : false 
        })
        .eq("id", myHand.id);

      // Handle draw2 and wild_draw4
      if (cardObj.type === "draw2" || cardObj.type === "wild_draw4") {
        const drawCount = cardObj.type === "draw2" ? 2 : 4;
        const nextPlayerHand = allPlayers.find((p) => p.user_id === nextPlayer.user_id);
        
        if (nextPlayerHand) {
          let drawnCards: string[] = [];
          let newDeck = [...game.deck];
          
          for (let i = 0; i < drawCount; i++) {
            if (newDeck.length === 0) {
              // Reshuffle discard pile into deck
              newDeck = shuffle([...game.discard_pile.slice(0, -1)]);
            }
            drawnCards.push(newDeck.pop()!);
          }
          
          await supabase
            .from("player_hands")
            .update({ cards: [...nextPlayerHand.cards, ...drawnCards] })
            .eq("id", nextPlayerHand.id);
          
          // Update deck in game state
          await supabase
            .from("games")
            .update({ deck: newDeck })
            .eq("id", game.id);
        }
      }

      // Update game state
      const updateData: any = {
        current_card: card,
        current_color: isWild ? chosenColor : cardObj.color,
        direction: newDirection,
        current_turn_user_id: nextPlayer.user_id,
        discard_pile: [...game.discard_pile, card],
      };

      if (playerWins) {
        updateData.status = "completed";
        updateData.winner_id = user?.id;
        
        // Update lobby status
        await supabase
          .from("lobbies")
          .update({ status: "waiting" })
          .eq("id", id);
      }

      await supabase.from("games").update(updateData).eq("id", game.id);

      setSelectedCard(null);
      setShowColorPicker(false);
      
      if (playerWins) {
        toast.success("🎉 You won!");
      }
    } catch (error: any) {
      console.error("Error playing card:", error);
      toast.error("Failed to play card");
    } finally {
      setLoading(false);
    }
  };

  const drawCard = async () => {
    if (!game || !myHand || !isMyTurn || loading) return;

    setLoading(true);

    try {
      let newDeck = [...game.deck];
      
      if (newDeck.length === 0) {
        // Reshuffle discard pile into deck
        newDeck = shuffle([...game.discard_pile.slice(0, -1)]);
        await supabase
          .from("games")
          .update({ 
            deck: newDeck,
            discard_pile: [game.discard_pile[game.discard_pile.length - 1]]
          })
          .eq("id", game.id);
      }
      
      const drawnCard = newDeck.pop()!;
      
      // Add card to hand
      const newHand = [...myHand.cards, drawnCard];
      
      await supabase
        .from("player_hands")
        .update({ cards: newHand })
        .eq("id", myHand.id);
      
      // Update deck and move to next player
      const currentPlayerIndex = allPlayers.findIndex((p) => p.user_id === user?.id);
      let nextPlayerIndex = currentPlayerIndex + game.direction;
      if (nextPlayerIndex >= allPlayers.length) nextPlayerIndex = 0;
      if (nextPlayerIndex < 0) nextPlayerIndex = allPlayers.length - 1;
      
      await supabase
        .from("games")
        .update({ 
          deck: newDeck,
          current_turn_user_id: allPlayers[nextPlayerIndex].user_id
        })
        .eq("id", game.id);
      
      toast.success("Drew a card");
    } catch (error: any) {
      console.error("Error drawing card:", error);
      toast.error("Failed to draw card");
    } finally {
      setLoading(false);
    }
  };

  const sayUno = async () => {
    if (!myHand || myHand.cards.length !== 1) return;
    
    await supabase
      .from("player_hands")
      .update({ has_said_uno: true })
      .eq("id", myHand.id);
    
    toast.success("UNO!");
  };

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="gradient-card border-border max-w-md w-full">
          <CardHeader>
            <CardTitle>Couldn't load game</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{initError}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(`/lobby/${id}`)}>
                Back to Lobby
              </Button>
              <Button onClick={() => window.location.reload()} className="gradient-primary">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!game || !myHand) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🎮</div>
          <p className="text-muted-foreground">Loading game...</p>
        </div>
      </div>
    );
  }

  if (game.status === "completed") {
    const winner = allPlayers.find((p) => p.user_id === game.winner_id);
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <Card className="gradient-card border-border shadow-glow max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center text-3xl">Game Over!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="text-6xl">🏆</div>
            <p className="text-2xl font-bold text-primary">
              {winner?.profiles.username} wins!
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => navigate(`/lobby/${id}`)} className="gradient-primary">
                Back to Lobby
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentPlayer = allPlayers.find((p) => p.user_id === game.current_turn_user_id);

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => navigate(`/lobby/${id}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Lobby
          </Button>
          <div className="flex items-center gap-2">
            {game.direction === 1 ? (
              <RotateCw className="w-5 h-5 text-primary" />
            ) : (
              <RotateCcw className="w-5 h-5 text-primary" />
            )}
            <span className="text-sm text-muted-foreground">
              {currentPlayer?.profiles.username}'s turn
            </span>
          </div>
        </div>

        {/* Other Players */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {allPlayers
            .filter((p) => p.user_id !== user?.id)
            .map((player) => (
              <Card key={player.id} className={`gradient-card border-border ${player.user_id === game.current_turn_user_id ? 'ring-2 ring-primary' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{player.profiles.username}</span>
                    <span className="text-2xl font-bold text-primary">
                      {player.cards.length}
                    </span>
                  </div>
                  {player.has_said_uno && player.cards.length === 1 && (
                    <span className="text-xs text-yellow-500">UNO!</span>
                  )}
                </CardContent>
              </Card>
            ))}
        </div>

        {/* Game Center */}
        <Card className="gradient-card border-border shadow-glow">
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-8">
              {/* Draw Pile */}
              <div className="text-center space-y-2">
                <div className="text-sm text-muted-foreground">Draw Pile</div>
                <Button
                  onClick={drawCard}
                  disabled={!isMyTurn || loading}
                  variant="outline"
                  className="w-20 h-28 rounded-lg bg-card hover:bg-accent"
                >
                  <div className="text-center">
                    <div className="text-2xl">🎴</div>
                    <div className="text-xs">{game.deck.length}</div>
                  </div>
                </Button>
              </div>

              {/* Current Card */}
              <div className="text-center space-y-2">
                <div className="text-sm text-muted-foreground">Current Card</div>
                <UnoCard card={game.current_card} size="lg" />
                {game.current_color && (
                  <div className="text-xs">Color: {game.current_color}</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* My Hand */}
        <Card className="gradient-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Your Hand</CardTitle>
              {myHand.cards.length === 1 && !myHand.has_said_uno && (
                <Button onClick={sayUno} variant="outline" size="sm" className="text-yellow-500">
                  Say UNO!
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 justify-center">
              {myHand.cards.map((card, index) => (
                <UnoCard
                  key={`${card}-${index}`}
                  card={card}
                  onClick={() => playCard(card)}
                  disabled={!isMyTurn || loading || !canPlayCard(card, game.current_card, game.current_color)}
                  size="md"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Color Picker Dialog */}
      <Dialog open={showColorPicker} onOpenChange={setShowColorPicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a color</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {(['red', 'blue', 'green', 'yellow'] as CardColor[]).map((color) => (
              <Button
                key={color}
                onClick={() => selectedCard && playCard(selectedCard, color)}
                className={`h-20 text-white font-bold ${
                  color === 'red' ? 'bg-red-600 hover:bg-red-700' :
                  color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' :
                  color === 'green' ? 'bg-green-600 hover:bg-green-700' :
                  'bg-yellow-500 hover:bg-yellow-600'
                }`}
              >
                {color.toUpperCase()}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Game;
