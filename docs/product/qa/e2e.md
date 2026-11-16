# E2E tests (P-045 v1): πώς τρέχουν

Spec: `docs/product/specs/e2e-tests.md`. Κώδικας: `e2e/`, `playwright.config.ts`, `.github/workflows/e2e.yml`.

## Τοπικά
1. Μία φορά: `npm ci` και `npx playwright install chromium webkit` (στο Linux/CI με `--with-deps`).
2. `npm run e2e`: build των τριών εκδόσεων για τα tests (`npm run build:e2e`) και όλα τα projects, όπως στο CI.
3. Χωρίς νέο build (όταν το `src/` δεν άλλαξε): `npx playwright test`. Ένα αρχείο / project: `npx playwright test e2e/training.spec.ts --project=chromium-375 --headed`.
4. `npm run e2e:ui` (βήμα-βήμα), `npm run e2e:report` (η τελευταία αναφορά HTML).
5. Όλα τα αποτελέσματα μένουν στο `e2e/.out/` (μπαίνει στο `e2e/.gitignore`).

## Τι τρέχει
| Project | Τι | Πού |
|---|---|---|
| `smoke` | ποιον server έχει κάθε build· η φύλαξη δικτύου. Αν αποτύχει, δεν τρέχει τίποτα άλλο | Chromium |
| `chromium-375`, `webkit-iphone` | ροές 1–4, βόλτα (P-036), ακραίες περιπτώσεις, λογαριασμός, 375 px «Μέρα»/«Σούρουπο» | `vite preview` του `build:e2e` στο :4173, `page.route` |
| `chromium-320`, `webkit-320` | `@narrow`: «Νύχτα» + «Πολύ μεγάλα» στα 320 px | ίδιο |
| `chromium-375-sw`, `webkit-iphone-sw` | ροές 5–6 με πραγματικό service worker | `e2e/sw-serve.mjs` (:4174 / :4175, έκδοση A ή B) + ψεύτικος Worker `127.0.0.1:8788` (`e2e/fake-server.ts`) |

Ασφάλεια: τα builds δείχνουν σε `https://api.e2e.example.test` (`.env.e2e`) ή `http://127.0.0.1:8788` (`.env.e2e-sw`). Κάθε άλλο host κόβεται και αποτυγχάνει το test («Αίτημα εκτός λίστας: …»). Ο Chromium επιπλέον δεν λύνει κανένα όνομα εκτός από localhost/127.0.0.1. Οι διαδρομές AI απαντούν μόνο από fixtures και μόνο όταν το test το ζητήσει (`allowAi`). Το `npm test` ελέγχει ότι τα αρχεία των tests έχουν μόνο `@example.test`, κανένα κλειδί και κανένα URL παραγωγής.

## Νέο test
- Fixture `app` (`e2e/fixtures/app.ts`): `open`, `signIn`, `setSettings`, `useSimulator`, `startTraining`, `advance` (ψεύτικο ρολόι), `geoCalls`, `server.calls('/analysis')`. Σενάριο ανά test: `test.use({ scenario: { boats: [boatItem()], login: '401' } })`.
- Εντοπισμός: `getByTestId(...)` για τα στοιχεία που έχουν `data-testid` (λίστα παρακάτω), αλλιώς ρόλος/κείμενο του UI. Όχι κλάσεις CSS: αλλάζουν με το νέο σχέδιο (P-049). Μένουν ακόμα δύο (`.race-setup`, `.rs-tile .val`) και το `.val` του `cruise-dest-tile`.
- `data-testid` της εφαρμογής: `screen-title`, `onboarding`, `instruments-card`, `inst-pill`, `net-strip`, `session-end`, `session-pause`, `session-resume`, `session-strip`, `update-line`, `lap-button`, `lap-undo`, `lap-list`, `ended-undo`, `summary-stats`, `laps-table`, `export-gpx`, `export-csv`, `lessons`, `lessons-ask`, `lessons-error`, `history-item`, `race-points`, `race-analysis`, `course-card`, `update-card`, `update-now`, `app-version`, `cruise-dest-tile`, `cruise-dest-sheet`, `cruise-map`, `depth-here`.
- Γνωστό σφάλμα της εφαρμογής: `test.fail(true, '<αιτία>')` με σχόλιο `BUG (QA …)`. Ό,τι δεν μπορεί να ελεγχθεί: `test.fixme` με αιτία + γραμμή στη `docs/product/qa/iphone-checklist.md`.

## Αρχεία tests
| Αρχείο | Τι καλύπτει |
|---|---|
| `smoke.spec.ts` | κριτήρια 1–4 (server των builds, φύλαξη δικτύου) |
| `first-run.spec.ts` | 10–18· `/sync` 500 σε συσκευή χωρίς σκάφη (P-047, σημερινή συμπεριφορά) και με σκάφη (δεν φαίνεται το καρουζέλ) |
| `auth.spec.ts` | 19–27, αργό δίκτυο, σύνδεσμος πρόσκλησης |
| `race.spec.ts` | 28–37, χωρίς διαδρομή, χωρίς σκάφος |
| `training.spec.ts` | 38–45, 40α |
| `cruise.spec.ts` | βόλτα (P-036): «Πού πάμε;» → Live με προορισμό → αλλαγή προορισμού → παύση → χάρτης → τέλος → σύνοψη, GPX, ιδιωτικότητα· βόλτα χωρίς προορισμό. Το EMODnet μένει κομμένο: «Βάθος εδώ» «—» και το πολύ ένα αίτημα το λεπτό |
| `edge-cases.spec.ts` | άδεια θέσης «denied» (Γρήγορη ματιά, Live της εξόδου), προπόνηση χωρίς όργανα (GPS κινητού), κενό ιστορικό |
| `account.spec.ts` | «Κατέβασε τα δεδομένα μου», «Διαγραφή λογαριασμού» (Άκυρο / επιβεβαίωση / 500) |
| `update.spec.ts`, `offline.spec.ts` | `@sw`: 46–53 |
| `layout.spec.ts` | 54–56 |

Άδεια θέσης «denied»: το init script `DENY_GEO` (στο `edge-cases.spec.ts`) κάνει το ίδιο σε Chromium και WebKit: το `permissions.query` λέει «denied» και κάθε κλήση GPS αποτυγχάνει με `PERMISSION_DENIED`.

## Κανόνας καραντίνας (κριτήριο 58)
Test που βγει flaky 2 φορές σε μία εβδομάδα: μέσα σε 1 εργάσιμη διορθώνεται ή γίνεται `test.fixme` με σχόλιο `// flaky: P-045 <ημερομηνία> <αιτία>` και γραμμή στο `BACKLOG.md`. Το πολύ 3 tests σε καραντίνα.

## Spike WebKit + service worker (2026-11-16, Windows 11, Playwright 1.65.1)
- WebKit (Windows): ο service worker γράφεται, ενεργοποιείται και ελέγχει τη σελίδα μετά από reload· `setOffline(true)` + reload ανοίγει την εφαρμογή από την cache· η εναλλαγή A→B φέρνει νέο worker σε «waiting». Άρα οι ροές 5–6 τρέχουν και στο WebKit.
- Chromium: όταν υπάρχει `page.route`/`context.route`, η σελίδα παρακάμπτει τον service worker. Γι' αυτό οι ροές 5–6 δεν έχουν routing· φρένο δικτύου εκεί είναι ο ψεύτικος Worker, η παρακολούθηση αιτημάτων και (Chromium) το `--host-resolver-rules`.
- Στο CI (Linux) δεν έχει τρέξει ακόμα: η πρώτη εκτέλεση του `e2e.yml` είναι η επιβεβαίωση.
