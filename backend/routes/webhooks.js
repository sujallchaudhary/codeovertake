const express = require('express');
const { Webhook } = require('svix');
const authService = require('../services/authService');

const router = express.Router();

/**
 * Clerk webhooks.
 *
 * Mounted in app.js with `express.raw` and BEFORE `express.json`, because Svix
 * signatures are computed over the exact raw bytes - parsing the body first
 * would make every signature fail.
 *
 * These are a *sync* mechanism, not the critical path: users are provisioned
 * just in time on their first authenticated request (see middlewares/auth.js),
 * so a delayed or dropped webhook never blocks anyone from signing in.
 */

/** Verifies the Svix signature and returns the parsed event, or null. */
function verifyEvent(req) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[CLERK WEBHOOK] CLERK_WEBHOOK_SECRET is not set; refusing the request');
    return null;
  }

  try {
    const wh = new Webhook(secret);
    // req.body is a Buffer here thanks to express.raw
    return wh.verify(req.body, {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch (error) {
    console.error('[CLERK WEBHOOK] Signature verification failed:', error.message);
    return null;
  }
}

router.post('/clerk', async (req, res) => {
  const event = verifyEvent(req);
  if (!event) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const clerkUserId = event.data?.id;
  try {
    switch (event.type) {
      case 'user.created':
      case 'user.updated': {
        // created: usually a no-op because the user is provisioned on first
        // request, but it keeps the mirror warm for accounts made in the Clerk
        // Dashboard. updated: propagates email/name/avatar changes.
        const synced = await authService.syncFromClerk(clerkUserId);
        if (!synced && event.type === 'user.created') {
          await authService.findOrCreateFromClerk(clerkUserId);
        }
        break;
      }

      case 'user.deleted':
        await authService.deleteLocalAccount(clerkUserId);
        break;

      default:
        // Unhandled event types are acknowledged so Clerk stops retrying
        break;
    }
  } catch (error) {
    console.error(`[CLERK WEBHOOK] ${event.type} for ${clerkUserId} failed:`, error.message);
    // 500 so Svix retries with backoff
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  return res.json({ received: true, type: event.type });
});

module.exports = router;
