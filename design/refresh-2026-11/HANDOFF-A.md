# P-049 · Φ-A (0.19.0) · Οδηγίες για τον developer (`sailing-developer`)

> Από `sailing-ui-ux`, 2026-11-20. Βάση:
> - το εγκεκριμένο spec `docs/product/specs/P-049-refresh.md` (ΚΑ Κ1–Κ6 και A1–A20)·
> - το εγκεκριμένο πρωτότυπο `design/refresh-2026-11/index.html` (οθόνη «Tokens»)·
> - το `RESEARCH.md`·
> - οι κανόνες μεγέθους της P-053 (`design/manual-wind-2026-11/HANDOFF.md` §5)·
> - το γλωσσάρι `docs/product/research/2026-11-glossary.md`.
>
> Όπου διαφωνεί το πρωτότυπο με αυτό το έγγραφο, **ισχύει αυτό το έγγραφο**. Όπου διαφωνεί με το spec, ισχύει το spec, εκτός από τα 2 σημεία της §1.4, που θέλουν απόφαση.

## 0. Τι μπαίνει στη Φ-A και τι όχι

**Μπαίνουν:**
- tokens σε 3 θέματα, με ψευδώνυμα για τα παλιά ονόματα·
- Inter μέσα στο build·
- νέα εμφάνιση στα κοινά στοιχεία: κουμπιά, κάρτες, πεδία, segmented, διακόπτης, λίστες, μήνυμα, λωρίδες·
- ανοιχτή πάνω μπάρα με τσιπ σκάφους·
- κάτω πλοήγηση με «χάπι» και πλαϊνή πλοήγηση σε χαμηλή οριζόντια οθόνη·
- κοινό `SheetFrame` με `useSheetMode()` για **όλα** τα φύλλα και τους διαλόγους·
- emoji → SVG·
- `prefers-reduced-motion`.

**Δεν αλλάζουν στη Φ-A (αυστηρά):**

| Τι | Κανόνας |
|---|---|
| Περιεχόμενο οθονών | Η σειρά και τα στοιχεία της Αρχικής, του Live, του Ιστορικού, των Σκαφών, των Ρυθμίσεων, της διοργάνωσης, του χάρτη και του Συμβούλου μένουν ίδια. Αλλάζουν μόνο χρώματα, γραμματοσειρά, γωνίες, αποστάσεις και ύψη στόχων. Η νέα Αρχική είναι Φ-C, το νέο Live Φ-D |
| Κείμενα | Κανένα κείμενο δεν αλλάζει, εκτός από (α) τα emoji που γίνονται SVG (§8): μένει το κείμενο δίπλα τους, και (β) το τσιπ σκάφους (§4.2). Το «Νέα έξοδος» μένει τίτλος της Αρχικής ως τη Φ-C |
| `data-testid` | Όλα μένουν στα ίδια λογικά στοιχεία: `screen-title`, `net-strip`, `inst-pill`, `session-end`, `session-pause`, `session-resume`, `session-strip`, `update-line`, `finish-sheet`/`finish-yes`/`finish-no`, `forgotten-line`, `wind-reading`, `tws-mini`, `lap-*`, `home-event*`, `result-sheet`, `cruise-dest-sheet` κ.ά. Νέα: §4.2 και §6 |
| Ονόματα ARIA της πλοήγησης | `nav[aria-label="Κύριες οθόνες"]` και `nav[aria-label="Οθόνες εξόδου"]` μένουν ακριβώς έτσι (τα χρησιμοποιούν 9 E2E) |
| Κλάσεις που διαβάζουν τα E2E | `.snack`, `.sbar .modeb`, `.rs-tile .val`, `.val`, `.ws-steps`, `.ws-sp`, `.race-setup`, `.race-live`, `.c-boat`, `main, .content` |
| Σκούρα μπάρα εξόδου | Η `SessionBar` μένει όπως είναι σε δομή και κείμενα. Παίρνει μόνο tokens (§4.1) |
| Χάρτης | Το `nauticalStyle.ts` και τα `.map-*` δεν αλλάζουν χρώματα στη Φ-A |

## 1. Χρώματα ανά θέμα

### 1.1 Πίνακας

Στο `:root[data-theme='day']` (και στο `:root`), `:root[data-theme='dark']` και `:root[data-theme='night']`. Η στήλη «Χρήση» λέει πού επιτρέπεται το καθένα.

| Token | Μέρα | Σούρουπο | Νύχτα | Χρήση |
|---|---|---|---|---|
| `--bg` | `#ffffff` | `#0b1220` | `#000000` | φόντο σελίδας, φύλλων, πεδίων |
| `--surface` | `#f2f4f7` | `#152033` | `#120202` | κάρτες, κάτω πλοήγηση, λίστες |
| `--surface-2` | `#e4e8ee` | `#1e2b42` | `#1c0403` | segmented (φόντο), εικονίδια γραμμών, μπάρα % |
| `--fg` | `#05080f` | `#f8fafc` | `#ff3b30` | κείμενο σώματος, νούμερα |
| `--muted` | `#475467` | `#a3b1c6` | **`#e5483d`** | λεζάντες, υπότιτλοι, ανενεργές ετικέτες πλοήγησης |
| `--line` | `#667085` | `#6b7c96` | `#b02a20` | όρια στοιχείων που πατιούνται (πεδία, κουμπιά με περίγραμμα, τσιπ). ≥ 3:1 |
| `--line-soft` | `#d0d5dd` | `#2a3a55` | `#4a0b07` | **μόνο διακοσμητικό**: περίγραμμα κάρτας, διαχωριστικά γραμμών |
| `--accent` | `#0b2a4a` | `#7cb4ff` | `#ff3b30` | γεμάτο κουμπί, σύνδεσμοι, εστίαση πεδίου |
| `--accent-fg` | `#ffffff` | `#0b1220` | `#000000` | κείμενο πάνω σε `--accent` |
| `--accent-cont` | `#dbe7f5` | `#1e3a5f` | `#2a0503` | τονικό κουμπί, «χάπι» πλοήγησης, ενεργό segmented στο Σούρουπο |
| `--on-accent-cont` | `#0b2a4a` | `#dbeafe` | `#ff3b30` | κείμενο/εικονίδιο πάνω σε `--accent-cont` |
| `--good` | `#047857` | `#34d399` | `#ff6b5e` | κατάσταση «καλό» (πάντα με ✓ ή κείμενο) |
| `--good-cont` | `#d1fae5` | `#0f3b2e` | `#2a0503` | φόντο μηνύματος «καλό» |
| `--fair` | `#b45309` | `#fbbf24` | `#d1342a` | κατάσταση «μέτριο / προσοχή» (πάντα με «!») |
| `--fair-cont` | `#fef3c7` | `#3d2e0a` | `#2a0503` | φόντο λωρίδας κατάστασης, μηνύματος «προσοχή» |
| `--bad` | `#b91c1c` | `#f87171` | `#ff3b30` | κίνδυνος, σφάλμα πεδίου |
| `--bad-cont` | `#fee2e2` | `#3f1616` | `#2a0503` | φόντο λωρίδας «Χωρίς GPS», σφάλματος |
| `--scrim` | `rgba(5,8,15,.48)` | `rgba(0,0,0,.6)` | `rgba(0,0,0,.78)` | σκίαση πίσω από φύλλο `bottom`/`center` |
| `--shadow-1` | `0 1px 2px rgba(16,24,40,.10), 0 1px 3px rgba(16,24,40,.10)` | `none` | `none` | κάρτες (μόνο Μέρα) |
| `--shadow-2` | `0 8px 24px rgba(16,24,40,.18)` | `0 8px 24px rgba(0,0,0,.5)` | `none` | φύλλα, μήνυμα (snack) |
| `--sbar-bg` | `#0b2a4a` | `#7cb4ff` | `#000000` | **μόνο** η μπάρα εξόδου (= σημερινό `--accent`) |
| `--sbar-fg` | `#ffffff` | `#0b1220` | `#ff3b30` | κείμενο μπάρας εξόδου |

