import Link from 'next/link'
import { AccountDeletionForm } from './client'

export const metadata = {
  title: 'Account and Data Deletion Request - IndustryForms',
  description: 'Request deletion of your IndustryForms account and associated data.',
}

export default function AccountDeletionPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-gray-800">
      <h1 className="text-3xl font-bold mb-2">Account and Data Deletion Request</h1>
      <p className="text-sm text-gray-500 mb-8">IndustryForms mobile app and web platform</p>

      <section className="mb-8 space-y-4">
        <p>
          Use this page to request deletion of your IndustryForms account and associated personal data. This link is provided for Google Play users and anyone else who wants to request account deletion.
        </p>
        <p>
          For security, we do not delete accounts automatically from this public form. We will verify account ownership first, then process the request and confirm by email.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">What will be deleted</h2>
        <ul className="list-disc pl-6 space-y-1 text-gray-700">
          <li>Your IndustryForms user account and profile.</li>
          <li>Personal contact details connected to your account.</li>
          <li>Mobile app data linked to your account, including device/session records where applicable.</li>
          <li>Non-essential uploaded content directly associated with your account, subject to verification and lawful retention requirements.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Data we may need to retain</h2>
        <p className="mb-3">
          Some records may need to be retained where required for legal, tax, accounting, fraud-prevention, dispute-resolution, security, or compliance purposes. This can include billing records, invoices, payment records, audit logs, and business records belonging to an organisation that uses IndustryForms.
        </p>
        <p>
          Where we need to retain data, we will limit access and retain it only for as long as required. Where practical, personal identifiers will be removed or anonymised.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How long it takes</h2>
        <p>
          We aim to respond to deletion requests within 20 working days. Complex requests, organisation-owned accounts, or legally retained records may take longer, and we will let you know if that applies.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Submit a request</h2>
        <AccountDeletionForm />
      </section>

      <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <h2 className="text-lg font-semibold mb-2">Contact</h2>
        <p className="text-sm text-gray-700">
          You can also email us at{' '}
          <a href="mailto:privacy@industryforms.co.nz" className="text-orange-600 hover:underline">privacy@industryforms.co.nz</a>.
        </p>
        <p className="text-sm text-gray-500 mt-3">
          See also our <Link href="/privacy" className="text-orange-600 hover:underline">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  )
}
