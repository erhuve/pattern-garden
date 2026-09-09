This file provides guidance when working with code in this repository. The README.md should ALWAYS serve as an accurate, comprehensive piece of documentation for this project. It should describe the broader goals and purpose of this repository along with the technical implementation details. If any aspect of the project changes, the README.md should be updated to reflect that.

# Project Notes

## Pattern Garden

A browser puzzle game built on Christopher Alexander's *A Pattern Language* (1977). Every level is one of the book's 253 patterns. The player is given a small isometric room (or plot) and a limited palette of pieces — windows, doors, alcoves, seats, tables, plants, trees, path stones, gates, hearths — and arranges them until the pattern is "fulfilled" at 100%.

Design decisions agreed with Miku (Sept 2026):

- **Web only.** Vite + React SVG isometric renderer. No 3D engine.
- **Hybrid feel.** Charming miniature places, but governed by legible, deterministic puzzle rules.
- **Scoring is rule-based; inhabitants are the payoff.** Each level defines explicit weighted checks (e.g. "windows on two different sides", "the path changes direction"). Score = weighted ratio of checks passed, but 100% is reserved for layouts where every check has a full ratio so rounding can never trigger a false completion. Light on Two Sides requires both supplied seats to receive cross-light from windows on two different walls before it can reach 100%. Palette counts are inventory limits, not requirements; spare pieces may remain unused. Tiny inhabitants wander the room and gravitate toward the cells the pattern marks as *attractors*; when they arrive they become "content" (music note). They never affect score.
- **Handful of quality levels first.** Thirteen patterns are playable: the original five (159 Light on Two Sides of Every Room, 112 Entrance Transition, 180 Window Place, 179 Alcoves, 185 Sitting Circle), plus 242 Front Door Bench, 171 Tree Places, 163 Outdoor Room, 183 Workspace Enclosure, 192 Windows Overlooking Life, 182 Eating Atmosphere, 176 Garden Seat and 174 Trellised Walk. All 253 patterns appear on the home page; unbuilt ones are locked. New levels explicitly distinguish the book's ideas from the exact tile-based puzzle interpretation in About.

### Structure

- `src/data/apl.json` — all 253 patterns (number, title, section, subsection, stars) plus the 1858 cross-reference edges. Derived from BeksOmega/pattern-language-graph GraphML; two duplicate numbers in the source (73→75 The Family, 201→211 Thickening the Outer Walls) were corrected by hand.
- `src/game/types.ts` — `Piece` (wall pieces live on a room side+pos; cell pieces live on a grid cell), `Layout`, `Level`, `Check`.
- `src/game/levels.ts` — the original five levels and combined thirteen-level registry. `expanded-levels.ts` and `living-levels.ts` each hold four additions, with paraphrased context, explicit puzzle adaptations, palette limits and `evaluate(layout)` returning checks + attractors. `evaluate(level, layout)` computes the 0–100 score.
- `src/game/geometry.ts` — grid helpers, `placeAt` / `removeAt` with placement rules (indoor vs outdoor pieces, wall vs floor, occupancy). Alcoves extend the room by one usable recessed floor cell; attached furniture is removed with the alcove.
- `src/game/inhabitants.ts` — spawn / retarget / step for the little people. Blocking furniture is not walkable.
- `src/game/Board.tsx` — SVG isometric renderer. Back walls full height, front walls knee-high so the interior stays visible. Hit targets carry `data-cell="x,y"` and `data-wall="<side><pos>"` for testing.
- `src/game/CompletionCelebration.tsx` + `completion-celebration.css` — transient, non-blocking board celebration on completion, with reduced-motion support.
- `src/game/progress.ts` — versioned localStorage best score + last layout per level (`pattern-garden:v1`), including one-time layout migrations.
- `src/pages/home.tsx` — level list and the full 253-pattern index by section.
- `src/pages/play.tsx` — the play screen: board, palette, score ring, checklist, book excerpt, celebration + next.
- Styling is hand-written CSS under the `pg-` prefix at the bottom of `src/styles.css`; fonts are Fraunces + IBM Plex Mono loaded from `index.html`.

### Adding a level

Add a `Level` object to a level module and include it in `LEVELS` (`expanded-levels.ts` exports the four additions). Give every check clear pass/fail detail and a known-good layout built legally through `placeAt`. Verify removal, obstruction, order independence, shared-candidate matching and current score vs historical best. Test desktop/phone placement, completion, reload, reset and criterion explanations. Preserve existing patterns, saved coordinates and historical best scores.

### Four additional places

