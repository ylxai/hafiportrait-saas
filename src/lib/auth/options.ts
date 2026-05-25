import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { compare } from "bcryptjs";
import {
  ROLE_CLIENT,
  PROVIDER_ID_ADMIN,
  PROVIDER_ID_CLIENT,
} from "@/lib/auth/role-constants";
import { normalizeRawRole } from "@/lib/auth/role-helpers";
import { normalizeEmail } from "@/lib/auth/email-helpers";

// Pre-computed valid bcrypt hash used to keep `compare()` cost roughly
// constant when the user/client isn't found. Without this, an attacker
// could distinguish "unknown email" from "wrong password" via response
// timing. The previous placeholder string was not a structurally valid
// bcrypt encoding — bcryptjs.compare typically returns false on it but
// some internal paths can throw. The value below was generated with
// `bcryptjs.hashSync(<random>, 10)` once at deploy time so it costs the
// same to compare against as a real hash, and shared here so both
// providers behave identically.
const DUMMY_HASH =
  "$2a$10$I7tq13TZOyxcakczoqyxS.EKmoLyNKHmxjTx4R0NjstXXEhgpA7Ka";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      // Provider ID is stable and decoupled from role semantics.
      // See PROVIDER_ID_ADMIN in role-constants.ts for session invalidation warning.
      id: PROVIDER_ID_ADMIN,
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const normalizedEmail = normalizeEmail(credentials.email);

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        // Always hash-compare to prevent timing attacks (use dummy if absent).
        const passwordToCompare = user?.password || DUMMY_HASH;
        const isValid = await compare(credentials.password, passwordToCompare);

        if (!user || !user.password || !isValid) {
          return null;
        }

        // Cross-table email guard: User.email and Client.email each have
        // their own @unique index, but uniqueness is NOT enforced across
        // the two tables. Without this check, a single email could exist
        // in both — letting whichever provider authenticates first win and
        // mint a token under the wrong role (role confusion). Refuse the
        // admin login only when an *approved* Client row owns the same
        // email, so the operator is forced to resolve a real duplicate
        // before either side can sign in.
        //
        // We deliberately ignore unapproved Client rows here: the booking
        // flow lets anyone self-register as a client with an arbitrary
        // email, so blocking on the mere existence of such a row would
        // let an attacker DoS an admin out of their own account by
        // registering as a client under the admin's email. Unapproved
        // clients can't authenticate via the client provider either
        // (see `!client.isApproved` check below), so they pose no role-
        // confusion risk until/unless an admin approves them.
        const collidingClient = await prisma.client.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, isApproved: true },
        });
        if (collidingClient?.isApproved) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          // Normalize role to lowercase so middleware and route-level guards
          // can compare case-insensitively without each call site having to
          // repeat the toLowerCase(). DB column is free-form string today
          // (not an enum), so mixed-case values can leak in via seeds or
          // manual edits — collapse them at the token-issue boundary via
          // the shared `normalizeRawRole` helper so the issue-time and
          // read-time normalization (used by middleware + route guards)
          // stay in lock-step. Handles null/undefined/non-string defensively
          // so a routine bad-login can't surface as a 500.
          role: normalizeRawRole(user.role),
        };
      },
    }),
    CredentialsProvider({
      id: PROVIDER_ID_CLIENT,
      name: "Client",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const normalizedEmail = normalizeEmail(credentials.email);

        const client = await prisma.client.findUnique({
          where: { email: normalizedEmail },
          select: {
            id: true,
            email: true,
            nama: true,
            password: true,
            isApproved: true,
          },
        });

        // Constant-time compare against either the real or a dummy hash so we
        // don't leak whether the email exists.
        const hashToCompare = client?.password || DUMMY_HASH;
        const isValid = await compare(credentials.password, hashToCompare);

        // Reject if the row is missing OR the row is legacy and never had a
        // password set (column nullable for backwards-compat) OR the password
        // doesn't match. The admin must (re-)set a password before such a
        // legacy client can log in.
        if (!client || !client.password || !isValid) {
          return null;
        }

        // Reject self-registered clients that haven't been approved by an
        // admin yet. The booking-flow flips `isApproved` to `false` for new
        // rows; admin-created and pre-existing rows default to `true`.
        // Returning null (instead of throwing a custom error) keeps the
        // browser-side message generic ("Email atau password salah"), which
        // matches the timing-safe behaviour above and avoids leaking that
        // an account exists in pending state. Admin should communicate
        // approval status out-of-band (WhatsApp/email) once they click
        // approve in the dashboard.
        if (!client.isApproved) {
          return null;
        }

        // Cross-table email guard (symmetric to the admin provider above):
        // refuse the client login when a User row owns the same email so a
        // shared address can't silently authenticate under the wrong role.
        const collidingAdmin = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        });
        if (collidingAdmin) {
          return null;
        }

        return {
          id: client.id,
          email: client.email,
          name: client.nama,
          role: ROLE_CLIENT,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
