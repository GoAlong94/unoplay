import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, Users, Check, X, Search } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface FriendRow {
  id: string;
  user_id: string;
  friend_id: string;
  status: string;
  created_at: string;
}

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
}

const Friends = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
      else setUser(session.user);
    });
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    fetchFriends();
  }, [user]);

  const fetchFriends = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("friends")
      .select("*")
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

    if (data) {
      setFriends(data);
      const ids = new Set<string>();
      data.forEach(f => {
        ids.add(f.user_id);
        ids.add(f.friend_id);
      });
      ids.delete(user.id);
      if (ids.size > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", Array.from(ids));
        if (profs) {
          setProfiles(new Map(profs.map(p => [p.id, p])));
        }
      }
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim() || !user) return;
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .ilike("username", `%${searchQuery}%`)
      .neq("id", user.id)
      .limit(10);
    setSearchResults(data || []);
    setSearching(false);
  };

  const sendRequest = async (friendId: string) => {
    if (!user) return;
    const { error } = await supabase.from("friends").insert({
      user_id: user.id,
      friend_id: friendId,
      status: "pending",
    });
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Request already sent" : error.message);
    } else {
      toast.success("Friend request sent!");
      fetchFriends();
    }
  };

  const acceptRequest = async (friendRowId: string) => {
    await supabase.from("friends").update({ status: "accepted" }).eq("id", friendRowId);
    toast.success("Friend request accepted!");
    fetchFriends();
  };

  const removeFriend = async (friendRowId: string) => {
    await supabase.from("friends").delete().eq("id", friendRowId);
    toast.success("Removed");
    fetchFriends();
  };

  const getFriendId = (f: FriendRow) => f.user_id === user?.id ? f.friend_id : f.user_id;

  const accepted = friends.filter(f => f.status === "accepted");
  const incoming = friends.filter(f => f.status === "pending" && f.friend_id === user?.id);
  const outgoing = friends.filter(f => f.status === "pending" && f.user_id === user?.id);

  if (!user) return null;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Friends</h1>
        </div>

        {/* Search */}
        <Card className="gradient-card border-border">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="w-4 h-4" /> Find Players
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                className="bg-background/50"
              />
              <Button onClick={searchUsers} disabled={searching} className="gradient-primary">
                Search
              </Button>
            </div>
            {searchResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {searchResults.map(p => {
                  const alreadyFriend = friends.some(f => getFriendId(f) === p.id);
                  return (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border">
                      <span className="font-medium">{p.username}</span>
                      {alreadyFriend ? (
                        <span className="text-xs text-muted-foreground">Already added</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => sendRequest(p.id)}>
                          <UserPlus className="w-3 h-3 mr-1" /> Add
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Incoming Requests */}
        {incoming.length > 0 && (
          <Card className="gradient-card border-border">
            <CardHeader>
              <CardTitle className="text-sm">Pending Requests ({incoming.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {incoming.map(f => (
                <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border">
                  <span className="font-medium">{profiles.get(getFriendId(f))?.username || "Player"}</span>
                  <div className="flex gap-1">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => acceptRequest(f.id)}>
                      <Check className="w-3 h-3 text-accent" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => removeFriend(f.id)}>
                      <X className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Friends List */}
        <Card className="gradient-card border-border">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" /> Friends ({accepted.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {accepted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No friends yet. Search and add players above!</p>
            ) : (
              <div className="space-y-2">
                {accepted.map(f => {
                  const profile = profiles.get(getFriendId(f));
                  return (
                    <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border">
                      <span className="font-medium">{profile?.username || "Player"}</span>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeFriend(f.id)}>
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Outgoing */}
        {outgoing.length > 0 && (
          <Card className="gradient-card border-border">
            <CardHeader>
              <CardTitle className="text-sm">Sent Requests ({outgoing.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {outgoing.map(f => (
                <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border">
                  <span className="font-medium">{profiles.get(getFriendId(f))?.username || "Player"}</span>
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => removeFriend(f.id)}>
                    Cancel
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Friends;
