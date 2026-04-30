import { useState, useEffect } from 'react';
import { agents } from '@/lib/api';
import toast from 'react-hot-toast';

export const useAgents = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await agents.list();
      setList(res.data);
    } catch (error) {
      toast.error('Failed to fetch agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    // Optimistic update
    setList(list.map(a => a.id === id ? { ...a, status: newStatus } : a));
    
    try {
      if (newStatus === 'active') {
        await agents.activate(id);
      } else {
        await agents.deactivate(id);
      }
      toast.success(`Agent ${newStatus}d`);
    } catch (error) {
      // Rollback
      setList(list.map(a => a.id === id ? { ...a, status: currentStatus } : a));
      toast.error('Failed to update agent status');
    }
  };

  const createAgent = async (data: any) => {
    try {
      const res = await agents.create(data);
      setList([...list, res.data]);
      toast.success('Agent created');
      return res.data;
    } catch (error) {
      toast.error('Failed to create agent');
      throw error;
    }
  };

  return { list, loading, toggleStatus, createAgent, refresh: fetchAgents };
};
