'use client'

import { useState } from 'react'
import { saveProfile } from '@/lib/actions/profile'
import type { ProfileData } from '@/lib/schemas/profile'

const STEPS = 7

const GOAL_OPTIONS: { value: ProfileData['primary_goal']; label: string }[] = [
  { value: 'emergency_fund', label: 'Build an emergency fund' },
  { value: 'debt_payoff', label: 'Pay off debt' },
  { value: 'retirement', label: 'Save for retirement' },
  { value: 'home_purchase', label: 'Buy a home' },
  { value: 'wealth_building', label: 'Build long-term wealth' },
]

const HORIZON_OPTIONS: { value: ProfileData['time_horizon']; label: string }[] = [
  { value: 'short', label: 'Short term (1–3 years)' },
  { value: 'medium', label: 'Medium term (3–7 years)' },
  { value: 'long', label: 'Long term (7+ years)' },
]

const RISK_OPTIONS: { value: ProfileData['risk_tolerance']; label: string }[] = [
  { value: 'conservative', label: 'Conservative — protect what I have' },
  { value: 'moderate', label: 'Moderate — balanced growth' },
  { value: 'aggressive', label: 'Aggressive — maximize growth' },
]

type FormData = Partial<ProfileData>

// ─── Why-this-matters callout ─────────────────────────────────────────────────

function WhyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-teal-50 border-l-4 border-teal-600 rounded-md p-3 text-sm text-gray-700 leading-relaxed">
      <p className="font-semibold text-teal-900 mb-1">Why this matters</p>
      <p>{children}</p>
    </div>
  )
}

// ─── Number input ─────────────────────────────────────────────────────────────

function NumberField({
  label,
  value,
  onChange,
  prefix,
}: {
  label: string
  value: number | undefined
  onChange: (v: number) => void
  prefix?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          min="0"
          value={value ?? ''}
          onChange={e => onChange(Number(e.target.value))}
          className={`w-full border border-gray-300 rounded-md py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 ${prefix ? 'pl-7 pr-3' : 'px-3'}`}
        />
      </div>
    </div>
  )
}

// ─── Radio group ──────────────────────────────────────────────────────────────

function RadioGroup<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string
  name: string
  options: { value: T; label: string }[]
  value: T | undefined
  onChange: (v: T) => void
}) {
  return (
    <div>
      <p className="block text-sm font-medium text-gray-700 mb-2">{label}</p>
      <div className="space-y-2">
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="accent-gray-900"
            />
            <span className="text-sm text-gray-700">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ─── Nav buttons ──────────────────────────────────────────────────────────────

function StepNav({
  onBack,
  onNext,
  onSubmit,
  loading,
  isFirst,
  isLast,
}: {
  onBack?: () => void
  onNext?: () => void
  onSubmit?: () => void
  loading?: boolean
  isFirst?: boolean
  isLast?: boolean
}) {
  return (
    <div className="flex gap-3 mt-6">
      {!isFirst && (
        <button
          type="button"
          onClick={onBack}
          className="flex-1 border border-gray-300 text-gray-700 rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Back
        </button>
      )}
      {isLast ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="flex-1 bg-gray-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'See my results'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className="flex-1 bg-gray-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-700"
        >
          Continue
        </button>
      )}
    </div>
  )
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-4xl mb-3">👋</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Welcome to StratiFi</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          We&apos;re going to ask a few quick questions to personalize your dashboard. It takes about 90 seconds, and every answer makes your insights sharper. Nothing is shared, nothing is sold.
        </p>
      </div>
      <ul className="text-sm text-gray-700 space-y-2 bg-gray-50 rounded-md p-4">
        <li className="flex gap-2"><span className="text-gray-900 font-bold">1.</span> A snapshot of your money — income, debt, savings, goals</li>
        <li className="flex gap-2"><span className="text-gray-900 font-bold">2.</span> An instant 0–100 Financial Health Score</li>
        <li className="flex gap-2"><span className="text-gray-900 font-bold">3.</span> A ranked action plan based on what you told us</li>
      </ul>
      <StepNav onNext={onNext} isFirst />
    </div>
  )
}

function StepPreview({ onBack, onSubmit, loading }: { onBack: () => void; onSubmit: () => void; loading: boolean }) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-4xl mb-3">🚀</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">You&apos;re all set</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          Here&apos;s what you&apos;ll see on the next screen. Each section is built from what you just told us.
        </p>
      </div>
      <ul className="text-sm text-gray-700 space-y-3 bg-gray-50 rounded-md p-4">
        <li><strong>Financial Health Score</strong> — a 0–100 read on where you stand, with the factors driving it.</li>
        <li><strong>Top Actions</strong> — the highest-impact moves to make next, ranked by urgency.</li>
        <li><strong>Cashflow & Forecast</strong> — what came in, what went out, and what&apos;s coming.</li>
        <li><strong>Alerts</strong> — early warnings on spending spikes, missed bills, surprise charges.</li>
        <li><strong>Expenses & Subscriptions</strong> — where your money actually goes; recurring charges to trim.</li>
        <li><strong>Allocation</strong> — how your money splits across emergency fund, retirement, and debt.</li>
      </ul>
      <p className="text-xs text-gray-500 text-center">A guided tour will walk you through everything once you land on the dashboard.</p>
      <StepNav onBack={onBack} onSubmit={onSubmit} loading={loading} isLast />
    </div>
  )
}

