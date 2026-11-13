# Sailing Navigator — τεχνική περιγραφή

Έκδοση εγγράφου για την εφαρμογή **0.6.1**. Οδηγίες για τοπική εγκατάσταση: [LOCAL_SETUP.md](LOCAL_SETUP.md).

## 1. Συνοπτικά

Δύο κομμάτια, ένα αποθετήριο:

| Κομμάτι | Τι είναι | Πού τρέχει | Κώδικας |
| --- | --- | --- | --- |
| **Εφαρμογή (PWA)** | React 18 + TypeScript, Vite. Όλοι οι υπολογισμοί (polars, routing, χρονοδιόρθωση) γίνονται στο κινητό. Δουλεύει χωρίς internet. | GitHub Pages: https://geopapak.github.io/sailing-navigator/ | `src/` |
| **Server (API)** | Cloudflare Worker (TypeScript) + βάση **Cloudflare D1** (SQLite). Λογαριασμοί, συγχρονισμός, σύμβουλος AI (Claude), ανάγνωση πιστοποιητικών, proxy Windy. | https://sailing-navigator-ai.geopapak.workers.dev | `server/`, `migrations/` |

```
 Κινητό (PWA)                                   Cloudflare
 ┌───────────────────────────┐   HTTPS/JSON    ┌──────────────────────────┐     ┌─────────────┐
 │ React UI                  │ ──────────────▶ │ Worker (server/worker.ts)│ ──▶ │ D1 (SQLite) │
 │ IndexedDB (Dexie)         │ ◀────────────── │  accounts / sync / AI    │     └─────────────┘
 │ Web Worker: isochrones    │                 └──────────┬───────────────┘
 │ Service worker (offline)  │                            │
 └──────┬────────────────────┘                            ├──▶ Anthropic Claude API
        │                                                 └──▶ Windy Point Forecast API
        ├──▶ Open-Meteo (πρόγνωση, κύμα) — απευθείας από το κινητό
        └──▶ OpenFreeMap / OpenSeaMap (χάρτης) — απευθείας, με cache
```

Βασική αρχή: **ο κώδικας υπολογίζει, το AI ερμηνεύει.** Ο σύμβουλος παίρνει έτοιμα νούμερα από την εφαρμογή ή καλεί εργαλεία που τρέχουν τον ίδιο κώδικα (`src/performance`, `src/scoring`, `src/weather`).

## 2. Τεχνολογίες και εκδόσεις

| Τι | Έκδοση | Σημείωση |
| --- | --- | --- |
| Node.js | 22 (LTS) | ίδια με το CI (`.github/workflows/pages.yml`) |
| npm | 10 | |
| TypeScript | 5.6 | `tsconfig.json` καλύπτει `src/` και `server/` |
| React | 18.3 | |
| Vite | 6 + `vite-plugin-pwa` | service worker, offline cache |
| Dexie | 4 | IndexedDB στη συσκευή |
| MapLibre GL | 6.15 | χάρτης, φορτώνει μόνο στην καρτέλα Χάρτης |
| Vitest | 3 | tests εφαρμογής και server (`npm test`) |
| Wrangler | 4.158+ | Cloudflare CLI: τοπικός server, D1, deploy |
| @anthropic-ai/sdk | 1.6 | μόνο στον server |
| Claude μοντέλο | `claude-opus-5-5` | με `fallbacks: "default"` |

## 3. Δομή φακέλων

```
src/
  boat/        προφίλ σκάφους (types), τοπική βάση (store.ts, Dexie), TRE IRENE, scoring options,
               έλεγχοι (validate.ts), πιστοποιητικό ORC: σχήμα/μετατροπή/έλεγχοι (certificate.ts)
  performance/ polars, targets, πανιά, συμβουλές (καθαρές συναρτήσεις)
  routing/     isochrone routing, ακτογραμμή Σαρωνικού, Web Worker
  weather/     Open-Meteo (πλέγμα, πολλά μοντέλα, consensus), σύγκριση μοντέλων, Windy (parse)
  scoring/     ToT / ToD, ισοβαθμία με αντίπαλο
  nav/         γεωγραφία (απόσταση, διόπτευση, VMC)
  ai/          context προς τον σύμβουλο, client κλήσεων, τύποι συνομιλίας
  sync/        API λογαριασμών (api.ts), συγχρονισμός (sync.ts)
  ui/          React components (App, AuthFlow, LiveView, PlanView, ChatView, BoatsView, …)
  releases.json  σημειώσεις εκδόσεων (πηγή για CHANGELOG.md και «Τι νέο»)
server/
  worker.ts      είσοδος Worker: CORS, routing, AI endpoints
  accounts.ts    χρήστες, sessions, όροι, συγχρονισμός, διαχειριστής, εξαγωγή
  agent.ts       σύμβουλος-agent (εργαλεία + βιβλιοθήκη)
  knowledge.ts   βιβλιοθήκη γνώσεων ιστιοπλοΐας (system prompt)
  certificate.ts ανάγνωση πιστοποιητικού με Claude
  *.test.ts      tests (D1 προσομοιώνεται με node:sqlite)
migrations/      σχήμα βάσης D1 (εφαρμόζεται με wrangler)
design/          εγκεκριμένα σχέδια UI/UX
docs/            αυτό το έγγραφο και οι οδηγίες εγκατάστασης
scripts/         εικονίδια, CHANGELOG, ακτογραμμή
```

