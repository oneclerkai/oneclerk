'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { agents as agentsApi } from '@/lib/api';
import toast from 'react-hot-toast';

const STEPS = ['Business', 'Services', 'Agent', 'Connect'];

export default function NewAgentWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    language: 'english',
    voice_id: '21m00Tcm4TlvDq8ikWAM',
    business_context: {
      business_name: '',
      business_type: 'other',
      operating_hours: '9 AM - 6 PM',
      address: '',
      services: [],
      faqs: [],
    },
    escalation_phone: '',
    escalation_keywords: ['emergency', 'urgent'],
  });

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

  const handleFinish = async () => {
    setLoading(true);
    try {
      await agentsApi.create(formData);
      toast.success('Agent created successfully!');
      router.push('/dashboard/agents');
    } catch (error) {
      toast.error('Failed to create agent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-8">
      {/* Progress Bar */}
      <div className="mb-12">
        <div className="flex justify-between mb-4">
          {STEPS.map((step, i) => (
            <div key={step} className={`text-sm font-bold ${i <= currentStep ? 'text-indigo-600' : 'text-gray-300'}`}>
              {step}
            </div>
          ))}
        </div>
        <div className="h-2 bg-gray-100 rounded-full">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 min-h-[400px]">
        {currentStep === 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Tell us about the business</h2>
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                <input
                  type="text"
                  className="w-full rounded-lg border-gray-200 focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.business_context.business_name}
                  onChange={(e) => setFormData({
                    ...formData,
                    business_context: { ...formData.business_context, business_name: e.target.value }
                  })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Type</label>
                <select
                  className="w-full rounded-lg border-gray-200"
                  value={formData.business_context.business_type}
                  onChange={(e) => setFormData({
                    ...formData,
                    business_context: { ...formData.business_context, business_type: e.target.value }
                  })}
                >
                  <option value="clinic">Clinic</option>
                  <option value="hotel">Hotel</option>
                  <option value="restaurant">Restaurant</option>
                  {/* ... other options */}
                </select>
              </div>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Services & FAQs</h2>
            {/* Dynamic lists for services and FAQs would go here */}
            <p className="text-gray-500">Add the services your business provides and common questions callers ask.</p>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Customize your agent</h2>
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
                <input
                  type="text"
                  className="w-full rounded-lg border-gray-200"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Sarah"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                <select
                  className="w-full rounded-lg border-gray-200"
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                >
                  <option value="english">English</option>
                  <option value="hindi">Hindi</option>
                  <option value="spanish">Spanish</option>
                  {/* ... 40+ languages */}
                </select>
              </div>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
              🎉
            </div>
            <h2 className="text-2xl font-bold">Almost there!</h2>
            <p className="text-gray-500">Your agent is ready. We'll provision a phone number for you in the next step.</p>
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-between">
        <button
          onClick={prevStep}
          disabled={currentStep === 0}
          className="px-6 py-2 rounded-lg font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-0"
        >
          Back
        </button>
        {currentStep === STEPS.length - 1 ? (
          <button
            onClick={handleFinish}
            disabled={loading}
            className="px-8 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:bg-indigo-300"
          >
            {loading ? 'Creating...' : 'Finish & Activate'}
          </button>
        ) : (
          <button
            onClick={nextStep}
            className="px-8 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
