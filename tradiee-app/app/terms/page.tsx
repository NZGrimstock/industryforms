export const metadata = { title: 'Terms of Service — IndustryForms' }

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 text-gray-800">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: July 2026</p>

      <p className="mb-6">These Terms of Service ("Terms") govern your use of IndustryForms, a job management platform for trade businesses operated by Industry Forms Limited ("we", "us", or "our"). By accessing or using the Service — including the web portal and the mobile application — you agree to be bound by these Terms. If you do not agree, you must not use the Service.</p>

      <p className="mb-10">If you use the Service to collect payments from your customers (including Tap to Pay on iPhone), <strong>Section 4 (Payment Processing and Merchant Services)</strong> applies to you and forms part of these Terms. Section 4 contains important obligations about chargebacks, disputes, and negative account balances.</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">1. The Service</h2>
        <p>IndustryForms provides a cloud-based job management system including a web admin portal, a mobile application for field staff, and related integrations (collectively, the "Service"). The Service is intended for use by trade businesses including electricians, plumbers, builders, HVAC technicians, and similar trades in New Zealand and Australia.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">2. Accounts</h2>
        <h3 className="font-semibold mb-2">2.1 Registration</h3>
        <p className="mb-4">To use the Service you must create an account. You agree to provide accurate and complete information and to keep it up to date. You are responsible for maintaining the security of your account credentials and for all activity that occurs under your account.</p>
        <h3 className="font-semibold mb-2">2.2 Authorised Users</h3>
        <p className="mb-4">You may invite team members to use the Service under your account. You are responsible for ensuring that all authorised users comply with these Terms.</p>
        <h3 className="font-semibold mb-2">2.3 Account Suspension</h3>
        <p>We reserve the right to suspend or terminate accounts that violate these Terms, are used fraudulently, or where subscription fees remain unpaid.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">3. Subscriptions and Billing</h2>
        <h3 className="font-semibold mb-2">3.1 Free Trial</h3>
        <p className="mb-4">New accounts are entitled to a 28-day free trial. No credit card is required to start a trial. At the end of the trial period, continued access requires a paid subscription.</p>
        <h3 className="font-semibold mb-2">3.2 Subscription Fees</h3>
        <p className="mb-4">Subscription fees are charged monthly per the pricing displayed at <a href="https://industryforms.app/pricing" className="text-orange-600 hover:underline">industryforms.app/pricing</a>. Fees are exclusive of GST (New Zealand) or GST/applicable taxes (Australia), which will be added at checkout. Pricing may change with 30 days&apos; written notice.</p>
        <h3 className="font-semibold mb-2">3.3 Payment</h3>
        <p className="mb-4">Subscription payments are processed by a third-party payment provider. By providing payment details, you authorise us to charge the applicable fees on a recurring monthly basis.</p>
        <h3 className="font-semibold mb-2">3.4 Cancellation and Refunds</h3>
        <p>You may cancel your subscription at any time. Access continues until the end of the current billing period. We do not provide refunds for partial months.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">4. Payment Processing and Merchant Services</h2>
        <p className="mb-4">This Section 4 applies to you if you enable and use the Service to collect payments from your own customers, including online invoice payments, booking deposits, and in-person Tap to Pay card payments (together, "Payment Collection"). It supplements, and does not replace, your separate agreement with our payment processor.</p>

        <h3 className="font-semibold mb-2">4.1 Role of the Parties</h3>
        <p className="mb-4">Payment Collection is powered by Stripe, Inc. and its affiliates ("Stripe") as the payment processor. Funds you collect settle to a Stripe connected account held in your name — <strong>we do not take custody of, hold, or route your customers&apos; payments, and we do not charge a commission or application fee on them.</strong> Stripe is the merchant of record&apos;s processor; we operate the platform that enables the connection. We are a Stripe Connect platform, which means we have certain risk and compliance responsibilities to Stripe in respect of connected accounts on our platform (see 4.6–4.9).</p>

        <h3 className="font-semibold mb-2">4.2 Eligibility</h3>
        <p className="mb-4">Payment Collection, and Tap to Pay in particular, is available only to accounts on a current paid subscription and only to bona fide trade businesses operating in New Zealand or Australia. You must complete Stripe&apos;s identity verification and onboarding (KYC) before you can collect payments. We may decline, suspend, or discontinue Payment Collection for any account that does not meet these requirements.</p>

        <h3 className="font-semibold mb-2">4.3 Stripe Connected Account Agreement</h3>
        <p className="mb-4">To collect payments you must accept and remain bound by the <a href="https://stripe.com/legal/connect-account" className="text-orange-600 hover:underline" target="_blank" rel="noopener noreferrer">Stripe Connected Account Agreement</a> (which includes the Stripe Services Agreement). Those terms govern the relationship between you and Stripe, including settlement, payout timing, and Stripe&apos;s own fees. If there is a conflict between these Terms and the Stripe Connected Account Agreement in respect of the processing of a payment, the Stripe agreement prevails for that payment.</p>

        <h3 className="font-semibold mb-2">4.4 Tap to Pay (Card-Present)</h3>
        <p className="mb-4">Tap to Pay lets you accept contactless card and mobile-wallet payments using a supported mobile device, with no separate hardware. Your use of Tap to Pay is additionally subject to the terms and requirements of the device and operating-system provider (including Apple&apos;s Tap to Pay on iPhone Terms and Google&apos;s equivalent). You agree to: use a supported and unmodified device; never record, store, or ask a customer to disclose their card PIN; present customers with an accessible way to enter a PIN where prompted; and follow all in-app guidance shown before and during a transaction. You are responsible for correctly identifying the amount charged and the goods or services supplied.</p>

        <h3 className="font-semibold mb-2">4.5 Settlement and Fees</h3>
        <p className="mb-4">Payments you collect are settled by Stripe directly to your connected account on Stripe&apos;s payout schedule for your account. Stripe&apos;s processing fees apply and are set out in your Stripe agreement. We do not add a fee to individual transactions; the Service&apos;s cost to you is the subscription fee under Section 3.</p>

        <h3 className="font-semibold mb-2">4.6 Chargebacks, Disputes, and Negative Balances</h3>
        <p className="mb-4">You are responsible for all payments you collect, and for all chargebacks, refunds, reversals, disputes, fines, and associated fees relating to those payments. Where a chargeback, refund, reversal, or fee results in a negative balance on your connected account that Stripe recovers from us as the platform, <strong>you are liable to us for the full amount of that shortfall, together with any related fees and reasonable recovery costs.</strong> This liability survives termination of your account and applies regardless of whether the funds have already been paid out to you.</p>

        <h3 className="font-semibold mb-2">4.7 Indemnity for Payment Losses</h3>
        <p className="mb-4">You agree to indemnify us against any loss, cost, liability, or expense (including reasonable legal costs) that we actually incur arising out of or in connection with: (a) payments you collect through the Service; (b) any negative balance on your connected account; (c) chargebacks, disputes, fines, or penalties relating to your transactions; or (d) your failure to supply the goods or services you charged your customer for. This indemnity does not apply to loss caused by our own breach, negligence, or wilful misconduct, and is subject to any rights you have that cannot be excluded by law.</p>

        <h3 className="font-semibold mb-2">4.8 Recovery of Amounts Owed</h3>
        <p className="mb-4">You authorise Stripe to recover negative balances and amounts owed by deducting them from your connected-account balance and future settlements, as provided in your Stripe agreement. Where an amount remains owing to us after Stripe&apos;s recovery, we may invoice you for it and recover it as a debt due, and set it off against amounts we owe you (including subscription credits). We will give you reasonable notice and an itemised explanation of any amount we seek to recover, except where we are required to act immediately to prevent further loss.</p>

        <h3 className="font-semibold mb-2">4.9 Reserves, Limits, and Holds</h3>
        <p className="mb-4">To manage risk, we (and Stripe) may set reasonable transaction limits (including per-payment maximums and daily volume caps), apply a reserve, or delay, hold, or pause payouts or Payment Collection on your account. We will do so only where reasonably necessary — for example, where we detect unusual activity, an elevated dispute rate, suspected fraud, or a materially higher risk of loss — and we will act proportionately and restore normal processing once the concern is resolved. Where practicable we will tell you in advance; where we must act immediately, we will tell you promptly afterwards and explain why.</p>

        <h3 className="font-semibold mb-2">4.10 Prohibited and Restricted Use</h3>
        <p className="mb-4">You may only use Payment Collection for genuine trade goods and services you have supplied or will supply to the paying customer. You must not use it for any business or product prohibited by Stripe or by card-network rules, to process payments on behalf of anyone else, to process your own cards to obtain cash, or in a way that is misleading, unlawful, or designed to evade risk controls.</p>

        <h3 className="font-semibold mb-2">4.11 Risk Actions and Communication</h3>
        <p className="mb-4">We monitor Payment Collection for risk and fraud. If we take a risk action affecting your account (such as a limit, hold, reserve, or suspension), we will notify you and, where relevant, tell you what information or steps are needed to return your account to normal status. You agree to provide that information promptly and to cooperate with reasonable requests relating to a dispute, chargeback, or risk review.</p>

        <h3 className="font-semibold mb-2">4.12 Your Obligations to Your Customers</h3>
        <p>You are solely responsible for your relationship with your own customers, including supplying the goods and services charged for, providing receipts, honouring your quoted prices, complying with consumer-protection law, and handling refunds and complaints. We are not a party to any transaction between you and your customer.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">5. Acceptable Use</h2>
        <p className="mb-3">You agree not to:</p>
        <ul className="list-disc pl-6 space-y-1 text-gray-700">
          <li>Use the Service for any unlawful purpose or in violation of any applicable law or regulation</li>
          <li>Upload or transmit malicious code, viruses, or harmful content</li>
          <li>Attempt to gain unauthorised access to any part of the Service or its infrastructure</li>
          <li>Reverse-engineer, decompile, or disassemble any part of the Service</li>
          <li>Resell or sublicense the Service without our prior written consent</li>
          <li>Use the Service to store or transmit content that is defamatory, obscene, or infringes any third-party rights</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">6. The Mobile Application</h2>
        <p className="mb-4">We grant you a limited, non-exclusive, non-transferable, revocable licence to install and use the mobile application on devices you control, solely to access the Service in accordance with these Terms. Your use of the app is also subject to the rules of the app store from which you obtained it (the Apple App Store or Google Play), and, for Apple devices, Apple is a third-party beneficiary of these Terms and may enforce the licence terms in this section against you.</p>
        <p className="mb-4">The app requests device permissions only for stated features — for example location (vehicle logbook and job travel tracking), camera and photos (job photos and signatures), and notifications. You can manage these permissions in your device settings; disabling a permission may limit the related feature. The app may update automatically, including over-the-air updates that change functionality.</p>
        <p>Apple and Google are not responsible for the Service or the app, and are not responsible for any support, maintenance, warranty, or claims relating to it.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">7. Your Data</h2>
        <h3 className="font-semibold mb-2">7.1 Ownership</h3>
        <p className="mb-4">You retain ownership of all data you input into the Service ("Customer Data"), including job records, customer details, and business information.</p>
        <h3 className="font-semibold mb-2">7.2 Licence to Us</h3>
        <p className="mb-4">By using the Service, you grant us a limited licence to store, process, and display your Customer Data solely to provide and improve the Service.</p>
        <h3 className="font-semibold mb-2">7.3 Data Export and Deletion</h3>
        <p>You may export your Customer Data at any time. Upon account termination, we will retain your data for 90 days before permanent deletion, during which time you may request an export. We may retain records relating to payments and risk for longer where required by law or by Stripe or card-network rules.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">8. Intellectual Property</h2>
        <p>The Service, including all software, designs, trademarks, and content created by us, is owned by Industry Forms Limited and protected by intellectual property laws. Nothing in these Terms transfers ownership of our intellectual property to you.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">9. Third-Party Integrations</h2>
        <p>The Service integrates with third-party services including Xero (accounting), Google Calendar, Stripe (payments), and others. Your use of these integrations is subject to the respective third party&apos;s terms of service. We are not responsible for any third-party service&apos;s availability, accuracy, or actions.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">10. Warranties and Disclaimers</h2>
        <p>The Service is provided "as is" and "as available". To the maximum extent permitted by law, we disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement. Nothing in this section limits guarantees or rights that apply to you and cannot be excluded under the New Zealand Consumer Guarantees Act 1993 or the Australian Consumer Law.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">11. Limitation of Liability</h2>
        <p className="mb-3">To the maximum extent permitted by applicable law, our total liability to you for any claim arising out of or related to these Terms or the Service shall not exceed the total subscription fees paid by you in the three months preceding the claim. We are not liable for any indirect, incidental, special, consequential, or punitive damages, or for any chargeback, dispute, or negative-balance amount, which remain your responsibility under Section 4.</p>
        <p>Nothing in these Terms excludes, restricts, or modifies any liability or guarantee that cannot be excluded by law, including under the New Zealand Consumer Guarantees Act 1993 or the Australian Consumer Law where applicable.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">12. Indemnification</h2>
        <p>You agree to indemnify and hold harmless Industry Forms Limited, its officers, directors, and employees from any claims, damages, losses, or expenses (including reasonable legal fees) arising from your use of the Service, your Customer Data, or your violation of these Terms. Indemnification specific to Payment Collection is set out in Section 4.7. These indemnities do not apply to the extent a loss is caused by our own breach, negligence, or wilful misconduct.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">13. Changes to the Service</h2>
        <p>We may modify, suspend, or discontinue any part of the Service at any time with reasonable notice.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">14. Changes to These Terms</h2>
        <p>We may update these Terms from time to time. Material changes will be notified via email or in-app notice at least 14 days before they take effect. Continued use of the Service after changes take effect constitutes acceptance of the updated Terms.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">15. Governing Law</h2>
        <p>These Terms are governed by the laws of New Zealand. Any disputes will be subject to the exclusive jurisdiction of the New Zealand courts, except where mandatory consumer protection laws in Australia or another jurisdiction apply.</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">16. Contact</h2>
        <address className="not-italic text-gray-700">
          <strong>Industry Forms Limited</strong><br />
          Email: <a href="mailto:admin@industryforms.app" className="text-orange-600 hover:underline">admin@industryforms.app</a><br />
          Postal Address: 349 Mangakura Road, Helensville 0875, New Zealand
        </address>
      </section>
    </div>
  )
}
