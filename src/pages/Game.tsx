import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Pause, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { UnoCard } from "@/components/UnoCard";
import { InGameChat } from "@/components/InGameChat";
import { GameTimers } from "@/components/GameTimers";
import { TablePlayerLayout } from "@/components/TablePlayerLayout";
import { GameRankingScreen } from "@/components/GameRankingScreen";
import { AutoPlayToggle } from "@/components/AutoPlayToggle";
import { PauseOverlay } from "@/components/PauseOverlay";
import { EmoticonThrower } from "@/components/EmoticonThrower";
import { QuickChat } from "@/components/QuickChat";
import { SoundToggle } from "@/components/SoundToggle";
import { canPlayCard, shuffle, cardToString, stringToCard, type CardColor } from "@/lib/unoGame";
import { playCardSound, playDrawSound, playUnoSound, playTurnSound, playTimerWarning, playWinSound, playAttackSound, triggerHaptic } from "@/lib/sounds";
import type { GameRules } from "@/components/GameSettingsDialog";

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
  paused_at: string | null;
  pause_duration_minutes: number | null;
  pause_ready_players: unknown;
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
  paused_at: string | null;
  pause_duration_minutes: number | null;
  pause_ready_players: string[];
}

interface LobbyData {
  id: string;
  created_by: string;
  turn_time_seconds: number | null;
  game_time_minutes: number | null;
  game_rules: GameRules | null;
}

interface PlayerHandRaw {
  id: string;
  user_id: string;
  cards: unknown;
  position: number;
  has_said_uno: boolean;
  profiles?: { username: string };
}

interface PlayerHand {
  id: string;
  user_id: string;
  cards: string[];
  position: number;
  has_said_uno: boolean;
  profiles: { username: string };
}

const parseJsonArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
};

const normalizeGameState = (raw: GameStateRaw): GameState => ({
  ...raw,
  deck: parseJsonArray(raw.deck),
  discard_pile: parseJsonArray(raw.discard_pile),
  pause_ready_players: parseJsonArray(raw.pause_ready_players),
});

const normalizePlayerHand = (raw: PlayerHandRaw): PlayerHand => ({
  ...raw,
  cards: parseJsonArray(raw.cards),
  profiles: raw.profiles ?? { username: 'Player' },
});

