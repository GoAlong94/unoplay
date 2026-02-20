import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { UnoCard } from "@/components/UnoCard";
import { InGameChat } from "@/components/InGameChat";
import { GameTimers } from "@/components/GameTimers";
import { TablePlayerLayout } from "@/components/TablePlayerLayout";
import { GameRankingScreen } from "@/components/GameRankingScreen";
import { AutoPlayToggle } from "@/components/AutoPlayToggle";
import { canPlayCard, shuffle, cardToString, stringToCard, type CardColor } from "@/lib/unoGame";

interface GameStateRaw {
  id: string;
  lobby_id: string;
  status: string;
  current_card: string;
  current_color: string | null;
  direction: number;
  current_turn_user_id: string;
  deck: unknown;
  discard_pile: unknown;
  winner_id: string | null;
}

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

interface LobbyData {
  id: string;
  created_by: string;
  turn_time_seconds: number | null;
  game_time_minutes: number | null;
}

interface PlayerHandRaw {
  id: string;
  user_id: string;
  cards: unknown;
  position: number;
  has_said_uno: boolean;
  profiles?: {
    username: string;
  };
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

// Helper to safely parse JSON arrays from database
const parseJsonArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeGameState = (raw: GameStateRaw): GameState => ({
  ...raw,
  deck: parseJsonArray(raw.deck),
  discard_pile: parseJsonArray(raw.discard_pile),
});

const normalizePlayerHand = (raw: PlayerHandRaw): PlayerHand => ({
  ...raw,
  cards: parseJsonArray(raw.cards),
  profiles: raw.profiles ?? { username: 'Player' },
});

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
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [autoRestartCountdown, setAutoRestartCountdown] = useState(20);
  const [gameEndReason, setGameEndReason] = useState<"winner" | "timeout">("winner");
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  
  // Auto-play state
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  
  // Timer states
  const [turnTimeLeft, setTurnTimeLeft] = useState(30);
  const [gameTimeLeft, setGameTimeLeft] = useState(30 * 60);
  const turnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTurnUserRef = useRef<string | null>(null);
  const autoPlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Prevent auto-play from firing twice in the same turn
  const hasActedThisTurnRef = useRef(false);
  // Prevent game timer from triggering endGame multiple times
  const gameEndedRef = useRef(false);
  // Refs to always have latest lobby/user in timer callbacks (avoids stale closures)
  const lobbyRef = useRef<LobbyData | null>(null);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        userRef.current = session.user;
      }
    });
  }, [navigate]);

  // Keep refs in sync with latest state values (for use inside timer callbacks)
  useEffect(() => { lobbyRef.current = lobby; }, [lobby]);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    if (!id || !user) return;

    let gameChannel: any;
    let handsChannel: any;
    let mounted = true;

    const init = async () => {
      setInitError(null);

      const toPromise = <T,>(thenable: { then: (onFulfilled: (v: any) => any, onRejected?: (e: any) => any) => any }) =>
        new Promise<T>((resolve, reject) => thenable.then(resolve, reject));

      const withTimeout = async <T,>(thenable: { then: (onFulfilled: (v: any) => any, onRejected?: (e: any) => any) => any }, ms: number, label: string): Promise<T> => {
        const promise = toPromise<T>(thenable);
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
        ]);
      };

      // 1) Get the latest game for this lobby
      let gameData: any = null;
      let gameError: any = null;
      try {
        const res = await withTimeout(
          supabase
            .from("games")
            .select("*")
            .eq("lobby_id", id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          8000,
          "Load game"
        );
        gameData = (res as any).data;
        gameError = (res as any).error;
      } catch (e: any) {
        console.error("Error fetching game (timeout):", e);
        setInitError("Network timeout while loading game.");
        return;
      }

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

      setGame(normalizeGameState(gameData as GameStateRaw));

      const gameId = gameData.id as string;

      // 2) Wait until my hand exists
      const fetchMyHand = async () => {
        let my: any = null;
        let myErr: any = null;
        try {
          const res = await withTimeout(
            supabase
              .from("player_hands")
              .select("*")
              .eq("game_id", gameId)
              .eq("user_id", user.id)
              .maybeSingle(),
            8000,
            "Load your hand"
          );
          my = (res as any).data;
          myErr = (res as any).error;
        } catch (e: any) {
          console.warn("fetchMyHand timeout:", e);
          return null;
        }

        if (myErr) {
          console.warn("fetchMyHand error:", myErr);
          return null;
        }

        return my ? normalizePlayerHand(my as PlayerHandRaw) : null;
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
          const normalized = (handsJoined as PlayerHandRaw[]).map(normalizePlayerHand);
          setAllPlayers(normalized);
          const mine = normalized.find((h) => h.user_id === user.id);
          if (mine) setMyHand(mine);
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
        const enriched = handsRaw.map((h: any) => 
          normalizePlayerHand({
            ...h,
            profiles: { username: usernameById.get(h.user_id) ?? "Player" },
          })
        );

        setAllPlayers(enriched);
        const mine = enriched.find((h) => h.user_id === user.id);
        if (mine) setMyHand(mine);
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
            setGame(normalizeGameState(payload.new as GameStateRaw));
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

  // Auto-play a card (finds best playable card or draws)
  const autoPlay = useCallback(async () => {
    if (!game || !myHand || loading || hasActedThisTurnRef.current) return;
    
    // Mark as acted immediately to prevent double-fire
    hasActedThisTurnRef.current = true;
    
    // Find a playable card
    const playableCard = myHand.cards.find(card => 
      canPlayCard(card, game.current_card, game.current_color)
    );
    
    if (playableCard) {
      const cardObj = stringToCard(playableCard);
      const isWild = cardObj.type === "wild" || cardObj.type === "wild_draw4";
      
      if (isWild) {
        // Pick the most common color in hand for wild cards
        const colorCounts: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
        myHand.cards.forEach(c => {
          const co = stringToCard(c);
          if (co.color) colorCounts[co.color]++;
        });
        const bestColor = (Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'red') as CardColor;
        await playCard(playableCard, bestColor);
      } else {
        await playCard(playableCard);
      }
    } else {
      // No playable card, must draw
      await drawCard();
    }
  }, [game, myHand, loading]);

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

    // Mark as acted so auto-play doesn't fire again this turn
    hasActedThisTurnRef.current = true;
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
        setGameEndReason("winner");
        
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

    // Mark as acted so auto-play doesn't fire again this turn
    hasActedThisTurnRef.current = true;
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

  // End game due to timeout with rankings - only host executes to avoid race
  const endGameWithRankings = useCallback(async () => {
    if (!game || game.status === "completed") return;
    if (gameEndedRef.current) return;
    
    const isHostClient = lobby?.created_by === user?.id;
    
    // All clients show the UI change; only host writes to DB
    setGameEndReason("timeout");
    
    if (isHostClient) {
      gameEndedRef.current = true;
      setLoading(true);
      try {
        const sortedPlayers = [...allPlayers].sort((a, b) => a.cards.length - b.cards.length);
        const winner = sortedPlayers[0];
        
        await supabase
          .from("games")
          .update({ 
            status: "completed",
            winner_id: winner?.user_id || null 
          })
          .eq("id", game.id);
        
        await supabase
          .from("lobbies")
          .update({ status: "waiting" })
          .eq("id", id);
        
        toast.info("⏱️ Time's up! Game ended.");
      } catch (error) {
        console.error("Error ending game:", error);
        gameEndedRef.current = false;
      } finally {
        setLoading(false);
      }
    }
  }, [game, allPlayers, id, lobby, user]);

  // Back to lobby - only host cleans up DB to avoid multi-client race condition
  const backToLobby = useCallback(async () => {
    if (!id || !game) return;
    
    const isHostClient = lobby?.created_by === user?.id;
    
    // Navigate everyone immediately
    navigate(`/lobby/${id}`);
    
    // Only host cleans up game data
    if (isHostClient) {
      try {
        await supabase
          .from("player_hands")
          .delete()
          .eq("game_id", game.id);
        
        await supabase
          .from("games")
          .delete()
          .eq("id", game.id);
        
        await supabase
          .from("lobbies")
          .update({ status: "waiting" })
          .eq("id", id);
      } catch (error) {
        console.error("Error cleaning up game:", error);
      }
    }
  }, [id, game, navigate, lobby, user]);

  // Auto-restart countdown effect for completed games
  useEffect(() => {
    if (game?.status !== "completed") {
      setAutoRestartCountdown(20);
      // Reset game-ended guard when game restarts
      gameEndedRef.current = false;
      return;
    }
    
    countdownRef.current = setInterval(() => {
      setAutoRestartCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          backToLobby();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [game?.status, backToLobby]);

  // Fetch lobby data for host check and timer settings
  useEffect(() => {
    if (!id) return;
    
    const fetchLobby = async () => {
      const { data } = await supabase
        .from("lobbies")
        .select("id, created_by, turn_time_seconds, game_time_minutes")
        .eq("id", id)
        .single();
      
      if (data) {
        setLobby(data);
        // Initialize timers based on lobby settings
        setTurnTimeLeft(data.turn_time_seconds ?? 30);
        setGameTimeLeft((data.game_time_minutes ?? 30) * 60);
      }
    };
    
    fetchLobby();
  }, [id]);
  
  // Turn timer - single interval that counts down, resets on turn change
  useEffect(() => {
    if (!game || game.status === "completed") return;
    
    const turnUserId = game.current_turn_user_id;
    const turnSeconds = lobby?.turn_time_seconds ?? 30;
    
    // Reset turn timer and acted flag when the turn changes to a new player
    if (lastTurnUserRef.current !== turnUserId) {
      lastTurnUserRef.current = turnUserId;
      hasActedThisTurnRef.current = false;
      setTurnTimeLeft(turnSeconds);
    }
    
    // Clear old interval before starting new one
    if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    
    turnTimerRef.current = setInterval(() => {
      setTurnTimeLeft((prev) => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    };
  }, [game?.current_turn_user_id, game?.status, lobby?.turn_time_seconds]);

  // Auto-play when turn timer reaches 0 (only for current user's turn)
  useEffect(() => {
    if (!isMyTurn || game?.status === "completed" || loading) return;
    if (turnTimeLeft > 0) return;
    if (hasActedThisTurnRef.current) return;
    
    // Clear any pending timeout
    if (autoPlayTimeoutRef.current) clearTimeout(autoPlayTimeoutRef.current);
    
    autoPlayTimeoutRef.current = setTimeout(() => {
      toast.info("⏱️ Turn timed out - auto-playing...");
      autoPlay();
    }, 500);
    
    return () => {
      if (autoPlayTimeoutRef.current) clearTimeout(autoPlayTimeoutRef.current);
    };
  }, [turnTimeLeft, isMyTurn, game?.status, loading, autoPlay]);

  // Auto-play toggle - plays automatically when it's my turn
  useEffect(() => {
    if (!autoPlayEnabled || !isMyTurn || game?.status === "completed" || loading) return;
    if (hasActedThisTurnRef.current) return;
    
    const timeout = setTimeout(() => {
      autoPlay();
    }, 1000);
    
    return () => clearTimeout(timeout);
  }, [autoPlayEnabled, isMyTurn, game?.status, loading, autoPlay]);
  
  // Game timer - counts down overall game time. Only host triggers the end.
  useEffect(() => {
    if (!game || game.status === "completed") return;
    
    // Clear any previous game timer
    if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    
    gameTimerRef.current = setInterval(() => {
      setGameTimeLeft((prev) => {
        if (prev <= 1) {
          if (gameTimerRef.current) clearInterval(gameTimerRef.current);
          // Use refs to get latest lobby/user without stale closures
          const isHostClient = lobbyRef.current?.created_by === userRef.current?.id;
          if (isHostClient && !gameEndedRef.current) {
            gameEndedRef.current = true;
            // Defer to avoid calling state setter inside setState
            setTimeout(() => endGameWithRankings(), 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    };
  }, [game?.status]);

  const isHost = lobby?.created_by === user?.id;

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
    return (
      <>
        <GameRankingScreen
          players={allPlayers}
          winnerId={game.winner_id}
          gameEndReason={gameEndReason}
          autoRestartCountdown={autoRestartCountdown}
          onBackToLobby={backToLobby}
          loading={loading}
        />
        {/* In-game chat accessible on game over screen too */}
        {user && <InGameChat lobbyId={id!} userId={user.id} />}
      </>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header with Back button, Auto-play toggle, and Timers */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <Button variant="outline" size="sm" onClick={backToLobby} disabled={loading}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Lobby
          </Button>
          
          <div className="flex items-center gap-3">
            {/* Auto-play toggle */}
            <AutoPlayToggle
              enabled={autoPlayEnabled}
              onToggle={setAutoPlayEnabled}
            />
            
            {/* Timers */}
            <GameTimers
              turnTimeLeft={turnTimeLeft}
              turnTimeTotal={lobby?.turn_time_seconds ?? 30}
              gameTimeLeft={gameTimeLeft}
              isMyTurn={isMyTurn}
            />
          </div>
        </div>

        {/* Table Player Layout */}
        <TablePlayerLayout
          players={allPlayers}
          currentUserId={user?.id ?? ""}
          currentTurnUserId={game.current_turn_user_id}
          direction={game.direction}
          hostId={lobby?.created_by}
          autoPlayEnabled={autoPlayEnabled}
        />

        {/* Game Center */}
        <Card className="border-2 border-amber-900/50 bg-gradient-to-br from-emerald-900/30 to-emerald-800/20 shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-8">
              {/* Draw Pile */}
              <div className="text-center space-y-2">
                <div className="text-sm text-muted-foreground font-medium">Draw Pile</div>
                <Button
                  onClick={drawCard}
                  disabled={!isMyTurn || loading}
                  variant="outline"
                  className="w-20 h-28 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-600 hover:border-primary hover:scale-105 transition-all shadow-lg"
                >
                  <div className="text-center">
                    <div className="text-3xl">🎴</div>
                    <div className="text-sm font-bold text-primary">{game.deck.length}</div>
                  </div>
                </Button>
              </div>

              {/* Current Card */}
              <div className="text-center space-y-2">
                <div className="text-sm text-muted-foreground font-medium">Current Card</div>
                <div className="transform hover:scale-105 transition-transform">
                  <UnoCard card={game.current_card} size="lg" />
                </div>
                {game.current_color && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card/80 border border-border">
                    <div 
                      className={`w-4 h-4 rounded-full ${
                        game.current_color === 'red' ? 'bg-red-500' :
                        game.current_color === 'blue' ? 'bg-blue-500' :
                        game.current_color === 'green' ? 'bg-green-500' :
                        'bg-yellow-500'
                      }`}
                    />
                    <span className="text-xs font-medium capitalize">{game.current_color}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* My Hand */}
        <Card className="gradient-card border-border shadow-lg">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Your Hand
                <span className="text-sm font-normal text-muted-foreground">
                  ({myHand.cards.length} cards)
                </span>
              </CardTitle>
              {myHand.cards.length === 1 && !myHand.has_said_uno && (
                <Button onClick={sayUno} variant="outline" size="sm" className="text-yellow-500 border-yellow-500 hover:bg-yellow-500/10 animate-pulse">
                  Say UNO! 🔔
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 justify-center">
              {myHand.cards.map((card, index) => {
                const isPlayable = isMyTurn && !loading && canPlayCard(card, game.current_card, game.current_color);
                return (
                  <div
                    key={`${card}-${index}`}
                    className={`transform transition-all duration-200 ${
                      isPlayable ? "hover:-translate-y-3 hover:scale-110 cursor-pointer" : "opacity-60"
                    }`}
                  >
                    <UnoCard
                      card={card}
                      onClick={() => playCard(card)}
                      disabled={!isPlayable}
                      size="md"
                    />
                  </div>
                );
              })}
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
                className={`h-20 text-white font-bold text-lg shadow-lg hover:scale-105 transition-transform ${
                  color === 'red' ? 'bg-red-600 hover:bg-red-700' :
                  color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' :
                  color === 'green' ? 'bg-green-600 hover:bg-green-700' :
                  'bg-yellow-500 hover:bg-yellow-600 text-yellow-950'
                }`}
              >
                {color.toUpperCase()}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* In-game chat */}
      {user && <InGameChat lobbyId={id!} userId={user.id} />}
    </div>
  );
};

export default Game;
