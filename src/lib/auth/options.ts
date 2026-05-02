import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { compare } from "bcryptjs";
import { verifyMagicToken } from "./magic-link";

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

        // Always hash the password to prevent timing attacks
        // Use a dummy hash if user doesn't exist
        const passwordToCompare =
          user?.password ||
          "$2a$10$dummyhashtopreventtimingattack1234567890123456789012";
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
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.token) {
          return null;
        }

        const payload = await verifyMagicToken(credentials.token);

        if (!payload) {
          return null;
        }

        const client = await prisma.client.findUnique({
          where: { id: payload.clientId },
        });

        if (!client || client.email !== payload.email) {
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
