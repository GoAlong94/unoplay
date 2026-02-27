

# Pending Features - Implementation Progress

## ✅ COMPLETED (This Session)

### Phase 1: Game Logic Fixes + Settings
1. ✅ **3 Settings Pages** (Rules/Logic/Functionalities) - Tabs in GameSettingsDialog
2. ✅ **UNO Catch Penalty** - Catch button appears when opponent has 1 card without saying UNO
3. ✅ **Draw 2/4 Penalty Skip** - Victim's turn is skipped after drawing penalty cards
4. ✅ **2-Player Reverse = Skip** - Fixed in playCard logic
5. ✅ **Deck Exhaustion Safety** - getSafeDeck() reshuffles discard pile, handles truly empty deck
6. ✅ **Auto-play Says UNO** - Bot calls has_said_uno when playing down to 1 card
7. ✅ **First Card Action Handling** - Skip/Reverse/Draw2 effects applied on first card in Lobby.tsx
8. ✅ **End with Power Card Rule** - Toggleable in settings
9. ✅ **Stacking Rule** - Toggle added (logic enforcement deferred)
10. ✅ **Force Play Rule** - Toggle added (logic enforcement deferred)
11. ✅ **7-0 Rule** - Toggle added (logic enforcement deferred)
12. ✅ **Jump-In Rule** - Toggle added (logic enforcement deferred)
13. ✅ **Shuffle Seats** - Randomize player order on game start

### Phase 2: Pause + Connectivity + PWA
14. ✅ **Host Pause System** - Pause button, duration picker (5-60 min), pause overlay
15. ✅ **Ready-up to Resume** - All players click Ready, 5s countdown
16. ✅ **Favicon** - UNO card icon set as favicon
17. ✅ **PWA Manifest** - manifest.json for standalone mode
18. ✅ **Emoticons** - Floating emoji reactions, rate-limited 10/min, broadcast via realtime
19. ✅ **Quick Chat Phrases** - 8 preset phrases sent to game chat
20. ✅ **Sound Effects** - Card play, draw, UNO shout, timer warning, win, attack sounds via Web Audio API
21. ✅ **Sound Mute Toggle** - In-game sound toggle button
22. ✅ **Haptic Feedback** - Vibration on turn, +4 attack, win

### Database Changes
- Added `game_rules` jsonb to `lobbies`
- Added `paused_at`, `pause_duration_minutes`, `pause_ready_players` to `games`
- Created `friends` table with RLS
- Created `player_stats` table with RLS
- Created `avatars` storage bucket with RLS

---

## 🔲 REMAINING (Future Sessions)

### Social Features
- Friends system UI (add/delete, online status, send/receive requests)
- Invite online friends to game
- Mute specific players' emoticons
- User profile images (upload/default)
- Player stats & history page
- Leaderboards (global and friends-only)

### Connectivity & State
- Bot takeover on disconnect
- Connection/latency indicators
- AFK/inactivity kick
- Host migration

### Visual & UX
- Colorblind mode (symbols on card corners)
- Game UI overhaul (single-screen mobile, no scrolling)
- Card animations (framer-motion transitions)
- Unlockable cosmetics

### Game Mechanics
- Official UNO scoring (face value system, first to 500)
- Spectator mode
- Pre-select/queue cards
- Action log/game history feed
- "Keep" button after drawing (force play logic)
- Lobby size limits & deck scaling
- Shareable lobby link improvement

### Rule Logic Enforcement (toggles exist, game logic needs implementation)
- Stacking +2/+4 chains
- Force Play drawn card
- 7-0 Rule (swap/rotate hands)
- Jump-In Rule (identical card out of turn)
