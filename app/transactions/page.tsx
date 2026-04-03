import { auth, currentUser }     from '@clerk/nextjs/server'
import { redirect }               from 'next/navigation'
import Navbar                      from '@/app/components/Navbar'
import UploadForm                  from './components/UploadForm'
import FileList                    from './components/FileList'
import { getUploadedFiles }        from '@/lib/actions/transactions'

export default async function TransactionsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user  = await currentUser()
  const email = user?.emailAddresses?.[0]?.emailAddress ?? ''
  const files = await getUploadedFiles()

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar email={email} />

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Upload */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <div className="mb-6">
            <h1 className="text-base font-semibold text-gray-900">Upload Transactions</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Upload a CSV export from your bank or credit card.
            </p>
          </div>
          <UploadForm />
        </section>

        {/* File list */}
        {files.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-900">Uploaded Files</h2>
            </div>
            <FileList files={files} />
          </section>
        )}

      </main>
    </div>
  )
}
