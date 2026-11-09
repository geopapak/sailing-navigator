# Τοπική εγκατάσταση — βήμα προς βήμα

Στο τέλος θα έχεις στον υπολογιστή σου:

- **την εφαρμογή** στο `http://localhost:5173`·
- **τον server** στο `http://localhost:8787`·
- **τη βάση**, ένα τοπικό SQLite αρχείο που φτιάχνει το Wrangler.

Τίποτα από αυτά δεν αγγίζει την παραγωγή (GitHub Pages, Cloudflare). Τεχνική περιγραφή: [TECHNICAL.md](TECHNICAL.md).

Χρόνος: ~15 λεπτά την πρώτη φορά.

---

## 1. Τι χρειάζεσαι

| Εργαλείο | Έκδοση | Έλεγχος | Από πού |
| --- | --- | --- | --- |
| **Node.js** | 22.x (LTS) | `node -v` → `v22…` | https://nodejs.org (ή `nvm install 22`) |
| **npm** | 10.x (έρχεται με το Node) | `npm -v` | — |
| **Git** | οποιαδήποτε πρόσφατη | `git --version` | https://git-scm.com |
| Browser | Chrome, Edge ή Firefox | | |

**Δεν** χρειάζεσαι:

- **Λογαριασμό Cloudflare:** ο τοπικός server και η βάση τρέχουν εξ ολοκλήρου στον υπολογιστή σου.
- **Docker ή εγκατάσταση SQLite:** τα φέρνει το Wrangler.
- **Κλειδί Claude API:** μόνο αν θέλεις να δοκιμάσεις τον σύμβουλο AI ή την ανάγνωση PDF (βήμα 8).

> Windows: οι εντολές δουλεύουν σε PowerShell και σε Git Bash. Όπου διαφέρουν, γράφονται και οι δύο.

---

## 2. Κατέβασμα του κώδικα

```bash
git clone https://github.com/geopapak/sailing-navigator.git
cd sailing-navigator
```

## 3. Εγκατάσταση πακέτων

```bash
npm ci
```

Εγκαθιστά ακριβώς τις εκδόσεις του `package-lock.json`: React, Vite, Wrangler, το SDK του Claude κ.λπ. Ο φάκελος `node_modules/` θα πιάσει ~400 MB.

Έλεγχος ότι όλα είναι εντάξει:

```bash
npm run typecheck
npm test
```

Πρέπει να δεις `Tests 119 passed`. Τα tests δεν χρειάζονται ούτε server ούτε internet.

## 4. Ρυθμίσεις του τοπικού server (`.dev.vars`)

Αντίγραψε το πρότυπο:

```bash
cp .dev.vars.example .dev.vars
```

(PowerShell: `Copy-Item .dev.vars.example .dev.vars`)

Άνοιξε το `.dev.vars` και άλλαξε ό,τι θες:

| Μεταβλητή | Τι βάζεις | Γιατί |
| --- | --- | --- |
| `ADMIN_EMAIL` | το email που θα είναι **διαχειριστής** τοπικά (π.χ. `admin@test.local`) | όποιος κάνει εγγραφή με αυτό γίνεται αυτόματα admin με AI |
| `ANTHROPIC_API_KEY` | αφήνεις την ψεύτικη τιμή, ή βάζεις αληθινό κλειδί | με ψεύτικη τιμή δουλεύουν όλα εκτός από AI/PDF |
| `ACCESS_CODE` | οποιοδήποτε κείμενο | κωδικός ιδιοκτήτη για AI χωρίς λογαριασμό (προαιρετικό) |
| `CONTROLLER_NAME`, `CONTROLLER_EMAIL` | οτιδήποτε | εμφανίζονται στην Πολιτική απορρήτου |

Το `.dev.vars` είναι στο `.gitignore` και **δεν** ανεβαίνει ποτέ στο GitHub.

## 5. Ρύθμιση της εφαρμογής (`.env.local`)

```bash
cp .env.example .env.local
```

(PowerShell: `Copy-Item .env.example .env.local`)

Περιέχει `VITE_SERVER_URL=http://localhost:8787`, ώστε η εφαρμογή να μιλά στον **τοπικό** server και όχι στην παραγωγή. Χωρίς αυτό το αρχείο, η τοπική εφαρμογή συνδέεται στον πραγματικό server, με πραγματικούς λογαριασμούς.

