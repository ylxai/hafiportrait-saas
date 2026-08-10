# Next.js Mass Codemod Patterns

## withRequestContext Mass-Wrap (2026-05-25, hafiportrait-saas)

### Problem
Sprint 3 Task 3.1: `withRequestContext` wrapper existed but zero route handlers used it.
ALS scope never opened → `getRequestId()` always returned `undefined`.

### Solution: Python codemod script

Key challenges:
1. Import insertion must go AFTER the full import block (including multi-line imports)
2. Function signatures can be multi-line — can't just replace `) {` on declaration line
3. Closing `}` must become `});` — requires brace-depth tracking

```python
import os, re

IMPORT_LINE = "import { withRequestContext } from '@/lib/with-request-context';"
HTTP_METHODS = {'GET', 'POST', 'PATCH', 'DELETE', 'PUT'}
SKIP_FILES = {'src/app/api/auth/[...nextauth]/route.ts'}  # NextAuth = different pattern

def find_import_block_end(lines):
    """Find last line index of import block, handles multi-line imports."""
    last_import_end = -1
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith('import '):
            if '{' in line and '}' not in line:
                # Multi-line import — find closing '}'
                while i < len(lines) and '}' not in lines[i]:
                    i += 1
                last_import_end = i
            else:
                last_import_end = i
        elif last_import_end >= 0 and line == '':
            pass
        elif last_import_end >= 0 and not line.startswith('import ') and line != '':
            break
        i += 1
    return last_import_end

def transform_file(filepath):
    rel_path = filepath.replace('/home/ubuntu/hafiportrait-saas/', '')
    if rel_path in SKIP_FILES:
        return False, "skipped"
    with open(filepath, 'r') as f:
        content = f.read()
    if 'withRequestContext' in content:
        return False, "already done"
    has_method = any(f'export async function {m}(' in content for m in HTTP_METHODS)
    if not has_method:
        return False, "no HTTP methods"

    lines = content.split('\n')
    import_end = find_import_block_end(lines)
    if import_end < 0:
        import_end = 0
    lines.insert(import_end + 1, IMPORT_LINE)
    content = '\n'.join(lines)
    lines = content.split('\n')

    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        match = re.match(r'^(export async function )(GET|POST|PATCH|DELETE|PUT)\(', line)
        if match:
            method = match.group(2)
            new_line = line.replace(
                f'export async function {method}(',
                f'export const {method} = withRequestContext(async ('
            )
            if re.search(r'\)\s*\{$', new_line):
                # Single-line signature
                new_line = re.sub(r'\)\s*\{$', ') => {', new_line)
                new_lines.append(new_line)
                i += 1
            else:
                # Multi-line signature — find closing ') {'
                new_lines.append(new_line)
                i += 1
                while i < len(lines):
                    curr = lines[i]
                    if re.search(r'\)\s*\{$', curr):
                        curr = re.sub(r'\)\s*\{$', ') => {', curr)
                        new_lines.append(curr)
                        i += 1
                        break
                    else:
                        new_lines.append(curr)
                        i += 1

            # Track brace depth to find matching closing '}'
            depth = sum(l.count('{') - l.count('}') for l in new_lines)
            while i < len(lines) and depth > 0:
                curr = lines[i]
                depth += curr.count('{') - curr.count('}')
                if depth == 0:
                    new_lines.append(curr.rstrip() + ');')
                else:
                    new_lines.append(curr)
                i += 1
            continue
        new_lines.append(line)
        i += 1

    with open(filepath, 'w') as f:
        f.write('\n'.join(new_lines))
    return True, "transformed"
```

### Usage
```python
base = '/home/ubuntu/hafiportrait-saas'
route_files = []
for root, dirs, files in os.walk(f'{base}/src/app/api'):
    for f in files:
        if f == 'route.ts':
            route_files.append(os.path.join(root, f))

for filepath in sorted(route_files):
    changed, reason = transform_file(filepath)
    print(f"{'✅' if changed else '⏭️'} {filepath.replace(base+'/', '')} ({reason})")
```

### Result
- 52/53 route files transformed (1 skipped: NextAuth)
- TypeScript clean after transformation
- Commit: `feat(observability): wire withRequestContext to all 52 route handlers`

### Pitfalls
- **Multi-line imports**: Script v1 inserted import INSIDE a multi-line import block → syntax errors. Fix: `find_import_block_end()` tracks `{` without `}` to detect multi-line imports.
- **Multi-line function signatures**: Script v1 only replaced `) {` on declaration line. Fix: loop forward until `) {` found.
- **Brace depth tracking**: Must count ALL braces in `new_lines` accumulated so far, not just current line.
- **NextAuth handler**: `src/app/api/auth/[...nextauth]/route.ts` uses `export { GET, POST } = handlers` pattern — skip it.
- **jq not available**: Use `python3 -c "import json,sys; ..."` instead of `jq` for JSON parsing in terminal.

## require-client-auth Migration (2026-05-25)

### Pattern: Migrate inline auth to shared helper

**Before (5 portal routes):**
```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isClientSession } from '@/lib/auth/role-helpers';
// ...
const session = await getServerSession(authOptions);
if (!isClientSession(session)) {
  return unauthorizedResponse();
}
// use session.user.id
```

**After:**
```typescript
import { NextResponse } from 'next/server';
import { requireClientAuth } from '@/lib/auth/require-client-auth';
// ...
const auth = await requireClientAuth();
if (auth instanceof NextResponse) return auth;
// use auth.user.id
```

**Pitfall:** After replacing imports, grep for ALL remaining `session` references in the file — there may be `session.user.id` deep in query `where` clauses that the import patch doesn't touch.

```bash
grep -n "session" src/app/api/portal/**/*.ts
```