### 3.1 Έξοδοι: Live και ειδοποιήσεις ανά τύπο (P-034)

- **Προφίλ ειδοποιήσεων** (`src/race/alerts.ts`): `profileFor(kind, settings)` δίνει `AlertProfile` (`types`, `shiftDeg`, `layLeads`, `minGapSec`, `strictGap`, `voice`). Αγώνας: ό,τι πριν, κατώφλι `raceShiftDeg` (5/7/10, προεπιλογή 7). Προπόνηση: `training.*` (στροφή 7/10/15, GPS, layline μόνο «τώρα», «κάτω από 90%»), κενό 60″ (εξαίρεση: layline «τώρα» μετά από 10″, πετιέται αν περιμένει πάνω από 15″), «κάτω από 90%» μόνο με όργανα, μόνο μπιπ. Βόλτα: καμία (ασφάλεια στη Φ4). Το `step()` χωρίς profile συμπεριφέρεται όπως ο αγώνας. Ο κινητήρας ξεκινά από την αρχή σε αλλαγή τύπου (`AlertsProvider`, `src/ui/RaceAlerts.tsx`).
- **Μία πηγή σημαδούρων** (`src/race/sessionMarks.ts`, `useSessionMarks` στο `src/ui/useSession.ts`): μέσα σε έξοδο, layline, ειδοποιήσεις, οθόνη αγώνα και Χάρτης παίρνουν τις σημαδούρες της εξόδου και την επόμενη από το ίχνος (`nextMarkOf`). Το `nav.course` μόνο εκτός εξόδου. Ο Χάρτης στην έξοδο δείχνει τη διαδρομή μόνο για ανάγνωση και το ίχνος.
- **Νούμερα του Live** (`useLiveNumbers`): όργανα, αλλιώς SOG από GPS και ο χειροκίνητος άνεμος της Γρήγορης ματιάς (`live-state`). Ο μέσος όρος 15″ του % στόχου κρατιέται μόνο στη μνήμη (`src/race/liveNumbers.ts`). Το Live της εξόδου ενημερώνει το snapshot του συμβούλου, με θέση στρογγυλεμένη στα ~100 m (P-030). Το `/chat` παίρνει και `context.session.kind`, χωρίς αλλαγή στον server.
- Κείμενα: `src/ui/sessionText.ts`.

### 3.2 Προπόνηση v1 και Παύση (P-035, P-039)

- **Μοντέλο** (`src/race/types.ts`, χωρίς αλλαγή schema Dexie): `Race.goal` («Τι δουλεύουμε»), `laps` (αρχές γύρων με σημείωση: πανί, τιμονιέρης Α/Β/Γ, τριμάρισμα ≤ 60), `pauses` (`{from, to?}`· ποτέ σε Αγώνα), `manoeuvres` (από τα πυκνά δείγματα της μνήμης, με `recoverSec` ως το 90%), `crewShared`, `crewSharePending`, `crewId`.
- **Παύσεις** (`src/race/pauses.ts`): `isPaused`, `activeSpans`, `trackSegments`, `pauseAt`/`resumeAt`, `closePausesAt`. Σε παύση το `recording` του `RaceContext` είναι `false` (σβήνουν ίχνος, ειδοποιήσεις, wake lock)· το `trackGap` και η ερώτηση ακινησίας δεν μετράνε την παύση· το `sessionStats`, το `analyseRace` και τα `toGpx` (ένα `<trkseg>` ανά διάστημα) / `toCsv` (στήλη `segment`) δεν μετράνε χρόνο ούτε απόσταση πάνω από παύση.
- **Προπόνηση** (`src/race/training.ts`, καθαρές συναρτήσεις): `activeIntervals(race, { kindOnly?, now? })` (από `kindLog` και παύσεις), `lapStats`, `pctByLegAndBand` (ζώνες TWS ανά 4 κν, χωρίς τα 25″ μετά από μανούβρα), `manoeuvreStats`, `recoverySec`, `trainingSummary(race, { kindOnly? })`. Η ίδια σύνοψη πάει στην οθόνη, στο πλήρωμα (`trainingShare`, μόνο τα διαστήματα Προπόνησης, ≤ 32 KB: κόβονται πρώτα τα τριμαρίσματα των παλαιότερων γύρων) και στο `/analysis` (`analysisBody`, `{ summary, kind: 'training' }`).
- **Live**: `TrainingProvider` (`src/ui/TrainingContext.tsx`) κρατά στη μνήμη την αναίρεση γύρου (5″, προστασία 3″) και την αντίστροφη μέτρηση εκκίνησης (ειδοποίηση 1′, νέος γύρος στο 0). Το `AlertsProvider` βρίσκει τις μανούβρες από την TWA κάθε 2″ και γράφει `manoeuvres` όταν κλείσει η ανάκαμψη (ή 90″).
- **Πλήρωμα** (`src/ui/crewShare.ts`): `PUT /crews/:crewId/races/:raceId` με `kind: 'training'` και `summary` (καμία θέση), `DELETE` όταν κλείνει ο διακόπτης. Offline: `crewSharePending`, που στέλνεται στην επόμενη σύνδεση (`useShareRetry`). Το μέλος βλέπει την κοινή προπόνηση στο «Οι έξοδοί μου» χωρίς ίχνος (`SharedTrainings` στο `CrewViews.tsx`).

