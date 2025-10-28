import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Gamepad2, Plus, Users, LogOut } from "lucide-react";
import type { User } from "@supabase/supabase-js";

const Home = () => {
  const [user, setUser] = useState<User | null>(null);
  const [lobbyName, setLobbyName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const generateCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateLobby = async () => {
    if (!user || !lobbyName.trim()) return;
    
    setLoading(true);
    try {
      const code = generateCode();
      const { data, error } = await supabase
        .from("lobbies")
        .insert({
          name: lobbyName,
          code,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from("lobby_players").insert({
        lobby_id: data.id,
        user_id: user.id,
      });

      // Track analytics
      await supabase.from("analytics_events").insert({
        user_id: user.id,
        event_type: "lobby_created",
        metadata: { lobby_id: data.id },
      });

      toast.success("Lobby created!");
      navigate(`/lobby/${data.id}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinLobby = async () => {
    if (!user || !joinCode.trim()) return;

    setLoading(true);
    try {
      const { data: lobby, error } = await supabase
        .from("lobbies")
        .select("id")
        .eq("code", joinCode.toUpperCase())
        .single();

      if (error) throw error;

      // Check if already in lobby
      const { data: existing } = await supabase
        .from("lobby_players")
        .select("id")
        .eq("lobby_id", lobby.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing) {
        const { error: joinError } = await supabase
          .from("lobby_players")
          .insert({
            lobby_id: lobby.id,
            user_id: user.id,
          });

        if (joinError) throw joinError;
      }

      // Track analytics
      await supabase.from("analytics_events").insert({
        user_id: user.id,
        event_type: "lobby_joined",
        metadata: { lobby_id: lobby.id },
      });

      toast.success("Joined lobby!");
      navigate(`/lobby/${lobby.id}`);
    } catch (error: any) {
      toast.error("Invalid lobby code");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Gamepad2 className="w-10 h-10 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">GameLobby</h1>
              <p className="text-muted-foreground">Welcome back!</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="gradient-card border-border shadow-glow hover:shadow-[0_0_50px_hsl(263_70%_50%/0.4)] transition-smooth">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Create Lobby
              </CardTitle>
              <CardDescription>
                Start a new game and invite friends
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full gradient-primary">
                    Create New Lobby
                  </Button>
                </DialogTrigger>
                <DialogContent className="gradient-card border-border">
                  <DialogHeader>
                    <DialogTitle>Create New Lobby</DialogTitle>
                    <DialogDescription>
                      Give your lobby a name
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="Lobby name"
                      value={lobbyName}
                      onChange={(e) => setLobbyName(e.target.value)}
                      className="bg-background/50"
                    />
                    <Button
                      onClick={handleCreateLobby}
                      disabled={loading || !lobbyName.trim()}
                      className="w-full gradient-primary"
                    >
                      {loading ? "Creating..." : "Create"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card className="gradient-card border-border shadow-glow hover:shadow-[0_0_50px_hsl(217_91%_60%/0.4)] transition-smooth">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-secondary" />
                Join Lobby
              </CardTitle>
              <CardDescription>
                Enter a lobby code to join
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Enter lobby code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="bg-background/50"
              />
              <Button
                onClick={handleJoinLobby}
                disabled={loading || !joinCode.trim()}
                className="w-full bg-secondary hover:bg-secondary/90"
              >
                {loading ? "Joining..." : "Join Lobby"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Home;
