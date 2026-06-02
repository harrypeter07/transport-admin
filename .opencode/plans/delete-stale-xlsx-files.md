# Delete stale xlsx-importing files

Build fails because `xlsx` was removed from `package.json` but 5 leftover files still import it.

## Files to delete

```
seed-real.ts
seed-real.js
sync-excel.ts
sync-excel.js
inspect_excel.js
```

## Command

```powershell
Remove-Item -LiteralPath "seed-real.ts", "seed-real.js", "sync-excel.ts", "sync-excel.js", "inspect_excel.js"
```

## Verification

After deletion, the build should complete cleanly (`npm run build`). None of these files are imported anywhere in `src/`.