## 4. Βάση δεδομένων

### 4.1 Στον server: Cloudflare D1 (SQLite)

Όνομα βάσης `sailing-navigator`, binding `DB` (`wrangler.toml`). Οι αλλαγές σχήματος είναι αριθμημένα αρχεία SQL στο `migrations/` και εφαρμόζονται με τη σειρά. Ποιο έχει ήδη εφαρμοστεί, το κρατά η ίδια η D1 στον πίνακα `d1_migrations`.

**`users`** — ένας λογαριασμός ανά email

| Στήλη | Τύπος | Περιγραφή |
| --- | --- | --- |
| `id` | TEXT PK | 24 hex χαρακτήρες, τυχαίο |
| `email` | TEXT UNIQUE | πάντα πεζά |
| `name` | TEXT | |
| `pass_hash`, `pass_salt` | TEXT | PBKDF2-SHA256, 100.000 επαναλήψεις, salt 16 bytes |
| `created_at` | INTEGER | ms (Unix epoch) |
| `is_admin` | INTEGER 0/1 | 1 για τον πρώτο λογαριασμό με email του `ADMIN_EMAIL`· οι επόμενοι με `npm run make-admin` |
| `ai_allowed` | INTEGER 0/1 | έγκριση συμβούλου AI από τον διαχειριστή |
| `ai_limit` | INTEGER | ερωτήσεις AI τον μήνα (προεπιλογή 100, διαχειριστής 1000) |
| `ai_month`, `ai_count` | TEXT, INTEGER | μετρητής μήνα (`YYYY-MM`) |
| `failed_logins`, `locked_until` | INTEGER | 5 λάθος κωδικοί → κλείδωμα 15 λεπτά |
| `terms_version`, `terms_at` | INTEGER | ποια έκδοση όρων αποδέχτηκε και πότε |
| `marketing` | INTEGER 0/1 | συναίνεση για email ενημερώσεων |
| `must_change_password` | INTEGER 0/1 | μπήκε με προσωρινό κωδικό |
| `reset_requested_at` | INTEGER | πότε πάτησε «Ξέχασα τον κωδικό» |
| `pdf_used` | INTEGER | αναγνώσεις πιστοποιητικού (3 δωρεάν χωρίς έγκριση AI) |

**`sessions`** — μία ανά συνδεδεμένη συσκευή

| Στήλη | Περιγραφή |
| --- | --- |
| `token_hash` PK | SHA-256 του token. Το ίδιο το token (64 hex) το έχει μόνο η συσκευή. |
| `user_id` | → `users.id` (ON DELETE CASCADE) |
| `created_at`, `expires_at` | λήξη σε 120 ημέρες |

**`items`** — ό,τι συγχρονίζεται (σκάφη, διαδρομές)

| Στήλη | Περιγραφή |
| --- | --- |
| `user_id`, `kind`, `id` | PK· `kind` = `boat` ή `course` |
| `data` | JSON του σκάφους/διαδρομής (≤ 200 KB), `NULL` αν διαγράφηκε |
| `updated_at` | ρολόι της συσκευής που το άλλαξε (ms) — «νικάει το νεότερο» |
| `deleted` | 0/1 (tombstone για να διαγραφεί και στις άλλες συσκευές) |
| `server_at` | ρολόι του server όταν γράφτηκε — για «τι άλλαξε από τότε» |

Όρια: 500 στοιχεία ανά λογαριασμό.

**`rate_limits`** — μετρητές κατά της κατάχρησης (migration 0004)

| Στήλη | Περιγραφή |
| --- | --- |
| `key` PK | `<όριο>:<hash της IP>` — η ίδια η IP δεν αποθηκεύεται |
| `count` | πόσες φορές μέσα στο παράθυρο |
| `reset_at` | πότε μηδενίζει (ms)· οι ληγμένες γραμμές σβήνονται |

**Πληρώματα (P-022, migration 0005)**

| Πίνακας | Τι κρατά |
| --- | --- |
| `crews` | ένα πλήρωμα ανά σκάφος ιδιοκτήτη: `owner_id`, `boat_id`, `boat_name`, `sail_no` |
| `crew_members` | μέλη: `kind` = `crew` (μόνιμο) ή `guest` (ένας αγώνας, `race_id`, `expires_at` = εκκίνηση + 48 ώρες), προαιρετικό `athlete_card` (προσωπικό δεδομένο: το βλέπουν μόνο ο ιδιοκτήτης και το μέλος) |
| `invites` | SHA-256 του token της πρόσκλησης, μία χρήση, λήξη σε 7 μέρες |
| `shared_races` | το πλάνο αγώνα που στέλνει ο ιδιοκτήτης: όνομα, ώρα, διαδρομή, θέσεις, σημείωση. Όχι ίχνος ή GPS |

