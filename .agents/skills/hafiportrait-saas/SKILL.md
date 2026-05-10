```markdown
# hafiportrait-saas Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you the core development patterns, coding conventions, and multi-layer workflows used in the `hafiportrait-saas` TypeScript codebase. You'll learn how to structure code, manage cross-cutting changes across API, validation, and UI layers, and follow repository conventions for maintainable and scalable SaaS application development.

## Coding Conventions

### File Naming

- Use **camelCase** for file names.
  - Example: `userProfile.ts`, `apiRoutes.tsx`

### Import Style

- Use **alias imports** for clarity and modularity.
  ```typescript
  import { getUser } from '@/lib/user';
  import type { User } from '@/types/user';
  ```

### Export Style

- **Mixed**: Both named and default exports are used.
  ```typescript
  // Named export
  export function validateProfile(data: ProfileData) { ... }

  // Default export
  export default function Dashboard() { ... }
  ```

### Commit Messages

- Use **conventional commit** prefixes: `fix`, `feat`, `chore`
  - Example: `feat: add user avatar upload to profile page`
  - Keep commit messages concise (~80 characters).

## Workflows

### Multi-Layer Feature or Bugfix Touching API, Validation, and UI

**Trigger:** When you need to implement or fix a feature/bug that requires coordinated changes across backend API routes, validation logic, and frontend UI components/pages.

**Command:** `/feature-fix-api-ui`

**Step-by-Step Instructions:**

1. **Update or Create API Route Handler(s)**
   - Edit or add files in `src/app/api/[feature]/route.ts`.
   - Example:
     ```typescript
     // src/app/api/user/route.ts
     export async function POST(req: Request) {
       // handle user creation
     }
     ```

2. **Update Validation Schemas**
   - Modify or extend schemas in `src/lib/api/validation.ts`.
   - Example:
     ```typescript
     // src/lib/api/validation.ts
     export const userSchema = z.object({
       name: z.string().min(2),
       email: z.string().email(),
     });
     ```

3. **Update or Fix Frontend UI Components/Pages**
   - Edit files in `src/app/(dashboard)/admin/**/*.tsx` or `src/app/portal/**/*.tsx`.
   - Example:
     ```tsx
     // src/app/portal/UserProfile.tsx
     import { userSchema } from '@/lib/api/validation';

     function UserProfileForm() {
       // use userSchema for validation
     }
     ```

4. **Update Authentication/Authorization Logic (if needed)**
   - Edit `src/lib/auth/options.ts` or related files.
   - Example:
     ```typescript
     // src/lib/auth/options.ts
     export const adminRoles = ['admin', 'superuser'];
     ```

5. **Test the Integrated Flow End-to-End**
   - Manually or via automated tests, verify that the API, validation, and UI work together as expected.

## Testing Patterns

- **Test File Pattern:** Files are named with `*.test.*`.
  - Example: `userProfile.test.ts`
- **Testing Framework:** Not explicitly detected; check test files for framework usage.
- **Test Example:**
  ```typescript
  // userProfile.test.ts
  import { validateProfile } from './userProfile';

  test('validates user profile data', () => {
    expect(validateProfile({ name: 'Jane', email: 'jane@example.com' })).toBe(true);
  });
  ```

## Commands

| Command              | Purpose                                                         |
|----------------------|-----------------------------------------------------------------|
| /feature-fix-api-ui  | Coordinate changes across API, validation, and UI for a feature or bugfix |
```
