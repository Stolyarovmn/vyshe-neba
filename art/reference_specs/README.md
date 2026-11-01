# Machine-readable era-reference production specs

These JSON files are the machine source of truth for production-guard generation of atomic era-reference sheet-parts.

Canonical visual rules still come from `art/docs/ERA_DESIGN_MATRIX.md`, `art/docs/ERA_REFERENCE_CONTRACT.md` and `art/style_bible.txt`. The specs do not replace those documents; they encode each concrete sheet allowlist/forbidden list/layout/archive contract so it can be checked deterministically.

For guarded sheets:

```text
spec JSON
→ production_guard.py validate-spec
→ production_guard.py render-prompt (checked into art/prompts/...)
→ production_guard.py build-request (+ style_bible verbatim once)
→ imagegen_chat_bridge.py build-chat-block
→ imagegen_chat_bridge.py verify-chat-block
→ exact complete chat block immediately before conversational imagegen
→ one imagegen call
→ production_guard.py verify-source
→ untouched Drive archive + SHA-256 provenance
→ structured visual review
→ production_guard.py validate-review
→ only then continue downstream
```

`validate-tree` fails when a generated prompt drifts from its JSON spec. The production-guard regression suite also fails when any E1 `reference-set.json -> role_plan` sheet lacks a corresponding machine spec.

E1 currently has machine-readable specs for all 10 planned atomic sheet-parts: 3 `materials-construction`, 3 `mechanics-infrastructure`, 2 `controls-displays`, and 2 `lighting-signals`. Each contains exactly 8 explicitly enumerated specimens in the canonical 4×2 layout. Duplication, omission, substitution, merging or unlisted specimen classes are source-gate failures.
