'use client'

import { useState } from 'react'
import { saveProfile } from '@/lib/actions/profile'
import type { ProfileData } from '@/lib/schemas/profile'

const STEPS = 5

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

function Step1({
  data,
  onChange,
  onNext,
}: {
  data: FormData
  onChange: (f: Partial<ProfileData>) => void
  onNext: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">About you</h2>
      <NumberField label="Age" value={data.age} onChange={v => onChange({ age: v })} />
      <NumberField
        label="Household size"
        value={data.household_size}
        onChange={v => onChange({ household_size: v })}
      />
      <StepNav onNext={onNext} isFirst />
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
  onBack,
  onSubmit,
  loading,
  error,
}: {
  data: FormData
  onChange: (f: Partial<ProfileData>) => void
  onBack: () => void
  onSubmit: () => void
  loading: boolean
  error: string | null
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">Your goals</h2>
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <StepNav onBack={onBack} onSubmit={onSubmit} loading={loading} isLast />
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
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

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {step === 1 && <Step1 data={data} onChange={update} onNext={next} />}
          {step === 2 && <Step2 data={data} onChange={update} onNext={next} onBack={back} />}
          {step === 3 && <Step3 data={data} onChange={update} onNext={next} onBack={back} />}
          {step === 4 && <Step4 data={data} onChange={update} onNext={next} onBack={back} />}
          {step === 5 && (
            <Step5
              data={data}
              onChange={update}
              onBack={back}
              onSubmit={handleSubmit}
              loading={loading}
              error={error}
            />
          )}
        </div>
      </div>
    </div>
  )
}
