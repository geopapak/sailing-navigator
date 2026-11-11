# Sailing Navigator — οδηγίες για τον Claude

- Απαντάς πάντα στα **ελληνικά**. Κώδικας και σχόλια στα αγγλικά.
- Η ομάδα agents και η ροή «ιδέα → product-owner → business-analyst → sailing-ui-ux → sailing-developer / sailing-server-developer → qa-tester → κυκλοφορία» περιγράφονται στο `docs/product/WORKFLOW.md`. Νέες προτάσεις του χρήστη πάνε πρώτα στον `product-owner`.
- Πριν από μεγάλη αλλαγή οθόνης: πρωτότυπο στο `design/` και έγκριση.
- Κάθε deploy: έκδοση στο `package.json`, ελληνική εγγραφή στο `src/releases.json` (`app` / `server`), `npm run changelog`, και αναφορά αν έγινε deploy και με τι αποτέλεσμα. Τα `npx wrangler deploy` και `d1 migrations apply --remote` τα τρέχει ο χρήστης.
- Το repo είναι δημόσιο: όχι προσωπικά δεδομένα, όχι κλειδιά. Τα secrets τα βάζει μόνο ο χρήστης.
- Τεχνικά: `docs/TECHNICAL.md` · τοπικό στήσιμο: `docs/LOCAL_SETUP.md`.