- **Front Door Bench (242):** a bench on the entrance facade, off the threshold, a bench actually facing the visible south street with a clear view, a continuous stone path from the doorstep to a garden tile directly beside the road, and a planted private edge. The road is already walkable: it connects by cardinal adjacency without a stone on top. Gaps, diagonal-only links and blocked road entry tiles do not count. Existing stones on the road remain optional and removable; saved pieces, inventory limits and historical best scores are unchanged. All checks concern the same bench and door.
- **Tree Places (171):** the grove variant: at least three trees around one usable clearing, two benches sharing that clearing and simplified canopy shade, with a connected walk from the plot edge to both. A disconnected pair of groves cannot combine their scores. Paths and plants are optional.
- **Outdoor Room (163):** a table-centered 5×5 hedge footprint, three complete sides, at least two seats in the 3×3 interior, and an accessible entrance joining every seat to the same free-floor component. Closing all four sides fails. Exact dimensions are game rules, not architectural doctrine. The hedge detail reports complete sides against the required frame; a larger 6×6 U is not silently treated as a 5×5 room. A regression reproduces the reported 77% layout and verifies a 13-hedge correction without moving its table or chairs.
- **Workspace Enclosure (183):** a desk/chair pair with a protected back and side, two free forward tiles opening into common space, a real visible front/side window, and circulation from the door. Windows contribute half enclosure but never count as walking openings. Rotation remains decorative.

`expanded-solutions.ts` supplies tested example layouts, not automatic player solutions. `place-rules.ts` provides strict cardinal flood-fill without inventing blocked endpoints. New pieces are a one-cell slatted bench (four orientations), a symmetric desk with notebook, and a low leafy hedge. `NewPieceGlyph.tsx`, `new-pieces.css` and `DirectionalGlyph.tsx` contain their artwork; all use existing theme colors and no new dependencies.

`Level`/`Layout.setting = "garden"` removes the building walls and indoor floor without faking a giant room. `outdoorFurniture` permits seats/tables outdoors only in the added outdoor levels. `street` marks the entrance puzzle's south edge. These options must be propagated with the layout; legacy levels omit them. Shared placement enforces inventory, surface and occupancy rules. Floor and sill plants still share inventory.

The four added levels set `obstacleAware` independently of furniture presence. Their inhabitants use `walking-routes.ts` cardinal routes around trees, hedges and furniture, entering houses only through doors. Board edits invalidate their routes before subsequent movement. Original-level motion is unchanged. Benches face the street or nearby seating; workspace chairs favor their desks. Southern/eastern exterior pieces render after the facade, while indoor pieces remain behind it. Remove/Plant use the visible furniture surface rather than a window hidden underneath.