**Μένουν όπως είναι σήμερα** (τιμές και ονόματα):
- `--stbd`, `--port`, `--dest-line`, `--curve`, `--curve-hl`, `--opt`, `--now`·
- `--stale-bg`, `--stale-fg`, `--stale-line` (P-053)·
- `--mc-*` και `--slider-h`·
- `color-scheme` ανά θέμα.

Το `--accent` του Σούρουπου αλλάζει από `#60a5fa` σε `#7cb4ff` (από το πρωτότυπο). Το `--fg` του Σούρουπου αλλάζει από `#f9fafb` σε `#f8fafc`.

### 1.2 Αντιθέσεις (μετρημένες, WCAG)

| | Μέρα | Σούρουπο | Νύχτα |
|---|---|---|---|
| `--fg` σε `--bg` / `--surface` | 20,0 / 18,2 | 17,9 / 15,6 | **5,9 / 5,7** |
| `--muted` σε `--bg` / `--surface` / `--surface-2` | 7,7 / 7,0 / 6,3 | 8,6 / 7,5 / 6,5 | 5,3 / 5,1 / 5,0 |
| `--line` σε `--bg` / `--surface` | 5,0 / 4,5 | 4,4 / 3,9 | 3,2 / 3,1 |
| `--accent-fg` σε `--accent` | 14,5 | 8,8 | (Νύχτα: δεν χρησιμοποιείται, §1.3) |
| `--on-accent-cont` σε `--accent-cont` | 16,0 | 9,4 | 5,3 |
| `--fair` σε `--bg` | 5,0 | 11,2 | 4,2 (μόνο για σχήμα, όχι για κείμενο) |

Το παλιό `--muted` της Νύχτας (`#d8372c`) έδινε 4,50 σε `#000` και 4,35 σε κάρτα, δηλαδή κάτω από το όριο. Το νέο `#e5483d` περνά (A2). G/B: 72/61 έναντι 0,6·229 = 137 (Κ2 εντάξει).

### 1.3 Κανόνες Νύχτας (Κ2)
- Γεμάτο κουμπί, γεμάτο κουμπί κινδύνου, ενεργό «χάπι», ενεργό segmented, ενεργός διακόπτης: `background:#000; color:var(--fg); border:2px solid var(--fg)`. Ποτέ κόκκινο φόντο με μαύρα γράμματα, εκτός από τη ζώνη «ΤΩΡΑ» (D8, όπως σήμερα).
- Ο σύνδεσμος/κουμπί κειμένου είναι `color:var(--fg)` με υπογράμμιση (το χρώμα δεν φτάνει για να ξεχωρίσει).
- Καμία σκιά. Τα φύλλα έχουν `border:2px solid var(--line)`.
- Κανένα `#fff`, `rgba(255,255,255,…)`, μπλε ή πράσινο, ούτε σε `:focus-visible` (`outline: 3px solid var(--fg)`), ούτε σε placeholder (`::placeholder { color: var(--muted) }`).

### 1.4 Δύο σημεία που θέλουν απόφαση (δεν μπλοκάρουν την αρχή)
1. **Κ3 «σώμα ≥ 7:1» δεν βγαίνει στη Νύχτα.** Το `#ff3b30` σε `#000` δίνει 5,9:1. Το καθαρό `#ff0000` δίνει ακόμα λιγότερο (5,3:1). Για 7:1 χρειάζεται `#ff6b5e` (7,5:1), που είναι πιο φωτεινό και πιο ροζ, άρα χαλάει λίγο την προσαρμογή του ματιού στο σκοτάδι. **Πρόταση UX:** για τη Νύχτα το Κ3 να μετρά **≥ 4,5:1** για όλο το κείμενο, και το `--fg` να μένει `#ff3b30`. Το φως του περιβάλλοντος τη νύχτα είναι χαμηλό, οπότε η αντίθεση 5,9 αρκεί. Ο developer υλοποιεί με `#ff3b30`. Αν ο ιδιοκτήτης ζητήσει 7:1, αλλάζει μόνο μία τιμή. Την απόφαση την παίρνει ο `product-owner` ή ο ιδιοκτήτης και την καταγράφει η QA.
2. **`--fair` της Νύχτας (4,2:1).** Χρησιμοποιείται σήμερα και ως χρώμα κειμένου (`.warn-text`, `.ls-pct.fair`, `.tile.fair .tile-value`). **Κανόνας Φ-A:** στη Νύχτα το κείμενο «προσοχής» παίρνει `color: var(--fg)` με «!» μπροστά. Το `--fair` μένει μόνο για περιγράμματα και τελείες. Δεν αλλάζει η τιμή του token.

## 2. Γραμματοσειρά Inter

### 2.1 Από πού
- Πακέτο npm **`@fontsource-variable/inter@5.3.0`** (άδεια **SIL OFL 1.1**). **Μην το εγκαταστήσεις ως εξάρτηση runtime** και μην κάνεις `import '@fontsource-variable/inter'`. Το `index.css` του πακέτου φέρνει 7 υποσύνολα (κυριλλικά, βιετναμέζικα κ.λπ.), και θα έμπαιναν όλα στο precache.
- Πάρε **μόνο δύο αρχεία** από το `files/` του πακέτου (π.χ. με `npm pack @fontsource-variable/inter@5.3.0` σε φάκελο εκτός repo):

