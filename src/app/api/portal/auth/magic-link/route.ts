import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse, validationError } from '@/lib/api/response'
import { generateMagicLink, sendMagicLink } from '@/lib/auth/magic-link'

const schema = z.object({
  email: z.string().email()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = schema.safeParse(body)
    
    if (!result.success) {
      return validationError(result.error)
    }

    const { email } = result.data

    const client = await prisma.client.findUnique({
      where: { email },
      select: { id: true, email: true, nama: true }
    })

    if (!client) {
      return errorResponse('Email tidak ditemukan', 404)
    }

    const magicLink = await generateMagicLink(client.id, client.email)
    
    const token = magicLink.split('token=')[1]
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000)
    
    await prisma.client.update({
      where: { id: client.id },
      data: {
        verificationToken: token,
        tokenExpiry
      }
    })
    
    await sendMagicLink(client.email, magicLink, client.nama)

    return successResponse({ message: 'Link masuk telah dikirim ke email Anda' })
  } catch (error) {
    console.error('Magic link error:', error)
    return errorResponse('Gagal mengirim link masuk', 500)
  }
}
