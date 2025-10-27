import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import type { User } from "@supabase/supabase-js";

const Game = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <Button variant="outline" onClick={() => navigate(`/lobby/${id}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Lobby
        </Button>

        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold gradient-primary bg-clip-text text-transparent">
            Game In Progress
          </h1>
          <p className="text-muted-foreground">Game functionality coming soon!</p>
        </div>

        <Card className="gradient-card border-border shadow-glow">
          <CardHeader>
            <CardTitle>Game Area</CardTitle>
          </CardHeader>
          <CardContent className="min-h-[400px] flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-6xl">🎮</div>
              <p className="text-muted-foreground">
                This is where your game will be played!
              </p>
              <p className="text-sm text-muted-foreground">
                Add your game logic, UI, and mechanics here
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Game;
