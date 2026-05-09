'use client'

import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Calendar,
  MessageSquare,
  TrendingUp,
  Search,
  LayoutDashboard,
  Settings,
  LogOut,
} from 'lucide-react';
import { supabase } from '../utils/supabase';

const navItems = [
  { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'Leads', label: 'Leads', icon: Users },
  { id: 'Appointments', label: 'Appointments', icon: Calendar },
  { id: 'Chat History', label: 'Chat History', icon: MessageSquare },
];

export default function DashboardPage() {
  const [view, setView] = useState('Dashboard');
  const [leads, setLeads] = useState<any[]>([]);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLeads();
    fetchChatHistory();

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchLeads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchLeads() {
    setLoading(true);
    setError('');

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setError(error.message || 'Unable to load leads.');
      setLeads([]);
    } else {
      setLeads(data || []);
    }

    setLoading(false);
  }

  async function fetchChatHistory() {
    const { data, error } = await supabase
      .from('chat_history')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      setChatHistory(data || []);
    }
  }

  const stats = useMemo(() => {
    const total = leads.length;
    const today = leads.filter(
      (lead) => new Date(lead.created_at).toDateString() === new Date().toDateString()
    ).length;
    const booked = leads.filter((lead) => lead.status === 'Booked').length;

    return [
      { label: 'Total Leads', value: total.toString(), icon: Users },
      { label: 'New Today', value: today.toString(), icon: TrendingUp },
      { label: 'Booked Calls', value: booked.toString(), icon: Calendar },
      { label: 'Active Chats', value: total > 0 ? '1' : '0', icon: MessageSquare },
    ];
  }, [leads]);

  const filteredLeads = leads.filter(
    (lead) =>
      (lead.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.sender_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.area || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.intent || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderTopContent = () => {
    if (view === 'Leads' || view === 'Chat History' || view === 'Appointments') {
      return null;
    }

    return (
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
    );
  };

  const renderContent = () => {
    if (view === 'Leads') {
      return (
        <div className="leads-table-container">
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #333' }}>
            <h3 style={{ fontSize: '1.125rem' }}>All Leads</h3>
            <p style={{ color: '#888', marginTop: '0.5rem' }}>
              Click a lead row to inspect details.
            </p>
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
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
                    Loading leads...
                  </td>
                </tr>
              ) : filteredLeads.length > 0 ? (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} onClick={() => setSelectedLead(lead)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: '500' }}>{lead.name || 'Anonymous'}</td>
                    <td style={{ color: '#888' }}>{lead.sender_id}</td>
                    <td>{lead.area || 'Pending...'}</td>
                    <td>{lead.intent || 'Analyzing...'}</td>
                    <td>
                      <span className="status-badge">{lead.status || 'New'}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
                    {leads.length > 0
                      ? 'No leads match your search.'
                      : 'No leads yet. Send a message to your WhatsApp bot to see them appear here in real-time!'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {selectedLead && (
            <div className="lead-details">
              <h3>Lead Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <strong>Name:</strong> {selectedLead.name || 'Anonymous'}
                </div>
                <div>
                  <strong>Phone ID:</strong> {selectedLead.sender_id}
                </div>
                <div>
                  <strong>Area:</strong> {selectedLead.area || 'Not specified'}
                </div>
                <div>
                  <strong>Intent:</strong> {selectedLead.intent || 'Analyzing...'}
                </div>
                <div>
                  <strong>Status:</strong> {selectedLead.status || 'New'}
                </div>
                <div>
                  <strong>Created:</strong> {new Date(selectedLead.created_at).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                style={{
                  marginTop: '1rem',
                  background: '#c5a059',
                  color: 'black',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Close Details
              </button>
            </div>
          )}
        </div>
      );
    }

    if (view === 'Chat History') {
      return (
        <div className="leads-table-container">
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #333' }}>
            <h3 style={{ fontSize: '1.125rem' }}>Chat History</h3>
            <p style={{ color: '#888', marginTop: '0.5rem' }}>
              View recent WhatsApp messages captured by the bot.
            </p>
          </div>
          <table className="leads-table">
            <thead>
              <tr>
                <th>Sender ID</th>
                <th>Role</th>
                <th>Message</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {chatHistory.length > 0 ? (
                chatHistory.map((item) => (
                  <tr key={item.id}>
                    <td>{item.sender_id}</td>
                    <td>{item.role}</td>
                    <td>{item.message}</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
                    No chat history available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }

    if (view === 'Appointments') {
      return (
        <div className="leads-table-container" style={{ padding: '1.5rem' }}>
          <h3>Appointments</h3>
          <p style={{ color: '#888', marginTop: '0.5rem' }}>
            Appointment integration is ready to connect to Cal.com or your booking service.
          </p>
          <div style={{ marginTop: '2rem', color: '#ccc' }}>
            No appointment records are available yet. Once your WhatsApp bot triggers booking events, they will appear here.
          </div>
        </div>
      );
    }

    return (
      <>
        {renderTopContent()}
        <div className="leads-table-container">
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #333' }}>
            <h3 style={{ fontSize: '1.125rem' }}>Live Leads from WhatsApp</h3>
            <p style={{ color: '#888', marginTop: '0.5rem' }}>
              Your dashboard is connected to Supabase and will show new leads as they appear.
            </p>
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
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
                    Loading leads...
                  </td>
                </tr>
              ) : filteredLeads.length > 0 ? (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} onClick={() => setSelectedLead(lead)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: '500' }}>{lead.name || 'Anonymous'}</td>
                    <td style={{ color: '#888' }}>{lead.sender_id}</td>
                    <td>{lead.area || 'Pending...'}</td>
                    <td>{lead.intent || 'Analyzing...'}</td>
                    <td>
                      <span className="status-badge">{lead.status || 'New'}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
                    {leads.length > 0
                      ? 'No leads match your search.'
                      : 'No leads yet. Send a message to your WhatsApp bot to see them appear here in real-time!'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {selectedLead && (
            <div className="lead-details">
              <h3>Lead Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <strong>Name:</strong> {selectedLead.name || 'Anonymous'}
                </div>
                <div>
                  <strong>Phone ID:</strong> {selectedLead.sender_id}
                </div>
                <div>
                  <strong>Area:</strong> {selectedLead.area || 'Not specified'}
                </div>
                <div>
                  <strong>Intent:</strong> {selectedLead.intent || 'Analyzing...'}
                </div>
                <div>
                  <strong>Status:</strong> {selectedLead.status || 'New'}
                </div>
                <div>
                  <strong>Created:</strong> {new Date(selectedLead.created_at).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                style={{
                  marginTop: '1rem',
                  background: '#c5a059',
                  color: 'black',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Close Details
              </button>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="sidebar-logo">REEM AI</div>
        <nav style={{ flex: 1 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${view === item.id ? 'active' : ''}`}
                onClick={() => setView(item.id)}
                style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none' }}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ borderTop: '1px solid #333', paddingTop: '1rem' }}>
          <button
            type="button"
            className="nav-item"
            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none' }}
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
          <button
            type="button"
            className="nav-item"
            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none' }}
          >
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="header">
          <div>
            <h1>Real Estate Dashboard</h1>
            <p style={{ color: '#888' }}>Welcome back to your luxury lead hub.</p>
          </div>
          <div style={{ position: 'relative' }}>
            <Search
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }}
              size={18}
            />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                color: 'white',
                padding: '0.75rem 1rem 0.75rem 2.5rem',
                borderRadius: '8px',
                width: '300px',
              }}
            />
            <button
              onClick={fetchLeads}
              style={{
                marginLeft: '1rem',
                background: '#c5a059',
                color: 'black',
                border: 'none',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div style={{ marginBottom: '1.5rem', color: '#f2bfa5', background: '#321d0a', padding: '1rem', borderRadius: '8px' }}>
            {error}
          </div>
        )}

        {renderContent()}
      </main>
    </div>
  );
}