Μπαίνουν στην εξαγωγή (`/me/export`) και σβήνονται με τη διαγραφή λογαριασμού.

### 4.2 Στη συσκευή: IndexedDB (Dexie)

Βάση `sailing-navigator` (`src/boat/store.ts`):

| Πίνακας | Περιεχόμενο |
| --- | --- |
| `boats` | προφίλ σκαφών (`BoatProfile`: στοιχεία, polars, πανιά, κανόνες πανιών, συντελεστές ORC) |
| `courses` | διαδρομές (σημαδούρες) |
| `kv` | ρυθμίσεις, τελευταία πρόγνωση, σύγκριση μοντέλων, υπολογισμένη διαδρομή, `tombstones`, `sync-state` |

Μικρά πράγματα UI (καρτέλα, φόρμες, ιστορικό συνομιλίας) είναι στο `localStorage`.

### 4.3 Συγχρονισμός (`src/sync/sync.ts`, `POST /sync`)

1. Η συσκευή στέλνει όσα άλλαξαν μετά το τελευταίο επιτυχές push (`updatedAt > pushedAt`) και τα tombstones των διαγραφών, μαζί με το `since`, δηλαδή το ρολόι του server της τελευταίας φοράς.
2. Ο server γράφει όσα είναι **νεότερα** από αυτά που έχει (last write wins με βάση το `updated_at`). Επιστρέφει ό,τι άλλαξε μετά το `since` και, για όσα απέρριψε, τη νεότερη εκδοχή του.
3. Η συσκευή εφαρμόζει τα εισερχόμενα, εκτός αν η δική της εκδοχή είναι νεότερη, και κρατά το νέο `since`.

Πότε τρέχει: στο άνοιγμα, όταν επανέρχεται το internet ή η εφαρμογή στο προσκήνιο, και 2,5 δευτερόλεπτα μετά από κάθε αλλαγή. Αν συνδεθεί άλλος χρήστης στην ίδια συσκευή, τα δεδομένα του προηγούμενου σβήνονται από τη συσκευή (υπάρχουν στον λογαριασμό του).

## 5. API του server

Όλα JSON. Αυθεντικοποίηση: `Authorization: Bearer <token>`. Εναλλακτικά, μόνο για τα AI endpoints, `x-access-code: <ACCESS_CODE>` (ο ιδιοκτήτης χωρίς λογαριασμό). Τα σφάλματα έρχονται ως `{ "error": "μήνυμα στα ελληνικά" }` με κατάλληλο HTTP status.

