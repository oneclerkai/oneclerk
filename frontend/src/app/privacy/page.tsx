import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — Harkly AI',
  description: 'How Harkly AI collects, uses, and protects your data.',
}

const LAST_UPDATED = 'June 10, 2025'
const CONTACT_EMAIL = 'privacy@harkly.in'
const COMPANY_NAME = 'Harkly AI (OneClerk)'
const WEBSITE = 'https://harkly.in'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-100 bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-900 hover:text-indigo-600 transition-colors">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="28" height="28" rx="8" fill="#4F46E5"/>
              <path d="M8 14C8 10.686 10.686 8 14 8C17.314 8 20 10.686 20 14C20 17.314 17.314 20 14 20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="14" cy="14" r="2.5" fill="white"/>
            </svg>
            <span className="font-semibold text-lg tracking-tight">Harkly AI</span>
          </Link>
          <span className="text-sm text-gray-500">Last updated: {LAST_UPDATED}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-14">
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-sm font-medium px-3 py-1 rounded-full mb-4">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L8.8 5.2L13.3 5.6L10 8.5L11 13L7 10.7L3 13L4 8.5L0.7 5.6L5.2 5.2L7 1Z" fill="currentColor"/></svg>
            Legal &amp; Compliance
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-4">Privacy Policy</h1>
          <p className="text-lg text-gray-600 leading-relaxed max-w-3xl">
            {COMPANY_NAME} is committed to protecting your privacy. This policy explains exactly what data we
            collect, why we collect it, how we use it, and the choices you have. We keep this document plain
            and specific — no legalese padding.
          </p>
        </div>

        <nav className="bg-gray-50 rounded-2xl p-6 mb-12 border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Contents</h2>
          <ol className="space-y-1.5 text-sm">
            {[
              ['#overview', '1. Overview'],
              ['#data-ingestion', '2. Data Ingestion — Voice &amp; Microphone'],
              ['#google-scopes', '3. Google Integration Scopes'],
              ['#data-safeguards', '4. Data Safeguards &amp; No-Sale Commitment'],
              ['#data-retention', '5. Data Retention'],
              ['#user-rights', '6. Your Rights'],
              ['#cookies', '7. Cookies &amp; Tracking'],
              ['#children', '8. Children\'s Privacy'],
              ['#changes', '9. Changes to This Policy'],
              ['#contact', '10. Contact Us'],
            ].map(([href, label]) => (
              <li key={href}>
                <a href={href} className="text-indigo-600 hover:text-indigo-800 hover:underline" dangerouslySetInnerHTML={{ __html: label }} />
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-14 text-gray-700 leading-relaxed">

          <section id="overview">
            <SectionHeader number="1" title="Overview" />
            <p>
              {COMPANY_NAME} operates <a href={WEBSITE} className="text-indigo-600 underline">{WEBSITE}</a> and the
              Harkly AI voice receptionist platform (&ldquo;Service&rdquo;). When you use our Service you trust us with
              your information. We take that responsibility seriously. This Privacy Policy applies to all data
              processed through our web application, mobile interfaces, and telephony integrations.
            </p>
          </section>

          <section id="data-ingestion">
            <SectionHeader number="2" title="Data Ingestion — Voice & Microphone" />
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-5 flex gap-3">
              <svg className="shrink-0 mt-0.5 text-blue-600" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>
              <p className="text-sm text-blue-800">
                <strong>Core voice processing statement:</strong> Harkly captures microphone audio streams exclusively
                via real-time, encrypted WebRTC channels. Audio is processed in-transit and is never written to
                permanent storage.
              </p>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">What we capture</h3>
            <ul className="list-disc list-inside space-y-2 mb-4">
              <li>Live microphone input during an active AI call session, transmitted over a secure WebRTC peer-to-peer channel (DTLS-SRTP encrypted).</li>
              <li>Transcribed text derived from your speech, used solely to generate an AI response in that session.</li>
              <li>Session metadata (start/end timestamps, call duration) for billing and quality purposes.</li>
            </ul>
            <h3 className="font-semibold text-gray-900 mb-2">What we never capture</h3>
            <ul className="list-disc list-inside space-y-2 mb-4">
              <li>Raw audio recordings are <strong>not</strong> persisted to disk, databases, or cloud object storage after a call ends.</li>
              <li>We do not use voiceprints, biometrics, or speaker-identification technology on your audio.</li>
              <li>We do not share audio streams or transcripts with any advertising or analytics third parties.</li>
            </ul>
            <h3 className="font-semibold text-gray-900 mb-2">Telephony calls (PSTN)</h3>
            <p>
              For inbound phone calls handled by your Harkly agent, audio is processed in real-time through our
              telephony partner (Telnyx) under their own HIPAA/SOC 2-aligned infrastructure. Short-lived audio
              segments are deleted within 30 minutes of call completion.
            </p>
          </section>

          <section id="google-scopes">
            <SectionHeader number="3" title="Google Integration Scopes" />
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 mb-5 flex gap-3">
              <svg className="shrink-0 mt-0.5 text-amber-600" width="20" height="20" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              <p className="text-sm text-amber-800">
                <strong>Narrow-scope commitment:</strong> We request only the minimum OAuth scopes necessary to
                deliver each feature. We do not request, store, or process Google data beyond what is explicitly
                described below.
              </p>
            </div>

            <h3 className="font-semibold text-gray-900 mb-3">Google Calendar</h3>
            <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 w-2/5">Scope</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Reason &amp; Limitation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs text-indigo-700">https://www.googleapis.com/auth/calendar.events</td>
                    <td className="px-4 py-3 text-gray-700">
                      Used <strong>exclusively</strong> to create, read, update, and delete calendar events on the
                      user&rsquo;s behalf when their AI agent books or modifies appointments during a call. We never read
                      personal calendar events unrelated to bookings made by Harkly.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs text-indigo-700">https://www.googleapis.com/auth/calendar.readonly</td>
                    <td className="px-4 py-3 text-gray-700">
                      Used <strong>only</strong> to check existing bookings and available time slots so the AI
                      agent can avoid double-booking. Slot data is held in-memory during the call session and not
                      persisted.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold text-gray-900 mb-3">Gmail</h3>
            <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 w-2/5">Scope</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Reason &amp; Limitation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs text-indigo-700">https://www.googleapis.com/auth/gmail.send</td>
                    <td className="px-4 py-3 text-gray-700">
                      Used <strong>exclusively</strong> to send appointment confirmation and reminder emails to
                      the caller on behalf of the business. We never read, index, or analyse existing emails in
                      the connected inbox. This scope does not grant Harkly access to read any message in the
                      user&rsquo;s Gmail account.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold text-gray-900 mb-2">Google data usage rules</h3>
            <ul className="list-disc list-inside space-y-2">
              <li>Google user data is used only to operate the features described above.</li>
              <li>We do not transfer Google user data to third parties except as necessary to provide the Service (e.g., delivering an email through the Gmail API).</li>
              <li>We do not use Google user data for advertising, profiling, or any purpose unrelated to the feature the user explicitly enabled.</li>
              <li>We comply with <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">Google API Services User Data Policy</a>, including the Limited Use requirements.</li>
            </ul>
          </section>

          <section id="data-safeguards">
            <SectionHeader number="4" title="Data Safeguards & No-Sale Commitment" />
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              {[
                { icon: '🔒', title: 'Encryption in transit', body: 'All data transmitted between your browser, our servers, and third-party APIs uses TLS 1.2+ or DTLS-SRTP (for WebRTC audio).' },
                { icon: '🗄️', title: 'Encryption at rest', body: 'Database records are stored in encrypted PostgreSQL instances. Sensitive fields (passwords) are hashed with bcrypt.' },
                { icon: '🚫', title: 'No data selling', body: 'Zero user audio recordings, transcripts, or personal profile details are ever sold, rented, or shared with outside marketing networks — ever.' },
                { icon: '🔑', title: 'Minimal access', body: 'Internal team access to production data follows least-privilege principles. Access logs are audited quarterly.' },
                { icon: '🛡️', title: 'SOC 2-aligned partners', body: 'Our infrastructure partners (Telnyx, ElevenLabs, OpenAI) operate under SOC 2 Type II or equivalent certifications.' },
                { icon: '📋', title: 'No third-party analytics on audio', body: 'Voice data is never forwarded to advertising networks, data brokers, or behavioural analytics platforms.' },
              ].map(({ icon, title, body }) => (
                <div key={title} className="border border-gray-100 rounded-xl p-5 bg-gray-50">
                  <div className="text-2xl mb-2">{icon}</div>
                  <h4 className="font-semibold text-gray-900 mb-1">{title}</h4>
                  <p className="text-sm text-gray-600">{body}</p>
                </div>
              ))}
            </div>
            <p>
              We sub-process data with the following categories of third-party providers solely to operate the
              Service: cloud hosting, telephony, speech-to-text, text-to-speech, email delivery, and payment
              processing. Each sub-processor is contractually bound to data protection standards equivalent to
              those described in this policy.
            </p>
          </section>

          <section id="data-retention">
            <SectionHeader number="5" title="Data Retention" />
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Data Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Retention Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['Raw audio segments (telephony)', 'Deleted within 30 minutes of call end'],
                    ['Call transcripts', '90 days, then anonymised'],
                    ['Account profile data', 'Until account deletion + 30-day grace period'],
                    ['Billing / invoice records', '7 years (legal / tax obligation)'],
                    ['Server access logs', '30 days rolling'],
                    ['Google Calendar event data', 'Not stored; fetched live per request'],
                    ['Google OAuth refresh tokens', 'Until user revokes access or deletes agent'],
                  ].map(([type, retention]) => (
                    <tr key={type}>
                      <td className="px-4 py-3 text-gray-700 font-medium">{type}</td>
                      <td className="px-4 py-3 text-gray-600">{retention}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="user-rights">
            <SectionHeader number="6" title="Your Rights" />
            <p className="mb-4">
              Depending on your jurisdiction, you may have the right to access, correct, delete, or port your
              personal data. You may also revoke Google OAuth access at any time from your
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline mx-1">Google Account permissions page</a>
              — this immediately stops Harkly from accessing your Google Calendar and Gmail.
            </p>
            <p>
              To exercise any data rights, email us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 underline">{CONTACT_EMAIL}</a>. We
              respond to all verified requests within 30 days.
            </p>
          </section>

          <section id="cookies">
            <SectionHeader number="7" title="Cookies & Tracking" />
            <p>
              We use strictly necessary session cookies to keep you logged in and a minimal analytics cookie (no
              cross-site tracking) to understand aggregate product usage. We do not use third-party advertising
              cookies or fingerprinting scripts.
            </p>
          </section>

          <section id="children">
            <SectionHeader number="8" title="Children's Privacy" />
            <p>
              The Service is not directed at children under 13 (or 16 in the EU/UK). We do not knowingly collect
              personal data from children. If you believe a child has provided us data, contact us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 underline">{CONTACT_EMAIL}</a> and we
              will delete it promptly.
            </p>
          </section>

          <section id="changes">
            <SectionHeader number="9" title="Changes to This Policy" />
            <p>
              We may update this policy periodically. Material changes will be notified via email or an in-app
              banner at least 14 days before taking effect. The &ldquo;Last updated&rdquo; date at the top of this page
              always reflects the most recent revision.
            </p>
          </section>

          <section id="contact">
            <SectionHeader number="10" title="Contact Us" />
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Privacy enquiries</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex gap-2"><dt className="text-gray-500 w-28 shrink-0">Company:</dt><dd className="text-gray-800">{COMPANY_NAME}</dd></div>
                <div className="flex gap-2"><dt className="text-gray-500 w-28 shrink-0">Email:</dt><dd><a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 underline">{CONTACT_EMAIL}</a></dd></div>
                <div className="flex gap-2"><dt className="text-gray-500 w-28 shrink-0">Website:</dt><dd><a href={WEBSITE} className="text-indigo-600 underline">{WEBSITE}</a></dd></div>
              </dl>
            </div>
          </section>
        </div>

        <footer className="mt-20 pt-8 border-t border-gray-100 text-center text-sm text-gray-400">
          <p>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
          <p className="mt-1">
            <Link href="/" className="hover:text-gray-600 transition-colors">Home</Link>
            <span className="mx-2">·</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-gray-600 transition-colors">Contact</a>
          </p>
        </footer>
      </main>
    </div>
  )
}

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold shrink-0">
        {number}
      </span>
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
    </div>
  )
}
