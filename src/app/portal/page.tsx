import { redirect } from 'next/navigation';

/**
 * /portal has no content — redirect to /portal/dashboard.
 * This handles the case where middleware sets callbackUrl=/portal
 * after a client logs in from a portal-scoped route.
 */
export default function PortalRootPage() {
  redirect('/portal/dashboard');
}
