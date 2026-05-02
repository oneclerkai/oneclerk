'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('account');

  return (
    <div className="max-w-4xl p-4 sm:p-6">
      <h1 className="mb-6 text-xl font-bold sm:mb-8 sm:text-2xl">Settings</h1>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-gray-200 sm:mb-8">
        {['Account', 'Phone', 'Billing', 'Notifications'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab.toLowerCase())}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-6 sm:py-3 ${
              activeTab === tab.toLowerCase()
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-8">
        {activeTab === 'account' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                className="w-full rounded-lg border-gray-200"
                defaultValue={user?.full_name}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                className="w-full rounded-lg border-gray-200 bg-gray-50"
                defaultValue={user?.email}
                readOnly
              />
            </div>
            <button className="rounded-lg bg-indigo-600 px-6 py-2 text-white font-bold">
              Save Changes
            </button>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50 p-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium text-indigo-900">Current Plan</p>
                <p className="text-2xl font-bold text-indigo-700">Trial Plan</p>
              </div>
              <button className="rounded-lg bg-white px-4 py-2 font-bold text-indigo-600 shadow-sm">
                Upgrade Plan
              </button>
            </div>

            <div>
              <h3 className="font-bold mb-4">Usage this month</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Call Minutes</span>
                    <span>15 / 60 mins</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full">
                    <div className="h-full bg-indigo-600 rounded-full" style={{ width: '25%' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