const defaultRules: GameRules = {
  catch_uno_penalty: true,
  stacking: false,
  force_play: true,
  seven_zero_rule: false,
  jump_in: false,
  end_with_power_card: true,
  draw_penalty_skip: true,
};

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
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [pauseDuration, setPauseDuration] = useState("5");
  
  // Timer states
  const [turnTimeLeft, setTurnTimeLeft] = useState(30);
  const [gameTimeLeft, setGameTimeLeft] = useState(30 * 60);
  const turnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTurnUserRef = useRef<string | null>(null);
  const hasActedThisTurnRef = useRef(false);
  const gameEndedRef = useRef(false);
  const lobbyRef = useRef<LobbyData | null>(null);
  const userRef = useRef<User | null>(null);
  const isMyTurnRef = useRef(false);
  const gameRef = useRef<GameState | null>(null);
  const myHandRef = useRef<PlayerHand | null>(null);
  const allPlayersRef = useRef<PlayerHand[]>([]);

  const rules: GameRules = lobby?.game_rules ?? defaultRules;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
      else { setUser(session.user); userRef.current = session.user; }
    });
  }, [navigate]);

  useEffect(() => { lobbyRef.current = lobby; }, [lobby]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { myHandRef.current = myHand; }, [myHand]);
  useEffect(() => { allPlayersRef.current = allPlayers; }, [allPlayers]);
  useEffect(() => { isMyTurnRef.current = game?.current_turn_user_id === user?.id; }, [game?.current_turn_user_id, user?.id]);

  // Play sound on turn change
  useEffect(() => {
    if (!game || !user) return;
    if (game.current_turn_user_id === user.id) {
      playTurnSound();
      triggerHaptic("light");
    }
  }, [game?.current_turn_user_id, user?.id]);

  useEffect(() => {
    if (!id || !user) return;
    let gameChannel: any;
    let handsChannel: any;
    let mounted = true;

    const init = async () => {
      setInitError(null);
      const toPromise = <T,>(thenable: any) => new Promise<T>((resolve, reject) => thenable.then(resolve, reject));
      const withTimeout = async <T,>(thenable: any, ms: number, label: string): Promise<T> => {
        const promise = toPromise<T>(thenable);
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
        ]);
      };

      let gameData: any = null;
      let gameError: any = null;
      try {
        const res = await withTimeout(
          supabase.from("games").select("*").eq("lobby_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          8000, "Load game"
        );
        gameData = (res as any).data;
        gameError = (res as any).error;
      } catch (e: any) {
        setInitError("Network timeout while loading game.");
        return;
      }

      if (!mounted) return;
      if (gameError) { setInitError("Failed to load game state."); return; }
      if (!gameData) { toast.error("No game found"); navigate(`/lobby/${id}`); return; }

      setGame(normalizeGameState(gameData as GameStateRaw));
      const gameId = gameData.id as string;

      const fetchMyHand = async () => {
        try {
          const res = await withTimeout(
            supabase.from("player_hands").select("*").eq("game_id", gameId).eq("user_id", user.id).maybeSingle(),
            8000, "Load your hand"
          );
          const my = (res as any).data;
          return my ? normalizePlayerHand(my as PlayerHandRaw) : null;
        } catch { return null; }
      };

      let retries = 20;
      let my: PlayerHand | null = await fetchMyHand();
      while (mounted && !my && retries-- > 0) {
        await new Promise(r => setTimeout(r, 500));
        my = await fetchMyHand();
      }

      if (!mounted) return;
      if (!my) { setInitError("Couldn't load your hand. Go back to lobby."); return; }
      setMyHand(my);

      const loadAllHands = async () => {
        const { data: handsJoined, error: joinedErr } = await supabase
          .from("player_hands").select("*, profiles(username)").eq("game_id", gameId).order("position");

        if (!mounted) return;
        if (!joinedErr && handsJoined) {
          const normalized = (handsJoined as PlayerHandRaw[]).map(normalizePlayerHand);
          setAllPlayers(normalized);
          const mine = normalized.find(h => h.user_id === user.id);
          if (mine) setMyHand(mine);
          return;
        }

        const { data: handsRaw, error: rawErr } = await supabase
          .from("player_hands").select("*").eq("game_id", gameId).order("position");
        if (!mounted) return;
        if (rawErr || !handsRaw) return;

        const userIds = Array.from(new Set(handsRaw.map((h: any) => h.user_id)));
        const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", userIds);
        const usernameById = new Map((profiles ?? []).map((p: any) => [p.id, p.username]));
        const enriched = handsRaw.map((h: any) =>
          normalizePlayerHand({ ...h, profiles: { username: usernameById.get(h.user_id) ?? "Player" } })
        );
        setAllPlayers(enriched);
        const mine = enriched.find(h => h.user_id === user.id);
        if (mine) setMyHand(mine);
      };

      await loadAllHands();

      gameChannel = supabase.channel(`game-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `lobby_id=eq.${id}` },
          (payload) => { if (mounted) setGame(normalizeGameState(payload.new as GameStateRaw)); })
        .subscribe();

      handsChannel = supabase.channel(`hands-${gameId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "player_hands", filter: `game_id=eq.${gameId}` },
          async () => { await loadAllHands(); })
        .subscribe();
    };

    init();
    return () => { mounted = false; if (gameChannel) supabase.removeChannel(gameChannel); if (handsChannel) supabase.removeChannel(handsChannel); };
  }, [id, user, navigate]);

  const isMyTurn = game?.current_turn_user_id === user?.id;
  const isPaused = !!game?.paused_at;

  const autoPlayRef = useRef<() => Promise<void>>(async () => {});

  const autoPlay = useCallback(async () => {
    if (!game || !myHand || loading || hasActedThisTurnRef.current) return;
    hasActedThisTurnRef.current = true;
    const playableCard = myHand.cards.find(card => canPlayCard(card, game.current_card, game.current_color));
    if (playableCard) {
      const cardObj = stringToCard(playableCard);
      const isWild = cardObj.type === "wild" || cardObj.type === "wild_draw4";
      if (isWild) {
        const colorCounts: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
        myHand.cards.forEach(c => { const co = stringToCard(c); if (co.color) colorCounts[co.color]++; });
        const bestColor = (Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'red') as CardColor;
        await playCard(playableCard, bestColor);
      } else {
        await playCard(playableCard);
      }
    } else {
      await drawCard();
    }
    // Auto-play says UNO when leaving 1 card
    if (myHand.cards.length === 2) {
      await supabase.from("player_hands").update({ has_said_uno: true }).eq("id", myHand.id);
    }
  }, [game, myHand, loading]);

  useEffect(() => { autoPlayRef.current = autoPlay; }, [autoPlay]);

  // Helper to get safe deck, reshuffling if needed
  const getSafeDeck = (deck: string[], discardPile: string[]): string[] => {
    if (deck.length > 0) return [...deck];
    if (discardPile.length <= 1) return []; // truly exhausted
    return shuffle([...discardPile.slice(0, -1)]);
  };

  const playCard = async (card: string, chosenColor?: CardColor) => {
    if (!game || !myHand || !isMyTurn || loading || isPaused) return;

    const cardObj = stringToCard(card);
    const isWild = cardObj.type === "wild" || cardObj.type === "wild_draw4";

    if (isWild && !chosenColor) {
      setSelectedCard(card);
      setShowColorPicker(true);
      return;
    }

    if (!canPlayCard(card, game.current_card, game.current_color)) {
      toast.error("You can't play that card!");
      return;
    }

    // Check end_with_power_card rule
    if (!rules.end_with_power_card && myHand.cards.length === 1 && cardObj.type !== "number") {
      toast.error("Can't end with a power card!");
      return;
    }

    hasActedThisTurnRef.current = true;
    setLoading(true);

    try {
      const newHand = myHand.cards.filter(c => c !== card);
      const playerWins = newHand.length === 0;
      const currentPlayerIndex = allPlayers.findIndex(p => p.user_id === user?.id);
      let nextPlayerIndex = currentPlayerIndex + game.direction;
      let newDirection = game.direction;
      let skipNext = false;

      if (cardObj.type === "reverse") {
        newDirection = -game.direction;
        if (allPlayers.length === 2) {
          skipNext = true; // 2-player reverse acts as skip
        } else {
          nextPlayerIndex = currentPlayerIndex + newDirection;
        }
      } else if (cardObj.type === "skip") {
        skipNext = true;
        nextPlayerIndex = currentPlayerIndex + (game.direction * 2);
      }

      if (nextPlayerIndex >= allPlayers.length) nextPlayerIndex = nextPlayerIndex % allPlayers.length;
      if (nextPlayerIndex < 0) nextPlayerIndex = ((nextPlayerIndex % allPlayers.length) + allPlayers.length) % allPlayers.length;

      const nextPlayer = allPlayers[nextPlayerIndex];

      await supabase.from("player_hands").update({
        cards: newHand,
        has_said_uno: newHand.length === 1 ? myHand.has_said_uno : false
      }).eq("id", myHand.id);

      let deckForUpdate = [...game.deck];

      // Handle draw2 and wild_draw4
      if (cardObj.type === "draw2" || cardObj.type === "wild_draw4") {
        const drawCount = cardObj.type === "draw2" ? 2 : 4;
        const victimHand = allPlayers.find(p => p.user_id === nextPlayer.user_id);
        
        if (victimHand) {
          let safeDeck = getSafeDeck(deckForUpdate, game.discard_pile);
          const drawnCards: string[] = [];
          
          for (let i = 0; i < drawCount; i++) {
            if (safeDeck.length === 0) break;
            drawnCards.push(safeDeck.pop()!);
          }
          
          await supabase.from("player_hands").update({ cards: [...victimHand.cards, ...drawnCards] }).eq("id", victimHand.id);
          deckForUpdate = safeDeck;

          playAttackSound();
          triggerHaptic("heavy");
        }

        // Draw penalty skip: skip victim's turn
        if (rules.draw_penalty_skip) {
          let skipIdx = nextPlayerIndex + newDirection;
          if (skipIdx >= allPlayers.length) skipIdx = skipIdx % allPlayers.length;
          if (skipIdx < 0) skipIdx = ((skipIdx % allPlayers.length) + allPlayers.length) % allPlayers.length;
          nextPlayerIndex = skipIdx;
        }
      }

      const finalNextPlayer = allPlayers[nextPlayerIndex];

      const updateData: any = {
        current_card: card,
        current_color: isWild ? chosenColor : cardObj.color,
        direction: newDirection,
        current_turn_user_id: finalNextPlayer.user_id,
        discard_pile: [...game.discard_pile, card],
        deck: deckForUpdate,
      };

      if (playerWins) {
        updateData.status = "completed";
        updateData.winner_id = user?.id;
        setGameEndReason("winner");
        await supabase.from("lobbies").update({ status: "waiting" }).eq("id", id);
        playWinSound();
        triggerHaptic("heavy");
      }

      await supabase.from("games").update(updateData).eq("id", game.id);

      playCardSound();
      setSelectedCard(null);
      setShowColorPicker(false);

      if (playerWins) toast.success("🎉 You won!");
    } catch (error: any) {
      console.error("Error playing card:", error);
      toast.error("Failed to play card");
    } finally {
      setLoading(false);
    }
  };

  const drawCard = async () => {
    if (!game || !myHand || !isMyTurn || loading || isPaused) return;
    hasActedThisTurnRef.current = true;
    setLoading(true);

    try {
      let newDeck = getSafeDeck(game.deck, game.discard_pile);
      
      if (newDeck.length === 0) {
        toast.error("No cards left to draw!");
        // Move to next player anyway
        const currentPlayerIndex = allPlayers.findIndex(p => p.user_id === user?.id);
        let nextPlayerIndex = currentPlayerIndex + game.direction;
        if (nextPlayerIndex >= allPlayers.length) nextPlayerIndex = 0;
        if (nextPlayerIndex < 0) nextPlayerIndex = allPlayers.length - 1;
        await supabase.from("games").update({ current_turn_user_id: allPlayers[nextPlayerIndex].user_id }).eq("id", game.id);
        setLoading(false);
        return;
      }

      const drawnCard = newDeck.pop()!;
      const newHand = [...myHand.cards, drawnCard];
      
      await supabase.from("player_hands").update({ cards: newHand }).eq("id", myHand.id);
      
      const currentPlayerIndex = allPlayers.findIndex(p => p.user_id === user?.id);
      let nextPlayerIndex = currentPlayerIndex + game.direction;
      if (nextPlayerIndex >= allPlayers.length) nextPlayerIndex = 0;
      if (nextPlayerIndex < 0) nextPlayerIndex = allPlayers.length - 1;
      
      // Force play rule: if drawn card is playable, auto-play it (or let player keep)
      // For now just move to next player
      await supabase.from("games").update({
        deck: newDeck,
        discard_pile: game.deck.length === 0 ? [game.discard_pile[game.discard_pile.length - 1]] : game.discard_pile,
        current_turn_user_id: allPlayers[nextPlayerIndex].user_id
      }).eq("id", game.id);
      
      playDrawSound();
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
    await supabase.from("player_hands").update({ has_said_uno: true }).eq("id", myHand.id);
    playUnoSound();
    toast.success("UNO!");
  };

  // UNO Catch: catch a player who has 1 card and hasn't said UNO
  const catchPlayer = async (targetPlayer: PlayerHand) => {
    if (!game || !rules.catch_uno_penalty) return;
    if (targetPlayer.cards.length !== 1 || targetPlayer.has_said_uno) return;
    if (targetPlayer.user_id === user?.id) return;

    // Give them 2 penalty cards
    let safeDeck = getSafeDeck([...game.deck], game.discard_pile);
    const penaltyCards: string[] = [];
    for (let i = 0; i < 2; i++) {
      if (safeDeck.length === 0) break;
      penaltyCards.push(safeDeck.pop()!);
    }

    await supabase.from("player_hands").update({ cards: [...targetPlayer.cards, ...penaltyCards] }).eq("id", targetPlayer.id);
    await supabase.from("games").update({ deck: safeDeck }).eq("id", game.id);
    toast.success(`Caught ${targetPlayer.profiles.username}! +2 penalty cards`);
  };

  // Pause system
  const pauseGame = async () => {
    if (!game || !lobby || lobby.created_by !== user?.id) return;
    const duration = parseInt(pauseDuration);
    await supabase.from("games").update({
      paused_at: new Date().toISOString(),
      pause_duration_minutes: duration,
      pause_ready_players: [],
    }).eq("id", game.id);
    setShowPauseDialog(false);
    toast.info("Game paused");
  };

  const readyToResume = async () => {
    if (!game || !user) return;
    const currentReady = game.pause_ready_players || [];
    if (currentReady.includes(user.id)) return;
    await supabase.from("games").update({
      pause_ready_players: [...currentReady, user.id],
    }).eq("id", game.id);
  };

  const resumeGame = async () => {
    if (!game) return;
    await supabase.from("games").update({
      paused_at: null,
      pause_duration_minutes: null,
      pause_ready_players: [],
    }).eq("id", game.id);
  };

  const endGameWithRankings = useCallback(async () => {
    if (!game || game.status === "completed") return;
    if (gameEndedRef.current) return;
    const isHostClient = lobbyRef.current?.created_by === userRef.current?.id;
    setGameEndReason("timeout");
    if (isHostClient) {
      gameEndedRef.current = true;
      setLoading(true);
      try {
        const sortedPlayers = [...allPlayers].sort((a, b) => a.cards.length - b.cards.length);
        const winner = sortedPlayers[0];
        await supabase.from("games").update({ status: "completed", winner_id: winner?.user_id || null }).eq("id", game.id);
        await supabase.from("lobbies").update({ status: "waiting" }).eq("id", id);
        toast.info("⏱️ Time's up!");
      } catch (error) {
        console.error("Error ending game:", error);
        gameEndedRef.current = false;
      } finally {
        setLoading(false);
      }
    }
  }, [game, allPlayers, id]);

  const backToLobby = useCallback(async () => {
    if (!id || !game) return;
    const isHostClient = lobby?.created_by === user?.id;
    if (game.status === "in_progress") { navigate(`/lobby/${id}`); return; }
    navigate(`/lobby/${id}`);
    if (isHostClient) {
      try {
        await supabase.from("player_hands").delete().eq("game_id", game.id);
        await supabase.from("games").delete().eq("id", game.id);
        await supabase.from("lobbies").update({ status: "waiting" }).eq("id", id);
      } catch (error) { console.error("Error cleaning up:", error); }
    }
  }, [id, game, navigate, lobby, user]);

  useEffect(() => {
    if (game?.status !== "completed") { setAutoRestartCountdown(20); gameEndedRef.current = false; return; }
    countdownRef.current = setInterval(() => {
      setAutoRestartCountdown(prev => {
        if (prev <= 1) { if (countdownRef.current) clearInterval(countdownRef.current); backToLobby(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [game?.status, backToLobby]);

  useEffect(() => {
    if (!id) return;
    const fetchLobby = async () => {
      const { data } = await supabase.from("lobbies").select("id, created_by, turn_time_seconds, game_time_minutes, game_rules").eq("id", id).single();
      if (data) {
        setLobby(data as any);
        setTurnTimeLeft(data.turn_time_seconds ?? 30);
        setGameTimeLeft((data.game_time_minutes ?? 30) * 60);
      }
    };
    fetchLobby();
  }, [id]);

  // Turn timer
  useEffect(() => {
    if (!game || game.status === "completed" || isPaused) return;
    const turnUserId = game.current_turn_user_id;
    const turnSeconds = lobby?.turn_time_seconds ?? 30;
    if (lastTurnUserRef.current !== turnUserId) {
      lastTurnUserRef.current = turnUserId;
      hasActedThisTurnRef.current = false;
      setTurnTimeLeft(turnSeconds);
    }
    if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    turnTimerRef.current = setInterval(() => {
      setTurnTimeLeft(prev => {
        if (prev <= 0) {
          if (!hasActedThisTurnRef.current && isMyTurnRef.current) {
            hasActedThisTurnRef.current = true;
            setTimeout(() => { toast.info("⏱️ Turn timed out - auto-playing..."); autoPlayRef.current(); }, 100);
          }
          return 0;
        }
        const next = prev - 1;
        if (next <= 5 && next > 0) playTimerWarning();
        if (next <= 0 && !hasActedThisTurnRef.current && isMyTurnRef.current) {
          hasActedThisTurnRef.current = true;
          setTimeout(() => { toast.info("⏱️ Turn timed out - auto-playing..."); autoPlayRef.current(); }, 200);
        }
        return next;
      });
    }, 1000);
    return () => { if (turnTimerRef.current) clearInterval(turnTimerRef.current); };
  }, [game?.current_turn_user_id, game?.status, lobby?.turn_time_seconds, isPaused]);

  // Auto-play toggle
  useEffect(() => {
    if (!autoPlayEnabled || !isMyTurn || game?.status === "completed" || loading || isPaused) return;
    if (hasActedThisTurnRef.current) return;
    const timeout = setTimeout(() => autoPlay(), 1000);
    return () => clearTimeout(timeout);
  }, [autoPlayEnabled, isMyTurn, game?.status, loading, autoPlay, isPaused]);

  // Game timer
  useEffect(() => {
    if (!game || game.status === "completed" || isPaused) return;
    if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    gameTimerRef.current = setInterval(() => {
      setGameTimeLeft(prev => {
        if (prev <= 1) {
          if (gameTimerRef.current) clearInterval(gameTimerRef.current);
          const isHostClient = lobbyRef.current?.created_by === userRef.current?.id;
          if (isHostClient && !gameEndedRef.current) {
            gameEndedRef.current = true;
            setTimeout(() => endGameWithRankings(), 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (gameTimerRef.current) clearInterval(gameTimerRef.current); };
  }, [game?.status, isPaused]);

  const isHost = lobby?.created_by === user?.id;

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="gradient-card border-border max-w-md w-full">
          <CardHeader><CardTitle>Couldn't load game</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{initError}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(`/lobby/${id}`)}>Back to Lobby</Button>
              <Button onClick={() => window.location.reload()} className="gradient-primary">Retry</Button>
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

  // Pause overlay
  if (isPaused && game.paused_at && game.pause_duration_minutes) {
    return (
      <>
        <PauseOverlay
          pausedAt={game.paused_at}
          pauseDurationMinutes={game.pause_duration_minutes}
          readyPlayers={game.pause_ready_players}
          allPlayerIds={allPlayers.map(p => p.user_id)}
          currentUserId={user?.id ?? ""}
          isHost={isHost}
          onReady={readyToResume}
          onResume={resumeGame}
        />
        {user && <InGameChat lobbyId={id!} userId={user.id} />}
      </>
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
        {user && <InGameChat lobbyId={id!} userId={user.id} />}
      </>
    );
  }

  // Find catchable players (have 1 card, haven't said UNO)
  const catchablePlayers = rules.catch_uno_penalty
    ? allPlayers.filter(p => p.user_id !== user?.id && p.cards.length === 1 && !p.has_said_uno)
    : [];

  return (
    <div className="min-h-screen flex flex-col p-2 md:p-4 bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-7xl mx-auto flex flex-col flex-1 gap-2 w-full">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={backToLobby} disabled={loading}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            {isHost && (
              <Button variant="outline" size="sm" onClick={() => setShowPauseDialog(true)}>
                <Pause className="w-4 h-4 mr-1" />
                Pause
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <SoundToggle />
            <AutoPlayToggle enabled={autoPlayEnabled} onToggle={setAutoPlayEnabled} />
            <GameTimers
              turnTimeLeft={turnTimeLeft}
              turnTimeTotal={lobby?.turn_time_seconds ?? 30}
              gameTimeLeft={gameTimeLeft}
              isMyTurn={isMyTurn}
            />
          </div>
        </div>

        {/* Catch UNO alert */}
        {catchablePlayers.length > 0 && (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {catchablePlayers.map(p => (
              <Button
                key={p.id}
                size="sm"
                variant="destructive"
                onClick={() => catchPlayer(p)}
                className="animate-pulse"
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                Catch {p.profiles.username}!
              </Button>
            ))}
          </div>
        )}

        {/* Table */}
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
          <CardContent className="p-4">
            <div className="flex items-center justify-center gap-6">
              <div className="text-center space-y-1">
                <div className="text-xs text-muted-foreground font-medium">Draw</div>
                <Button
                  onClick={drawCard}
                  disabled={!isMyTurn || loading}
                  variant="outline"
                  className="w-16 h-24 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-600 hover:border-primary hover:scale-105 transition-all shadow-lg"
                >
                  <div className="text-center">
                    <div className="text-2xl">🎴</div>
                    <div className="text-xs font-bold text-primary">{game.deck.length}</div>
                  </div>
                </Button>
              </div>

              <div className="text-center space-y-1">
                <div className="text-xs text-muted-foreground font-medium">Current</div>
                <div className="transform hover:scale-105 transition-transform">
                  <UnoCard card={game.current_card} size="md" />
                </div>
                {game.current_color && (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card/80 border border-border">
                    <div className={`w-3 h-3 rounded-full ${
                      game.current_color === 'red' ? 'bg-red-500' :
                      game.current_color === 'blue' ? 'bg-blue-500' :
                      game.current_color === 'green' ? 'bg-green-500' : 'bg-yellow-500'
                    }`} />
                    <span className="text-xs font-medium capitalize">{game.current_color}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* My Hand */}
        <Card className="gradient-card border-border shadow-lg">
          <CardHeader className="pb-1 pt-2 px-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1">
                Your Hand
                <span className="text-xs font-normal text-muted-foreground">({myHand.cards.length})</span>
              </CardTitle>
              {myHand.cards.length === 1 && !myHand.has_said_uno && (
                <Button onClick={sayUno} variant="outline" size="sm" className="text-yellow-500 border-yellow-500 hover:bg-yellow-500/10 animate-pulse text-xs px-2 py-1">
                  Say UNO! 🔔
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="flex flex-wrap gap-1 justify-center">
              {myHand.cards.map((card, index) => {
                const isPlayable = isMyTurn && !loading && canPlayCard(card, game.current_card, game.current_color);
                return (
                  <div
                    key={`${card}-${index}`}
                    className={`transform transition-all duration-200 ${
                      isPlayable ? "hover:-translate-y-2 hover:scale-105 cursor-pointer" : "opacity-60"
                    }`}
                  >
                    <UnoCard card={card} onClick={() => playCard(card)} disabled={!isPlayable} size="sm" />
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
          <DialogHeader><DialogTitle>Choose a color</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {(['red', 'blue', 'green', 'yellow'] as CardColor[]).map(color => (
              <Button
                key={color}
                onClick={() => selectedCard && playCard(selectedCard, color)}
                className={`h-16 text-white font-bold text-lg shadow-lg hover:scale-105 transition-transform ${
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

      {/* Pause Dialog */}
      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Pause Game</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={pauseDuration} onValueChange={setPauseDuration}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="10">10 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={pauseGame} className="w-full gradient-primary">
              <Pause className="w-4 h-4 mr-2" /> Pause Game
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Emoticons & Quick Chat & In-game chat */}
      {user && (
        <>
          <EmoticonThrower lobbyId={id!} userId={user.id} />
          <QuickChat lobbyId={id!} userId={user.id} />
          <InGameChat lobbyId={id!} userId={user.id} />
        </>
      )}
    </div>
  );
};

export default Game;
