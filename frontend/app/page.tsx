'use client'

import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Calendar, 
  MessageSquare, 
  TrendingUp, 
  Search,
  LayoutDashboard,
  Settings,
  LogOut
} from 'lucide-react';
import { supabase } from '../utils/supabase';

export default function DashboardPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [stats, setStats] = useState([
    { label: 'Total Leads', value: '0', icon: Users },
    { label: 'New Today', value: '0', icon: TrendingUp },
    { label: 'Booked Calls', value: '0', icon: Calendar },
    { label: 'Active Chats', value: '0', icon: MessageSquare },
  ]);

  useEffect(() => {
    fetchLeads();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, payload => {
        fetchLeads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchLeads() {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      setLeads(data);
      
      // Update stats based on real data
      const total = data.length;
      const today = data.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length;
      const booked = data.filter(l => l.status === 'Booked').length;
      
      setStats([
        { label: 'Total Leads', value: total.toString(), icon: Users },
        { label: 'New Today', value: today.toString(), icon: TrendingUp },
        { label: 'Booked Calls', value: booked.toString(), icon: Calendar },
        { label: 'Active Chats', value: total > 0 ? '1' : '0', icon: MessageSquare },
      ]);
    }
  }

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">REEM AI</div>
        
        <nav style={{ flex: 1 }}>
          <a href="#" className="nav-item active">
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </a>
          <a href="#" className="nav-item">
            <Users size={20} />
            <span>Leads</span>
          </a>
          <a href="#" className="nav-item">
            <Calendar size={20} />
            <span>Appointments</span>
          </a>
          <a href="#" className="nav-item">
            <MessageSquare size={20} />
            <span>Chat History</span>
          </a>
        </nav>

        <div style={{ borderTop: '1px solid #333', paddingTop: '1rem' }}>
          <a href="#" className="nav-item">
            <Settings size={20} />
            <span>Settings</span>
          </a>
          <a href="#" className="nav-item">
            <LogOut size={20} />
            <span>Logout</span>
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <div>
            <h1>Real Estate Dashboard</h1>
            <p style={{ color: '#888' }}>Welcome back to your luxury lead hub.</p>
          </div>
          
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} size={18} />
            <input 
              type="text" 
              placeholder="Search leads..." 
              style={{ 
                background: '#1a1a1a', 
                border: '1px solid #333', 
                color: 'white', 
                padding: '0.75rem 1rem 0.75rem 2.5rem', 
                borderRadius: '8px',
                width: '300px'
              }} 
            />
          </div>
        </header>

        {/* Stats Grid */}
        <div className="stats-grid">
          {stats.map((stat, i) => (
            <div key={i} className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <stat.icon size={20} color="#c5a059" />
              </div>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Leads Table */}
        <div className="leads-table-container">
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #333' }}>
            <h3 style={{ fontSize: '1.125rem' }}>Live Leads from WhatsApp</h3>
          </div>
          <table className="leads-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone (ID)</th>
                <th>Area</th>
                <th>Intent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.length > 0 ? (
                leads.map((lead) => (
                  <tr key={lead.id}>
                    <td style={{ fontWeight: '500' }}>{lead.name || 'Anonymous'}</td>
                    <td style={{ color: '#888' }}>{lead.sender_id}</td>
                    <td>{lead.area || 'Pending...'}</td>
                    <td>{lead.intent || 'Analyzing...'}</td>
                    <td>
                      <span className="status-badge">{lead.status}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
                    No leads yet. Send a message to your WhatsApp bot to see them appear here in real-time!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