| Αρχείο του πακέτου | Μέγεθος | Αντιγραφή ως |
|---|---|---|
| `files/inter-latin-wght-normal.woff2` | 48.256 B | `src/assets/fonts/inter-latin-wght.woff2` |
| `files/inter-greek-wght-normal.woff2` | 18.996 B | `src/assets/fonts/inter-greek-wght.woff2` |
| `LICENSE` | — | `src/assets/fonts/OFL.txt` |

  **Σύνολο 67 KB** (όριο A3: 120 KB). Δεν χρειάζεται εργαλείο subsetting. Το spec αναφέρει ενδεικτικά ένα αρχείο `InterVariable-greek-latin.woff2`· τα δύο αρχεία με `unicode-range` κάνουν την ίδια δουλειά. Τα πολυτονικά (`greek-ext`) δεν μπαίνουν.
- Γράψε στο `src/assets/fonts/README.md` την πηγή, την έκδοση και την άδεια (μία γραμμή η καθεμία). Στην οθόνη «Σχετικά» των Ρυθμίσεων προστίθεται, αν υπάρχει λίστα αδειών, η γραμμή «Inter · SIL Open Font License 1.1». Αλλιώς μένει μόνο το αρχείο.

### 2.2 `@font-face` (στην κορυφή του `styles.css`)
```css
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url('../assets/fonts/inter-latin-wght.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329,
    U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url('../assets/fonts/inter-greek-wght.woff2') format('woff2');
  unicode-range: U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF;
}
:root { --font: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif; }
html, body { font-family: var(--font); font-weight: 500; }
```
- Τα σύμβολα που δεν έχει το υποσύνολο (✓ ✕ ⇄ ↶ ★ ⟨⟩) πέφτουν στη γραμματοσειρά του συστήματος. Αυτό είναι αποδεκτό. Τα ′ ″ − ↑ ↓ είναι μέσα (U+2000–206F, U+2191/2193, U+2212).
- **Precache (Κ6):** το `vite.config.ts` έχει ήδη `globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}']`. Η QA ελέγχει στο `dist/sw.js` ότι υπάρχουν και τα δύο `.woff2`, και offline ότι δεν γίνεται κλήση εκτός origin.
- **Χωρίς `<link rel="preload">`**: τα ονόματα έχουν hash του Vite. Το `swap` και το precache αρκούν (A4).
- **A4, μετακίνηση διάταξης:** τα σημεία που κινδυνεύουν είναι οι τίτλοι με `nowrap` + «…» και τα νούμερα του Live με σταθερό ύψος γραμμής. Δεν χρειάζεται fallback με `size-adjust`. Αν η QA δει αναδίπλωση > 1 γραμμή σε 320 px, προσθέτουμε μετά.

### 2.3 Κλίμακα
Σε `em` της ρύθμισης `html` 17 / 20 / 23 px (A5, δεν αλλάζει).

| Token / κλάση | Μέγεθος | Βάρος | Χρήση |
|---|---|---|---|
| `--t-display` | `4.4em` | 900 | το μεγάλο νούμερο του Live (Φ-D) |
| `--t-tile` | `2.6em` | 900 | νούμερο πλακιδίου |
| `--t-title` | `1.45em` | 800 | χαιρετισμός, όνομα Προφίλ |
| `--t-section` | `1.05em` | 800 | επικεφαλίδα ενότητας (`h3`) |
| σώμα | `1em` | 500 | παντού |
| `--t-caption` | `max(13px, 0.8em)` | 600 | λεζάντα, `.small`, `.muted.small` |
| ετικέτα κουμπιού | `1em` (κύριο `1.05em`) | 800 | |
| ετικέτα πλοήγησης | `clamp(13px, 0.76em, 15px)` | 700 (ενεργή 800) | |

- Το `.small` σήμερα είναι `0.85rem` (14,5 px), οπότε μένει πάνω από 13 px. Όπου υπάρχουν `0.72rem`–`0.78rem` (π.χ. `.race-strip.quiet` 0,78rem = 13,3 px, `.tab-label`), γίνονται `max(13px, …)`.
- **Νούμερα:** κάθε στοιχείο με νούμερα που αλλάζουν (`.val`, `.tile-value`, `.modeb .t`, `.big-num`, `.nm-val`, `table.leader .num`, `.stats b`) παίρνει `font-variant-numeric: tabular-nums` και `font-weight: 900`. Χωρίς `transition` (D7).
- `letter-spacing: -0.02em` μόνο στα νούμερα ≥ 2em.

## 3. Απόσταση, γωνίες, σκιές, κίνηση, στόχοι

