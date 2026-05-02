'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('account');

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      <div className="flex border-b border-gray-200 mb-8">
        {['Account', 'Phone', 'Billing', 'Notifications'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab.toLowerCase())}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.toLowerCase()
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
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
            <button className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold">
              Save Changes
            </button>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-indigo-900">Current Plan</p>
                <p className="text-2xl font-bold text-indigo-700">Trial Plan</p>
              </div>
              <button className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-bold shadow-sm">
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
