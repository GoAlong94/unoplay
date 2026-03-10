import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Pause, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import { InGameChat } from "@/components/InGameChat";
import { GameTimers } from "@/components/GameTimers";
import { TablePlayerLayout } from "@/components/TablePlayerLayout";
import { GameRankingScreen } from "@/components/GameRankingScreen";
import { AutoPlayToggle } from "@/components/AutoPlayToggle";
import { PauseOverlay } from "@/components/PauseOverlay";
import { EmoticonThrower } from "@/components/EmoticonThrower";
import { QuickChat } from "@/components/QuickChat";
import { SoundToggle } from "@/components/SoundToggle";
import { SpectatorBanner } from "@/components/SpectatorBanner";
import { AnimatedCard, AnimatedDiscardCard, AnimatedDrawPile } from "@/components/AnimatedCard";
import { ActionLog } from "@/components/ActionLog";
import { CosmeticsDialog } from "@/components/CosmeticsDialog";
import { useGamePresence } from "@/hooks/use-game-presence";
import { canPlayCard, shuffle, stringToCard, type CardColor } from "@/lib/unoGame";
import { playCardSound, playDrawSound, playUnoSound, playTurnSound, playTimerWarning, playWinSound, playAttackSound, triggerHaptic } from "@/lib/sounds";
import type { GameRules } from "@/components/GameSettingsDialog";

// ── Types ──
interface GameStateRaw {
  id: string; lobby_id: string; status: string; current_card: string;
  current_color: string | null; direction: number; current_turn_user_id: string;
  deck: unknown; discard_pile: unknown; winner_id: string | null;
  paused_at: string | null; pause_duration_minutes: number | null; pause_ready_players: unknown;
}
interface GameState {
  id: string; lobby_id: string; status: string; current_card: string;
  current_color: string | null; direction: number; current_turn_user_id: string;
  deck: string[]; discard_pile: string[]; winner_id: string | null;
  paused_at: string | null; pause_duration_minutes: number | null; pause_ready_players: string[];
}
interface LobbyData { id: string; created_by: string; turn_time_seconds: number | null; game_time_minutes: number | null; game_rules: GameRules | null; }
interface PlayerHandRaw { id: string; user_id: string; cards: unknown; position: number; has_said_uno: boolean; profiles?: { username: string }; }
interface PlayerHand { id: string; user_id: string; cards: string[]; position: number; has_said_uno: boolean; profiles: { username: string }; }

const parseJsonArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
};
const normalizeGameState = (raw: GameStateRaw): GameState => ({
  ...raw, deck: parseJsonArray(raw.deck), discard_pile: parseJsonArray(raw.discard_pile), pause_ready_players: parseJsonArray(raw.pause_ready_players),
});
const normalizePlayerHand = (raw: PlayerHandRaw): PlayerHand => ({
  ...raw, cards: parseJsonArray(raw.cards), profiles: raw.profiles ?? { username: 'Player' },
});

const defaultRules: GameRules = {
  catch_uno_penalty: true, stacking: false, force_play: true, seven_zero_rule: false,
  jump_in: false, end_with_power_card: true, draw_penalty_skip: true,
};

