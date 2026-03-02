import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ArrowLeft, Trophy, Target, Palette, BarChart3, Medal } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface PlayerStats {
  user_id: string;
  games_played: number;
  games_won: number;
  cards_played: number;
  cards_drawn: number;
  uno_calls: number;
  favorite_color: string | null;
}

interface ProfileData {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface LeaderboardEntry {
  user_id: string;
  games_won: number;
  games_played: number;
  username?: string;
}

const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [tab, setTab] = useState<"stats" | "leaderboard">("stats");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
      else setUser(session.user);
    });
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    fetchProfile();
    fetchStats();
    fetchLeaderboard();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (data) setProfile(data);
  };

  const fetchStats = async () => {
    if (!user) return;
    const { data } = await supabase.from("player_stats").select("*").eq("user_id", user.id).maybeSingle();
    if (data) setStats(data);
    else {
      // Initialize stats
      await supabase.from("player_stats").insert({ user_id: user.id });
      setStats({
        user_id: user.id,
        games_played: 0,
        games_won: 0,
        cards_played: 0,
        cards_drawn: 0,
        uno_calls: 0,
        favorite_color: null,
      });
    }
  };

  const fetchLeaderboard = async () => {
    const { data } = await supabase
      .from("player_stats")
      .select("user_id, games_won, games_played")
      .order("games_won", { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      const userIds = data.map(d => d.user_id);
      const { data: profs } = await supabase.from("profiles").select("id, username").in("id", userIds);
      const nameMap = new Map((profs || []).map(p => [p.id, p.username]));
      setLeaderboard(data.map(d => ({ ...d, username: nameMap.get(d.user_id) || "Player" })));
    }
  };

  const winRate = stats && stats.games_played > 0
    ? Math.round((stats.games_won / stats.games_played) * 100)
    : 0;

  if (!user) return null;

  const colorEmoji: Record<string, string> = { red: "🔴", blue: "🔵", green: "🟢", yellow: "🟡" };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">{profile?.username || "Profile"}</h1>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2">
          <Button
            variant={tab === "stats" ? "default" : "outline"}
            onClick={() => setTab("stats")}
            className={tab === "stats" ? "gradient-primary" : ""}
          >
            <BarChart3 className="w-4 h-4 mr-1" /> My Stats
          </Button>
          <Button
            variant={tab === "leaderboard" ? "default" : "outline"}
            onClick={() => setTab("leaderboard")}
            className={tab === "leaderboard" ? "gradient-primary" : ""}
          >
            <Medal className="w-4 h-4 mr-1" /> Leaderboard
          </Button>
        </div>

        {tab === "stats" && stats && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="gradient-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-500" /> Win Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{winRate}%</div>
                <Progress value={winRate} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">{stats.games_won} wins / {stats.games_played} games</p>
              </CardContent>
            </Card>

            <Card className="gradient-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-secondary" /> Cards
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Played</span>
                    <span className="font-bold">{stats.cards_played}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Drawn</span>
                    <span className="font-bold">{stats.cards_drawn}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">UNO calls</span>
                    <span className="font-bold">{stats.uno_calls}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="gradient-card border-border sm:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Palette className="w-4 h-4 text-accent" /> Favorite Color
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.favorite_color ? (
                  <div className="text-2xl">
                    {colorEmoji[stats.favorite_color] || "🃏"} <span className="capitalize font-bold">{stats.favorite_color}</span>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Play some games to find out!</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "leaderboard" && (
          <Card className="gradient-card border-border">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Medal className="w-4 h-4 text-yellow-500" /> Global Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leaderboard.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No data yet. Play some games!</p>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((entry, i) => {
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
                    const isMe = entry.user_id === user?.id;
                    return (
                      <div
                        key={entry.user_id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          isMe ? "bg-primary/10 border-primary/30" : "bg-background/50 border-border"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg w-8">{medal}</span>
                          <span className="font-medium">{entry.username} {isMe && "(You)"}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-primary">{entry.games_won} wins</div>
                          <div className="text-xs text-muted-foreground">{entry.games_played} games</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Profile;
