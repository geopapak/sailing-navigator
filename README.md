# Navigator — ORC ιστιοπλοΐα

PWA για targets/VMG, επιλογή πανιών, συμβουλές και διορθωμένο χρόνο ORC. Φάση 1: live mode με χειροκίνητη εισαγωγή.

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

## Πηγές δεδομένων

- Χάρτης: [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, © OpenStreetMap contributors
- Ναυτικά σημάδια: © [OpenSeaMap](https://openseamap.org) contributors
- Ακτογραμμή: © OpenStreetMap contributors (ODbL)
- Πρόγνωση: [Open-Meteo](https://open-meteo.com) (CC BY 4.0)

## Deploy (GitHub Pages)

Το `.github/workflows/pages.yml` τρέχει τα tests, κάνει build και δημοσιεύει σε κάθε push στο `main`. Στο GitHub: Settings → Pages → Source: GitHub Actions.
