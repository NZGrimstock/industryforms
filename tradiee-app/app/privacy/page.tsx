export const metadata = { title: 'Privacy Policy — IndustryForms' }

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 text-gray-800">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: June 2026</p>

      <p className="mb-6">This Privacy Policy describes how Industry Forms Limited ("we", "us", or "our") collects, uses, and protects your personal information when you use our mobile application and SaaS platform (collectively, the "Service"). We are committed to protecting your privacy and complying with the New Zealand Privacy Act 2020 and the Australian Privacy Act 1988.</p>
      <p className="mb-10">By using our Service, you agree to the collection and use of information as described in this policy. If you do not agree, please discontinue use of the Service.</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">1. Information We Collect</h2>
        <h3 className="font-semibold mb-2">1.1 Account Information</h3>
        <p className="mb-4">When you register for an account, we collect your full name, email address, password (stored in encrypted form), and business or organisation name (if applicable).</p>

        <h3 className="font-semibold mb-2">1.2 Payment Information</h3>
        <p className="mb-4">To process subscription payments, we collect billing details including credit or debit card details (processed and stored by our payment provider — we do not store full card numbers on our servers), billing address, and transaction history. Payments are processed by a PCI DSS-compliant third-party payment processor.</p>

        <h3 className="font-semibold mb-2">1.3 Customer Data</h3>
        <p className="mb-4">As part of using our productivity tools, you may input or upload business data, documents, contacts, or other customer information ("Customer Data"). We process this data solely to provide the Service to you.</p>

        <h3 className="font-semibold mb-2">1.4 Location Data</h3>
        <p className="mb-4">With your permission, the mobile app collects precise GPS location data to provide the automated vehicle travel logbook feature (recording trip start/end points and distance). Location data is associated with your account and is accessible to your company's administrators. You can disable location access at any time through your device settings, which will disable the auto-track feature.</p>

        <h3 className="font-semibold mb-2">1.5 Usage and Technical Data</h3>
        <p>We automatically collect certain technical data including device type, operating system, app version, IP address, log data (pages visited, features used, timestamps), and crash reports.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">2. How We Use Your Information</h2>
        <ul className="list-disc pl-6 space-y-1 text-gray-700">
          <li>Create and manage your account</li>
          <li>Process subscription payments and send billing receipts</li>
          <li>Deliver and improve the features of our Service</li>
          <li>Provide customer support</li>
          <li>Send important service notices, updates, and security alerts</li>
          <li>Send marketing communications (only with your consent — you may opt out at any time)</li>
          <li>Detect, investigate, and prevent fraudulent or unauthorised activity</li>
          <li>Comply with legal obligations under New Zealand and Australian law</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">3. How We Share Your Information</h2>
        <p className="mb-3">We do not sell your personal information.</p>
        <h3 className="font-semibold mb-2">3.1 Service Providers</h3>
        <p className="mb-4">We engage trusted third-party companies to assist us in operating the Service, including payment processors, cloud hosting providers, analytics tools, and email delivery services. These providers are contractually obligated to handle your data securely and only for the purposes we specify.</p>
        <h3 className="font-semibold mb-2">3.2 Legal Requirements</h3>
        <p className="mb-4">We may disclose your information if required to do so by law, court order, or governmental authority.</p>
        <h3 className="font-semibold mb-2">3.3 Business Transfers</h3>
        <p>In the event of a merger, acquisition, or sale of our business assets, your personal information may be transferred to the acquiring entity. We will notify you of any such change.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">4. Data Storage and Security</h2>
        <p>Your data is stored on secure servers located in Australia or New Zealand, or with cloud providers that maintain data centres in these regions. We implement industry-standard security measures including encryption in transit (TLS) and at rest, access controls, and regular security reviews.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">5. Data Retention</h2>
        <p>We retain your personal information for as long as your account is active or as needed to provide the Service. If you close your account, we will delete or anonymise your personal data within 90 days, unless we are required to retain it for legal, compliance, or dispute resolution purposes.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">6. Your Privacy Rights</h2>
        <p className="mb-3">Under the New Zealand Privacy Act 2020 and/or the Australian Privacy Act 1988, you have the right to:</p>
        <ul className="list-disc pl-6 space-y-1 text-gray-700">
          <li>Access the personal information we hold about you</li>
          <li>Request correction of inaccurate or incomplete information</li>
          <li>Request deletion of your personal information (subject to legal obligations)</li>
          <li>Withdraw consent for marketing communications at any time</li>
          <li>Lodge a complaint with the New Zealand Privacy Commissioner (<a href="https://www.privacy.org.nz" className="text-orange-600 hover:underline">privacy.org.nz</a>) or the Australian Information Commissioner (<a href="https://www.oaic.gov.au" className="text-orange-600 hover:underline">oaic.gov.au</a>)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">7. Children&apos;s Privacy</h2>
        <p>Our Service is not directed at children under the age of 13, and we do not knowingly collect personal information from children.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">8. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. When we make material changes, we will notify you by email or via a prominent notice in the app at least 14 days before the changes take effect.</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">9. Contact Us</h2>
        <p className="mb-2">If you have any questions or requests regarding this Privacy Policy, please contact our Privacy Officer:</p>
        <address className="not-italic text-gray-700">
          <strong>Industry Forms Limited</strong><br />
          Email: <a href="mailto:privacy@industryforms.co.nz" className="text-orange-600 hover:underline">privacy@industryforms.co.nz</a><br />
          Postal Address: 349 Mangakura Road, Helensville 0875, New Zealand
        </address>
        <p className="mt-3 text-sm text-gray-500">We aim to respond to all privacy enquiries within 20 working days.</p>
        <p className="mt-3 text-sm text-gray-500">
          To request deletion of your account and associated data, use our{' '}
          <a href="/account-deletion" className="text-orange-600 hover:underline">account deletion request form</a>.
        </p>
      </section>
    </div>
  )
}