| Μέθοδος & διαδρομή | Πρόσβαση | Τι κάνει |
| --- | --- | --- |
| `GET /health` | όλοι | κατάσταση server (`configured`, `accounts`, `windy`, `user` αν υπάρχει token) |
| `GET /config` | όλοι | `termsVersion`, στοιχεία υπευθύνου επεξεργασίας |
| `POST /auth/register` | όλοι | `{email, password, name, acceptTerms, acceptPrivacy, marketing}` → `{token, user}` |
| `POST /auth/login` | όλοι | `{email, password}` → `{token, user}` |
| `POST /auth/forgot` | όλοι | `{email}` → σημειώνει αίτημα για τον διαχειριστή (ίδια απάντηση για άγνωστα email) |
| `POST /auth/logout` | χρήστης | ακυρώνει το token |
| `GET /me` | χρήστης | στοιχεία λογαριασμού, όρια AI/PDF, `termsOk`, `mustChangePassword` |
| `POST /me/password` | χρήστης | `{current, next}` (χωρίς `current` μετά από προσωρινό κωδικό)· αποσυνδέει τις άλλες συσκευές |
| `POST /me/terms` | χρήστης | `{version}` → αποδοχή τρέχουσας έκδοσης όρων |
| `GET /me/export` | χρήστης | όλα τα δεδομένα του χρήστη (GDPR) |
| `DELETE /me` | χρήστης | διαγραφή λογαριασμού, sessions και items |
| `POST /sync` | χρήστης | `{since, changes[]}` → `{now, items[]}` |
| `GET /admin/users` | διαχειριστής | λίστα χρηστών με όρια, αιτήματα κωδικού |
| `POST /admin/users/:id` | διαχειριστής | `{aiAllowed?, aiLimit?, resetPassword?}` → (`tempPassword`) |
| `POST /certificate` | χρήστης | `{data: base64, mediaType}` (PDF/JPG/PNG/WebP ≤ 10 MB) → `{extract}` |
| `POST /advice` | AI* | γρήγορη συμβουλή καρτών Live/Χάρτη (structured output) |
| `POST /chat` | AI* | συνομιλία με τον σύμβουλο-agent |
| `POST /windy` | εγκεκριμένοι | πρόγνωση Windy σε σημείο (θέλει `WINDY_KEY`) |
| `POST /analysis` | AI* | `{summary}` (σύνοψη αγώνα) → `{lessons[]}` |
| `POST /entrylist` | χρήστης | λίστα συμμετοχών PDF/εικόνα → `{event, entries[]}` (μετρά στις αναγνώσεις PDF) |
| `GET /orc/boat?sailNo=` | χρήστης | πιστοποιητικό ORC ως προφίλ σκάφους (θέλει `ORC_API_KEY`, αλλιώς 501) |
| `GET /ais?mmsi=a,b&wait=` | χρήστης | τελευταίες θέσεις AIS από aisstream.io (θέλει `AISSTREAM_KEY`, αλλιώς 501) |
| `GET /notes/crew` | χρήστης | σημειώσεις «Πλήρωμα» μόνο από τον ιδιοκτήτη και το μόνιμο πλήρωμα του σκάφους με αυτόν τον αριθμό πανιού (έως 200) |
| `GET /crews` | χρήστης | `{owned[], member[]}`: τα πληρώματά μου (με μέλη και δελτία) και όσα είμαι μέλος (μόνο το δικό μου δελτίο) |
| `POST /crews` | χρήστης | `{boatId, boatName, sailNo?}` → το πλήρωμα του σκάφους (δημιουργείται αν λείπει) |
| `POST /crews/:id/invites` | ιδιοκτήτης | `{kind: crew\|guest, raceId?}` → `{token}` (έως 30 τη μέρα) |
| `GET /invites/:token` | χρήστης | προεπισκόπηση πρόσκλησης |
| `POST /invites/:token/accept` | χρήστης | `{athleteCard?}`· θέλει αποδεκτούς τους τρέχοντες όρους |
| `PATCH` / `DELETE /crews/:id/members/:userId\|me` | ιδιοκτήτης ή το μέλος | αλλαγή δελτίου / αφαίρεση ή αποχώρηση |
| `PUT` / `DELETE /crews/:id/races/:raceId` | ιδιοκτήτης | στέλνει ή αποσύρει το πλάνο αγώνα |
| `DELETE /crews/:id` | ιδιοκτήτης | διαγραφή πληρώματος |

\* AI = `ACCESS_CODE` ή χρήστης με `ai_allowed`. Κάθε κλήση μετρά στο μηνιαίο όριο του χρήστη.

**Φρένα κόστους (P-016, `server/aiBrakes.ts`):** `AI_DISABLED=1` κλείνει όλες τις πληρωμένες κλήσεις (503)· κάθε λογαριασμός έως 6 ερωτήσεις/λεπτό (429)· ο `ACCESS_CODE` έως 40 κλήσεις/ώρα ανά σύνδεση (429)· όλες μαζί οι πληρωμένες κλήσεις (σύμβουλος, συνομιλία, ανάλυση, νέα ανάγνωση PDF) σταματούν στο `AI_GLOBAL_MONTHLY_LIMIT` τον μήνα (503). Οι μετρητές είναι στον πίνακα `rate_limits`.

**CORS:** επιτρέπονται τα origins του `ALLOWED_ORIGINS` (`wrangler.toml`) και κάθε `http://localhost:<port>` / `http://127.0.0.1:<port>`.

## 6. Ρυθμίσεις server (secrets και vars)

| Όνομα | Τύπος | Υποχρεωτικό | Χρήση |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | secret | για AI | κλειδί Claude API |
| `ADMIN_EMAIL` | secret | ναι | email(s) για τον **πρώτο** διαχειριστή, χωρισμένα με κόμμα |
| `ACCESS_CODE` | secret | όχι | κωδικός ιδιοκτήτη για AI χωρίς λογαριασμό |
| `CONTROLLER_NAME`, `CONTROLLER_EMAIL` | secret | ναι (GDPR) | εμφανίζονται στην Πολιτική απορρήτου |
| `WINDY_KEY` | secret | όχι | Windy Point Forecast API |
| `ORC_API_KEY` | secret | όχι | ORC API (sas.orc.org → Developers): συντελεστές/polars αντιπάλων |
| `AISSTREAM_KEY` | secret | όχι | aisstream.io: θέσεις αντιπάλων από AIS μέσω internet |
| `WEB_SEARCH` | var | όχι | `0` = ο σύμβουλος χωρίς αναζήτηση web |
| `AI_DISABLED` | var | όχι | `1` = διακόπτης: καμία πληρωμένη κλήση AI |
| `AI_GLOBAL_MONTHLY_LIMIT` | var | όχι | μέγιστες πληρωμένες κλήσεις AI τον μήνα για όλο τον server (προεπιλογή 1000) |
| `ALLOWED_ORIGINS` | var | ναι | origins της εφαρμογής (CORS) |
| `ENVIRONMENT` | var | όχι | `staging` στο test περιβάλλον· αλλιώς `production`. Μόνο ετικέτα στο `/health` και στα logs, δεν αλλάζει τη λειτουργία |
| `DB` | binding D1 | ναι | η βάση |

