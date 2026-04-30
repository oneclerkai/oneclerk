import { useState, useEffect } from 'react';
import { dashboard } from '@/lib/api';

export const useDashboard = () => {
  const [overview, setOverview] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOverview = async () => {
    try {
      const res = await dashboard.overview();
      setOverview(res.data);
    } catch (error) {
      console.error('Failed to fetch overview', error);
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const res = await dashboard.recentActivity();
      setRecentActivity(res.data);
    } catch (error) {
      console.error('Failed to fetch recent activity', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchOverview(), fetchRecentActivity()]);
      setLoading(false);
    };
    init();

    const interval = setInterval(fetchRecentActivity, 8000);
    return () => clearInterval(interval);
  }, []);

  return { overview, recentActivity, loading, refreshOverview: fetchOverview };
};