Pattern references: [Front Door Bench](https://patternlanguage.cc/Patterns/Front-Door-Bench-(242)), [Tree Places](https://patternlanguage.cc/Patterns/Tree-Places-(171)), [Outdoor Room](https://patternlanguage.cc/Patterns/Outdoor-Room-(163)), [Workspace Enclosure](https://patternlanguage.cc/Patterns/Workspace-Enclosure-(183)). The new descriptions are paraphrases, not quotations; About lists deliberate simplifications.

`tests/expanded_levels.py` plays all four from reset to 100% with real touch on desktop and phone and checks 40 viewport/level combinations, inventory, garden rendering, bench occlusion, reload, reset, rotation, shade and About. Unit coverage includes all four legal solutions, incomplete/blocked layouts, no mutation, insertion-order invariance, movement and four-view bench occlusion. Run alongside the existing layout, orientation, completion and window suites.


### Four living patterns

`living-levels.ts` adds four independently solvable puzzles. `living-solutions.ts` contains verified solutions and host-before-attachment build sequences. None change earlier levels' scoring or saved layouts; no save-version migration is needed.

- **Windows Overlooking Life (192):** two distinct south windows overlook a populated public walk. Both indoor chairs need an unobstructed view through separate windows, must face the view, and need a walk from the north entrance. Shelves and other seats block sight; low plants and tables do not. Auto orientation follows the same indoor sight model.
- **Eating Atmosphere (182):** one table, four cardinal chairs facing it, a hanging lamp attached over that table, and a free pullback tile behind every chair reachable from the fixed north door. Plants and shelves are optional. The entry cannot be erased; the player receives an explanatory message. The lamp creates a visibly bright 3×3 island within a dimmer floor; this is not a lighting simulation.
- **Garden Seat (176):** a solitary bench screened from every tile of the busy public walk, backed and side-sheltered, sunny under a visible fixed-afternoon map, facing planting with an open and reachable front. Hedges shade their immediately northern tile; trees shade three northern rows with one-column spread. Cardinal paths are optional; walking on open grass is allowed. The rules are a disclosed tile approximation, not a solar or privacy simulation.
- **Trellised Walk (174):** one edge-connected stone route between already-paved endpoints, with a trellis and climbing vine over every route tile. Attachments share the stone tile and do not obstruct walking. The route minimizes missing stones, roofs, vines, then distance; a legally planted detour can beat an uncovered shortcut. Fourteen stones/trellises and sixteen plants allow bends and spare planting. Disconnected pieces cannot supply completion checks for another route.

`Layout.scene` chooses static scene paving, visible activity, and lighting. `scene-terrain.ts` is shared by placement, sunlight scoring and rendering: public pavement cannot be overwritten and path stones connect beside it. `living-rules.ts` supplies shared sight and shelter helpers. Fixed starts and palette counts remain level-specific.

Lamp and trellis are palette tools, not independent floor occupants. Tables persist `lamp?: true`; paths persist `trellis?: true` and `climbingPlant?: true`. `usedInventory` includes attachments and all forms of plants. `attachments.ts` provides selective removal; removing a host returns all attached inventory. Tapping the visible tabletop, lamp or trellis identifies its host rather than inverse-projecting the raised artwork onto an unrelated floor tile. Trellis backs, occupants and roofs use explicit painter ordering; all original level rendering remains unchanged.

New check results carry optional `marks`. Selecting a criterion highlights its relevant tiles; on mobile, the explanation has a Show highlighted tiles button. `CheckDiagnostics.tsx` exposes the exact reasons and 1-based tile coordinates in an accessible text list rather than relying on SVG hover titles. `SceneOverlay.tsx` renders the promenade, sun map, labels and nonblocking diagnostic marks. `LivingGlyph.tsx`/`living-art.css` provide the lamp, planted canopy and matching inventory icons. Rotation explanations describe the new scored directions; legacy direction-independent levels retain their behavior.

Verification: `bun test src/game`; `bunx tsc --noEmit`; `bun run build`; `python3 tests/living_levels.py --build-dir <build>` (or `--base-url <url>`). The new browser suite covers 40 viewport/level combinations and actual desktop/phone touch builds, all four completions, reload/reset, painted tabletop and trellis taps, attachment removal, fixed-door protection, and accessible diagnostic reasons. Run the existing play-layout, expanded-levels, orientation, window-details, completion and glyph-occlusion suites too. Regression tests include legally built bent trellis paths, direction-sensitive checks, obstruction, isolated pockets, exact completion, inventory, and nonmutation.

Sources for paraphrased context: [Windows Overlooking Life](https://patternlanguage.cc/Patterns/Windows-Overlooking-Life-(192)), [Eating Atmosphere](https://patternlanguage.cc/Patterns/Eating-Atmosphere-(182)), [Garden Seat](https://patternlanguage.cc/Patterns/Garden-Seat-(176)), [Trellised Walk](https://patternlanguage.cc/Patterns/Trellised-Walk-(174)). About distinguishes each puzzle's rules from the book's broader recommendations.

---

# Documentation

This is a **Zo Site** - a web application running on a user's Zo computer that combines:
- **Backend**: Bun + Hono server with API routes
- **Frontend**: React + Vite with client-side routing, shadcn/ui components, and Tailwind CSS 4
- **Single Process**: Vite runs in middleware mode (no separate dev server)

## Window places, room size and doors

Window Place now requires a seat directly beside glazing, side enclosure, and an accessible opening. `window-place.ts` checks a solid side wall or a shelf on a cardinal tile alongside the window (not a diagonal shelf, a low table, or furniture behind the seat). Each window seat must have a free cardinal route to an unoccupied interior floor cell; boxed-in seats fail even if they have enclosure. Plants and extra windows are optional. The four criteria total 100 points; saved best scores remain historical while current completion is reevaluated from the layout.

Select Plant and tap existing window glass or its sill to attach a planter. Windows store optional `sillPlant: true`; the chair's floor cell remains free. `usedInventory` counts floor plants and attached planters against the same palette limit. With Remove selected, tap anywhere on a planted window to choose “Remove plant only” or “Remove window and plant.” The two large buttons avoid requiring precise leaf taps on phones; closing or pressing Escape changes nothing. Both inventory items are returned when removing the whole window. The optional attachment is compatible with version-2 saves, so no migration or relocation of existing floor plants is needed. Reset clears attachments with the rest of the level. Other plant placements remain available.

Sitting Circle uses a 7×6 room (42 floor cells, previously 5×4) in an 11×10 world. Its origin and saved floor coordinates are unchanged; wall pieces stay anchored to their side and offset on the expanded boundary. No existing furniture is deleted or moved. Its six-seat completion criteria and two-cell gathering radius are unchanged. Alcoves and the other room dimensions are unchanged.

Doors remain full height on every wall, including cutaway front walls. Their frame, two panels, knob and full-height hit surface stay aligned; neighboring front walls remain low. Window sills and door details use `window-details.css`. Direct wall targeting prevents taps on the door's upper half from erasing a floor item behind it. Board actions commit on click after a valid pointer gesture, so opening a dialog cannot redirect the same gesture's click onto a destructive dialog button. Dialog dismissal restores focus to the initiating control or active palette tool.

## Object orientation

Seats, bookshelves and gates choose a direction automatically from the current layout. `src/game/orientation.ts` is a pure resolver: final-layout geometry, not insertion order, timers or inhabitants, determines orientation. Missing `CellPiece.facing` means Auto; only deliberate fixed directions are saved. Existing layouts need no orientation migration and retain their coordinates and inventory. Current completion is reevaluated; historical best scores remain saved. Front Door Bench now requires its rendered bench direction to face the street, including saved manual overrides.

- Alcove furniture faces its opening back into the common room; a blocked opening is reported honestly.
- Window Place chairs directly beside actual glazing look toward the glass. Other chairs prefer a nearby table, hearth or seat, then clear inward space. Sitting Circle prefers its hearth, falling back to an accessible table if the hearth is hidden. Shelf/tree occlusion and immediately blocked directions are checked. In crowded layouts Auto is best-effort, never a new placement restriction.
- Shelves prefer their closed back against a bare wall, otherwise open toward nearby seating or clear room space.
- Gate passage aligns with the connected path toward a door, then neighboring path stones, then the entrance direction.
- Walls already determine window/door/alcove alignment. The round/symmetric objects are unchanged.

The Rotate tile provides a keyboard-accessible placed-object chooser; close it to select an object directly on the board instead. Four illustrated fixed directions override Auto and persist through reloads and furniture changes. Selecting Auto removes the override. Rotation never moves or removes pieces. It remains decorative except in Front Door Bench, where the street-view criterion uses the same resolved direction as the renderer. Auto faces the street when its front is clear; flat path stones do not obstruct facing for benches, chairs, shelves or gates. Fixed directions remain deliberate overrides, so a bench facing away from the street fails that criterion until rotated back or returned to Auto. `DirectionalGlyph.tsx` rotates model XY coordinates before isometric projection, keeps height upright, and uses explicit per-view assembly ordering. Directional meshes are memoized; facing is recomputed only when the layout changes. No rotation animation or new dependency is needed.

Validation includes all four alcove sides and mesh views, obstructed targets, gates and paths, order independence, immutability, legacy saves, unchanged scoring outside Front Door Bench, real touch picking, keyboard focus, mobile palette breakpoints and completion regressions. Bench regressions cover adding/removing paving directly in front, all four manual directions, blocked sight lines, reload, and returning to Auto; the expanded browser suite checks the current score falls to 80% when turned away and returns to 100% on Auto.

## Play-screen layout

The play screen uses a viewport-height workbench. Desktop has a full-height board and a dedicated criteria column; the score sits in the header. Pieces are miniature icon tiles inside the board's left edge with used/available counters in the bottom-right corner, active highlighting, accessible labels and hover titles. The selected piece name and placement hint appear inside the board, with daylight, reset and About controls at the bottom-right. There is no tray below the board. A dedicated board viewport reserves space for these controls so they never cover placement targets. Phone layouts retain a two-column checklist; the icon rail shrinks to 44px minimum targets and wraps to two columns when board height is limited. Select a criterion for its current explanation (inline on desktop, a native modal sheet on phones and short screens). A newly completed pattern plays a 3.6-second celebration centered over the board (warm ripple, drifting petals and a clear 100% message), then fades; the persistent success summary stays beside the criteria. The overlay never captures input or moves focus. Reduced-motion mode shows the same message without animation. Only a current-score transition from incomplete to 100% triggers it: saved completed layouts and ordinary rerenders do not replay it, and resetting, navigating or dropping below 100% clears it. Completing the pattern again plays a fresh celebration. About preserves the book context and previous/next navigation on mobile.

`src/pages/play-layout.css` scopes the workbench layout; `src/pages/board-tools.css` owns the in-board controls and height-aware rail. `src/game/PieceIcon.tsx` shares the board's furniture glyphs and provides matching window, door and alcove icons. Do not reduce touch targets below 44px or clip criteria to enforce a fixed height. At 320px widths, very short viewports, or enlarged text, scrolling is an intentional accessibility fallback. Keyed `PlayLevel` instances prevent route changes from recording the previous level's pieces under the next level.

Validation:

```bash
bun test src/game
bunx tsc --noEmit
bun run build
python3 tests/play_layout.py --build-dir dist
python3 tests/completion_celebration.py --build-dir dist
python3 tests/orientation.py --build-dir dist
python3 tests/window_details.py --build-dir dist
python3 tests/expanded_levels.py --build-dir dist
python3 tests/glyph_occlusion.py
```

The browser suite requires Python Playwright and Chromium (`python3 -m pip install playwright` and `python3 -m playwright install chromium`). `--build-dir` tests an isolated build through intercepted browser requests without a server; `--base-url` tests a running deployment in a fresh browser profile. `--screenshots <directory>` saves desktop, phone, landscape and completion evidence. The original layout suite checks five levels across ten viewport sizes; the expanded suite adds four levels across ten sizes. Coverage includes text/320px fallbacks, modal focus, actual touch placement/removal, score persistence and level navigation. It also checks icon squares and corner counters, full-height stage layout, control/board separation, palette hit targets, touch/keyboard selection without accidental placement, and used inventory updates through placement/removal/reload.

## Architecture

### File Structure

```
.
├── server.ts              # Main server (Hono + Vite middleware)
├── index.html             # HTML entry point for React
├── vite.config.ts         # Vite configuration
├── package.json           # Dependencies and scripts
├── zosite.json            # Zo deployment config (ports, env vars)
├── public/                # Static assets (images, fonts, favicon)
│   ├── favicon.svg        # Site favicon (replace with your own)
│   └── images/
│       └── pegasus.png    # Example image (loaded via <img src="/images/pegasus.png">)
├── backend-lib/
│   └── zo-api.ts         # Helper for calling Zo API
└── src/
    ├── main.tsx          # React entry point
    ├── App.tsx           # Router setup
    ├── styles.css        # Global styles
    └── pages/            # Page components
```

### Development vs Production

**Development Mode** (`bun run dev`):
- Single Bun process running `server.ts`
- Vite in middleware mode transforms files on-the-fly
- API routes: `/api/*` handled by Hono
- React app: served via Vite transforms (HMR disabled, use `bun --hot` for server restart)
- Client-side routing: any non-API, non-file route falls back to `index.html`
- **Environment**: Site runs at an internal authenticated URL accessible only to you (private site on your Zo computer)

**Production Mode** (`bun run prod`):
- Builds React app to `dist/` using Vite
- Bun serves static files from `dist/` via `hono/bun` serveStatic
- API routes still handled by Hono
- SPA fallback: all non-API routes serve `dist/index.html`
- **Environment**: Site is published and accessible to anyone on the internet at a public URL

NEVER use the scripts `bun run dev` or `bun run prod`. The Zo system handles running the site in the correct mode based on context. All process management of the server is handled by Zo. Never restart or stop the server manually.

## Viewing, Verification, and Debugging (agent-browser)

The `agent-browser` CLI tool lets you preview, navigate, and debug the site running at `http://localhost:$PORT` (PORT is set by Zo). Use it to verify UI changes, debug routing, or capture screenshots.

Core workflow:
1. Navigate to the site:
   ```bash
   agent-browser open http://localhost:$PORT
   ```
2. Snapshot the page to get interactive element refs:
   ```bash
   agent-browser snapshot -i
   ```
3. Interact with elements:
   ```bash
   agent-browser click @e1
   agent-browser fill @e2 "text"
   agent-browser hover @e3
   agent-browser get text @e1
   ```
4. Re-snapshot after page changes to get updated refs.

Taking screenshots:
```bash
agent-browser screenshot
agent-browser screenshot --full-page
agent-browser screenshot --filename debug.png
```

For the full list of commands and options, run:
```bash
agent-browser --help
```

Note: Do not tell the user to visit localhost; they already have access via the Zo preview iframe.

## Key Technologies

### ⚠️ IMPORTANT: This is BUN + HONO (NOT Node.js + Express)

This application uses:
- **Bun** as the runtime (NOT Node.js)
- **Hono** as the web framework (NOT Express)

Do not use Express patterns. Use Hono equivalents. For file system operations, see the section below.

### Bun Runtime
- JavaScript runtime (NOT Node.js or Deno)
- Use `bun add <package>` to install dependencies
- Built-in TypeScript support
- Built-in SQLite via `import { Database } from "bun:sqlite"`
- Process spawning: `Bun.spawn()` for running commands

### File System Operations

Bun has native APIs for file I/O but uses Node.js APIs for directory operations. Use the correct API for each operation:

| Operation | API | Example |
|-----------|-----|---------|
| Read file | `Bun.file()` | `await Bun.file("data.json").text()` |
| Write file | `Bun.write()` | `await Bun.write("out.txt", content)` |
| File exists | `Bun.file().exists()` | `await Bun.file("x.txt").exists()` |
| Read directory | `node:fs/promises` | `await readdir("./posts")` |
| Create directory | `node:fs/promises` | `await mkdir("dir", { recursive: true })` |
| Glob files | `Bun Glob` | `new Glob("**/*.md").scan(".")` |

**⚠️ Common Mistakes to Avoid:**

```ts
// ❌ WRONG - These do NOT exist:
Bun.readdir()        // No such API
Bun.readdirSync()    // No such API
Bun.mkdir()          // No such API
fs.readFileSync()    // Works but slower than Bun.file()

// ✅ CORRECT patterns:
import { readdir, mkdir } from "node:fs/promises";

// Reading a file
const content = await Bun.file("config.json").json();

// Writing a file
await Bun.write("output.txt", "Hello");

// Listing directory contents
const files = await readdir("./posts");

// Creating a directory
await mkdir("./uploads", { recursive: true });

// Finding files by pattern
import { Glob } from "bun";
const glob = new Glob("**/*.md");
for await (const file of glob.scan("./posts")) {
  console.log(file);
}
```

### Hono Framework
- Lightweight web framework designed for Bun
- Documentation: https://honojs.dev/llms-small.txt
- Import from `hono` for core, `hono/bun` for Bun-specific features like `serveStatic`

**Serving Static Files (Bun-specific):**

```ts
import { serveStatic } from 'hono/bun'

app.use('/static/*', serveStatic({ root: './' }))
app.use('/favicon.ico', serveStatic({ path: './favicon.ico' }))
app.get('*', serveStatic({ path: './static/fallback.txt' }))

// You can reach outside the project root to files in the user's workspace
app.get('/workspace-file', serveStatic({ path: '../some/dir/file.txt' }))
app.get('/absolute-file', serveStatic({ path: '/home/user/file.txt' }))

// Custom MIME types
app.get('/media/*', serveStatic({
  mimes: {
    m3u8: 'application/vnd.apple.mpegurl',
    ts: 'video/mp2t',
  },
}))
```

**Hono Routing:**

```ts
// REST API endpoints
app.get('/', (c) => c.json({ items: [] }))
app.post('/', (c) => c.json({ created: true }, 201))
app.get('/:id', (c) => c.json({ id: c.req.param('id') }))

// Middleware
import { basicAuth } from 'hono/basic-auth'
app.use('/admin/*', basicAuth({ username: 'admin', password: 'secret' }))

// Multiple middlewares are processed in order
app.use(logger())
app.use('/posts/*', cors())
app.post('/posts/*', basicAuth())
```

### React + Vite
- React for UI components
- Vite handles bundling and transforms
- Dependencies installed via `bun add` (NOT CDN imports) - all packages bundled by Vite
- React Router for client-side routing
- **Styling**: Tailwind CSS 4 configured with `@tailwindcss/vite` plugin
- **UI Components**: shadcn/ui on **Base UI** primitives (`@base-ui/react`, the `base-nova` style) already set up and configured - components can be added via `bunx shadcn@latest add <component-name>`. Base UI uses a `render` prop for composition, NOT Radix's `asChild` (e.g. `<DropdownMenuTrigger render={<Button variant="outline" />} />`); a trigger given a non-`<button>` element via `render` also needs `nativeButton={false}`. In Tailwind selectors prefer the `data-open:`/`data-closed:`/`data-checked:` variants (they match both Base UI and Radix state attributes) over `data-[state=...]`.
- **Icons**: Lucide React icons included and ready to use
- **React Compiler enabled** (via `babel-plugin-react-compiler` in `vite.config.ts`): components are auto-memoized, so do NOT add `useMemo`/`useCallback`/`React.memo` for performance. Follow the Rules of React strictly — no setState during render, no ref reads/writes during render, no `Date.now()`/`Math.random()` in render (derive them in event handlers or effects) — or the compiler skips the component.

## UI Quality

Rules for building interfaces that feel polished:

- **No state-driven layout shift.** When a hover/active/selected state changes an element's size (bold text, revealed actions), reserve the largest variant's space so neighbors don't reflow: keep revealed affordances mounted and toggle `opacity` (with `pointer-events-none`), and for text that bolds when active, stack an invisible bold copy in the same grid cell to hold the width.
- **Never nest `fixed`/`absolute` overlays inside blurred or transformed chrome.** An ancestor with `backdrop-filter`, `filter`, `transform`, or `contain: paint` becomes the containing block for `fixed`/`absolute` descendants, clamping drawers/menus to that ancestor's box. Render overlays as a sibling of the blurred/transformed element.
- **Don't hand-add `cursor-pointer`.** A base rule in `src/styles.css` gives every enabled interactive element the pointer cursor app-wide. A component needing a different cursor still wins with a `cursor-*` utility.
- **Semantic theme tokens only.** Use `bg-background`, `text-foreground`, `text-muted-foreground`, `border`, `bg-card`, etc. — never hard-coded colors like `text-zinc-500`. The palette lives in `src/theme.json` (source of truth) which generates the CSS variables in `src/styles.css`.
- **Keep the browser console clean** — zero errors AND zero warnings (hydration mismatches, React key warnings, failed fetches). Treat a warning as a bug. Verify with agent-browser after substantive UI changes.
- **Modern text wrapping**: `text-balance` on headings, `text-pretty` on body copy, and respect `prefers-reduced-motion` when adding animation.

## Site Kit (`src/components/kit/`)

Opinionated, reusable components layered on the `ui/` primitives. **See them all rendered live at `/_design`** — keep that page updated when you add or change a kit component. Prefer composing with these over hand-rolling one-offs:

- `Tooltip` — wrap any element to label it: `<Tooltip label="Copy"><Button …/></Tooltip>`. Never use the native `title` attribute.
- `Menu` / `MenuItem` / `MenuSection` / `MenuSeparator` / `MenuButton` / `ContextMenuTrigger` — popup + right-click menus with full keyboard support (react-aria-components). Items take `icon` (Lucide), `shortcut`, `selected`, and `variant="destructive"`. IMPORTANT: the click-menu trigger must be `<MenuTrigger><MenuButton>…</MenuButton><Menu>…</Menu></MenuTrigger>` — react-aria only wires open/close onto its own button, so the plain `ui/button` will not open the menu.
- `List` / `ListItem` / `ListSection` — keyboard-navigable interactive lists (arrows, type-ahead, Home/End). NOT for static nav links — use plain `<a>`/`<ul>` for navigation; a listbox is the wrong semantics there.
- `SegmentedControl` — the mode-switcher pill, always one selected, arrow-key navigable.
- `EmptyState` — the standard "nothing here yet" placeholder (icon chip, title, description, optional action). Use it for every empty list/panel.
- `Spinner` — font-drawn Braille loading glyph, colored by `currentColor`; drops into buttons and status text.
- `KeyHint` — keyboard shortcuts as key chips, e.g. `<KeyHint display="⌘K" />`.
- `ArrowLink` / `ProseLink` — standalone directional links (arrow nudges on hover) vs. links inside running text.
- `ThemedSurface` — re-theme a subtree by overriding semantic tokens (`{ background: …, foreground: … }`); children keep using `bg-background` etc.
- `Favicon` — third-party brand marks by domain with a globe fallback.

The kit is also published as the `@zo` shadcn registry (wired into this
project's `components.json`). Re-fetch a component after upstream fixes with
`bunx shadcn@latest add @zo/<name> --overwrite` (e.g. `@zo/menu`), or refresh
the whole kit with `bunx shadcn@latest add @zo/site-kit --overwrite`. The
catalog lives at https://zo.computer/r/registry.json. `--overwrite` replaces
the local file — if a kit component has been customized in this project, port
the upstream fix by hand instead of overwriting.

## Common Tasks

### Adding API Routes

Add routes in `server.ts` before the Vite middleware:

```ts
app.get("/api/example", async (c) => {
  return c.json({ data: "example" });
});
```

### Adding React Components

Create components in `src/`:

```tsx
// src/components/MyComponent.tsx
import React from "react";

export default function MyComponent() {
  return <div>Hello</div>;
}
```

Add routes in `src/App.tsx`:

```tsx
import MyPage from "./pages/MyPage";

<Routes>
  <Route path="/my-page" element={<MyPage />} />
</Routes>
```

### Calling Zo API from Backend

Use the helper in `backend-lib/zo-api.ts`:

```ts
import { callZo } from "./backend-lib/zo-api";

app.post("/api/ask-zo", async (c) => {
  const { question } = await c.req.json();

  const result = await callZo(question, {
    outputFormat: {
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"]
    }
  });

  return c.json(result);
});
```

### Static Assets

There are two ways to include static assets like images, fonts, or JSON data:

#### Option 1: The `public/` Folder (Recommended for Most Cases)

Place files in the `public/` directory. They're served at the root URL path and work identically in dev and production.

```
public/
├── favicon.svg
├── images/
│   ├── logo.png
│   └── hero.jpg
├── fonts/
│   └── custom.woff2
└── og-image.jpg
```

Reference them with absolute paths:

```tsx
<img src="/images/logo.png" alt="Logo" />
<link rel="icon" href="/favicon.svg" />
```

In production, Vite copies the `public/` folder contents to `dist/` automatically.

**Use `public/` for**: favicons, Open Graph images, downloadable files, fonts, any asset that needs a stable/predictable URL.

#### Option 2: Import in Components (Bundled Assets)

Import assets directly in your React components. Vite handles bundling, optimization, and cache-busting via content hashes.

```tsx
// Images
import heroImage from '@/assets/hero.png';

function Hero() {
  return <img src={heroImage} alt="Hero" />;
}

// JSON data
import config from '@/data/config.json';

function Settings() {
  return <div>App version: {config.version}</div>;
}

// SVG as component (with ?react suffix)
import Logo from '@/assets/logo.svg?react';

function Header() {
  return <Logo className="h-8 w-8" />;
}
```

Place imported assets in `src/assets/` or alongside components:

```
src/
├── assets/
│   ├── hero.png
│   └── logo.svg
├── data/
│   └── config.json
└── components/
    └── Header.tsx
```

**Use imports for**: component-specific images, icons used in JSX, JSON configuration, any asset that benefits from bundling/tree-shaking.

#### Serving Files from the Workspace

For files outside the project (e.g., user's workspace files), create an API route:

```ts
app.get("/myfile", async (c) => {
  const file = Bun.file("/path/to/file");
  return new Response(file);
});
```

### Database

This application is database-agnostic and doesn't include a database by default. For most use cases, SQLite is recommended.

**Using Bun's Built-in SQLite:**

```ts
import { Database } from "bun:sqlite";

// Create/open database
const db = new Database("mydb.sqlite");

// Create table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  )
`);

// Insert data
const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
insert.run("John Doe", "john@example.com");

// Query data
const query = db.query("SELECT * FROM users WHERE name = ?");
const users = query.all("John Doe");

// Close when done
db.close();
```

**In a Hono route:**

```ts
app.get("/api/users", (c) => {
  const db = new Database("mydb.sqlite");
  const users = db.query("SELECT * FROM users").all();
  db.close();
  return c.json({ users });
});

app.post("/api/users", async (c) => {
  const { name, email } = await c.req.json();
  const db = new Database("mydb.sqlite");

  try {
    const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
    insert.run(name, email);
    db.close();
    return c.json({ success: true }, 201);
  } catch (error) {
    db.close();
    return c.json({ error: "Failed to create user" }, 400);
  }
});
```

## Scripts

- `bunx tsc --noEmit` - Type check

## Important Notes

### Server-Side vs Client-Side

- **Server code**: `server.ts`, `backend-lib/` - runs on Bun
- **Client code**: `src/` - runs in browser, bundled by Vite
- Install ALL dependencies via `bun add` (React, etc.) - Vite bundles them

### Environment Variables

- `NODE_ENV=production` switches to production mode
- `ZO_CLIENT_IDENTITY_TOKEN` required for calling Zo API
- Access server vars via `process.env.VAR_NAME` in server code
- Access client vars prefixed with `VITE_` via `import.meta.env.VITE_VAR_NAME` in React code

### File System Access

The server runs on the user's Zo computer and can:
- Read/write any file on the system
- Execute commands via `Bun.spawn()`
- Access local databases

### Configuration

`zosite.json` defines:
```json
{
  "name": "My Site",
  "local_port": 12345,
  "entrypoint": "bun run dev",
  "publish": {
    "label": "My Site",
    "type": "http",
    "entrypoint": "bun run prod",
    "published_port": 12346,
    "env": {
      "NODE_ENV": "production",
      "ZO_CLIENT_IDENTITY_TOKEN": "none"
    }
  }
}
```

- Top-level `env`: Environment variables for **development mode**
- `publish.env`: Environment variables for **production mode**
- Variables prefixed with `VITE_` are exposed to client-side code via Vite
- `PORT` environment variable is automatically set to match `local_port` (or `published_port` in production)

### ⚠️ IMPORTANT: Do Not Edit `zosite.json` System Fields

**The `zosite.json` file is auto-generated by Zo. Most fields should not be manually edited.**

- `local_port` and `published_port` are assigned by the system when the site is created
- Ports are chosen using a hash-based algorithm to avoid conflicts
- The Zo system manages process lifecycle, tunneling, and URL routing based on these ports
- Editing ports or entrypoints will break the site's preview URL and publish functionality

**Safe to edit:**
- `name` - The display name for the site
- `env` and `publish.env` - Add or modify environment variables as needed

**Never edit:**
- `local_port`, `published_port` - System-assigned ports
- `entrypoint`, `publish.entrypoint` - Managed startup commands
- `label`, `type` - Service configuration

**Private vs Public Access:**
- **Private (default)**: Sites run in dev mode behind authentication. Only you can access them via the preview iframe in Zo. This is the normal development experience.
- **Public (published)**: Publishing creates a shareable URL that anyone on the internet can access without authentication.

To publish your site publicly, use the **Publish button** in the Zo UI or explicitly ask Zo to publish it (e.g., "publish this site", "make it public").

## Deployment

The site exports `{ fetch, port }` from `server.ts` for Zo's deployment system. The same code runs in both dev and production - mode is controlled by `NODE_ENV`.
