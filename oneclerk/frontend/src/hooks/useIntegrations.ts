import { useState, useEffect } from 'react';
import { integrations } from '@/lib/api';
import toast from 'react-hot-toast';

export const useIntegrations = () => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await integrations.status();
      setStatus(res.data);
    } catch (error) {
      console.error('Failed to fetch integrations status', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const connectCalendar = async () => {
    try {
      const res = await integrations.connectCalendar();
      window.location.href = res.data.url;
    } catch (error) {
      toast.error('Failed to initiate Google Calendar connection');
    }
  };

  return { status, loading, connectCalendar, refresh: fetchStatus };
};
