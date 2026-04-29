'use client';

import { useIntegrations } from '@/hooks/useIntegrations';

export default function IntegrationsPage() {
  const { status, loading, connectCalendar } = useIntegrations();

  if (loading) return <div className="p-8">Loading integrations...</div>;

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-gray-500">Connect your favorite tools to power up your AI receptionist</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Google Calendar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center text-2xl">
              📅
            </div>
            <div>
              <h3 className="font-bold text-lg">Google Calendar</h3>
              <p className="text-sm text-gray-500">Sync appointments and check availability</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-6">
            <span className="text-sm font-medium">Status</span>
            <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full ${
              status?.google_calendar === 'connected' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
            }`}>
              {status?.google_calendar || 'Not Connected'}
            </span>
          </div>

          <button
            onClick={connectCalendar}
            className={`w-full py-2 rounded-lg font-bold transition-colors ${
              status?.google_calendar === 'connected' 
              ? 'border border-gray-200 text-gray-600 hover:bg-gray-50' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {status?.google_calendar === 'connected' ? 'Manage Connection' : 'Connect Google Calendar'}
          </button>
        </div>

        {/* WhatsApp */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center text-2xl">
              💬
            </div>
            <div>
              <h3 className="font-bold text-lg">WhatsApp</h3>
              <p className="text-sm text-gray-500">Send confirmations and summaries via WhatsApp</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-6">
            <span className="text-sm font-medium">Status</span>
            <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full ${
              status?.whatsapp === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
            }`}>
              {status?.whatsapp || 'Inactive'}
            </span>
          </div>

          <p className="text-sm text-gray-400 italic">WhatsApp is automatically managed via your Telnyx number.</p>
        </div>
      </div>
    </div>
  );
}
