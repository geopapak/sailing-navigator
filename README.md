# Navigator — ORC ιστιοπλοΐα

PWA για targets/VMG, επιλογή πανιών, συμβουλές, routing με πρόγνωση, σύμβουλο AI και διορθωμένο χρόνο ORC.

## Εντολές

```bash
npm install
npm run dev      # http://localhost:5173 (και στο τοπικό δίκτυο)
npm test         # unit tests (Vitest)
npm run build    # παραγωγή στο dist/
```

## Δομή

| Φάκελος | Περιεχόμενο |
|---|---|
| `src/boat/` | Τύποι προφίλ σκάφους, TRE IRENE, επιλογές scoring, αποθήκευση (IndexedDB/Dexie), έλεγχοι |
| `src/performance/` | Interpolation polars, targets, VMG, επιλογή πανιών, κανόνες συμβουλών |
| `src/scoring/` | ToT / ToD, κατάταξη, σύγκριση με αντίπαλο |
| `src/nav/` | Γεωδαισία: απόσταση, διόπτευση, VMC, SOG/COG από fixes |
| `src/weather/` | Πεδίο ανέμου (grid/σταθερός/διορθωμένος), λήψη Open-Meteo. Ανεξάρτητο από την πηγή, ώστε να μπει GRIB αργότερα |
| `src/routing/` | Ισόχρονες, αποφυγή στεριάς (ακτογραμμή OSM Σαρωνικού), web worker, GeoJSON για τον χάρτη |
| `src/ai/` | Σύμβουλος AI: δεδομένα που στέλνονται (τύποι, builders), system prompt, σχήμα απάντησης, client |
| `server/` | Cloudflare Worker που καλεί το Claude API (το κλειδί μένει στον server) |
| `src/ui/` | React UI: Live, Χάρτης/σχεδιασμός, Polar, Χρόνος, Σκάφη, Οδηγός, Ρυθμίσεις |

Το core (`boat`, `performance`, `scoring`, `nav`) είναι καθαρό TypeScript χωρίς React, για να το χρησιμοποιήσει και το backend της Φάσης 3.

## Μοντέλο polars

Για κάθε TWS η καμπύλη TWA→BSP φτιάχνεται από τις 8 γωνίες του πιστοποιητικού, συν:
- σημείο beat: `BSP = beatVMG / cos(beatAngle)`
- σημείο gybe: `BSP = runVMG / cos(180 − gybeAngle)`
- 0 kt στις 25° και `BSP = runVMG` στις 180°

Γραμμική παρεμβολή ως προς TWA και μετά ως προς TWS. Κάτω από το μικρότερο TWS η ταχύτητα κλιμακώνεται αναλογικά, πάνω από το μεγαλύτερο μένει σταθερή. Ο «συντελεστής απόδοσης» του προφίλ πολλαπλασιάζει όλα τα targets.

## Routing

Μέθοδος ισόχρονων: σε κάθε βήμα (προεπιλογή 10′) κάθε σημείο του μετώπου δοκιμάζει πορείες ανά 3°, με τα polars και τον άνεμο στη θέση και την ώρα του. Το μέτωπο κρατά το πιο μακρινό σημείο ανά τομέα 2° γύρω από την αρχή του σκέλους. Κινήσεις που τέμνουν την ακτογραμμή απορρίπτονται, και κάθε αναστροφή/υποσταύρωση κοστίζει χρόνο. Το σκέλος τελειώνει στο πρώτο βήμα από το οποίο η σημαδούρα φαίνεται απευθείας. Τα πανιά προκύπτουν από τους κανόνες του προφίλ. Περίοδοι κάτω από 20′ συγχωνεύονται, ώστε να μην εμφανίζονται αλλαγές πανιού που δεν θα έκανε κανείς στην πράξη.

Στο Live, ο «Ξαναϋπολογισμός» διορθώνει την πρόγνωση με τον λόγο TWS και τη διαφορά TWD ανάμεσα σε μέτρηση και πρόγνωση στη θέση του σκάφους, και ξανατρέχει το routing από τη θέση GPS.

Η ακτογραμμή ξαναφτιάχνεται με:

```bash
node scripts/fetch-coastline.mjs
```

## Σύμβουλος AI (Φάση 3)