Στην παραγωγή μπαίνουν με `npx wrangler secret put <ΟΝΟΜΑ>`. Τοπικά μπαίνουν στο αρχείο `.dev.vars` (δες `.dev.vars.example`).

Στην εφαρμογή: `VITE_SERVER_URL` (αρχείο `.env.local`, δες `.env.example`) — ποιον server χρησιμοποιεί. Κενό = παραγωγή. Στο build του test περιβάλλοντος τα `VITE_SERVER_URL` και `VITE_APP_ENV=staging` έρχονται από το `.env.staging` (§11).

## 7. AI (Claude)

| Χρήση | Αρχείο | Ρυθμίσεις |
| --- | --- | --- |
| Γρήγορη συμβουλή | `server/worker.ts` → `advice()`, `src/ai/prompt.ts` | structured output (`REPLY_SCHEMA`), effort `low` (Live) / `medium` (σχέδιο) |
| Σύμβουλος (συνομιλία) | `server/agent.ts`, `server/knowledge.ts` | tool runner, έως 8 βήματα, effort `medium`, system prompt cached. Εργαλεία: `boat_targets`, `ratings_math`, `weather_models`, `distance_bearing`, `web_search` (server tool, έως 3) |
| Πιστοποιητικό ORC | `server/certificate.ts`, `src/boat/certificate.ts` | PDF ως `document` ή εικόνα ως `image`, structured output (`CERTIFICATE_SCHEMA`), μετά έλεγχοι στον κώδικα (`checkExtract`) |

Όλα με `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`. Τα σφάλματα του API γίνονται ελληνικά μηνύματα στο `apiError()`. Κόστος (ενδεικτικά): γρήγορη συμβουλή 1–4 λεπτά, συνομιλία 5–15 λεπτά, πιστοποιητικό 10–30 λεπτά του ευρώ.

## 8. Ασφάλεια και ιδιωτικότητα

- Κωδικοί: PBKDF2-SHA256 (100k), σύγκριση σταθερού χρόνου. 5 λάθος κωδικοί κλειδώνουν τον λογαριασμό για 15 λεπτά **μόνο για εκείνη τη σύνδεση** (ώστε ένας ξένος να μη μπορεί να κλειδώσει τον κάτοχο)· 50 λάθος από οπουδήποτε τον κλειδώνουν παντού.
- Όρια ανά σύνδεση (`server/rateLimit.ts`): 5 εγγραφές/ώρα, 30 συνδέσεις/15 λεπτά, 5 «ξέχασα τον κωδικό»/ώρα, 6 δωρεάν αναγνώσεις PDF/ημέρα. Αν ο πίνακας λείπει, τα αιτήματα περνούν (και γράφεται error στα logs).
- Διαχειριστής: το `ADMIN_EMAIL` δίνει ρόλο μόνο όταν δεν υπάρχει ακόμα διαχειριστής· οι επόμενοι με `npm run make-admin`.
- CORS: μόνο τα `ALLOWED_ORIGINS`· σελίδες `localhost` μόνο όταν ο ίδιος ο server τρέχει τοπικά.
- Headers: `nosniff`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, HSTS. Η εφαρμογή (build) έχει Content-Security-Policy.
- Sessions: τυχαίο token 256 bit. Στη βάση αποθηκεύεται μόνο το SHA-256 του. Ένας νέος κωδικός αποσυνδέει τις άλλες συσκευές.
- Το κλειδί Claude API είναι μόνο στον server, ποτέ στο κινητό ή στο αποθετήριο.
- Το PDF του πιστοποιητικού στέλνεται στο Claude και δεν αποθηκεύεται πουθενά.
- Η θέση GPS μένει στη συσκευή, εκτός αν σταλεί με ερώτηση στον σύμβουλο.
- Αποδοχή όρων με έκδοση: όταν αλλάζουν οι όροι, αυξάνεται το `TERMS_VERSION` (σε `server/accounts.ts` **και** `src/ui/legal.tsx`) και όλοι αποδέχονται ξανά.

## 9. Logs

`server/log.ts`: μία γραμμή JSON ανά γεγονός (`request`, `register`, `login`, `login_failed`, `password_reset_requested`, `password_changed`, `admin_update`, `account_deleted`, `sync`, `ai`, `error`). Οι γραμμές περιέχουν μόνο ids και νούμερα, ποτέ email, κωδικούς, tokens ή κείμενο ερωτήσεων.

- **Τοπικά:** στο terminal του `wrangler dev`.
- **Παραγωγή:** ζωντανά με `npx wrangler tail`, και με ιστορικό στα Workers Logs (`[observability]` στο `wrangler.toml`): Cloudflare dashboard → Workers & Pages → `sailing-navigator-ai` → Logs.

