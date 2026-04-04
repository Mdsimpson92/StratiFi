import { auth }        from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { queryOne }    from '@/lib/db/client'
import { demoGuard, getDemoAllocation } from '@/lib/demo'

interface ProfileRow {
  annual_income:       number
  monthly_expenses:    number
  total_debt:          number
  monthly_debt_payment:number
  liquid_savings:      number
  retirement_savings:  number
  age:                 number
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const demo = await demoGuard(userId, getDemoAllocation()); if (demo) return demo

    const profile = await queryOne<ProfileRow>(
      `SELECT annual_income, monthly_expenses, total_debt, monthly_debt_payment,
              liquid_savings, retirement_savings, age
       FROM profiles WHERE id = $1`,
      [userId]
    )

    if (!profile) {
      return NextResponse.json({ allocation: null })
    }

    const monthlyIncome = Number(profile.annual_income) / 12
    const liquid    = Number(profile.liquid_savings)
    const retirement = Number(profile.retirement_savings)
    const debt      = Number(profile.total_debt)
    const expenses  = Number(profile.monthly_expenses)
    const age       = Number(profile.age)
    const netWorth  = liquid + retirement - debt

    // Targets
    const emergencyTarget = expenses * 6        // 6 months
    const retirementTarget = Number(profile.annual_income) * Math.max(1, (age - 20) * 0.15)
    const debtTarget = 0

    return NextResponse.json({
      allocation: {
        net_worth:          netWorth,
        liquid_savings:     liquid,
        retirement_savings: retirement,
        total_debt:         debt,
        monthly_income:     monthlyIncome,
        monthly_expenses:   expenses,
        buckets: [
          { label: 'Emergency Fund',  value: liquid,     target: emergencyTarget,  color: '#2ab9b0' },
          { label: 'Retirement',      value: retirement, target: retirementTarget, color: '#1e3166' },
          { label: 'Debt',            value: debt,       target: debtTarget,       color: '#ef4444' },
        ],
      },
    })
  } catch (err) {
    console.error('[/api/allocation]', err)
    return NextResponse.json({ error: 'Failed to load allocation.' }, { status: 500 })
  }
}