Η εφαρμογή υπολογίζει τα πάντα τοπικά και στέλνει μόνο τα αποτελέσματα (JSON) στο `server/worker.ts`. Ο Worker καλεί το Claude (`claude-opus-5-5`, structured output, effort `low` για Live και `medium` για σχεδιασμό, `fallbacks: "default"`) και επιστρέφει `{summary, actions[{text, when}], caution}` στα ελληνικά. Προστασία: κωδικός πρόσβασης (`x-access-code`) και επιτρεπτά origins (CORS).

Εγκατάσταση (μία φορά):

1. Λογαριασμός στο [Claude Console](https://platform.claude.com): δημιούργησε API key και βάλε μηνιαίο όριο χρέωσης.
2. Δωρεάν λογαριασμός στο [Cloudflare](https://dash.cloudflare.com/sign-up).
3. Από τον φάκελο του project:

```bash
npx wrangler login
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ACCESS_CODE
```

4. Στην εφαρμογή: ⚙ → Σύμβουλος AI → η διεύθυνση `https://sailing-navigator-ai.<λογαριασμός>.workers.dev` και ο κωδικός → «Δοκιμή σύνδεσης».

Τοπικά: φτιάξε `.dev.vars` με `ACCESS_CODE=…`, `ANTHROPIC_API_KEY=…`, `ADMIN_EMAIL=…`, τρέξε `npx wrangler d1 migrations apply sailing-navigator --local` και `npx wrangler dev`.

## Σύμβουλος-agent, μοντέλα καιρού, λογαριασμοί

- **Συνομιλία (`POST /chat`)**: agent με το Claude (`server/agent.ts`). Βιβλιοθήκη γνώσεων ιστιοπλοΐας στο `server/knowledge.ts` (σύνοψη με δικά μας λόγια — RRS, ORC, τακτική, ρύθμιση, μετεωρολογία Σαρωνικού, ασφάλεια), cached στο system prompt. Εργαλεία που τρέχουν τον κώδικα της εφαρμογής: `boat_targets` (polars/πανιά), `ratings_math` (ToT/ToD, αντίπαλοι), `weather_models` (8 μοντέλα + κύμα), `distance_bearing`, και `web_search` (server tool· αν δεν είναι ενεργό στον οργανισμό, η απάντηση δίνεται χωρίς αυτό).
- **Μοντέλα καιρού**: `src/weather/models.ts` (κατάλογος), `src/weather/compare.ts` (σύγκριση/διασπορά σε σημείο, Open-Meteo Marine για κύμα), «Συμφωνία 5 μοντέλων» ως πλέγμα για το routing (`consensus` στο `openMeteo.ts`). Windy Point Forecast μέσω του server (`POST /windy`, secret `WINDY_KEY` — με δοκιμαστικό κλειδί το Windy δίνει σκόπιμα αλλοιωμένα νούμερα).
- **Λογαριασμοί (`server/accounts.ts`, D1)**: email + κωδικός (PBKDF2-SHA256), session tokens (αποθηκεύεται μόνο το hash), συγχρονισμός σκαφών/διαδρομών (last write wins, `src/sync/`). Ο σύμβουλος AI επιτρέπεται σε λογαριασμούς που εγκρίνει ο διαχειριστής (`ADMIN_EMAIL`), με μηνιαίο όριο· ο `ACCESS_CODE` συνεχίζει να δουλεύει για τον ιδιοκτήτη.

Εγκατάσταση βάσης και secrets:

```bash
npx wrangler d1 migrations apply sailing-navigator --remote
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put WINDY_KEY
```

## Πηγές δεδομένων

- Χάρτης: [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, © OpenStreetMap contributors
- Ναυτικά σημάδια: © [OpenSeaMap](https://openseamap.org) contributors
- Ακτογραμμή: © OpenStreetMap contributors (ODbL)
- Πρόγνωση: [Open-Meteo](https://open-meteo.com) (CC BY 4.0) — ECMWF, DWD, Météo-France, UK Met Office, NOAA, ECCC, JMA· κύμα από Open-Meteo Marine
- Προαιρετικά: [Windy Point Forecast API](https://api.windy.com)

## Deploy (GitHub Pages)

Το `.github/workflows/pages.yml` τρέχει τα tests, κάνει build και δημοσιεύει σε κάθε push στο `main`. Στο GitHub: Settings → Pages → Source: GitHub Actions.
