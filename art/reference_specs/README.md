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

E1 `materials-construction` is the first fully guarded reference area. The original combined `01-surfaces-stock` spec was removed after five source rejects repeatedly collapsed the yellow folded sheet and galvanized L-profile. Its canonical replacement is two separate 4-specimen sheet-parts: `01a-flat-materials` and `01b-profiles-polymers`. Historical rejected outputs remain only under the E1 review/provenance directory and are not canonical visual evidence.
