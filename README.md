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
| `src/ui/` | React UI: Live, Polar, Χρόνος, Σκάφη, Ρυθμίσεις |

Το core (`boat`, `performance`, `scoring`, `nav`) είναι καθαρό TypeScript χωρίς React, για να το χρησιμοποιήσει και το backend της Φάσης 3.

## Μοντέλο polars

Για κάθε TWS η καμπύλη TWA→BSP φτιάχνεται από τις 8 γωνίες του πιστοποιητικού, συν:
- σημείο beat: `BSP = beatVMG / cos(beatAngle)`
- σημείο gybe: `BSP = runVMG / cos(180 − gybeAngle)`
- 0 kt στις 25° και `BSP = runVMG` στις 180°

Γραμμική παρεμβολή ως προς TWA και μετά ως προς TWS. Κάτω από το μικρότερο TWS η ταχύτητα κλιμακώνεται αναλογικά, πάνω από το μεγαλύτερο μένει σταθερή. Ο «συντελεστής απόδοσης» του προφίλ πολλαπλασιάζει όλα τα targets.

## Deploy (GitHub Pages)

Το `.github/workflows/pages.yml` τρέχει τα tests, κάνει build και δημοσιεύει σε κάθε push στο `main`. Στο GitHub: Settings → Pages → Source: GitHub Actions.
