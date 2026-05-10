import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { compare } from "bcryptjs";

// Dummy bcrypt hash used to keep `compare()` cost roughly constant when the
// user/client isn't found. Without this, an attacker could distinguish
// "unknown email" from "wrong password" via response timing. Shared here so
// both providers behave the same.
const DUMMY_HASH =
  "$2a$10$dummyhashtopreventtimingattack1234567890123456789012";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      // WARNING: Changing this ID will invalidate all existing admin sessions
      // and require all admins to log in again. Coordinate changes with team.
      id: "admin",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        // Always hash-compare to prevent timing attacks (use dummy if absent).
        const passwordToCompare = user?.password || DUMMY_HASH;
        const isValid = await compare(credentials.password, passwordToCompare);

        if (!user || !user.password || !isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    CredentialsProvider({
      id: "client",
      name: "Client",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const client = await prisma.client.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
          select: { id: true, email: true, nama: true, password: true },
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

        return {
          id: client.id,
          email: client.email,
          name: client.nama,
          role: "CLIENT",
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
