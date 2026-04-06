import Stripe from 'stripe'

// Server-side Stripe client (never exposed to the browser)
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
