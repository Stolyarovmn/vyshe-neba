# Machine-readable era-reference production specs

These JSON files are the machine source of truth for production-guard generation of atomic era-reference sheet-parts.

Canonical visual rules still come from `art/docs/ERA_DESIGN_MATRIX.md`, `art/docs/ERA_REFERENCE_CONTRACT.md` and `art/style_bible.txt`. The specs do not replace those documents; they encode each concrete sheet allowlist/forbidden list/layout/archive contract so it can be checked deterministically.

For guarded sheets:

```text
spec JSON
→ production_guard.py validate-spec
→ production_guard.py render-prompt (checked into art/prompts/...)
→ production_guard.py build-request (+ style_bible verbatim once)
→ one imagegen call
→ production_guard.py verify-source
→ untouched Drive archive + SHA-256 provenance
→ structured visual review
→ production_guard.py validate-review
→ only then continue downstream
```

`validate-tree` fails when a generated prompt drifts from its JSON spec.

The first migrated sheet is E1 `materials-construction/01-surfaces-stock`; the same schema is reusable for the remaining E1 sheet-parts and later eras.
