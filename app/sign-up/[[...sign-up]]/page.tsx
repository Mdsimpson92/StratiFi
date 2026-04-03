import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <main style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: '#f0f9fb', padding: '1rem',
    }}>
      <SignUp
        appearance={{
          elements: {
            rootBox:    { width: '100%', maxWidth: 420 },
            card:       { boxShadow: '0 4px 24px rgba(30,49,102,0.08)', border: '1px solid #daeef2' },
            headerTitle: { color: '#1e3166' },
            formButtonPrimary: {
              background: 'linear-gradient(135deg, #2ab9b0, #1e3166)',
              fontWeight: 700,
            },
          },
        }}
      />
    </main>
  )
}