## 6. Δημιουργία της τοπικής βάσης

```bash
npx wrangler d1 migrations apply sailing-navigator --local
```

Εφαρμόζει τα αρχεία του `migrations/` με τη σειρά (`0001_accounts.sql`, `0002_terms_reset_pdf.sql`). Θα δεις:

```
┌──────────────────────────┬────────┐
│ name                     │ status │
├──────────────────────────┼────────┤
│ 0001_accounts.sql        │ ✅     │
│ 0002_terms_reset_pdf.sql │ ✅     │
└──────────────────────────┴────────┘
```

Η βάση είναι ένα SQLite αρχείο κάτω από το `.wrangler/state/v3/d1/`, επίσης εκτός git. Αν το Wrangler σε ρωτήσει για σύνδεση στο Cloudflare, απάντησε όχι: το `--local` δεν το χρειάζεται.

> **Windows:** οι εντολές `--local` αφήνουν μερικές φορές ανοιχτή μια διεργασία `workerd`. Πριν το βήμα 7 κλείσε τις παλιές:
> PowerShell: `Get-Process workerd -ErrorAction SilentlyContinue | Stop-Process -Force`
> (Αλλιώς ο server του βήματος 7 ξεκινά, αλλά δεν απαντά σε κανένα αίτημα.)

## 7. Εκκίνηση — δύο terminals

**Terminal 1 — server:**

```bash
npx wrangler dev --port 8787
```

Περίμενε `Ready on http://127.0.0.1:8787`. Έλεγχος από άλλο terminal ή από τον browser:

```bash
curl http://localhost:8787/health
```

Πρέπει να δεις `{"ok":true,...,"accounts":true}`.

**Terminal 2 — εφαρμογή:**

```bash
npm run dev
```

Άνοιξε **http://localhost:5173**. Οι αλλαγές στον κώδικα φαίνονται αμέσως, και στην εφαρμογή (Vite) και στον server (Wrangler).

## 8. Πρώτη χρήση

1. Στην οθόνη σύνδεσης πάτα **«Νέος λογαριασμός»**.
2. Βάλε **το email του `ADMIN_EMAIL`** από το `.dev.vars` και έναν κωδικό τουλάχιστον 8 χαρακτήρων. Τσέκαρε Όρους και Πολιτική και πάτα «Δημιουργία λογαριασμού».
3. Είσαι ο **διαχειριστής**: στο ⚙ → Λογαριασμός φαίνεται η ετικέτα «διαχειριστής» και από κάτω η λίστα **«Χρήστες»**.
4. Για δοκιμή δεύτερου χρήστη, άνοιξε ένα παράθυρο ανώνυμης περιήγησης και κάνε εγγραφή με άλλο email. Θα εμφανιστεί στη λίστα σου, όπου μπορείς να του ανοίξεις το AI ή να του δώσεις προσωρινό κωδικό.
5. Πρόσθεσε σκάφος από **Σκάφη → «+ Προσθήκη σκάφους»**. Χειροκίνητα ή με JSON δουλεύει χωρίς κλειδί. Για δοκιμαστικό σκάφος, πάρε ένα Export από την παραγωγή.

**Σύμβουλος AI και ανάγνωση PDF τοπικά:**

1. Βάλε αληθινό κλειδί στο `ANTHROPIC_API_KEY` του `.dev.vars`. Φτιάχνεται στο platform.claude.com → API keys· βάλε και όριο χρέωσης.
2. Σταμάτησε τον server (Ctrl+C) και ξανατρέξε `npx wrangler dev --port 8787`.
3. Κάθε ερώτηση ή ανάγνωση **χρεώνει** τον λογαριασμό σου στο Claude, όπως και στην παραγωγή.

## 9. Χρήσιμες εντολές