Λεπτομέρειες και φίλτρα: [LOCAL_SETUP.md § Logs](LOCAL_SETUP.md#10-logs).

## 10. Tests, build, εκδόσεις

- `npm test` — 119 tests. Καλύπτουν polars/targets, routing, πρόγνωση, χρονοδιόρθωση, τους ελέγχους πιστοποιητικού, την τοπική βάση, τον server (D1 πάνω σε `node:sqlite`, ψεύτικες απαντήσεις Claude) και τις σημειώσεις εκδόσεων.
- `npm run build` — typecheck και build στο `dist/`.
- **Εκδόσεις:** κάθε deploy ανεβάζει την έκδοση στο `package.json` και γράφει εγγραφή στο `src/releases.json`, και μετά τρέχει `npm run changelog`. Τα tests αποτυγχάνουν αν λείπει κάτι από αυτά.
- **Deploy εφαρμογής:** αυτόματο με push στο `main` (GitHub Actions → Pages). Αλλαγές μόνο σε `docs/` και `*.md` δεν κάνουν deploy.
- **Deploy server:** `npx wrangler d1 migrations apply sailing-navigator --remote` (αν υπάρχει νέο migration) → `npx wrangler deploy`. Πρώτα ο server και η βάση, μετά η εφαρμογή.

## 11. Περιβάλλον δοκιμών (staging)

Δύο χωριστά περιβάλλοντα (P-044). Το test δεν αγγίζει ποτέ τη βάση, τα κλειδιά ή τους χρήστες του production.

| | Production | Test (staging) |
| --- | --- | --- |
| Εφαρμογή | GitHub Pages: https://geopapak.github.io/sailing-navigator/ | Cloudflare Pages: `https://sailing-navigator-staging.pages.dev` |
| Build | `npm run build` (στο CI, `BASE_PATH=/sailing-navigator/`) | `npm run build:staging` (base `/`, ρυθμίσεις από `.env.staging`) |
| Worker | `sailing-navigator-ai` | `sailing-navigator-ai-staging` (`[env.staging]` στο `wrangler.toml`) |
| Βάση D1 | `sailing-navigator` | `sailing-navigator-staging` |
| Secrets | δικά του | δικά του (`--env staging`), **ποτέ** τα ίδια με του production |
| Σήμανση | — | σήμα «TEST» στην κεφαλίδα, όνομα «Sailing Navigator TEST», `noindex`, `/health` → `"environment": "staging"` |

Όλες τις εντολές με `--remote`, `deploy`, `secret put` και `pages` τις τρέχει **ο ιδιοκτήτης** (χρειάζεται `npx wrangler login`). Τα φρένα κόστους AI (P-016) ισχύουν και στο test, με χαμηλότερο μηνιαίο όριο (`AI_GLOBAL_MONTHLY_LIMIT = "100"` στο `[env.staging.vars]`).

**Κανόνας:** ο server και οι μεταναστεύσεις D1 μένουν συμβατοί με την προηγούμενη έκδοση της εφαρμογής. Τα κινητά δεν ενημερώνονται όλα μαζί (P-043, 02:00 τοπική ώρα με την P-044β), άρα για κάποιο διάστημα η παλιά εφαρμογή μιλά με τον νέο server: νέα πεδία και πίνακες προστίθενται, δεν σβήνονται ούτε μετονομάζονται στην ίδια έκδοση.

### 11.1 Πρώτο στήσιμο (μία φορά)

1. Δημιουργία της βάσης test:
   ```
   npx wrangler d1 create sailing-navigator-staging
   ```
   Αντιγράφεις το `database_id` που τυπώνει και το βάζεις στο `wrangler.toml`, στο `[[env.staging.d1_databases]]`, στη θέση του `REPLACE_WITH_STAGING_DATABASE_ID`.
2. Πίνακες στη βάση test:
   ```
   npx wrangler d1 migrations apply sailing-navigator-staging --env staging --remote
   ```
3. Secrets του test (σε κάθε εντολή γράφεις την τιμή όταν τη ζητήσει· αν ρωτήσει αν θα δημιουργηθεί ο Worker, απαντάς ναι):
   ```
   npx wrangler secret put ANTHROPIC_API_KEY --env staging
   npx wrangler secret put ACCESS_CODE --env staging
   npx wrangler secret put ADMIN_EMAIL --env staging
   npx wrangler secret put CONTROLLER_NAME --env staging
   npx wrangler secret put CONTROLLER_EMAIL --env staging
   ```
   - `ANTHROPIC_API_KEY`: **χωριστό κλειδί** μόνο για το test, από χωριστό workspace στο Anthropic Console με χαμηλό μηνιαίο όριο δαπάνης (π.χ. 3 €).
   - `ACCESS_CODE`: διαφορετικός από του production.
   - Προαιρετικά, μόνο αν θες να τα δοκιμάσεις: `WINDY_KEY`, `ORC_API_KEY`, `AISSTREAM_KEY` (ίδια εντολή με `--env staging`).
4. Deploy του Worker test:
   ```
   npx wrangler deploy --env staging
   ```
   Κρατάς τη διεύθυνση που τυπώνει (`https://sailing-navigator-ai-staging.<subdomain>.workers.dev`). Αν είναι διαφορετική από το `VITE_SERVER_URL` του `.env.staging`, διορθώνεις το `.env.staging`.
5. Δημιουργία του Pages project:
   ```
   npx wrangler pages project create sailing-navigator-staging --production-branch main
   ```
   Αν το όνομα είναι πιασμένο και πάρεις άλλο, βάζεις τη νέα διεύθυνση `https://<όνομα>.pages.dev` στο `ALLOWED_ORIGINS` του `[env.staging.vars]` και ξανατρέχεις το βήμα 4.
6. Build της εφαρμογής test:
   ```
   npm run build:staging
   ```
7. Ανέβασμα της εφαρμογής test:
   ```
   npx wrangler pages deploy dist --project-name sailing-navigator-staging --branch main
   ```
   Το `--branch main` χρειάζεται: χωρίς αυτό, από άλλο branch γίνεται «preview» με άλλη διεύθυνση, που ο server δεν δέχεται (CORS).
8. Έλεγχος: ανοίγεις `https://sailing-navigator-staging.pages.dev` στο κινητό· πρέπει να φαίνεται το «TEST» στην κεφαλίδα. Το `https://sailing-navigator-ai-staging.<subdomain>.workers.dev/health` πρέπει να δείχνει `"environment":"staging"`. Κάνεις εγγραφή με το `ADMIN_EMAIL` του test για να γίνεις διαχειριστής εκεί.

### 11.2 Deploy στο test

Όποτε θες, από οποιοδήποτε branch:

1. `npm test` και `npm run typecheck`
2. Μόνο αν υπάρχει νέο migration: `npx wrangler d1 migrations apply sailing-navigator-staging --env staging --remote`
3. `npx wrangler deploy --env staging`
4. `npm run build:staging`
5. `npx wrangler pages deploy dist --project-name sailing-navigator-staging --branch main`
6. Στο κινητό: άνοιγμα της εφαρμογής test, «Ενημέρωση τώρα» αν τη ζητήσει, δοκιμή.

### 11.3 Deploy στο production

Μόνο ό,τι δοκιμάστηκε στο test:

1. Έκδοση στο `package.json`, εγγραφή στο `src/releases.json`, `npm run changelog`, `npm test`.
2. Μόνο αν υπάρχει νέο migration: `npx wrangler d1 migrations apply sailing-navigator --remote`
3. `npx wrangler deploy`
4. Push στο `main`: το GitHub Action χτίζει την εφαρμογή (`npm run build`) και την ανεβάζει στο GitHub Pages.
5. Έλεγχος: `https://sailing-navigator-ai.geopapak.workers.dev/health` → `"environment":"production"`.

**Πότε το παίρνουν οι χρήστες (P-044β):** οι συσκευές δεν ενημερώνονται αμέσως. Όταν ένα κινητό βρει νέα έκδοση, δείχνει «Νέα έκδοση διαθέσιμη — θα ενημερωθεί αυτόματα στις 02:00 (τοπική ώρα)» με κουμπί «Ενημέρωση τώρα» (κάρτα στην Αρχική· μέσα σε έξοδο μία γραμμή στη λωρίδα της εξόδου). Η νέα έκδοση εφαρμόζεται στις 02:00 τοπική ώρα της συσκευής ή στο πρώτο άνοιγμα μετά, και μόνο αν δεν τρέχει έξοδος, δεν υπάρχει κάτι αναποθήκευτο και δεν τρέχει η αναίρεση 10″. Η ώρα 02:00 κρατιέται και μετά από επανεκκίνηση.

- **Επείγουσα διόρθωση:** `"critical": true` στην εγγραφή της έκδοσης στο `src/releases.json`. Τότε οι συσκευές την εφαρμόζουν μόλις είναι ελεύθερες, χωρίς αναμονή ως τις 02:00 (ποτέ μέσα σε έξοδο). Το build γράφει το `version.json` (`version`, `critical`, `criticalVersions`) που διαβάζει η εφαρμογή· αν δεν το βρει (π.χ. χωρίς δίκτυο), η έκδοση θεωρείται κανονική.
- Τα κείμενα των μηνυμάτων ενημέρωσης είναι όλα στο `src/pwa/updateText.ts`.
- **Στάνταρ μήνυμα deploy** (στην αναφορά προς την ομάδα):
  > Έκδοση X.Y.Z — production deploy ΗΗ/ΜΜ ΩΩ:ΛΛ· οι συσκευές ενημερώνονται 02:00 τοπική ώρα ή στο επόμενο άνοιγμα

  και για έκδοση `critical`:
  > Έκδοση X.Y.Z — production deploy ΗΗ/ΜΜ ΩΩ:ΛΛ· οι συσκευές ενημερώνονται άμεσα (critical), μόλις δεν τρέχει έξοδος

Πρώτα η βάση, μετά ο server, τελευταία η εφαρμογή. Το `npm run build:staging` γράφει κι αυτό στο `dist/`: το production δεν επηρεάζεται, γιατί το χτίζει το CI από την αρχή.
