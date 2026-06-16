#!/usr/bin/env python3
"""
WHY DO FILES SHOW AS CHANGED AFTER PUSHING? (Double Push Issue)
"""

print("""
╔════════════════════════════════════════════════════════════════════════════╗
║                     🔄 DOUBLE PUSH ISSUE EXPLAINED                        ║
╚════════════════════════════════════════════════════════════════════════════╝

SYMPTOM:
--------
You make changes → push files → Git says committed ✅
But then → files show as "changed" again → need to push SECOND time


ROOT CAUSES (in likelihood order):
──────────────────────────────────

1️⃣  AUTO-FORMATTING ON SAVE (Most Likely)
   ┌─────────────────────────────────────┐
   │ What Happens:                       │
   │ 1. You edit file.tsx                │
   │ 2. Save (Ctrl+S)                    │
   │ 3. ESLint runs auto-fix             │
   │ 4. Prettier reformats               │
   │ 5. File is now \"changed\"            │
   │ 6. You push these changes           │
   │ 7. BUT after push → another format  │
   │    runs → file \"changed\" again      │
   └─────────────────────────────────────┘
   
   Why: ESLint/Prettier can be triggered by:
   - Webpack dev server watching files
   - Next.js Turbopack recompiling
   - Post-save hooks in editors
   - Git hooks (pre-commit)


2️⃣  TYPESCRIPT TYPE CHECKING
   ┌─────────────────────────────────────┐
   │ TypeScript generates .d.ts files    │
   │ on-the-fly during compilation       │
   │ File watcher detects these          │
   │ Runs eslint again                   │
   │ Marks source as \"changed\"           │
   └─────────────────────────────────────┘


3️⃣  NEXT.JS TURBOPACK RECOMPILING
   ┌─────────────────────────────────────┐
   │ Your edit triggers rebuild          │
   │ Webpack/Turbopack processes files   │
   │ During build: auto-fixes applied    │
   │ File watcher sees changes           │
   │ Marks as dirty again                │
   └─────────────────────────────────────┘


4️⃣  GIT HOOKS RUNNING POST-PUSH
   ┌─────────────────────────────────────┐
   │ husky or other hooks might be:      │
   │ - Reformatting committed files      │
   │ - Running linters                   │
   │ - Generating types                  │
   └─────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│                        ✅ SOLUTION #1                       │
│              Disable auto-format on save                    │
├─────────────────────────────────────────────────────────────┤
│ 1. Open VS Code Settings (Ctrl+,)                           │
│ 2. Search: \"Format On Save\"                                │
│ 3. UNCHECK the box                                          │
│ 4. Now manually format when you want:                       │
│    → Right-click → Format Document                          │
│    → Or press Shift+Alt+F                                   │
│                                                             │
│ Bonus: Add this to .vscode/settings.json:                   │
│                                                             │
│ {                                                           │
│   \"editor.formatOnSave\": false,                            │
│   \"editor.defaultFormatter\": \"esbenp.prettier-vscode\",    │
│   \"editor.codeActionsOnSave\": {                            │
│     \"source.fixAll.eslint\": false                          │
│   }                                                         │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│                        ✅ SOLUTION #2                       │
│           Disable ESLint auto-fix on save                   │
├─────────────────────────────────────────────────────────────┤
│ In .vscode/settings.json:                                   │
│                                                             │
│ {                                                           │
│   \"editor.codeActionsOnSave\": {                            │
│     \"source.fixAll.eslint\": false,                         │
│     \"source.organizeImports\": false                        │
│   },                                                        │
│   \"eslint.run\": \"onSave\",  // Change to: onSave only     │
│   \"eslint.autoFixOnSave\": false                            │
│ }                                                           │
│                                                             │
│ Then manually run:                                          │
│   npm run lint:fix                                          │
│   npm run format                                            │
│ BEFORE pushing                                              │
└─────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│                        ✅ SOLUTION #3                       │
│        Format & commit everything BEFORE pushing           │
├─────────────────────────────────────────────────────────────┤
│ 1. Make your changes                                        │
│ 2. Run: npm run lint:fix                                    │
│ 3. Run: npm run format                                      │
│ 4. Run: git status (verify no new changes)                  │
│ 5. Now safe to push:                                        │
│        git add .                                            │
│        git commit -m \"your message\"                        │
│        git push                                             │
│                                                             │
│ Why this works:                                             │
│ - Format tool runs ONCE with full control                  │
│ - No file watcher interference                              │
│ - All changes included in commit                            │
│ - Nothing left to format post-push                          │
└─────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│                        ✅ SOLUTION #4                       │
│          Update ESLint/Prettier ignore files               │
├─────────────────────────────────────────────────────────────┤
│ Create .eslintignore (if doesn't exist):                    │
│                                                             │
│ node_modules                                                │
│ .next                                                       │
│ dist                                                        │
│ build                                                       │
│ .git                                                        │
│ *.generated.ts                                              │
│                                                             │
│ And .prettierignore:                                        │
│                                                             │
│ node_modules                                                │
│ .next                                                       │
│ dist                                                        │
│ public                                                      │
│                                                             │
│ This prevents formatters from re-running on generated     │
│ files which might trigger the double-push cycle            │
└─────────────────────────────────────────────────────────────┘


⚠️  IF YOU ALREADY HAVE DOUBLE PUSH OCCURRING:

Step 1: Check what changed
  ╰─ git status

Step 2: See the diff
  ╰─ git diff <filename>

Step 3: If it's only whitespace/formatting:
  ╰─ Add to .gitignore or format config

Step 4: Force commit with no formatting
  ╰─ HUSKY_SKIP_HOOKS=1 git commit -m \"skip hooks\"
  ╰─ git push


RECOMMENDED FOR YOUR PROJECT:
────────────────────────────

Based on your Next.js 16.2.6 setup:

1. Add to package.json scripts:
   {
     \"scripts\": {
       \"format\": \"prettier --write \\\"src/**/*.{ts,tsx,js,json,css,md}\\\"\",
       \"lint:fix\": \"eslint --fix src/\",
       \"pre-push\": \"npm run lint:fix && npm run format && npm run type-check\"
     }
   }

2. Then before each push, run:
   npm run pre-push
   git add .
   git commit
   git push

3. This ensures:
   ✅ No auto-formatters interfere during push
   ✅ All lint issues fixed
   ✅ All formatting done
   ✅ Types checked
   ✅ Clean git history


═══════════════════════════════════════════════════════════════════════════════

QUICK FIX (TRY THIS NOW):
────────────────────────

1. Open VS Code Settings:
   Ctrl+, → search \"Format On Save\" → UNCHECK

2. Restart VS Code (Ctrl+Shift+P → Developer: Reload Window)

3. Edit file normally

4. Before pushing:
   npm run lint:fix && npm run format

5. Then push:
   git add . && git commit -m \"fix: ...\" && git push

This should eliminate double pushes! 🎉
""")
