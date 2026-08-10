# File Editing Conventions — Chunked Write Protocol

> CRITICAL: Follow these limits when creating or editing files.
> User repeated this multiple times — it is a hard rule, not a suggestion.

---

## Absolute Limits

| File Size | Method | Notes |
|---|---|---|
| **≤ 300 lines** (recommended) | Single `write_file()` | Safe for one operation |
| **≤ 350 lines** (absolute max) | Single `write_file()` | Never exceed this |
| **> 300 lines** | **Split into chunks** | Write 250-300 first, then append |
| **Editing existing file** | `patch()` tool | Surgical find-replace only |
| **New file >300 lines** | Write 250-300 lines | Then append remaining in separate calls |

## Rule of Thumb

- Multiple small operations > one large operation
- If a write takes > 2 seconds, stop and chunk it
- Surgical patches (`patch` tool) should only change the specific lines needed
- NEVER rewrite a file to change one line

## Why This Matters

- Large single writes can timeout
- Rewriting entire large files risks overwriting concurrent changes
- Chunked writes are more reliable and easier to review

## Correct Pattern

Chunked write for large new files:
1. `write_file()` with first 250-300 lines
2. `patch()` to append remaining content

For edits: use `patch()` with exact old_string -> new_string on the specific lines that changed. Never rewrite the whole file.

## Incorrect Pattern

```python
# ❌ WRONG: Rewriting 800-line file to change 2 lines
write_file(path="800-line-file.ts", content="# entire file...")

# ✅ CORRECT: Surgical edit
patch(path="800-line-file.ts",
      old_string="const oldValue",
      new_string="const newValue")
```
