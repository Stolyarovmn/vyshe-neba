# Asset pipeline: R_BODY / e1_1986

- status: **blocked**
- current step: **visual_review**
- updated: `2026-10-21T08:14:28Z`
- resume allowed: `true`

| step | status | attempt | finished | note |
|---|---|---:|---|---|
| `generate` | ✅ success | 0 | 2026-10-21T08:14:26Z | source identity recovered from provenance |
| `edit` | ⏭️ skipped | 0 | 2026-10-21T08:14:26Z | no separate edit/repair checkpoint declared |
| `archive_original` | ✅ success | 0 | 2026-10-21T08:14:26Z | Google Drive original provenance present |
| `source_prepare` | ✅ success | 1 | 2026-10-21T08:14:26Z |  |
| `pixel_snap` | ✅ success | 1 | 2026-10-21T08:14:26Z |  |
| `normalize` | ✅ success | 1 | 2026-10-21T08:14:26Z |  |
| `aseprite_index` | ✅ success | 1 | 2026-10-21T08:14:26Z |  |
| `qa_auto` | ✅ success | 1 | 2026-10-21T08:14:27Z |  |
| `candidate_manifest` | ✅ success | 0 | 2026-10-21T08:14:28Z |  |
| `visual_review` | ⛔ blocked | 0 | 2026-10-21T08:14:28Z | awaiting hash-bound visual approval for this exact candidate |
| `promote` | ⬜ pending | 0 |  |  |
| `game_tests` | ⬜ pending | 0 |  |  |

Resume:
```bash
python3 tools/art_pipeline/process_asset.py --asset R_BODY --resume ...
```
