'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { agents as agentsApi } from '@/lib/api';
import toast from 'react-hot-toast';

const STEPS = ['Business', 'Services', 'Agent', 'Connect'];

export default function OnboardingPage() {
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

  const handleComplete = async () => {
    setLoading(true);
    try {
      await agentsApi.create(formData);
      // In a real app, update user.onboarding_complete = true
      toast.success('Onboarding complete!');
      router.push('/dashboard');
    } catch (error) {
      toast.error('Failed to complete onboarding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to OneClerk!</h1>
          <p className="text-gray-500 mt-2">Let's set up your first AI receptionist in minutes.</p>
        </div>

        {/* Reuse the wizard logic from NewAgentWizard or implement similar here */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
           {/* Wizard UI... simplified for now */}
           <div className="py-12 text-center space-y-6">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-2xl mx-auto">🚀</div>
              <h2 className="text-2xl font-bold">Ready to launch your agent?</h2>
              <button 
                onClick={handleComplete}
                disabled={loading}
                className="bg-indigo-600 text-white px-12 py-3 rounded-xl font-bold text-lg hover:bg-indigo-700 disabled:bg-indigo-300 transition-all"
              >
                {loading ? 'Setting up...' : 'Create My First Agent'}
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
