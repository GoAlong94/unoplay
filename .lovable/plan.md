

# Pending Features - Complete Audit & Implementation Plan

This is a massive list. I've categorized everything into what's **done**, what's **partially done**, and what's **not started**, then proposed a phased implementation approach.

---

## Status Audit: What's Done vs. What's Left

### DONE (Already Implemented)
- Basic game flow (deal, play, draw, win)
- Turn timer + game timer display
- Auto-play toggle (bot plays for you)
- Auto-play on turn timeout (timer hits 0, auto-plays)
- Game end on timeout with ranking screen
- Back to lobby + 20s auto-restart countdown
- In-game chat via floating button
- Table player layout with avatars, card counts, turn indicators
- Lobby: create/join, share via WhatsApp, copy code
- Host: kick/mute players, game settings (turn time, game time, double deck)
- Rejoin active game button in lobby
- 2nd match navigation fix

### PARTIALLY DONE (Needs Fixes/Completion)
- Draw 2 / Draw 4 penalty turn bug (victim draws but their turn is NOT skipped - needs fix)
- 2-player Reverse bug (doesn't act as Skip properly)
- Deck exhaustion crash (empty deck + empty discard = undefined card)
- Auto-play doesn't call sayUno() when leaving 1 card
- "Action Card First" bug (first card Skip/Reverse/Draw2 not handled)
- Ghost players in lobby (offline players not cleaned up before game start)

### NOT STARTED (Full Feature List)

**Core Gameplay & Rules (3 Settings Pages)**
1. Game Rules page - toggleable rules:
   - "Call UNO" catch penalty (other players can catch you)
   - Stacking +2/+4 cards
   - Force Play vs. Keep drawn card
   - 7-0 Rule (swap/rotate hands)
   - Jump-In Rule (play identical card out of turn)
   - End game with power card allowed or not
2. Game Logic page:
   - Change seat positions between games
3. Functionalities page:
   - All current toggles + future ones

**Pause System**
4. Host pause with duration input (up to 60 min)
5. All players "Ready" to resume, then 5s countdown

**Connectivity & State**
6. Bot takeover on disconnect (AI takes over seat)
7. Connection/latency indicators (Wi-Fi bars near avatars)
8. AFK/inactivity kick (2-3 timeouts in a row = kicked/replaced by bot)
9. Host migration (if host disconnects, next player becomes host)

**Social Features**
10. Friends system (add/delete friends, see online status, send/receive requests)
11. Invite online friends to game
12. Emoticons thrown at other players (max 10/min, displayed by avatar)
13. Quick chat phrases ("Hurry up!", "Good game!", "Oops!")
14. Mute specific players' emoticons
15. User profile images (upload custom or random default)
16. Player stats & history (games played, win rate, cards drawn, favorite color)
17. Leaderboards (global and friends-only, weekly/monthly)

**Audio & Haptic**
18. Sound effects (card play swoosh, ticking clock warning, UNO shout, dealing)
19. Mute sound toggle in UI
20. Haptic feedback (vibration on turn, +4 attack, win)

**Visual & UX**
21. Colorblind mode (symbols on card corners: square/circle/triangle/star)
22. Game UI overhaul - fit one screen on mobile, no scrolling
23. Card animations (smooth play/draw transitions)
24. Unlockable cosmetics (card deck skins, table backgrounds, emoticon packs)

**PWA & Branding**
25. Favicon update (user needs to provide an image)
26. manifest.json + Service Worker for full PWA (standalone mode, no URL bar)

**Game Mechanics Fixes**
27. Official Uno scoring (number=face value, action=20, wild=50, first to 500)
28. Spectator mode
29. Pre-select/queue cards before your turn
30. Action log/game history feed
31. "End Turn" / "Keep" button after drawing
32. Lobby size limits & deck scaling enforcement
33. Shareable lobby link/code improvement (4-digit code or short URL)

---

## Proposed Implementation - Phase 1 (This Session)

Given the sheer scope, I recommend we tackle the **most impactful items** that fix broken gameplay and add the most-requested features. Here is what I'll implement now:

### A. Fix All Critical Game Logic Bugs
1. **Draw 2/Draw 4 penalty turn skip** - After victim draws, skip their turn to the next player
2. **2-player Reverse acts as Skip** - Fix nextPlayerIndex calculation
3. **Deck exhaustion safety** - Handle empty deck+discard gracefully (declare draw or recycle)
4. **Auto-play says UNO** - Bot calls sayUno() when it plays down to 1 card
5. **First card action handling** - If first discard is Skip/Reverse/Draw2, apply its effect
6. **Ghost player filter** - Host filters out offline players before starting game

### B. Game UI Overhaul for Mobile
7. **Single-screen layout** - Redesign Game.tsx to fit everything in one viewport without scroll on mobile
8. **Compact table layout** - Smaller cards, tighter spacing, responsive positioning

### C. Pause System
9. **Host pause** - Add pause button, duration picker, pause overlay for all players
10. **Ready-up to resume** - All players click Ready, then 5s countdown
11. Database: Add `paused_at`, `pause_duration_minutes`, `pause_ready_players` columns to `games` table

### D. Favicon & PWA
12. **Favicon** - Need user to provide an image (will ask)
13. **manifest.json** - Add for standalone PWA mode

### E. Emoticons
14. **Throw emoticons** - Floating emoji reactions at other players, rate-limited to 10/min, displayed by avatar

### F. UNO Catch Penalty
15. **Catch button** - Other players can click "Catch!" if someone with 1 card hasn't said UNO

---

## Technical Details

### Database Changes Required
```sql
-- Add pause columns to games table
ALTER TABLE public.games ADD COLUMN paused_at timestamptz DEFAULT NULL;
ALTER TABLE public.games ADD COLUMN pause_duration_minutes integer DEFAULT NULL;
ALTER TABLE public.games ADD COLUMN pause_ready_players jsonb DEFAULT '[]'::jsonb;
```

### Files to Create
- `src/components/PauseOverlay.tsx` - Pause screen with timer and ready buttons
- `src/components/EmoticonThrower.tsx` - Emoticon selection and display
- `public/manifest.json` - PWA manifest

### Files to Modify
- `src/pages/Game.tsx` - Bug fixes, pause logic, emoticons, mobile layout, UNO catch
- `src/pages/Lobby.tsx` - Ghost player filter before game start
- `src/lib/unoGame.ts` - No changes needed
- `src/components/TablePlayerLayout.tsx` - Compact mobile layout, emoticon display area
- `src/components/GameTimers.tsx` - Compact for mobile
- `index.html` - Add manifest link, favicon

### Favicon Note
You mentioned wanting a favicon but haven't provided an image. Please upload a favicon image (PNG or ICO, ideally 512x512 for PWA) and I'll set it up. For now I'll create the PWA manifest structure pointing to the existing favicon.

### What's Deferred to Future Sessions
- Friends system (needs new DB tables, complex UI)
- User profile images (needs storage bucket setup)
- Sound effects & haptic feedback
- Leaderboards & player stats
- 3 settings pages (Rules/Logic/Functionalities)
- Cosmetics/unlockables system
- Spectator mode
- Colorblind mode
- Card animations
- Bot takeover on disconnect
- Host migration
- Official Uno scoring (500 points)
- Pre-select/queue cards
- Action log feed
- Connection indicators
- Quick chat phrases
