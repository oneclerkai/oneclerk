import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — Harkly',
  description: 'How Harkly collects, uses, and protects your data. Effective June 10, 2026.',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">

      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-gray-900 hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-black text-sm">
              H
            </div>
            <span className="font-bold text-lg">Harkly</span>
          </Link>
          <span className="text-sm text-gray-400">Effective Date: June 10, 2026</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-14">

        {/* Hero */}
        <div className="mb-12">
          <span className="inline-block bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">
            Legal &amp; Compliance
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-3">Privacy Policy</h1>
          <p className="text-lg text-gray-500 max-w-2xl leading-relaxed">
            Welcome to Harkly, hosted at{' '}
            <a href="https://harkly.in" className="text-indigo-600 underline">harkly.in</a>. We are committed
            to protecting your privacy and handling your data with absolute security and transparency.
          </p>
        </div>

        {/* Table of contents */}
        <nav className="bg-white rounded-2xl border border-gray-100 p-6 mb-14 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Contents</p>
          <ol className="space-y-2 text-sm">
            {[
              ['#s1', '1. Data Ingestion and Processing'],
              ['#s2', '2. Google OAuth API Scope Disclosures'],
              ['#s3', '3. Data Protection and Third-Party Sub-Processors'],
              ['#s4', '4. Data Retention and Deletion Rights'],
              ['#s5', '5. Contact Information'],
            ].map(([href, label]) => (
              <li key={href}>
                <a href={href} className="text-indigo-600 hover:underline">{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-16">

          {/* Section 1 */}
          <section id="s1">
            <SectionHeading n="1" title="Data Ingestion and Processing" />

            <h3 className="text-base font-semibold text-gray-900 mb-2 mt-6">A. Real-Time Voice and Audio Processing</h3>
            <p className="text-gray-600 mb-3">
              Harkly provides real-time voice automation tools. When you engage with our voice agents via telephone
              or web browsers, our systems capture and process voice metadata streams using secure WebRTC (Web
              Real-Time Communication) wrappers.
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-600 mb-4">
              <li>Audio streams are captured solely to synthesize, transcribe, and process conversational input into textual commands via secure API integrations.</li>
              <li>Voice data processed through our Vapi or OpenRouter network nodes is strictly <strong className="text-gray-900">transient</strong>. We do not store, retain, or compile raw audio files or audio recordings for marketing, tracking, or profiling purposes.</li>
            </ul>
            <Callout color="blue">
              <strong>Key commitment:</strong> No raw audio recordings are ever written to permanent storage.
              All voice data is processed in-transit over encrypted WebRTC (DTLS-SRTP) channels and discarded
              immediately after transcription.
            </Callout>

            <h3 className="text-base font-semibold text-gray-900 mb-2 mt-6">B. User Profile and Registration Data</h3>
            <p className="text-gray-600">
              During signup, we collect user credentials, including username, encrypted password hashes, and a
              verified email address. This data is handled via secure JWT validation keys and encrypted databases
              to verify account status and access boundaries.
            </p>
          </section>

          <Divider />

          {/* Section 2 */}
          <section id="s2">
            <SectionHeading n="2" title="Google OAuth API Scope Disclosures" />
            <p className="text-gray-600 mb-6">
              To provide cross-channel workflow automation, Harkly requests explicit, user-authorized permissions
              via Google API OAuth scopes. Our usage of these scopes is strictly restricted as detailed below.
            </p>

            <h3 className="text-base font-semibold text-gray-900 mb-3">A. Google Calendar API Access</h3>
            <p className="text-gray-600 mb-3">
              Harkly requests access to your Google Calendar to read availability and programmatically schedule,
              modify, or delete calendar consultation appointments explicitly requested by you or your calling
              customers.
            </p>
            <ScopeTable rows={[
              ['calendar.events', 'Create, update, and delete booking appointments on behalf of the business owner when their AI agent handles a call.'],
              ['calendar.readonly', 'Read existing availability and booked slots to avoid double-booking. Data is held in-memory per session only — never persisted.'],
            ]} />

            <h3 className="text-base font-semibold text-gray-900 mb-3 mt-6">B. Gmail API Access</h3>
            <p className="text-gray-600 mb-3">
              Harkly requests access to your Gmail infrastructure solely to dispatch direct automation status
              updates, transactional confirmations, and appointment summaries on your behalf.
            </p>
            <ScopeTable rows={[
              ['gmail.send', 'Send appointment confirmation and reminder emails to callers on behalf of the business. We never read, index, or analyse any existing emails in the connected inbox.'],
            ]} />

            <h3 className="text-base font-semibold text-gray-900 mb-3 mt-6">C. Limited Use Compliance Statement</h3>
            <Callout color="green">
              Harkly&apos;s use and transfer of information received from Google APIs to any other app will adhere
              to the{' '}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. We do not under any circumstances sell, lease, or transfer
              your Google user data to external advertising tracking companies or third-party data brokers.
            </Callout>
          </section>

          <Divider />

          {/* Section 3 */}
          <section id="s3">
            <SectionHeading n="3" title="Data Protection and Third-Party Sub-Processors" />
            <p className="text-gray-600 mb-4">
              We share limited, relevant data payloads with reputable infrastructure providers strictly necessary
              to execute our application services:
            </p>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Provider</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Role</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Data Shared</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['Railway / PostgreSQL', 'Database Infrastructure', 'Core data profiles hosted on encrypted database networks.'],
                    ['Deepgram', 'Telephony & Transcription', 'Real-time speech-to-text via isolated low-latency AI models. No audio retained.'],
                    ['Resend', 'Email & Notifications', 'Operational messaging routed for transactional delivery only.'],
                    ['Telnyx / Vapi', 'Telephony', 'Live call routing. Audio deleted within 30 minutes of call end.'],
                  ].map(([provider, role, data]) => (
                    <tr key={provider}>
                      <td className="px-4 py-3 font-semibold text-gray-900">{provider}</td>
                      <td className="px-4 py-3 text-gray-500">{role}</td>
                      <td className="px-4 py-3 text-gray-600">{data}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-gray-500 text-sm mt-3">
              Each sub-processor is contractually bound to data protection standards equivalent to those described
              in this policy. None are authorised to use your data for their own marketing or analytical purposes.
            </p>
          </section>

          <Divider />

          {/* Section 4 */}
          <section id="s4">
            <SectionHeading n="4" title="Data Retention and Deletion Rights" />
            <p className="text-gray-600 mb-4">
              You retain full ownership of your data parameters. You may request the absolute deletion of your user
              profile record, active agents, or integration connection keys at any time by contacting us at{' '}
              <a href="mailto:support@harkly.in" className="text-indigo-600 underline">support@harkly.in</a>.
              Upon verification, all corresponding application records will be purged permanently from our active
              database within <strong className="text-gray-900">30 business days</strong>.
            </p>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Data Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Retention Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['Raw audio segments', 'Deleted within 30 minutes of call end'],
                    ['Call transcripts', '90 days, then permanently anonymised'],
                    ['Account profile & agent config', 'Until account deletion + 30-day grace period'],
                    ['Billing & invoice records', '7 years (statutory tax obligation)'],
                    ['Google Calendar event data', 'Not stored — fetched live per request only'],
                    ['Google OAuth refresh tokens', 'Until user revokes access or deletes connected agent'],
                  ].map(([type, ret]) => (
                    <tr key={type}>
                      <td className="px-4 py-3 font-medium text-gray-900">{type}</td>
                      <td className="px-4 py-3 text-gray-600">{ret}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <Divider />

          {/* Section 5 */}
          <section id="s5">
            <SectionHeading n="5" title="Contact Information" />
            <p className="text-gray-600 mb-4">
              For questions, clarifications, or data removal requests regarding our compliance protocols, please
              reach out directly via:
            </p>
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 space-y-2 text-sm">
              <p><span className="font-semibold text-gray-700 w-40 inline-block">Email:</span>
                <a href="mailto:support@harkly.in" className="text-indigo-600 underline">support@harkly.in</a>
              </p>
              <p><span className="font-semibold text-gray-700 w-40 inline-block">Corporate Portal:</span>
                <a href="https://harkly.in" className="text-indigo-600 underline">https://harkly.in</a>
              </p>
            </div>
          </section>

        </div>

        <footer className="mt-20 pt-8 border-t border-gray-100 text-center text-sm text-gray-400">
          <p>&copy; 2026 Harkly. All rights reserved.</p>
          <p className="mt-1">
            <Link href="/" className="hover:text-gray-600 transition-colors">Home</Link>
            <span className="mx-2">·</span>
            <a href="mailto:support@harkly.in" className="hover:text-gray-600 transition-colors">support@harkly.in</a>
          </p>
        </footer>

      </main>
    </div>
  )
}

function SectionHeading({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
        {n}
      </span>
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
    </div>
  )
}

function Callout({ color, children }: { color: 'blue' | 'green' | 'amber'; children: React.ReactNode }) {
  const styles = {
    blue: 'bg-blue-50 border-blue-100 text-blue-800',
    green: 'bg-green-50 border-green-100 text-green-800',
    amber: 'bg-amber-50 border-amber-100 text-amber-800',
  }
  return (
    <div className={`border rounded-xl p-4 text-sm leading-relaxed my-4 ${styles[color]}`}>
      {children}
    </div>
  )
}

function ScopeTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-gray-700 w-2/5">Scope</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-700">Purpose &amp; Limitation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(([scope, purpose]) => (
            <tr key={scope}>
              <td className="px-4 py-3 font-mono text-xs text-indigo-700 align-top">{scope}</td>
              <td className="px-4 py-3 text-gray-600">{purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Divider() {
  return <hr className="border-gray-100" />
}
