Οπτική περιήγηση της εφαρμογής (στιγμιότυπα, λεζάντα, ορατό κείμενο ανά βήμα) με τα ίδια fixtures του E2E· δεν τρέχει στο `npm run e2e` ούτε στο CI.
Τρέξιμο: `npm run build:e2e` και μετά `npx playwright test -c e2e/tour/playwright.tour.config.ts` (προαιρετικά `TOUR_OUT=<φάκελος>` για άλλο φάκελο εξόδου).
Έξοδος: `e2e/.out/tour/` (εκτός git) με `index.md`· τίποτα δεν φεύγει προς πραγματικό server ή AI.