| Τι θες | Εντολή |
| --- | --- |
| Όλα τα tests | `npm test` |
| Tests σε λειτουργία παρακολούθησης | `npm run test:watch` |
| Μόνο τα tests του server | `npx vitest run server` |
| Έλεγχος τύπων | `npm run typecheck` |
| Build παραγωγής (στο `dist/`) | `npm run build` και μετά `npm run preview` |
| Δες τους τοπικούς χρήστες | `npx wrangler d1 execute sailing-navigator --local --command "SELECT email, is_admin, ai_allowed, terms_version FROM users"` |
| Δες τα συγχρονισμένα σκάφη | `npx wrangler d1 execute sailing-navigator --local --command "SELECT user_id, kind, id, deleted FROM items"` |
| Κάνε κάποιον admin χειροκίνητα | `npx wrangler d1 execute sailing-navigator --local --command "UPDATE users SET is_admin=1, ai_allowed=1 WHERE email='x@y.gr'"` |
| Σβήσε τη βάση και ξεκίνα από την αρχή | σταμάτα τον server, σβήσε τον φάκελο `.wrangler/state`, ξανατρέξε το βήμα 6 |
| Σβήσε τα δεδομένα του browser (σκάφη, σύνδεση) | DevTools → Application → Storage → «Clear site data» για `localhost:5173` |
| Ενημέρωση του CHANGELOG | `npm run changelog` |

Για εντολές βάσης χωρίς `--local` (δηλαδή με `--remote`) χρειάζεται `npx wrangler login`. Αυτές πειράζουν την **πραγματική** βάση, οπότε χρησιμοποίησέ τες μόνο αν το εννοείς.

## 10. Logs

Ο server γράφει **μία γραμμή JSON για κάθε γεγονός**. Δεν περιέχουν ποτέ email, κωδικούς, tokens ή κείμενο ερωτήσεων, μόνο ids χρηστών και νούμερα.