function Step1({
  data,
  onChange,
  onNext,
  onBack,
}: {
  data: FormData
  onChange: (f: Partial<ProfileData>) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">About you</h2>
      <WhyBox>
        Age sets the math. The same $500/month saved at 25 vs. 45 lands you in completely different places at retirement, and your plan should reflect which one you are. Household size sets your real emergency target: a solo earner needs roughly 3 months of expenses banked; a family of four needs 6+. Skip these and the plan I build is for the wrong life.
      </WhyBox>
      <NumberField label="Age" value={data.age} onChange={v => onChange({ age: v })} />
      <NumberField
        label="Household size"
        value={data.household_size}
        onChange={v => onChange({ household_size: v })}
      />
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  )
}

function Step2({
  data,
  onChange,
  onNext,
  onBack,
}: {
  data: FormData
  onChange: (f: Partial<ProfileData>) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Income & expenses</h2>
      <WhyBox>
        The gap between these two numbers is the only one that builds wealth. Debt-payoff speed, emergency-fund timeline, retirement trajectory — all of it sits downstream of that gap. Give me both and I&apos;ll tell you whether you&apos;re widening it or shrinking it, which expenses are eating the most return, and exactly how many dollars per month you can redirect without changing your life.
      </WhyBox>
      <NumberField
        label="Annual income"
        value={data.annual_income}
        onChange={v => onChange({ annual_income: v })}
        prefix="$"
      />
      <NumberField
        label="Monthly expenses"
        value={data.monthly_expenses}
        onChange={v => onChange({ monthly_expenses: v })}
        prefix="$"
      />
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  )
}

function Step3({
  data,
  onChange,
  onNext,
  onBack,
}: {
  data: FormData
  onChange: (f: Partial<ProfileData>) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Debt</h2>
      <WhyBox>
        Every $1 servicing old debt is $1 not compounding for you. Total debt + monthly payment lets me calculate the real interest tax you&apos;re paying each year and rank your loans by which one costs the most per dollar killed. You&apos;ll see the exact payoff date for each balance — and whether attacking debt or building savings first puts more in your pocket over the next 12 months.
      </WhyBox>
      <NumberField
        label="Total debt outstanding"
        value={data.total_debt}
        onChange={v => onChange({ total_debt: v })}
        prefix="$"
      />
      <NumberField
        label="Monthly debt payment"
        value={data.monthly_debt_payment}
        onChange={v => onChange({ monthly_debt_payment: v })}
        prefix="$"
      />
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  )
}

function Step4({
  data,
  onChange,
  onNext,
  onBack,
}: {
  data: FormData
  onChange: (f: Partial<ProfileData>) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Savings & assets</h2>
      <WhyBox>
        Liquid savings is your shock absorber — without it, the next surprise lands on a credit card at 24% APR and erases months of progress. Retirement savings is doing silent work in the background; if you&apos;re behind for your age, every month of delay costs more than the last. Give me these and I&apos;ll show you your runway in months, your retirement gap in dollars, and the single highest-leverage move you can make this week.
      </WhyBox>
      <NumberField
        label="Liquid savings (checking/savings accounts)"
        value={data.liquid_savings}
        onChange={v => onChange({ liquid_savings: v })}
        prefix="$"
      />
      <NumberField
        label="Retirement savings (401k, IRA, etc.)"
        value={data.retirement_savings}
        onChange={v => onChange({ retirement_savings: v })}
        prefix="$"
      />
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  )
}

function Step5({
  data,
  onChange,
  onNext,
  onBack,
}: {
  data: FormData
  onChange: (f: Partial<ProfileData>) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">Your goals</h2>
      <WhyBox>
        A 2-year house fund and a 30-year retirement plan run on opposite playbooks. Goal + time horizon + risk tolerance tells me whether to push you toward liquidity or growth, whether to recommend a high-yield savings account or an index fund, and whether to warn you off moves that look smart but would make you sell at the worst possible moment.
      </WhyBox>
      <RadioGroup
        label="Primary goal"
        name="primary_goal"
        options={GOAL_OPTIONS}
        value={data.primary_goal}
        onChange={v => onChange({ primary_goal: v })}
      />
      <RadioGroup
        label="Time horizon"
        name="time_horizon"
        options={HORIZON_OPTIONS}
        value={data.time_horizon}
        onChange={v => onChange({ time_horizon: v })}
      />
      <RadioGroup
        label="Risk tolerance"
        name="risk_tolerance"
        options={RISK_OPTIONS}
        value={data.risk_tolerance}
        onChange={v => onChange({ risk_tolerance: v })}
      />
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<FormData>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function update(fields: Partial<ProfileData>) {
    setData(prev => ({ ...prev, ...fields }))
  }

  function next() {
    setStep(s => Math.min(s + 1, STEPS))
  }

  function back() {
    setStep(s => Math.max(s - 1, 1))
  }

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    const result = await saveProfile(data)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center py-6 sm:py-12 px-4">
      <div className="w-full max-w-lg">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Step {step} of {STEPS}</span>
            <span>{Math.round((step / STEPS) * 100)}%</span>
          </div>
          <div className="h-1 bg-gray-200 rounded-full">
            <div
              className="h-1 bg-gray-900 rounded-full transition-all duration-300"
              style={{ width: `${(step / STEPS) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-8">
          {step === 1 && <StepWelcome onNext={next} />}
          {step === 2 && <Step1 data={data} onChange={update} onNext={next} onBack={back} />}
          {step === 3 && <Step2 data={data} onChange={update} onNext={next} onBack={back} />}
          {step === 4 && <Step3 data={data} onChange={update} onNext={next} onBack={back} />}
          {step === 5 && <Step4 data={data} onChange={update} onNext={next} onBack={back} />}
          {step === 6 && <Step5 data={data} onChange={update} onNext={next} onBack={back} />}
          {step === 7 && <StepPreview onBack={back} onSubmit={handleSubmit} loading={loading} />}
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </div>
      </div>
    </div>
  )
}