// ── Scoring helper ──
const getCardPoints = (card: string): number => {
  const c = stringToCard(card);
  if (c.type === 'number') return c.value ?? 0;
  if (c.type === 'skip' || c.type === 'reverse' || c.type === 'draw2') return 20;
  return 50; // wild / wild_draw4
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
  const [isSpectator, setIsSpectator] = useState(false);
  const [showCosmetics, setShowCosmetics] = useState(false);
  const [roundScore, setRoundScore] = useState<number | null>(null);

  // Timers
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
  const afkTimeoutCountRef = useRef<Record<string, number>>({});

  const rules: GameRules = lobby?.game_rules ?? defaultRules;

  // ── Auth ──
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

  // Sound on turn change
  useEffect(() => {
    if (!game || !user || isSpectator) return;
    if (game.current_turn_user_id === user.id) { playTurnSound(); triggerHaptic("light"); }
  }, [game?.current_turn_user_id, user?.id, isSpectator]);

  // ── Game presence for connection indicators & bot takeover ──
  const handleAfkKick = useCallback(async (afkUserId: string) => {
    if (!game || !lobby) return;
    const isHost = lobby.created_by === user?.id;
    if (!isHost) return;
    toast.warning(`Player kicked for AFK`);
    // Just auto-play for them instead of actually removing
  }, [game, lobby, user]);

  const { onlinePlayerIds, isPlayerOnline, trackAfkTimeout, resetAfkCount } = useGamePresence({
    roomId: id,
    userId: user?.id,
    allPlayerIds: allPlayers.map(p => p.user_id),
    isMyTurn: game?.current_turn_user_id === user?.id,
    onBotPlay: () => {},
    onAfkKick: handleAfkKick,
  });

  // ── Init ──
  useEffect(() => {
    if (!id || !user) return;
    let gameChannel: any;
    let handsChannel: any;
    let mounted = true;

    const init = async () => {
      setInitError(null);
      const withTimeout = async <T,>(thenable: any, ms: number, label: string): Promise<T> => {
        const promise = new Promise<T>((resolve, reject) => thenable.then(resolve, reject));
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
        ]);
      };

      let gameData: any = null;
      try {
        const res = await withTimeout(
          supabase.from("games").select("*").eq("lobby_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          8000, "Load game"
        );
        gameData = (res as any).data;
        if ((res as any).error) { setInitError("Failed to load game state."); return; }
      } catch { setInitError("Network timeout while loading game."); return; }

      if (!mounted) return;
      if (!gameData) { toast.error("No game found"); navigate(`/lobby/${id}`); return; }

      setGame(normalizeGameState(gameData as GameStateRaw));
      const gameId = gameData.id as string;

      // Check if user is a spectator (not in player_hands)
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

      let retries = 15;
      let my: PlayerHand | null = await fetchMyHand();
      while (mounted && !my && retries-- > 0) {
        await new Promise(r => setTimeout(r, 500));
        my = await fetchMyHand();
      }

      if (!mounted) return;
      if (!my) {
        // User is a spectator
        setIsSpectator(true);
        setMyHand(null);
      } else {
        setMyHand(my);
      }

      const loadAllHands = async () => {
        const { data: handsJoined, error: joinedErr } = await supabase
          .from("player_hands").select("*, profiles(username)").eq("game_id", gameId).order("position");
        if (!mounted) return;
        if (!joinedErr && handsJoined) {
          const normalized = (handsJoined as PlayerHandRaw[]).map(normalizePlayerHand);
          setAllPlayers(normalized);
          if (!isSpectator) {
            const mine = normalized.find(h => h.user_id === user.id);
            if (mine) setMyHand(mine);
          }
          return;
        }
        const { data: handsRaw, error: rawErr } = await supabase
          .from("player_hands").select("*").eq("game_id", gameId).order("position");
        if (!mounted || rawErr || !handsRaw) return;
        const userIds = Array.from(new Set(handsRaw.map((h: any) => h.user_id)));
        const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", userIds);
        const usernameById = new Map((profiles ?? []).map((p: any) => [p.id, p.username]));
        const enriched = handsRaw.map((h: any) =>
          normalizePlayerHand({ ...h, profiles: { username: usernameById.get(h.user_id) ?? "Player" } })
        );
        setAllPlayers(enriched);
        if (!isSpectator) {
          const mine = enriched.find(h => h.user_id === user.id);
          if (mine) setMyHand(mine);
        }
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

  const isMyTurn = !isSpectator && game?.current_turn_user_id === user?.id;
  const isPaused = !!game?.paused_at;

  const autoPlayRef = useRef<() => Promise<void>>(async () => {});

  // ── Helper: safe deck ──
  const getSafeDeck = (deck: string[], discardPile: string[]): string[] => {
    if (deck.length > 0) return [...deck];
    if (discardPile.length <= 1) return [];
    return shuffle([...discardPile.slice(0, -1)]);
  };

  // ── Auto-play ──
  const autoPlay = useCallback(async () => {
    if (!game || !myHand || loading || hasActedThisTurnRef.current || isSpectator) return;
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
    if (myHand.cards.length === 2) {
      await supabase.from("player_hands").update({ has_said_uno: true }).eq("id", myHand.id);
    }
  }, [game, myHand, loading, isSpectator]);

  useEffect(() => { autoPlayRef.current = autoPlay; }, [autoPlay]);

  // ── Bot takeover for disconnected current-turn player ──
  useEffect(() => {
    if (!game || game.status !== "in_progress" || isPaused) return;
    const currentTurnUser = game.current_turn_user_id;
    const isHost = lobby?.created_by === user?.id;
    if (!isHost || currentTurnUser === user?.id) return;

    // If current turn player is offline, auto-play for them after 5s
    if (!isPlayerOnline(currentTurnUser)) {
      const timer = setTimeout(async () => {
        if (hasActedThisTurnRef.current) return;
        // Host forces a simple auto-play: draw a card for the disconnected player
        const playerHand = allPlayers.find(p => p.user_id === currentTurnUser);
        if (!playerHand || !game) return;

        let safeDeck = getSafeDeck([...game.deck], game.discard_pile);
        if (safeDeck.length > 0) {
          const drawn = safeDeck.pop()!;
          await supabase.from("player_hands").update({ cards: [...playerHand.cards, drawn] }).eq("id", playerHand.id);
        }

        // Advance turn
        const idx = allPlayers.findIndex(p => p.user_id === currentTurnUser);
        let next = idx + game.direction;
        if (next >= allPlayers.length) next = 0;
        if (next < 0) next = allPlayers.length - 1;
        await supabase.from("games").update({
          deck: safeDeck,
          current_turn_user_id: allPlayers[next].user_id,
        }).eq("id", game.id);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [game?.current_turn_user_id, onlinePlayerIds, game?.status, isPaused]);

  // ── Play card ──
  const playCard = async (card: string, chosenColor?: CardColor) => {
    if (!game || !myHand || !isMyTurn || loading || isPaused || isSpectator) return;

    const cardObj = stringToCard(card);
    const isWild = cardObj.type === "wild" || cardObj.type === "wild_draw4";

    if (isWild && !chosenColor) { setSelectedCard(card); setShowColorPicker(true); return; }
    if (!canPlayCard(card, game.current_card, game.current_color)) { toast.error("Can't play that card!"); return; }
    if (!rules.end_with_power_card && myHand.cards.length === 1 && cardObj.type !== "number") {
      toast.error("Can't end with a power card!"); return;
    }

    hasActedThisTurnRef.current = true;
    resetAfkCount(user!.id);
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
        if (allPlayers.length === 2) skipNext = true;
        else nextPlayerIndex = currentPlayerIndex + newDirection;
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

      if (cardObj.type === "draw2" || cardObj.type === "wild_draw4") {
        const drawCount = cardObj.type === "draw2" ? 2 : 4;
        const victimHand = allPlayers.find(p => p.user_id === nextPlayer.user_id);
        if (victimHand) {
          let safeDeck = getSafeDeck(deckForUpdate, game.discard_pile);
          const drawnCards: string[] = [];
          for (let i = 0; i < drawCount; i++) { if (safeDeck.length === 0) break; drawnCards.push(safeDeck.pop()!); }
          await supabase.from("player_hands").update({ cards: [...victimHand.cards, ...drawnCards] }).eq("id", victimHand.id);
          deckForUpdate = safeDeck;
          playAttackSound(); triggerHaptic("heavy");
        }
        if (rules.draw_penalty_skip) {
          let skipIdx = nextPlayerIndex + newDirection;
          if (skipIdx >= allPlayers.length) skipIdx = skipIdx % allPlayers.length;
          if (skipIdx < 0) skipIdx = ((skipIdx % allPlayers.length) + allPlayers.length) % allPlayers.length;
          nextPlayerIndex = skipIdx;
        }
      }

      const finalNextPlayer = allPlayers[nextPlayerIndex];

      const updateData: any = {
        current_card: card, current_color: isWild ? chosenColor : cardObj.color,
        direction: newDirection, current_turn_user_id: finalNextPlayer.user_id,
        discard_pile: [...game.discard_pile, card], deck: deckForUpdate,
      };

      if (playerWins) {
        // Calculate round score
        const score = allPlayers
          .filter(p => p.user_id !== user?.id)
          .reduce((sum, p) => sum + p.cards.reduce((s, c) => s + getCardPoints(c), 0), 0);
        setRoundScore(score);

        updateData.status = "completed";
        updateData.winner_id = user?.id;
        setGameEndReason("winner");
        await supabase.from("lobbies").update({ status: "waiting" }).eq("id", id);

        // Update stats
        try {
          const { data: existingStats } = await supabase.from("player_stats").select("*").eq("user_id", user!.id).maybeSingle();
          if (existingStats) {
            await supabase.from("player_stats").update({
              games_won: (existingStats.games_won || 0) + 1,
              games_played: (existingStats.games_played || 0) + 1,
            }).eq("user_id", user!.id);
          } else {
            await supabase.from("player_stats").insert({ user_id: user!.id, games_won: 1, games_played: 1 });
          }
          // Update other players' games_played
          for (const p of allPlayers.filter(pl => pl.user_id !== user!.id)) {
            const { data: ps } = await supabase.from("player_stats").select("*").eq("user_id", p.user_id).maybeSingle();
            if (ps) await supabase.from("player_stats").update({ games_played: (ps.games_played || 0) + 1 }).eq("user_id", p.user_id);
            else await supabase.from("player_stats").insert({ user_id: p.user_id, games_played: 1 });
          }
        } catch {}

        playWinSound(); triggerHaptic("heavy");
      }

      await supabase.from("games").update(updateData).eq("id", game.id);
      playCardSound(); setSelectedCard(null); setShowColorPicker(false);
      if (playerWins) toast.success("🎉 You won!");
    } catch (error: any) {
      console.error("Error playing card:", error);
      toast.error("Failed to play card");
    } finally { setLoading(false); }
  };

  // ── Draw card ──
  const drawCard = async () => {
    if (!game || !myHand || !isMyTurn || loading || isPaused || isSpectator) return;
    hasActedThisTurnRef.current = true;
    resetAfkCount(user!.id);
    setLoading(true);

    try {
      let newDeck = getSafeDeck(game.deck, game.discard_pile);
      if (newDeck.length === 0) {
        toast.error("No cards left to draw!");
        const currentPlayerIndex = allPlayers.findIndex(p => p.user_id === user?.id);
        let nextPlayerIndex = currentPlayerIndex + game.direction;
        if (nextPlayerIndex >= allPlayers.length) nextPlayerIndex = 0;
        if (nextPlayerIndex < 0) nextPlayerIndex = allPlayers.length - 1;
        await supabase.from("games").update({ current_turn_user_id: allPlayers[nextPlayerIndex].user_id }).eq("id", game.id);
        setLoading(false); return;
      }

      const drawnCard = newDeck.pop()!;
      const newHand = [...myHand.cards, drawnCard];
      await supabase.from("player_hands").update({ cards: newHand }).eq("id", myHand.id);

      const currentPlayerIndex = allPlayers.findIndex(p => p.user_id === user?.id);
      let nextPlayerIndex = currentPlayerIndex + game.direction;
      if (nextPlayerIndex >= allPlayers.length) nextPlayerIndex = 0;
      if (nextPlayerIndex < 0) nextPlayerIndex = allPlayers.length - 1;

      await supabase.from("games").update({
        deck: newDeck,
        discard_pile: game.deck.length === 0 ? [game.discard_pile[game.discard_pile.length - 1]] : game.discard_pile,
        current_turn_user_id: allPlayers[nextPlayerIndex].user_id
      }).eq("id", game.id);

      playDrawSound(); toast.success("Drew a card");
    } catch (error: any) {
      console.error("Error drawing card:", error);
      toast.error("Failed to draw card");
    } finally { setLoading(false); }
  };

  const sayUno = async () => {
    if (!myHand || myHand.cards.length !== 1 || isSpectator) return;
    await supabase.from("player_hands").update({ has_said_uno: true }).eq("id", myHand.id);
    playUnoSound(); toast.success("UNO!");
  };

  const catchPlayer = async (targetPlayer: PlayerHand) => {
    if (!game || !rules.catch_uno_penalty || isSpectator) return;
    if (targetPlayer.cards.length !== 1 || targetPlayer.has_said_uno) return;
    if (targetPlayer.user_id === user?.id) return;
    let safeDeck = getSafeDeck([...game.deck], game.discard_pile);
    const penaltyCards: string[] = [];
    for (let i = 0; i < 2; i++) { if (safeDeck.length === 0) break; penaltyCards.push(safeDeck.pop()!); }
    await supabase.from("player_hands").update({ cards: [...targetPlayer.cards, ...penaltyCards] }).eq("id", targetPlayer.id);
    await supabase.from("games").update({ deck: safeDeck }).eq("id", game.id);
    toast.success(`Caught ${targetPlayer.profiles.username}! +2 penalty cards`);
  };

  // ── Pause system ──
  const pauseGame = async () => {
    if (!game || !lobby || lobby.created_by !== user?.id) return;
    await supabase.from("games").update({ paused_at: new Date().toISOString(), pause_duration_minutes: parseInt(pauseDuration), pause_ready_players: [] }).eq("id", game.id);
    setShowPauseDialog(false); toast.info("Game paused");
  };

  const readyToResume = async () => {
    if (!game || !user) return;
    const currentReady = game.pause_ready_players || [];
    if (currentReady.includes(user.id)) return;
    await supabase.from("games").update({ pause_ready_players: [...currentReady, user.id] }).eq("id", game.id);
  };

  const resumeGame = async () => {
    if (!game) return;
    await supabase.from("games").update({ paused_at: null, pause_duration_minutes: null, pause_ready_players: [] }).eq("id", game.id);
  };

  const endGameWithRankings = useCallback(async () => {
    if (!game || game.status === "completed" || gameEndedRef.current) return;
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
      } catch { gameEndedRef.current = false; } finally { setLoading(false); }
    }
  }, [game, allPlayers, id]);

  const backToLobby = useCallback(async () => {
    if (!id || !game) return;
    const isHostClient = lobby?.created_by === user?.id;
    navigate(`/lobby/${id}`);
    if (isHostClient && game.status === "completed") {
      try {
        await supabase.from("player_hands").delete().eq("game_id", game.id);
        await supabase.from("games").delete().eq("id", game.id);
        await supabase.from("lobbies").update({ status: "waiting" }).eq("id", id);
      } catch {}
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
      if (data) { setLobby(data as any); setTurnTimeLeft(data.turn_time_seconds ?? 30); setGameTimeLeft((data.game_time_minutes ?? 30) * 60); }
    };
    fetchLobby();
  }, [id]);

  // ── Turn timer ──
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
            trackAfkTimeout(user!.id);
            setTimeout(() => { toast.info("⏱️ Turn timed out"); autoPlayRef.current(); }, 100);
          }
          return 0;
        }
        const next = prev - 1;
        if (next <= 5 && next > 0) playTimerWarning();
        if (next <= 0 && !hasActedThisTurnRef.current && isMyTurnRef.current) {
          hasActedThisTurnRef.current = true;
          trackAfkTimeout(user!.id);
          setTimeout(() => { toast.info("⏱️ Turn timed out"); autoPlayRef.current(); }, 200);
        }
        return next;
      });
    }, 1000);
    return () => { if (turnTimerRef.current) clearInterval(turnTimerRef.current); };
  }, [game?.current_turn_user_id, game?.status, lobby?.turn_time_seconds, isPaused]);

  // ── Auto-play toggle ──
  useEffect(() => {
    if (!autoPlayEnabled || !isMyTurn || game?.status === "completed" || loading || isPaused || isSpectator) return;
    if (hasActedThisTurnRef.current) return;
    const timeout = setTimeout(() => autoPlay(), 1000);
    return () => clearTimeout(timeout);
  }, [autoPlayEnabled, isMyTurn, game?.status, loading, autoPlay, isPaused, isSpectator]);

  // ── Game timer ──
  useEffect(() => {
    if (!game || game.status === "completed" || isPaused) return;
    if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    gameTimerRef.current = setInterval(() => {
      setGameTimeLeft(prev => {
        if (prev <= 1) {
          if (gameTimerRef.current) clearInterval(gameTimerRef.current);
          const isHostClient = lobbyRef.current?.created_by === userRef.current?.id;
          if (isHostClient && !gameEndedRef.current) { gameEndedRef.current = true; setTimeout(() => endGameWithRankings(), 0); }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (gameTimerRef.current) clearInterval(gameTimerRef.current); };
  }, [game?.status, isPaused]);

  const isHost = lobby?.created_by === user?.id;

  // ── Error / Loading states ──
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

  if (!game || (!myHand && !isSpectator)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🎮</div>
          <p className="text-muted-foreground">Loading game...</p>
        </div>
      </div>
    );
  }

  // ── Pause overlay ──
  if (isPaused && game.paused_at && game.pause_duration_minutes) {
    return (
      <>
        <PauseOverlay pausedAt={game.paused_at} pauseDurationMinutes={game.pause_duration_minutes}
          readyPlayers={game.pause_ready_players} allPlayerIds={allPlayers.map(p => p.user_id)}
          currentUserId={user?.id ?? ""} isHost={isHost} onReady={readyToResume} onResume={resumeGame} />
        {user && <InGameChat lobbyId={id!} userId={user.id} />}
      </>
    );
  }

  // ── Completed ──
  if (game.status === "completed") {
    return (
      <>
        <GameRankingScreen players={allPlayers} winnerId={game.winner_id} gameEndReason={gameEndReason}
          autoRestartCountdown={autoRestartCountdown} onBackToLobby={backToLobby} loading={loading}
          roundScore={roundScore} />
        {user && <InGameChat lobbyId={id!} userId={user.id} />}
      </>
    );
  }

  const catchablePlayers = !isSpectator && rules.catch_uno_penalty
    ? allPlayers.filter(p => p.user_id !== user?.id && p.cards.length === 1 && !p.has_said_uno) : [];

  // ── Main game UI (mobile-first, no-scroll) ──
  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-gradient-to-b from-background to-muted/20">
      {isSpectator && <SpectatorBanner onLeave={() => navigate(`/lobby/${id}`)} />}

      <div className="flex-1 flex flex-col gap-1 p-2 max-w-7xl mx-auto w-full" style={{ paddingTop: isSpectator ? '2.5rem' : undefined }}>
        {/* Header - compact */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={backToLobby} disabled={loading} className="h-8 px-2">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            {isHost && !isSpectator && (
              <Button variant="ghost" size="sm" onClick={() => setShowPauseDialog(true)} className="h-8 px-2">
                <Pause className="w-3 h-3" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setShowCosmetics(true)} className="h-8 px-2">
              <Sparkles className="w-3 h-3" />
            </Button>
            <SoundToggle />
            {!isSpectator && <AutoPlayToggle enabled={autoPlayEnabled} onToggle={setAutoPlayEnabled} />}
            <GameTimers turnTimeLeft={turnTimeLeft} turnTimeTotal={lobby?.turn_time_seconds ?? 30} gameTimeLeft={gameTimeLeft} isMyTurn={isMyTurn} />
          </div>
        </div>

        {/* Catch UNO */}
        {catchablePlayers.length > 0 && (
          <div className="flex items-center justify-center gap-2 flex-shrink-0">
            {catchablePlayers.map(p => (
              <Button key={p.id} size="sm" variant="destructive" onClick={() => catchPlayer(p)} className="animate-pulse text-xs h-7">
                <AlertTriangle className="w-3 h-3 mr-1" />Catch {p.profiles.username}!
              </Button>
            ))}
          </div>
        )}

        {/* Table - takes available space */}
        <div className="flex-1 flex items-center justify-center min-h-0">
          <TablePlayerLayout
            players={allPlayers}
            currentUserId={user?.id ?? ""}
            currentTurnUserId={game.current_turn_user_id}
            direction={game.direction}
            hostId={lobby?.created_by}
            autoPlayEnabled={autoPlayEnabled}
            onlinePlayerIds={onlinePlayerIds}
            isSpectator={isSpectator}
          />
        </div>

        {/* Game center - draw & discard */}
        <div className="flex-shrink-0 flex items-center justify-center gap-4 py-1">
          <div className="text-center">
            <AnimatedDrawPile onClick={drawCard} disabled={!isMyTurn || loading || isSpectator} deckSize={game.deck.length} />
          </div>
          <div className="text-center">
            <AnimatedDiscardCard card={game.current_card} />
            {game.current_color && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card/80 border border-border mt-1">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  game.current_color === 'red' ? 'bg-red-500' : game.current_color === 'blue' ? 'bg-blue-500' :
                  game.current_color === 'green' ? 'bg-green-500' : 'bg-yellow-500'
                }`} />
                <span className="text-xs font-medium capitalize">{game.current_color}</span>
              </div>
            )}
          </div>
        </div>

        {/* My Hand - compact, scrollable horizontally */}
        {!isSpectator && myHand && (
          <div className="flex-shrink-0 bg-card/50 rounded-xl border border-border p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-muted-foreground">Your Hand ({myHand.cards.length})</span>
              {myHand.cards.length === 1 && !myHand.has_said_uno && (
                <Button onClick={sayUno} variant="outline" size="sm" className="text-yellow-500 border-yellow-500 hover:bg-yellow-500/10 animate-pulse text-xs h-6 px-2">
                  UNO! 🔔
                </Button>
              )}
            </div>
            <div className="flex gap-0.5 overflow-x-auto pb-1 justify-center">
              <AnimatePresence mode="popLayout">
                {myHand.cards.map((card, index) => {
                  const isPlayable = isMyTurn && !loading && canPlayCard(card, game.current_card, game.current_color);
                  return (
                    <AnimatedCard
                      key={`${card}-${index}`}
                      card={card}
                      onClick={() => playCard(card)}
                      disabled={!isPlayable}
                      size="sm"
                      index={index}
                      total={myHand.cards.length}
                      isPlayable={isPlayable}
                    />
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* Color Picker Dialog */}
      <Dialog open={showColorPicker} onOpenChange={setShowColorPicker}>
        <DialogContent>
          <DialogHeader><DialogTitle>Choose a color</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {(['red', 'blue', 'green', 'yellow'] as CardColor[]).map(color => (
              <Button key={color} onClick={() => selectedCard && playCard(selectedCard, color)}
                className={`h-16 text-white font-bold text-lg shadow-lg hover:scale-105 transition-transform ${
                  color === 'red' ? 'bg-red-600 hover:bg-red-700' : color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' :
                  color === 'green' ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-500 hover:bg-yellow-600 text-yellow-950'
                }`}
              >{color.toUpperCase()}</Button>
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
            <Button onClick={pauseGame} className="w-full gradient-primary"><Pause className="w-4 h-4 mr-2" /> Pause Game</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cosmetics */}
      <CosmeticsDialog open={showCosmetics} onOpenChange={setShowCosmetics} />

      {/* Floating controls */}
      {user && (
        <>
          <EmoticonThrower lobbyId={id!} userId={user.id} />
          <QuickChat lobbyId={id!} userId={user.id} />
          <InGameChat lobbyId={id!} userId={user.id} />
          <ActionLog lobbyId={id!} />
        </>
      )}
    </div>
  );
};

export default Game;
