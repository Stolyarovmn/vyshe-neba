# Asset pipeline: R_FINS / e3_2015

- status: **blocked**
- current step: **visual_review**
- updated: `2026-10-21T08:14:30Z`
- resume allowed: `true`

| step | status | attempt | finished | note |
|---|---|---:|---|---|
| `generate` | ✅ success | 0 | 2026-10-21T08:14:29Z | source identity recovered from provenance |
| `edit` | ⏭️ skipped | 0 | 2026-10-21T08:14:29Z | no separate edit/repair checkpoint declared |
| `archive_original` | ✅ success | 0 | 2026-10-21T08:14:29Z | Google Drive original provenance present |
| `source_prepare` | ✅ success | 1 | 2026-10-21T08:14:29Z |  |
| `pixel_snap` | ✅ success | 1 | 2026-10-21T08:14:29Z |  |
| `normalize` | ✅ success | 1 | 2026-10-21T08:14:29Z |  |
| `aseprite_index` | ✅ success | 1 | 2026-10-21T08:14:29Z |  |
| `qa_auto` | ✅ success | 1 | 2026-10-21T08:14:29Z |  |
| `candidate_manifest` | ✅ success | 0 | 2026-10-21T08:14:30Z |  |
| `visual_review` | ⛔ blocked | 0 | 2026-10-21T08:14:30Z | awaiting hash-bound visual approval for this exact candidate |
| `promote` | ⬜ pending | 0 |  |  |
| `game_tests` | ⬜ pending | 0 |  |  |

Resume:
```bash
python3 tools/art_pipeline/process_asset.py --asset R_FINS --resume ...
```
