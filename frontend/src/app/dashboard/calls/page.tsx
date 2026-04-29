'use client';

import { useState, useEffect } from 'react';
import { dashboard } from '@/lib/api';
import { format } from 'date-fns';

export default function CallsPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<any>(null);

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        const res = await dashboard.calls({});
        setCalls(res.data);
      } catch (error) {
        console.error('Failed to fetch calls', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCalls();
  }, []);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Call History</h1>
        <div className="flex gap-2">
          {/* Add filters here */}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Time</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Caller</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Duration</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Booked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {calls.map((call) => (
              <tr
                key={call.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedCall(call)}
              >
                <td className="px-6 py-4 text-sm">{format(new Date(call.created_at), 'MMM d, h:mm a')}</td>
                <td className="px-6 py-4 text-sm font-medium">{call.caller_number}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{call.duration_seconds}s</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    call.status === 'completed' ? 'bg-green-100 text-green-700' :
                    call.status === 'escalated' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {call.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">{call.appointment_booked ? '✅' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Slide-out Panel for Transcript */}
      {selectedCall && (
        <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform border-l border-gray-200">
          <div className="p-6 flex flex-col h-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Call Details</h2>
              <button onClick={() => setSelectedCall(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-6">
              <section>
                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">AI Summary</h3>
                <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{selectedCall.summary || 'No summary available'}</p>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Appointment</h3>
                {selectedCall.appointment_booked ? (
                  <div className="bg-green-50 border border-green-100 p-3 rounded-lg text-green-800 text-sm">
                    {JSON.stringify(selectedCall.appointment_details)}
                  </div>
                ) : <p className="text-gray-400 italic">No appointment booked</p>}
              </section>

              <section className="flex-1">
                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Transcript</h3>
                <div className="space-y-3">
                  {/* Mock transcript turns */}
                  <div className="bg-indigo-50 p-3 rounded-lg text-sm self-start max-w-[80%]">
                    Hello, how can I help you?
                  </div>
                  <div className="bg-gray-100 p-3 rounded-lg text-sm self-end ml-auto max-w-[80%]">
                    I want to book an appointment for tomorrow.
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
