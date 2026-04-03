import { z } from 'zod'

export const profileSchema = z.object({
  age: z.coerce.number().int().min(18, 'Must be at least 18').max(100),
  household_size: z.coerce.number().int().min(1).max(20),
  annual_income: z.coerce.number().min(0),
  monthly_expenses: z.coerce.number().min(0),
  total_debt: z.coerce.number().min(0),
  monthly_debt_payment: z.coerce.number().min(0),
  liquid_savings: z.coerce.number().min(0),
  retirement_savings: z.coerce.number().min(0),
  primary_goal: z.enum([
    'emergency_fund',
    'debt_payoff',
    'retirement',
    'home_purchase',
    'wealth_building',
  ]),
  time_horizon: z.enum(['short', 'medium', 'long']),
  risk_tolerance: z.enum(['conservative', 'moderate', 'aggressive']),
})

export type ProfileData = z.infer<typeof profileSchema>