| `evt` | Πότε | Πεδία |
| --- | --- | --- |
| `request` | κάθε αίτημα | `method`, `path`, `status`, `ms` |
| `register`, `login`, `login_failed` | εγγραφή / σύνδεση | `user`, `admin`, `temp`, `locked` |
| `password_reset_requested`, `password_changed` | «Ξέχασα τον κωδικό» / νέος κωδικός | `known`, `user`, `afterTemp` |
| `admin_update` | ο διαχειριστής άλλαξε κάτι | `user`, `aiAllowed`, `aiLimit`, `resetPassword` |
| `sync` | συγχρονισμός με αλλαγές | `user`, `pushed`, `pulled` |
| `ai` | κάθε κλήση Claude | `kind` (advice/chat/certificate), `model`, `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `ms`, `tools` |
| `error` | σφάλμα server ή Claude API | `where`, `error` |

### Τοπικά

- **Server:** οι γραμμές εμφανίζονται κατευθείαν στο terminal του `npx wrangler dev`.
- **Αναζήτηση με SQL στα τοπικά logs** (όσο τρέχει ο server):

  ```bash
  curl -X POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query -H "Content-Type: application/json" -d "{\"sql\":\"SELECT ts_ms, message FROM logs ORDER BY ts_ms DESC LIMIT 20\"}"
  ```

- **Εφαρμογή:** DevTools του browser (F12) → **Console** για σφάλματα και **Network** για κάθε κλήση στον server, με την απάντησή της.

### Στην παραγωγή

- **Ζωντανά, από τον υπολογιστή σου** (χρειάζεται `npx wrangler login` μία φορά):

  ```bash
  npx wrangler tail --format pretty
  ```

  Μόνο σφάλματα: `npx wrangler tail --status error`. Μόνο ένα είδος: `npx wrangler tail --search "\"evt\":\"ai\""`.

- **Ιστορικό και αναζήτηση στο dashboard:** dash.cloudflare.com → **Workers & Pages** → `sailing-navigator-ai` → **Logs**. Τα Workers Logs είναι ενεργά (`[observability]` στο `wrangler.toml`) και κρατούν τις γραμμές μερικές μέρες στο δωρεάν πακέτο. Φίλτρα: `evt = ai` για κατανάλωση AI, `evt = error` για προβλήματα, `status >= 400` για αποτυχημένα αιτήματα.
- **Κόστος AI:** τα `input_tokens` / `output_tokens` των γραμμών `ai` δείχνουν τι κόστισε κάθε κλήση. Τα ακριβή ποσά είναι στο platform.claude.com → Usage.

## 11. Αλλαγή στη βάση (νέο migration)

1. Φτιάξε νέο αρχείο με τον επόμενο αριθμό, π.χ. `migrations/0003_<περιγραφή>.sql`. Ποτέ μην αλλάζεις αρχείο που έχει ήδη εφαρμοστεί.
2. Πρόσθεσέ το στα tests: στο `server/accounts.test.ts`, στη λίστα αρχείων του `fakeD1()`.
3. Τοπικά: `npx wrangler d1 migrations apply sailing-navigator --local`.
4. Στην παραγωγή, με αυτή τη σειρά:
   - `npx wrangler d1 migrations apply sailing-navigator --remote`
   - `npx wrangler deploy`
   - push της εφαρμογής.

## 12. Διαχειριστής (admin)

- **Ποιος είναι:** ο λογαριασμός με το email του `ADMIN_EMAIL`. Τοπικά το ορίζεις στο `.dev.vars`, στην παραγωγή με `npx wrangler secret put ADMIN_EMAIL`.
- **Πώς γίνεσαι:** κάνεις εγγραφή ή σύνδεση με αυτό το email. Ο ρόλος δίνεται ή διορθώνεται σε κάθε σύνδεση. Αν το email άλλαξε μετά την εγγραφή, κάνε αποσύνδεση και σύνδεση ξανά.
- **Τι βλέπεις:** ⚙ → **Λογαριασμός** με την ετικέτα «διαχειριστής», και από κάτω **Χρήστες**:
  - έγκριση AI και μηνιαίο όριο ανά χρήστη·
  - αιτήματα «Ξέχασα τον κωδικό» (κίτρινα) και κουμπί «Νέος κωδικός», που δίνει προσωρινό·
  - πόσα πιστοποιητικά διάβασε ο καθένας και αν έχει αποδεχτεί τους όρους.
- **Πολλοί διαχειριστές:** `ADMIN_EMAIL` με email χωρισμένα με κόμμα.

## 13. Προβλήματα που μπορεί να συναντήσεις

| Σύμπτωμα | Αιτία | Λύση |
| --- | --- | --- |
| Ο server γράφει «Ready» αλλά τα αιτήματα κολλάνε | παλιά διεργασία `workerd` (Windows) | κλείσε τις `workerd` (βήμα 6) και ξανατρέξε |
| `address already in use :8787` ή `:5173` | τρέχει ήδη κάτι εκεί | κλείσε το άλλο terminal ή άλλαξε πόρτα (`--port 8788` και στο `.env.local`) |
| Η εφαρμογή λέει «Δεν βρέθηκε ο server» | ο server δεν τρέχει, ή λείπει το `.env.local` | βήματα 5 και 7· μετά από αλλαγή στο `.env.local` ξανατρέξε `npm run dev` |
| Η εφαρμογή μιλά στον server της παραγωγής | λείπει το `.env.local`, ή το browser έχει αποθηκευμένη άλλη διεύθυνση | φτιάξε το `.env.local`· μετά τη σύνδεση άλλαξέ τη στο ⚙ → Server, ή «Clear site data» |
| «Οι λογαριασμοί δεν έχουν ρυθμιστεί στον server» | δεν βρέθηκε η βάση | `npx wrangler d1 migrations apply sailing-navigator --local` |
| `no such column: terms_version` | λείπει το migration 0002 | ξανατρέξε το βήμα 6 |
| «Άκυρο κλειδί Claude API στον server» | ψεύτικο `ANTHROPIC_API_KEY` | αναμενόμενο· για AI βάλε αληθινό κλειδί (βήμα 8) |
| Δεν γίνεσαι admin | το email δεν είναι ίδιο με το `ADMIN_EMAIL`, ή ο server ξεκίνησε πριν αλλάξεις το `.dev.vars` | ξανατρέξε τον server και κάνε σύνδεση ξανά (ο ρόλος διορθώνεται στη σύνδεση) |
| Μετά από αλλαγή κώδικα η εφαρμογή δείχνει παλιά έκδοση | service worker (PWA) | Ctrl+Shift+R, ή DevTools → Application → Service workers → Unregister |
| `npm ci` αποτυγχάνει | λάθος έκδοση Node | `node -v` πρέπει να είναι 22.x |
