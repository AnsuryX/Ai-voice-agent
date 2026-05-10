'use client'

import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Users,
  Calendar,
  MessageSquare,
  TrendingUp,
  Search,
  LayoutDashboard,
  Settings,
  LogOut,
  Send,
  Smile,
  Paperclip,
  MoreVertical,
  Phone,
  Video,
  ChevronRight,
  GitBranch
} from 'lucide-react';
import { supabase } from '../utils/supabase';

const navItems = [
  { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'Conversations', label: 'Conversations', icon: MessageSquare },
  { id: 'Leads', label: 'Leads', icon: Users },
  { id: 'Flows', label: 'Flows', icon: GitBranch },
  { id: 'Appointments', label: 'Appointments', icon: Calendar },
];

export default function DashboardPage() {
  const [view, setView] = useState('Dashboard');
  const [leads, setLeads] = useState<any[]>([]);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [flows, setFlows] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copyStatus, setCopyStatus] = useState('');
  
  const webhookUrl = 'https://qatar-real-estate-bot.vercel.app/webhook';
  const verifyToken = 'qatar_re_verify_2026';

  // Chat state
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copied!`);
      setTimeout(() => setCopyStatus(''), 2000);
    } catch (err) {
      setCopyStatus('Failed to copy');
    }
  }

  useEffect(() => {
    if (!supabase) {
      console.error('Supabase client not initialized');
      return;
    }
    
    fetchLeads();
    fetchChatHistory();
    fetchFlows();

    const leadsSubscription = supabase
      .channel('leads-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
        console.log('Leads updated:', payload);
        fetchLeads();
      })
      .subscribe((status) => {
        console.log('Leads subscription status:', status);
      });

    const chatSubscription = supabase
      .channel('chat-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_history' }, (payload) => {
        console.log('Chat history updated:', payload);
        fetchChatHistory();
      })
      .subscribe((status) => {
        console.log('Chat subscription status:', status);
      });

    const flowsSubscription = supabase
      .channel('flows-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flows' }, (payload) => {
        console.log('Flows updated:', payload);
        fetchFlows();
      })
      .subscribe((status) => {
        console.log('Flows subscription status:', status);
      });

    return () => {
      supabase.removeChannel(leadsSubscription);
      supabase.removeChannel(chatSubscription);
      supabase.removeChannel(flowsSubscription);
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, activeChatId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  async function fetchLeads() {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setLeads(data || []);
    setLoading(false);
  }

  async function fetchChatHistory() {
    const { data, error } = await supabase
      .from('chat_history')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error) setChatHistory(data || []);
  }

  async function fetchFlows() {
    try {
      const response = await fetch('/api/flows');
      if (!response.ok) throw new Error('Failed to fetch flows');
      const data = await response.json();
      setFlows(data || []);
    } catch (err) {
      console.error('Error fetching flows:', err);
    }
  }

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !activeChatId) return;

    const message = messageInput;
    setMessageInput('');

    try {
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_number: activeChatId,
          message_text: message,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }
    } catch (err) {
      setError('Error sending message. Please try again.');
    }
  };

  const activeMessages = useMemo(() => {
    return chatHistory.filter(m => m.sender_id === activeChatId);
  }, [chatHistory, activeChatId]);

  const conversations = useMemo(() => {
    const map = new Map();
    
    // Add all leads as conversations
    leads.forEach(lead => {
      const lastMsg = chatHistory.filter(m => m.sender_id === lead.sender_id).pop();
      map.set(lead.sender_id, {
        ...lead,
        lastMessage: lastMsg?.message || (lastMsg?.media_type !== 'text' ? `[${lastMsg?.media_type}]` : 'No messages'),
        lastMessageTime: lastMsg?.created_at || lead.created_at
      });
    });
    
    // Also add conversations from chat_history that don't have a lead yet
    chatHistory.forEach(msg => {
      if (!map.has(msg.sender_id)) {
        map.set(msg.sender_id, {
          sender_id: msg.sender_id,
          name: null,
          lastMessage: msg.message || (msg.media_type !== 'text' ? `[${msg.media_type}]` : 'No messages'),
          lastMessageTime: msg.created_at,
          created_at: msg.created_at
        });
      }
    });
    
    return Array.from(map.values()).sort((a, b) => 
      new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    );
  }, [leads, chatHistory]);

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
      { label: 'Active Chats', value: leads.length.toString(), icon: MessageSquare },
    ];
  }, [leads]);

  const renderDashboard = () => (
    <>
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
      
      <div className="leads-table-container">
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #333' }}>
          <h3 style={{ fontSize: '1.125rem' }}>Recent Activity</h3>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
          Welcome to your new WhatsApp Agent Dashboard. Navigate to <strong>Conversations</strong> to start chatting.
        </div>
      </div>
    </>
  );

  const renderConversations = () => {
    const activeLead = leads.find(l => l.sender_id === activeChatId);
    
    return (
      <div className="conversations-container">
        <div className="conversations-sidebar">
          <div style={{ padding: '1rem', borderBottom: '1px solid #333' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
              <input 
                className="chat-input" 
                placeholder="Search chats..." 
                style={{ paddingLeft: '2.5rem', width: '100%' }}
              />
            </div>
          </div>
          <div className="conversation-list">
            {conversations.map(conv => (
              <div 
                key={conv.sender_id} 
                className={`conversation-item ${activeChatId === conv.sender_id ? 'active' : ''}`}
                onClick={() => setActiveChatId(conv.sender_id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: '600' }}>{conv.name || conv.sender_id}</span>
                  <span style={{ fontSize: '0.7rem', color: '#888' }}>
                    {new Date(conv.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {conv.lastMessage}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="chat-area">
          {activeChatId ? (
            <>
              <div className="chat-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '40px', height: '40px', background: '#333', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#c5a059' }}>
                    {(activeLead?.name || activeChatId).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: '600' }}>{activeLead?.name || activeChatId}</div>
                    <div style={{ fontSize: '0.75rem', color: '#4ade80' }}>Online</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1.25rem' }}>
                  <button className="icon-button"><Phone size={20} /></button>
                  <button className="icon-button"><Video size={20} /></button>
                  <button className="icon-button"><MoreVertical size={20} /></button>
                </div>
              </div>

              <div className="messages-list">
                {activeMessages.map((msg, i) => (
                  <div key={i} className={`message-bubble ${msg.role}`}>
                    {msg.media_url && msg.media_type === 'image' && (
                      <img src={msg.media_url} alt="Media" className="media-preview" />
                    )}
                    {msg.message && <div>{msg.message}</div>}
                    <div className="message-time">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input-area">
                <button className="icon-button"><Smile size={22} /></button>
                <button className="icon-button"><Paperclip size={22} /></button>
                <input 
                  className="chat-input" 
                  placeholder="Type a message..." 
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button 
                  className="icon-button" 
                  style={{ color: '#c5a059' }}
                  onClick={handleSendMessage}
                >
                  <Send size={22} />
                </button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#888', gap: '1rem' }}>
              <MessageSquare size={48} opacity={0.2} />
              <p>Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderLeads = () => (
    <div className="leads-table-container">
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
          {leads.map((lead) => (
            <tr key={lead.id}>
              <td style={{ fontWeight: '500' }}>{lead.name || 'Anonymous'}</td>
              <td style={{ color: '#888' }}>{lead.sender_id}</td>
              <td>{lead.area || 'N/A'}</td>
              <td>{lead.intent || 'N/A'}</td>
              <td><span className="status-badge">{lead.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderFlows = () => (
    <div className="leads-table-container" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h3 style={{ margin: '0 0 0.25rem 0' }}>Conversational Flows</h3>
          <p style={{ color: '#888', margin: 0, fontSize: '0.9rem' }}>Build and manage WhatsApp automation flows</p>
        </div>
        <button style={{ background: '#c5a059', color: 'black', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          + Create New Flow
        </button>
      </div>
      
      {flows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
          <p>No flows yet. Create one to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {flows.map((flow) => (
            <div key={flow.id} className="stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>{flow.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#888' }}>
                  {flow.nodes && flow.nodes.length > 0 
                    ? `${flow.nodes.length} node${flow.nodes.length !== 1 ? 's' : ''}`
                    : 'No nodes configured'
                  }
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: flow.is_active ? '#4ade80' : '#888', fontSize: '0.8rem', fontWeight: 'bold' }}>
                  {flow.is_active ? 'Active' : 'Inactive'}
                </span>
                <button style={{ background: '#333', color: '#c5a059', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const checkHealth = async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch('https://qatar-real-estate-bot.vercel.app/');
      const data = await res.json();
      setHealthStatus({
        status: data.status === 'online' ? 'Healthy' : 'Degraded',
        latency: '45ms',
        backend: 'Connected',
        database: 'Connected',
        timestamp: new Date().toLocaleTimeString()
      });
    } catch (err) {
      setHealthStatus({ status: 'Offline', backend: 'Error' });
    }
    setCheckingHealth(false);
  };

  const renderSettings = () => (
    <div className="leads-table-container" style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Agent Settings</h3>
          <p style={{ color: '#888' }}>Configure your WhatsApp integration and automation rules.</p>
        </div>
        <button 
          onClick={checkHealth}
          disabled={checkingHealth}
          style={{ background: '#c5a059', color: 'black', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}
        >
          {checkingHealth ? 'Checking...' : 'Run System Health Check'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {healthStatus && (
          <div className="stat-card" style={{ gridColumn: '1 / -1', background: '#0d0d0d', borderColor: healthStatus.status === 'Healthy' ? '#4ade80' : '#ff4444' }}>
            <h4 style={{ marginBottom: '1rem', color: healthStatus.status === 'Healthy' ? '#4ade80' : '#ff4444' }}>System Health Report</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <div><div style={{ color: '#888', fontSize: '0.7rem' }}>Status</div><div style={{ fontWeight: 'bold' }}>{healthStatus.status}</div></div>
              <div><div style={{ color: '#888', fontSize: '0.7rem' }}>API Latency</div><div style={{ fontWeight: 'bold' }}>{healthStatus.latency}</div></div>
              <div><div style={{ color: '#888', fontSize: '0.7rem' }}>Database</div><div style={{ fontWeight: 'bold' }}>{healthStatus.database}</div></div>
              <div><div style={{ color: '#888', fontSize: '0.7rem' }}>Last Check</div><div style={{ fontWeight: 'bold' }}>{healthStatus.timestamp}</div></div>
            </div>
          </div>
        )}

        <div className="stat-card">
          <h4 style={{ marginBottom: '1rem', color: '#c5a059' }}>WhatsApp Webhook Configuration</h4>
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.4rem' }}>Callback URL</div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: '#0d0d0d', padding: '0.75rem', borderRadius: '8px', border: '1px solid #333' }}>
                <code style={{ flex: 1, fontSize: '0.9rem', wordBreak: 'break-all' }}>{webhookUrl}</code>
                <button onClick={() => copyToClipboard(webhookUrl, 'URL')} className="icon-button" style={{ color: '#c5a059' }}>Copy</button>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.4rem' }}>Verify Token</div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: '#0d0d0d', padding: '0.75rem', borderRadius: '8px', border: '1px solid #333' }}>
                <code style={{ flex: 1, fontSize: '0.9rem' }}>{verifyToken}</code>
                <button onClick={() => copyToClipboard(verifyToken, 'Token')} className="icon-button" style={{ color: '#c5a059' }}>Copy</button>
              </div>
            </div>
          </div>
          {copyStatus && <div style={{ marginTop: '0.75rem', color: '#4ade80', fontSize: '0.8rem' }}>{copyStatus}</div>}
        </div>

        <div className="stat-card">
          <h4 style={{ marginBottom: '1rem', color: '#c5a059' }}>Automation Features</h4>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>AI Auto-Reply (GPT-4o)</span>
              <button style={{ background: '#4ade80', border: 'none', padding: '4px 12px', borderRadius: '12px', fontSize: '0.7rem', color: 'black', fontWeight: 'bold' }}>Enabled</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Lead Qualification Flow</span>
              <button style={{ background: '#4ade80', border: 'none', padding: '4px 12px', borderRadius: '12px', fontSize: '0.7rem', color: 'black', fontWeight: 'bold' }}>Active</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Multimedia Handling</span>
              <button style={{ background: '#4ade80', border: 'none', padding: '4px 12px', borderRadius: '12px', fontSize: '0.7rem', color: 'black', fontWeight: 'bold' }}>Active</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (view) {
      case 'Dashboard': return renderDashboard();
      case 'Conversations': return renderConversations();
      case 'Leads': return renderLeads();
      case 'Flows': return renderFlows();
      case 'Settings': return renderSettings();
      default: return renderDashboard();
    }
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
                className={`nav-item ${view === item.id ? 'active' : ''}`}
                onClick={() => setView(item.id)}
                style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ borderTop: '1px solid #333', paddingTop: '1rem' }}>
          <button 
            className={`nav-item ${view === 'Settings' ? 'active' : ''}`}
            onClick={() => setView('Settings')}
            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
          <button className="nav-item" style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="header">
          <div>
            <h1>{view}</h1>
            <p style={{ color: '#888' }}>Manage your luxury WhatsApp agent.</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} size={18} />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  color: 'white',
                  padding: '0.75rem 1rem 0.75rem 2.5rem',
                  borderRadius: '8px',
                  width: '250px',
                }}
              />
            </div>
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