Στο `:root` (ίδια σε όλα τα θέματα):
```css
--s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;
--r-s: 10px;   /* τσιπ, μικρά εικονίδια */
--r-m: 14px;   /* κουμπιά, πεδία, segmented */
--r-l: 20px;   /* κάρτες, πλακίδια */
--r-xl: 28px;  /* πάνω γωνίες φύλλου bottom· όλες οι γωνίες στο center */
--r-pill: 999px;
--hit: 48px; --hit-main: 56px;
--dur-1: 120ms; --dur-2: 220ms; --ease: cubic-bezier(.2, 0, 0, 1);
```
- **Στόχοι:** κάθε `button`, `a`, `[role=button]`, `select`, `input` ≥ `var(--hit)` σε ύψος **και** πλάτος. Το κύριο κουμπί της οθόνης, το «■ Τέλος», το «Συνέχεια» και τα κουμπιά φύλλων είναι `var(--hit-main)`. Απόσταση ανάμεσα σε γειτονικούς στόχους ≥ `--s2`.
- Τα σημερινά `min-height: 40px`/`44px` (`.race-strip .link`, `.btn.small-btn`, `.inst-pill` 36px, `.topbar .top-btn` 40px, `.schip`) ανεβαίνουν σε 48px. Όπου το ορατό σχήμα πρέπει να μείνει μικρό (τσιπ 30–36 px), ο στόχος μεγαλώνει με διάφανο `::before { inset: -8px }` ή με padding.
- **Σκιές:** μόνο `var(--shadow-1)` στις κάρτες και `var(--shadow-2)` σε φύλλο/snack. Στο Σούρουπο και στη Νύχτα είναι `none` από τα tokens, οπότε δεν χρειάζεται κανόνας ανά θέμα.
- **Κίνηση:** πάτημα κουμπιού `transform: scale(.98)` σε `var(--dur-1)`. Το φύλλο ανεβαίνει με `translateY(40px) → 0` σε `var(--dur-2)`, και το «χάπι» αλλάζει φόντο σε `var(--dur-2)`. Τίποτε άλλο.
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```
  Η κουκκίδα καταγραφής (`.rec`) μένει **σταθερή** με reduced motion (υπάρχει ήδη).

## 4. Κέλυφος

### 4.1 Πάνω μπάρα (A6–A9)

| Κατάσταση | Μπάρα |
|---|---|
| Εκτός εξόδου, Αρχική | `header.topbar`: `[τσιπ σκάφους] [κενό] [TestBadge] [InstrumentPill]` (+ avatar στη Φ-B) |
| Εκτός εξόδου, άλλη καρτέλα | `[κενό 4px] [τίτλος] [TestBadge] [InstrumentPill]` |
| Στήσιμο / Γρήγορη ματιά (`hasBack`) | `[← Πίσω] [τίτλος] [TestBadge] [InstrumentPill]` |
| Μέσα σε έξοδο | μόνο `SessionBar` (σκούρα), όπως σήμερα |

CSS της ανοιχτής μπάρας:
```css
.topbar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; gap: var(--s2);
  min-height: 64px;
  padding: calc(env(safe-area-inset-top) + var(--s2)) var(--s3) var(--s2);
  padding-left: calc(env(safe-area-inset-left) + var(--s3));
  padding-right: calc(env(safe-area-inset-right) + var(--s3));
  background: var(--surface);          /* Μέρα (A6) */
  color: var(--fg);
  border-bottom: 1px solid var(--line-soft);
}
:root[data-theme='dark'] .topbar { background: var(--bg); }
:root[data-theme='night'] .topbar { background: #000; border-bottom: 2px solid var(--line); }
.top-title { flex: 1; min-width: 0; font-size: 1.1em; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.topbar .top-btn.back { min-width: var(--hit); min-height: var(--hit); border-radius: var(--r-pill); }
```
- Το «←» γίνεται SVG `back` (§8) μέσα στο ίδιο κουμπί, με το ίδιο `aria-label="Πίσω"`.
- **Τίτλος στην Αρχική (Φ-A):** το `<b data-testid="screen-title">Νέα έξοδος</b>` μένει στο DOM με κλάση `sr-only`, δηλαδή ορατό μόνο σε αναγνώστη οθόνης. Τα 15 E2E με `toHaveText` περνούν, γιατί δεν ελέγχουν ορατότητα. Στη Φ-C το `screen-title` περνά στον χαιρετισμό (C1).
- **`InstrumentPill`:** `min-height: var(--hit)`, `border: 2px solid var(--line)`, `background: var(--bg)`, `border-radius: var(--r-pill)`. Η κατάσταση φαίνεται με τελεία **και** κείμενο («Όργανα» / «Όργανα ✕»). Σε πλάτος < 22em, ή όταν δεν χωρά, κρύβεται το `.inst-text` και μένει τελεία + εικονίδιο. Το `aria-label` υπάρχει ήδη.
- **`TestBadge`:** μένει. Στη Μέρα `--fair-cont`/`--fg` με `1px solid var(--fair)`· στη Νύχτα όπως σήμερα.
- **Μπάρα εξόδου:** `.sbar { background: var(--sbar-bg); color: var(--sbar-fg); }`. Ο κανόνας `:root[data-theme='night'] .sbar` μένει. Τα `.sb` γίνονται `min-height: var(--hit-main)` (ήδη 52 → 56) και `border-radius: var(--r-m)`. Το `.rec` στη Μέρα/Σούρουπο: `background: #ef4444; box-shadow: 0 0 0 2px currentColor`, όπως στο πρωτότυπο.

### 4.2 Τσιπ σκάφους (A8), αντικαθιστά το `<select class="boat-select">`

**Component** `BoatChip` (στο `App.tsx` ή σε νέο `BoatChip.tsx`):
```tsx
<button type="button" className="boat-chip" data-testid="boat-chip"
  aria-haspopup="dialog" aria-label={`Ενεργό σκάφος: ${name ?? 'κανένα'}. Αλλαγή`}>
  <Icon name="boats" /> <span className="bc-name">{name ?? 'Χωρίς σκάφος'}</span> <Icon name="chev-down" />
</button>
```
- CSS: `display:inline-flex; align-items:center; gap:6px; min-height:var(--hit); max-width:min(72%, 20em); padding:0 var(--s3) 0 var(--s2); border:2px solid var(--line); border-radius:var(--r-pill); background:var(--bg); font-weight:800;`· `.bc-name { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }`. Στη Νύχτα `background:#000; border-color:var(--fg)`.
- Το εικονίδιο `boats` του `Icons.tsx` σήμερα είναι «τρεις γραμμές» (μενού). Για το τσιπ χρησιμοποίησε το `cruise` (πανί) ή πρόσθεσε `boat` (§8). **Μην** μπει εικονίδιο μενού στο τσιπ, γιατί διαβάζεται ως «μενού».
- **Πάτημα:** ανοίγει `SheetFrame` «Ενεργό σκάφος» (`testId="boat-sheet"`) με `role="radiogroup"` `aria-label="Ενεργό σκάφος"`. Κάθε σκάφος είναι γραμμή 56 px `role="radio"` `aria-checked` με όνομα (2 γραμμές το πολύ), αριθμό πανιού σε λεζάντα και ✓ στο επιλεγμένο. Ένα πάτημα επιλέγει και κλείνει (`updateSettings({ activeBoatId })`). Κάτω υπάρχει κουμπί κειμένου «Σκάφη ›», που ανοίγει την καρτέλα «Σκάφη».
- **Χωρίς σκάφη:** το τσιπ γράφει «Χωρίς σκάφος» και ανοίγει την καρτέλα «Σκάφη» (όχι φύλλο).
- **Ένα σκάφος:** ανοίγει το ίδιο φύλλο με μία γραμμή και το «Σκάφη ›». Έτσι η συμπεριφορά μένει σταθερή.
- **E2E:** 20 σημεία κάνουν `getByRole('combobox', { name: 'Ενεργό σκάφος' }).selectOption(...)`. Πρώτη εργασία της QA πριν από το PR: helper `selectBoat(page, name)` που σήμερα κάνει `selectOption` και στη 0.19.0 κάνει `getByTestId('boat-chip').click()` → `getByRole('radio', { name })`. Το commit γράφει «άλλαξε δομή: boat-select → boat-chip».

### 4.3 Κάτω πλοήγηση (A10)
```css
.tabbar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
  display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr));
  background: var(--surface); border-top: 1px solid var(--line-soft);
  padding: var(--s1) calc(env(safe-area-inset-right) + var(--s1)) calc(env(safe-area-inset-bottom) + var(--s1)) calc(env(safe-area-inset-left) + var(--s1));
}
.tabbar button { min-width: 0; min-height: 64px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  background: none; border: 0; color: var(--muted); font-size: clamp(13px, 0.76em, 15px); font-weight: 700; box-shadow: none; }
.tabbar .tab-icon { width: 64px; height: 34px; border-radius: 17px; display: flex; align-items: center; justify-content: center;
  transition: background var(--dur-2) var(--ease); color: inherit; }
.tabbar button.on { color: var(--fg); font-weight: 800; }
.tabbar button.on .tab-icon { background: var(--accent-cont); color: var(--on-accent-cont); }
:root[data-theme='night'] .tabbar { background: #000; border-top: 2px solid var(--line); }
:root[data-theme='night'] .tabbar button.on .tab-icon { background: #000; color: var(--fg); border: 2px solid var(--fg); }
.tab-label { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```
- Το `--n` μπαίνει inline (`style={{ '--n': tabs.length }}`) ή μένουν οι κλάσεις `.tabs-4`/`.tabs-3`.
- **Σβήνουν** οι σημερινοί κανόνες: `box-shadow: inset 0 3px 0 …` (η γραμμή πάνω από το ενεργό), `.tabbar button { color: var(--fg) }` (γρ. ~1705), `.tab-label { clamp(0.66rem …) }` και `.tabbar.tabs-4 .tab-label { font-size … 3.6vw }`. Μένει ένας κανόνας μεγέθους, αυτός του block.
- Το `.content` κρατά `padding-bottom` = ύψος πλοήγησης + 24px (σήμερα 96px· γίνεται `calc(72px + env(safe-area-inset-bottom) + var(--s5))`).
- `aria-current="page"` στο ενεργό (υπάρχει ήδη). Η ένδειξη δεν είναι μόνο χρώμα: έχει χάπι (σχήμα) και έντονη ετικέτα (Κ5).

### 4.4 Πλαϊνή πλοήγηση σε χαμηλή οριζόντια οθόνη (A11, D5)

**Πότε:** `width > height` **και** `height / htmlFontPx ≤ 30`, ο ίδιος κανόνας με το `side` του `sheetMode()`. **Μην** το κάνεις με `@media (max-height: 30em)`: στα media queries το `em` είναι πάντα 16 px και αγνοεί τη ρύθμιση 17/20/23. Πρόσθεσε στο `hooks.ts`:
```ts
export function navMode(width: number, height: number, fontPx: number): 'bottom' | 'side' {
  return width > height && height / fontPx <= 30 ? 'side' : 'bottom';
}
```
με `useNavMode()`, που ξαναϋπολογίζει σε `resize`/`orientationchange` όπως το `useSheetMode`, και βάζει `data-nav="side"` στο `.app`.
```css
.app[data-nav='side'] { padding-left: calc(100px + env(safe-area-inset-left)); }
.app[data-nav='side'] .tabbar {
  top: 0; bottom: 0; right: auto; width: calc(100px + env(safe-area-inset-left));
  grid-template-columns: 1fr; grid-auto-rows: min-content; align-content: center; gap: var(--s2);
  padding: env(safe-area-inset-top) var(--s1) env(safe-area-inset-bottom) calc(env(safe-area-inset-left) + var(--s1));
  border-top: 0; border-right: 1px solid var(--line-soft);
}
.app[data-nav='side'] .tabbar button { min-height: 64px; }      /* στόχος 100×64 ≥ 48 */
.app[data-nav='side'] .tabbar .tab-icon { width: 56px; height: 32px; }
.app[data-nav='side'] .content { padding-bottom: var(--s5); }
.app[data-nav='side'] .snack { left: calc(100px + 12px); bottom: calc(12px + env(safe-area-inset-bottom)); }
:root[data-theme='night'] .app[data-nav='side'] .tabbar { border-right: 2px solid var(--line); }
```
- Οι ετικέτες μένουν **κάτω** από τα εικονίδια (A11).
- Η `SessionBar` και η `.topbar` είναι δεξιά της πλαϊνής μπάρας (το `padding-left` του `.app` το κάνει μόνο του).
- Με `hasBack` (στήσιμο) δεν υπάρχει πλοήγηση, άρα ούτε `padding-left`.

### 4.5 Λωρίδες (`.net-strip`, `.race-strip`)
- Βάση: `min-height: var(--hit)`, `padding: var(--s2) var(--s4)`, `font-size: max(13px, .84em)`, `font-weight: 700`, `background: var(--fair-cont)`, `border-bottom: 2px solid var(--fair)`, `color: var(--fg)`.
- `.bad` → `--bad-cont` / `--bad`· `.ok` → `--good-cont` / `--good`· `.quiet` → `background: var(--surface)`, `border-bottom: 1px solid var(--line-soft)`.
- Η τελεία `.dot` μένει **και** υπάρχει κείμενο (Κ5). Το κουμπί μέσα (`.link`, «Ξανά», «Εντάξει», «▶ Συνέχεια») γίνεται 48 px.

## 5. Στοιχεία

| Σημερινή κλάση | Νέα εμφάνιση | Σημείωση |
|---|---|---|
| `.btn` | **με περίγραμμα**: `min-height:var(--hit); padding:0 18px; border:2px solid var(--line); border-radius:var(--r-m); background:var(--bg); font-weight:800` | προεπιλογή |
| `.btn.primary` | **γεμάτο**: `background:var(--accent); color:var(--accent-fg); border-color:var(--accent)`. Νύχτα §1.3 | το πολύ **ένα** ορατό ανά οθόνη (A12)· όπου σήμερα υπάρχουν δύο, το δεύτερο γίνεται `.btn.tonal` (λίστα στο PR) |
| νέο `.btn.tonal` | `background:var(--accent-cont); color:var(--on-accent-cont); border-color:transparent`. Νύχτα: `border-color:var(--line)` | δεύτερες ενέργειες |
| νέο `.btn.text`, `.link`, `.link-btn` | `background:none; border:0; color:var(--accent); min-height:var(--hit); padding:0 10px`. Νύχτα: `color:var(--fg); text-decoration:underline` | |
| `.btn.danger` | `background:var(--bg); border-color:var(--bad); color:var(--bad)` | |
| νέο `.btn.danger-fill` | `background:var(--bad); color:var(--bg); border-color:var(--bad)`. Νύχτα: μαύρο με κόκκινο περίγραμμα | «Οριστική διαγραφή» και παρόμοια |
| `.big-btn` | `min-height:var(--hit-main); font-size:1.05em` | το «κύριο» |
| `.btn:active` | `transform:scale(.98); filter:brightness(.92)` | `:disabled` → `opacity:.45`, χωρίς transform |
| `.card` | `background:var(--surface); border:1px solid var(--line-soft); border-radius:var(--r-l); padding:var(--s4); box-shadow:var(--shadow-1); margin-bottom:var(--s3)` | A13 |
| `.tile`, `.rs-tile`, `.bl-tile` | ίδια με την κάρτα, `border-radius:var(--r-l)`, χωρίς σκιά | διάταξη ίδια ως τη Φ-D |
| `input`, `select`, `textarea` | `min-height:var(--hit-main); border:2px solid var(--line); border-radius:var(--r-m); background:var(--bg); padding:0 14px; font-weight:600`· `:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-cont) }` | το `textarea` κρατά monospace και 13px **μόνο** στο «Για προχωρημένους»· αλλιώς `var(--font)` |
| πεδίο με σφάλμα (A14) | `[aria-invalid='true'] { border-color:var(--bad) }`· κείμενο κάτω `.field-err` (`color:var(--bad); font-weight:700`) που αρχίζει με «! » και συνδέεται με `aria-describedby` | Νύχτα: το «!» και το κείμενο είναι αρκετά (Κ5) |
| `.seg` (A15) | `display:grid; grid-auto-flow:column; grid-auto-columns:minmax(0,1fr); background:var(--surface-2); border-radius:var(--r-m); padding:4px; gap:4px; border:0`· `button { min-height:var(--hit); border:0; border-radius:11px; background:none; color:var(--muted); font-weight:800 }`· `.on { background:var(--bg); color:var(--fg); box-shadow:var(--shadow-1) }`· Σούρουπο `.on { background:var(--accent-cont); color:var(--on-accent-cont) }`· Νύχτα `.on { background:#000; border:2px solid var(--fg); color:var(--fg) }` | `role="radiogroup"` + `role="radio"` `aria-checked`. Μόνο κείμενο. Σβήνει το `button + button { border-left }`. Το `.seg.wrap` (> 4 τιμές) μένει πλέγμα με κενό 4px |
| `.seg .stbd.on` / `.port.on` | κρατούν `--stbd`/`--port` ως **περίγραμμα 2px** και όχι ως φόντο, συν το κείμενο «δεξιές»/«αριστερές» | Κ5 |
| `.toggle` + `.knob` | κουμπί 60px ύψος· `.knob` 56×32, `border:2px solid var(--line)`, `background:var(--surface-2)`· `::after` 20×20 `background:var(--line)`· `.on .knob { background:var(--accent); border-color:var(--accent) }`, `.on .knob::after { left:28px; background:var(--accent-fg) }`. Νύχτα: μαύρο με κόκκινο | `role="switch"` `aria-checked` |
| `.chip`, `.schip`, `.badge` | `min-height:32px` ορατό (στόχος 48 με `::before`), `border:1.5px solid var(--line)`, `border-radius:var(--r-pill)`, `background:var(--bg)`, `font-size:max(13px,.8em)`, `font-weight:700`· `.chip.on` όπως το τονικό, με ✓ | |
| `.msg`, `.advice`, `.next-mark`, `.ws-info.warn`, `.mc-verdict`, `.event-fields` (παχιά αριστερή γραμμή) | **φεύγει** η αριστερή γραμμή 4–8 px. Γίνεται `background:var(--X-cont); border:1px solid var(--X); border-radius:var(--r-m)`, όπου X = good / fair / bad / line ανάλογα με την κλάση. Μπροστά από το κείμενο μπαίνει SVG (`warn` για fair/bad, `check` για good) | A13 + Κ5. Το `table.stand .c-total` και το `.seg.wrap` **κρατούν** τη γραμμή τους (είναι δομικές) |
| `.rows li`, `.row-btn`, `.hub-links .btn` | γραμμή λίστας `min-height:56px`, `border-top:1px solid var(--line-soft)`, chevron SVG δεξιά | C7 το ολοκληρώνει στη Φ-C· στη Φ-A μόνο ύψος, γραμμή και χρώματα |
| `.snack` | `background:var(--fg); color:var(--bg); border-radius:var(--r-m); min-height:56px; box-shadow:var(--shadow-2)`· το κουμπί μέσα 48px **χωρίς** περίγραμμα, με υπογράμμιση. Νύχτα όπως σήμερα | ίδια θέση |

Γενικά:
- `:focus-visible { outline: 3px solid var(--fg); outline-offset: 2px; }` παντού. Ποτέ `outline: none` χωρίς αντικατάσταση.
- `.sr-only` (νέα κλάση): `position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap;`.

## 6. Φύλλα και διάλογοι σε όλη την εφαρμογή (A17–A19)

### 6.1 Ένα component
Το `SheetFrame` (σήμερα στο `SessionBar.tsx`) μεταφέρεται στο `src/ui/Sheet.tsx`, με re-export από το `SessionBar.tsx` για να μη σπάσουν τα imports. **Πάντα** καλεί μόνο του το `useSheetMode()`. Το prop `mode` μένει μόνο ως παράκαμψη (π.χ. το `ResultSheet` που θέλει `center` αντί για `side`, όπως σήμερα).

```tsx
<SheetFrame
  title="Ενεργό σκάφος"          // ορατός τίτλος h3, παίρνει την εστίαση (tabIndex=-1)
  onClose={...}
  kind="sheet" | "confirm"        // "confirm" = διάλογος που θέλει απάντηση
  testId="..."
  footer={<>...κουμπιά...</>}     // κολλητό κάτω (sticky)
>
```
Το σημερινό `label` μένει δεκτό ως συνώνυμο του `title`, για συμβατότητα.

### 6.2 Οι τρεις μορφές

| Μορφή | Πότε (`sheetMode`, em της ρύθμισης) | Εμφάνιση | Κλείνει με | ARIA |
|---|---|---|---|---|
| `bottom` | πλάτος < 34em | από κάτω, όλο το πλάτος, `max-height:84dvh`, γωνίες `var(--r-xl) var(--r-xl) 0 0`, λαβή 40×5 πάνω (μόνο διακοσμητική), σκίαση `--scrim`, `padding-bottom: env(safe-area-inset-bottom)` | ✕, «Άκυρο», Escape, πάτημα στη σκίαση | `aria-modal="true"`, παγίδα Tab |
| `center` | ≥ 34em, όχι `side` | ίδιο φύλλο, στο κέντρο οριζόντια και **κάτω** κατακόρυφα, `max-width:34em`, όλες οι γωνίες `--r-xl`, `margin-bottom: var(--s5)` | όπως το `bottom` | όπως το `bottom` |
| `side` | πλάτος ≥ 60em **ή** οριζόντια με ύψος ≤ 30em | πλαϊνό πάνελ δεξιά, `top` = κάτω από τη μπάρα (ή 0), ως κάτω, πλάτος `min(26em, 48vw)`, `border-left:1px solid var(--line)` (Νύχτα 2px), χωρίς λαβή, χωρίς σκίαση, χωρίς κίνηση | **μόνο** ✕, «Έτοιμο»/«Άκυρο», Escape | `aria-modal="false"`, χωρίς παγίδα. Το `.content` παίρνει `padding-inline-end` ίσο με το πλάτος του πάνελ όσο είναι ανοιχτό (κλάση `:root.side-open`) |
| `kind="confirm"` σε οποιαδήποτε μορφή | πάντα | **στο κέντρο της οθόνης**, `max-width:30em`, με σκίαση, γωνίες `--r-xl` | μόνο με τα κουμπιά του και Escape (= «Άκυρο»). **Όχι** με πάτημα έξω | `role="alertdialog"`, `aria-modal="true"`, παγίδα Tab |

Ποια είναι `confirm`:
- `Dialogs.tsx` (`askConfirm`, `showAlert`)·
- «Τέλος εξόδου» / «Τερματισμός αγώνα;»·
- «Τερματίσατε στις …;» (`finish-sheet`, μένει `z-index:70`)·
- «Ξεχασμένη έξοδος»·
- «Κλείσιμο διοργάνωσης;» και «Διαγραφή ιστιοδρομίας»·
- στη Φ-B, «Αποσύνδεση;» και «Διαγραφή λογαριασμού».

Όλα τα άλλα είναι `sheet`:
- «Άνεμος» και αποτέλεσμα (P-053/P-040, ήδη)·
- «Γρήγορες ρυθμίσεις», «Τύπος εξόδου», «Αλλαγή τύπου εξόδου»·
- «Πού πάμε;» (`cruise-dest-sheet`), σημείωση γύρου·
- «Ενεργό σκάφος» (νέο).

### 6.3 Κοινή δομή φύλλου
```
.sheet
  .sh-hdl (μόνο bottom, aria-hidden)
  .sh-head:  h3#id (tabIndex=-1, εστίαση στο άνοιγμα) + button.sh-x [aria-label="Κλείσιμο"] 48×48 με SVG close
  .sh-body   (κύλιση)
  .sh-foot   sticky bottom: 0, border-top 1px var(--line-soft), background var(--bg),
             padding var(--s3) 0 calc(var(--s4) + env(safe-area-inset-bottom))
             κουμπιά σε πλέγμα 2 στηλών minmax(0,1fr): [Άκυρο (με περίγραμμα)] [κύρια (γεμάτο)]
```
- **A18:**
  - Το ✕ φαίνεται πάντα.
  - Δεν ανοίγει δεύτερο φύλλο πάνω από άλλο. Αν ζητηθεί, το πρώτο κλείνει. Εξαίρεση: το `finish-sheet`, που μπαίνει πάνω από όλα, όπως σήμερα.
  - Η εστίαση πάει στο `h3` στο άνοιγμα και επιστρέφει στο στοιχείο που το άνοιξε στο κλείσιμο (κράτα `document.activeElement` στο mount).
- **A19:** η μορφή αλλάζει με `resize`/`orientationchange` **χωρίς unmount** του περιεχομένου (ίδιο React tree, αλλάζει μόνο η κλάση `mode-*` του wrapper). Έτσι δεν χάνεται ό,τι γράφτηκε.
- Τα σημερινά ειδικά CSS (`.wind-sheet.mode-*`, `.result-sheet.mode-center`, `.ws-hdl`, `.ws-head`, `.ws-x`, `.ws-foot`) γίνονται οι κοινές κλάσεις `.sheet.mode-*`, `.sh-hdl`, `.sh-head`, `.sh-x`, `.sh-foot`. Κράτα τα παλιά ονόματα ως επιπλέον κλάσεις όπου τα διαβάζουν E2E (`.ws-steps`, `.ws-sp`). Τα `@container wsheet/rsheet` μένουν.
- Το snack, όσο είναι ανοιχτό φύλλο `bottom`/`center`, ανεβαίνει πάνω (γενίκευση των `:root.wind-sheet-open .snack` → `:root.sheet-open .snack`).
- Ελάχιστο CSS:
```css
.sheet-backdrop { position: fixed; inset: 0; z-index: 50; background: var(--scrim); display: flex; align-items: flex-end; justify-content: center; padding: 0; }
.sheet { width: 100%; background: var(--bg); color: var(--fg); box-shadow: var(--shadow-2); overflow-y: auto; overflow-x: hidden; padding: 0 var(--s4); }
.sheet.mode-bottom { max-height: 84dvh; border-radius: var(--r-xl) var(--r-xl) 0 0; animation: sh-up var(--dur-2) var(--ease); }
.sheet.mode-center { max-width: 34em; max-height: 84dvh; border-radius: var(--r-xl); margin-bottom: var(--s5); animation: sh-up var(--dur-2) var(--ease); }
.sheet.mode-side { position: fixed; right: 0; top: var(--bar-h, 0); bottom: 0; z-index: 45; width: min(26em, 48vw); border-radius: 0; border-left: 1px solid var(--line); box-shadow: none; }
.sheet-backdrop.confirm { align-items: center; padding: var(--s3); z-index: 60; }
.sheet.confirm { max-width: 30em; border-radius: var(--r-xl); }
:root[data-theme='night'] .sheet { border: 2px solid var(--line); }
@keyframes sh-up { from { transform: translateY(40px); opacity: .4; } }
```

## 7. Αντιστοίχιση παλιών μεταβλητών → νέων

| Παλιό | Νέο | Πώς |
|---|---|---|
| `--card` | `--surface` | ψευδώνυμο `--card: var(--surface);` σε κάθε θέμα ως το τέλος της Φ-D (A1). Νέος κώδικας γράφει `--surface` |
| `--line` (97 χρήσεις) | `--line` **ή** `--line-soft` | Το όνομα μένει, αλλάζει η τιμή (§1.1). Πέρασμα: σε **κάρτες, διαχωριστικά, πίνακες, `border-top` γραμμών** γίνεται `--line-soft`. Σε **πεδία, κουμπιά, τσιπ, segmented, λαβή, steppers** μένει `--line` |
| `--muted` | `--muted` | αλλάζει μόνο η τιμή της Νύχτας και του Σούρουπου |
| `--accent` στο `.topbar` | `--surface` / `--bg` | §4.1 |
| `--accent` στο `.sbar` | `--sbar-bg` / `--sbar-fg` | §4.1. Το `--accent` του Σούρουπου αλλάζει, γι' αυτό η μπάρα παίρνει δικό της token |
| `--accent` ως φόντο ενεργού (`.chip.on`, `.ws-sp:active`) | `--accent-cont` + `--on-accent-cont` | εκτός από το γεμάτο κουμπί |
| `color-mix(in srgb, var(--bad) 14%, var(--bg))` (`.net-strip.bad`) | `--bad-cont` | |
| `rgba(0,0,0,.55)` (`.sheet-backdrop`) | `--scrim` | |
| `0 4px 16px rgba(0,0,0,.3)` (`.snack`) | `--shadow-2` | |
| `border-radius: 8px / 10px / 12px / 16px` | `--r-s` (8, 10) · `--r-m` (12 κουμπιά/πεδία) · `--r-l` (12, 16 κάρτες/πλακίδια) | αντικατάσταση με το μάτι ανά κλάση, όχι μαζικά |
| `font-family: system-ui …` | `var(--font)` | `html, body` και `textarea` |
| `#fff` / `#000` γραμμένα στο CSS | `--bg` / `--fg` / `--accent-fg` | Εξαίρεση: οι κανόνες Νύχτας με `#000`, που είναι σκόπιμοι |

Οι ίδιες τιμές μπαίνουν και στο `<meta name="theme-color">` ανά θέμα, αν το ορίζει το `Appearance.tsx`: Μέρα `#f2f4f7`, Σούρουπο `#0b1220`, Νύχτα `#000000`. Μέσα σε έξοδο δίνει `--sbar-bg`.

## 8. Emoji → SVG (A16)

Νέα εικονίδια στο `Icons.tsx` (`viewBox 0 0 24 24`, `stroke="currentColor"`, `aria-hidden`). Τα paths είναι από το εγκεκριμένο πρωτότυπο ή απλά γεωμετρικά.

| Όνομα | Path (αφετηρία) |
|---|---|
| `back` | `M15 5l-7 7 7 7` |
| `chev` | `M9 5l7 7-7 7` |
| `chev-down` | `M6 9l6 6 6-6` |
| `boat` | `M11 3v13H4zM13 6l6 10h-6zM3 18h18l-3 3H6z` |
| `check` | `M5 12l5 5 9-10` |
| `timer` | ίδιο με το υπάρχον `training` |
| `pause` | `M8 5v14M16 5v14` |
| `play` | `M7 5l12 7-12 7z` |
| `stop` | `M6 6h12v12H6z` |
| `undo` | `M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3` |
| `swap` | `M7 7h13l-3-3M17 17H4l3 3` |
| `mute` | `M11 5L6 9H3v6h3l5 4zM16 9l5 6M21 9l-5 6` |
| `sound` | `M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13` |
| `list` | `M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01` |
| `lock` | `M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3` |
| `star` | `M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z` |
| `bulb` | `M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z` |

Πού (λίστα από το `src/ui`, εκτός `legal.tsx` και κειμένων οδηγού):

| Emoji / σύμβολο | Αρχεία | Γίνεται |
|---|---|---|
| ⏱ | `SessionLiveViews.tsx`, `TrainingContext.tsx`, `PlanView.tsx`, `sessionText.ts` (`lapBtn`) | `timer` μπροστά από το κείμενο. Το `lapBtn` χάνει το «⏱ » από το string και το εικονίδιο μπαίνει στο JSX |
| ⏸ / ▶ / ■ | `SessionBar.tsx`, `SessionLiveViews.tsx`, `RaceContext.tsx`, `sessionText.ts`, `HistoryView.tsx`, `RaceView.tsx` | `pause` / `play` / `stop`. Το κείμενο «Παύση», «Συνέχεια», «Τέλος» μένει |
| 🔕 / 🔊 | `RaceScreen.tsx`, `RaceAlerts.tsx`, `AlertsCard.tsx` | `mute` / `sound` |
| ↶ / ↺ / ↻ | `SessionBar.tsx`, `HistoryView.tsx`, `TrainingContext.tsx`, `CrewViews.tsx`, `PlanView.tsx`, `AccountCard.tsx`, `AppUpdater.tsx`, `ModelCompareCard.tsx`, `NextMarkCard.tsx` | `undo` / `rotate` |
| ⇄ | `SessionBar.tsx`, `SessionLiveViews.tsx`, `sessionText.ts` (`toCruise`/`toTraining`) | `swap`. Το κείμενο «Άλλαξε σε Αναψυχή» μένει (απόφαση γλωσσαρίου) |
| ⚙ | `SessionBar.tsx`, `LiveView.tsx`, `AlertsCard.tsx` | `gear` (υπάρχει) |
| ⚠ | `CrewViews.tsx`, `LiveView.tsx`, `AdvisorCard.tsx`, `ModelCompareCard.tsx` | `warn` (υπάρχει) |
| ✎ | `sessionText.ts`, `RaceCourse.tsx`, `Onboarding.tsx` | `pen` (υπάρχει) |
| ★ | `SessionLiveViews.tsx`, `TrainingSummary.tsx`, `LiveView.tsx`, `sessionText.ts` | `star` όπου είναι εικονίδιο κουμπιού. Μέσα σε κείμενο λίστας γύρων («Γύρος 3: 4:12 ★») **μένει** ως χαρακτήρας |
| 📋 | `CrewViews.tsx` | `list` |
| 🔒 | `AdvisorCard.tsx` | `lock` |
| 💡 | `Appearance.tsx` | `bulb` |
| 📄 / 📲 / ①…⑥ | `Onboarding.tsx` | `doc`/`download`, αριθμοί σε κύκλο με CSS (`.step-n`) |
| ✕ σε κουμπί κλεισίματος | `App.tsx`, `AppUpdater.tsx`, `BoatEditor.tsx`, `PlanView.tsx`, `RaceCourse.tsx`, `RaceView.tsx`, `SessionBar.tsx` | `close` |
| ← σε κουμπί | `App.tsx`, `HistoryView.tsx`, `HubViews.tsx`, `eventText.ts` (`back`, `backEvent`) | `back` στο JSX, και το κείμενο χωρίς «← » |

**Μένουν ως χαρακτήρες μέσα σε κείμενο:** ✓ ✕ ! (Κ5), → ↑ ↓ σε προτάσεις, ≈ ≤ ≥ −, ′ ″ ⟨⟩, ♪ (`FINISH_TEXT.tones`), ⇆ («Σύρε τον πίνακα»), ▾▸▴◂ στα `details`. Για το ✓ στις λωρίδες («Συνδέθηκε ξανά ✓») δεν αλλάζει τίποτα.

Όπου αλλάζει string με emoji που το ελέγχει E2E (π.χ. `getByRole('button', { name: '⏸ Παύση' })`), το test αλλάζει στο ίδιο PR. Το accessible name γίνεται σκέτο «Παύση», γιατί το SVG έχει `aria-hidden`.

## 9. Έλεγχος πριν από την QA (από τον developer)
1. 320×640, «Πολύ μεγάλα», 3 θέματα: Αρχική (με 0, 1 και 3 σκάφη, όνομα «Αύρα του Σαρωνικού»), Ιστορικό, Σκάφη, Ρυθμίσεις, στήσιμο αγώνα, Live αγώνα, φύλλο «Άνεμος», «Ενεργό σκάφος», `askConfirm`. Χωρίς οριζόντια κύλιση.
2. 844×390 (οριζόντια): πλαϊνή πλοήγηση, φύλλο σε `side`, `askConfirm` στο κέντρο.
3. 768×1024 και 1280×800: φύλλο `center` και `side`.
4. Offline από την αρχή: κείμενο σε Inter (DevTools → Rendered fonts), καμία κλήση εκτός origin.
5. `prefers-reduced-motion`: χωρίς κίνηση φύλλου και χαπιού.
6. Νύχτα: script Κ2 (G, B ≤ 0,6·R) σε όλα τα `getComputedStyle` χρώματα της σελίδας.

Ο `sailing-ui-ux` κάνει οπτικό έλεγχο με το πρωτότυπο `design/refresh-2026-11/` (οθόνη «Tokens») πριν από την QA.
