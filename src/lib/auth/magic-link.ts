import jwt from 'jsonwebtoken'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const JWT_SECRET = process.env.NEXTAUTH_SECRET!
const BASE_URL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'

interface MagicLinkPayload {
  clientId: string
  email: string
}

export async function generateMagicLink(clientId: string, email: string): Promise<string> {
  const token = jwt.sign(
    { clientId, email } as MagicLinkPayload,
    JWT_SECRET,
    { expiresIn: '15m' }
  )
  return `${BASE_URL}/portal/verify?token=${token}`
}

export async function verifyMagicToken(token: string): Promise<MagicLinkPayload | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as MagicLinkPayload
    return payload
  } catch {
    return null
  }
}

export async function sendMagicLink(email: string, magicLink: string, clientName: string) {
  await resend.emails.send({
    from: 'PhotoStudio <noreply@yourdomain.com>',
    to: email,
    subject: 'Link Masuk ke Gallery Anda',
    html: `
      <h2>Halo ${clientName},</h2>
      <p>Klik link di bawah untuk masuk ke gallery Anda:</p>
      <a href="${magicLink}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;">Masuk ke Gallery</a>
      <p style="color:#666;font-size:14px;margin-top:20px;">Link ini berlaku selama 15 menit.</p>
    `
  })
}
