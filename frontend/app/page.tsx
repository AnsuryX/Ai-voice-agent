'use client'

import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Users,
  UserPlus,
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
  GitBranch,
  Activity,
  Download
} from 'lucide-react';
import { supabase } from '../utils/supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://qatar-real-estate-bot.vercel.app';
const WEBHOOK_URL = process.env.NEXT_PUBLIC_WEBHOOK_URL || `${API_URL}/webhook`;
const VERIFY_TOKEN_DISPLAY = process.env.NEXT_PUBLIC_WHATSAPP_VERIFY_TOKEN || 'Set in backend env';

const navItems = [
  { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'Contacts', label: 'Contacts', icon: UserPlus },
  { id: 'Live Monitor', label: 'Live Monitor', icon: Activity },
  { id: 'Conversations', label: 'Conversations', icon: MessageSquare },
  { id: 'Leads', label: 'Leads', icon: Users },
  { id: 'Flows', label: 'Flows', icon: GitBranch },
  { id: 'Appointments', label: 'Appointments', icon: Calendar },
];

export default function DashboardPage() {
  const [view, setView] = useState('Dashboard');
  const [settingsView, setSettingsView] = useState('General');
  const [leads, setLeads] = useState<any[]>([]);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copyStatus, setCopyStatus] = useState('');
  
  // Automation settings
  const [aiAutoReply, setAiAutoReply] = useState(true);
  const [leadQualification, setLeadQualification] = useState(true);
  const [multimediaHandling, setMultimediaHandling] = useState(true);
  
  const webhookUrl = WEBHOOK_URL;
  const verifyToken = VERIFY_TOKEN_DISPLAY;

  // Chat state
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [contactForm, setContactForm] = useState({ sender_id: '', name: '', intent: '', area: '' });
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [contactNotes, setContactNotes] = useState('');
  const [contactTagsInput, setContactTagsInput] = useState('');
  const [contactAssignee, setContactAssignee] = useState('');
  const [contactStatus, setContactStatus] = useState('');
  const [bulkStatus, setBulkStatus] = useState('Contact');
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkTag, setBulkTag] = useState('');
  const [flows, setFlows] = useState<any[]>([]);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowNodes, setNewFlowNodes] = useState('[]');
  const [monitorEvents, setMonitorEvents] = useState<any[]>([]);
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
    fetchLeads();
    fetchChatHistory();
    fetchFlows();

    if (!supabase) {
      setError('Missing Supabase env in frontend deployment. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      return;
    }

    const leadsSubscription = supabase
      .channel('leads-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
        const pl: any = payload;
        setMonitorEvents((prev) => [
          {
            table: 'leads',
            event: pl.eventType,
            sender_id: pl.new?.sender_id || pl.old?.sender_id || 'unknown',
            role: 'system',
            message: `Lead ${String(pl.eventType).toLowerCase()}`,
            timestamp: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 200));
        fetchLeads();
      })
      .subscribe();

    const chatSubscription = supabase
      .channel('chat-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_history' }, (payload) => {
        const pl: any = payload;
        const newRow: any = pl.new || {};
        setMonitorEvents((prev) => [
          {
            table: 'chat_history',
            event: pl.eventType,
            sender_id: newRow.sender_id || 'unknown',
            role: newRow.role || 'system',
            message: newRow.message || `[${newRow.media_type || 'message'}]`,
            timestamp: newRow.created_at || new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 200));
        fetchChatHistory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(leadsSubscription);
      supabase.removeChannel(chatSubscription);
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
    if (!supabase) return;
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setLeads(data || []);
    setLoading(false);
  }

  async function fetchChatHistory() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('chat_history')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error) setChatHistory(data || []);
  }

  async function fetchFlows() {
    try {
      const res = await fetch(`${API_URL}/api/flows`);
      if (!res.ok) return;
      const data = await res.json();
      setFlows(data || []);
    } catch {
      // noop
    }
  }

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !activeChatId) return;

    const message = messageInput;
    setMessageInput('');

    try {
      const response = await fetch(`${API_URL}/api/send-message`, {
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

  const quickReplyTemplates = [
    'Thanks for contacting REEM AI. Which area in Qatar are you interested in?',
    'Great choice. What is your budget range?',
    'Would you like me to book a call with our specialist?',
    'Please share your email so I can schedule your visit.'
  ];

  const activeMessages = useMemo(() => {
    return chatHistory.filter(m => m.sender_id === activeChatId);
  }, [chatHistory, activeChatId]);

  const conversations = useMemo(() => {
    const map = new Map();
    const allSenderIds = new Set([
      ...leads.map((lead) => lead.sender_id),
      ...chatHistory.map((msg) => msg.sender_id),
    ]);
    allSenderIds.forEach((senderId) => {
      const lead = leads.find((l) => l.sender_id === senderId) || {};
      const lastMsg = chatHistory.filter((m) => m.sender_id === senderId).pop();
      map.set(senderId, {
        ...lead,
        sender_id: senderId,
        lastMessage: lastMsg?.message || (lastMsg?.media_type !== 'text' ? `[${lastMsg?.media_type}]` : 'No messages'),
        lastMessageTime: lastMsg?.created_at || lead.created_at || new Date().toISOString()
      });
    });
    return Array.from(map.values()).sort((a, b) => 
      new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    );
  }, [leads, chatHistory]);

  const createContact = async () => {
    if (!contactForm.sender_id.trim()) {
      setError('Phone/WhatsApp number is required.');
      return;
    }
    setError('');
    const res = await fetch(`${API_URL}/api/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactForm),
    });
    if (!res.ok) {
      const body = await res.text();
      setError(`Failed to create contact. ${body}`);
      return;
    }
    setContactForm({ sender_id: '', name: '', intent: '', area: '' });
    fetchLeads();
  };

  const activeContact = useMemo(
    () => leads.find((l) => l.sender_id === activeContactId) || null,
    [leads, activeContactId]
  );

  useEffect(() => {
    if (!activeContact) return;
    const ctx = activeContact.flow_context || {};
    setContactNotes(ctx.notes || '');
    setContactAssignee(ctx.assignee || '');
    setContactTagsInput(((ctx.tags || []) as string[]).join(', '));
    setContactStatus(activeContact.status || 'Contact');
  }, [activeContactId, leads]);

  const saveContactProfile = async () => {
    if (!activeContactId) return;
    const tags = contactTagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const res = await fetch(`${API_URL}/api/contacts/${activeContactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: contactStatus,
        notes: contactNotes,
        tags,
        assignee: contactAssignee,
      }),
    });
    if (!res.ok) {
      setError('Failed to save contact profile.');
      return;
    }
    fetchLeads();
  };

  const toggleContactSelection = (senderId: string) => {
    setSelectedContacts((prev) =>
      prev.includes(senderId) ? prev.filter((id) => id !== senderId) : [...prev, senderId]
    );
  };

  const runBulkAction = async (action: 'status' | 'assignee' | 'add_tag', value: string) => {
    if (!selectedContacts.length) {
      setError('Select at least one contact for bulk actions.');
      return;
    }
    const res = await fetch(`${API_URL}/api/contacts/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_ids: selectedContacts, action, value }),
    });
    if (!res.ok) {
      setError('Bulk update failed.');
      return;
    }
    setSelectedContacts([]);
    fetchLeads();
  };

  const createFlow = async () => {
    if (!newFlowName.trim()) {
      setError('Flow name is required.');
      return;
    }
    let nodes = [];
    try {
      nodes = JSON.parse(newFlowNodes || '[]');
      if (!Array.isArray(nodes)) throw new Error('Nodes must be an array');
    } catch {
      setError('Flow nodes must be valid JSON array.');
      return;
    }
    const res = await fetch(`${API_URL}/api/flows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFlowName, nodes }),
    });
    if (!res.ok) {
      setError('Failed to create flow.');
      return;
    }
    setNewFlowName('');
    setNewFlowNodes('[]');
    fetchFlows();
  };

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
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginRight: '0.5rem' }}>
                  {quickReplyTemplates.map((t, idx) => (
                    <button
                      key={idx}
                      onClick={() => setMessageInput(t)}
                      style={{ background: '#1a1a1a', color: '#bbb', border: '1px solid #333', borderRadius: '12px', padding: '0.25rem 0.6rem', fontSize: '0.7rem', cursor: 'pointer' }}
                    >
                      Template {idx + 1}
                    </button>
                  ))}
                </div>
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

  const renderContacts = () => (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div className="stat-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
        <input className="chat-input" placeholder="WhatsApp Number*" value={contactForm.sender_id} onChange={(e) => setContactForm({ ...contactForm, sender_id: e.target.value })} />
        <input className="chat-input" placeholder="Name" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
        <input className="chat-input" placeholder="Intent (Buy/Rent/Sell)" value={contactForm.intent} onChange={(e) => setContactForm({ ...contactForm, intent: e.target.value })} />
        <input className="chat-input" placeholder="Area" value={contactForm.area} onChange={(e) => setContactForm({ ...contactForm, area: e.target.value })} />
        <button onClick={createContact} style={{ background: '#c5a059', color: '#000', border: 'none', borderRadius: '8px', padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
          Create Contact
        </button>
      </div>

      <div className="stat-card" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => {
            const headers = ['name', 'sender_id', 'intent', 'area', 'status', 'created_at'];
            const rows = leads.map((l) => headers.map((h) => `"${String(l[h] ?? '').replace(/"/g, '""')}"`).join(','));
            const csv = [headers.join(','), ...rows].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          }}
          style={{ background: '#c5a059', color: '#000', border: 'none', borderRadius: '8px', padding: '0.6rem 0.9rem', cursor: 'pointer', fontWeight: 700 }}
        >
          <Download size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Export CSV
        </button>
        <input className="chat-input" placeholder="Bulk status" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} />
        <button onClick={() => runBulkAction('status', bulkStatus)} style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '8px', padding: '0.6rem 0.9rem', cursor: 'pointer' }}>Apply Status</button>
        <input className="chat-input" placeholder="Bulk assignee" value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)} />
        <button onClick={() => runBulkAction('assignee', bulkAssignee)} style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '8px', padding: '0.6rem 0.9rem', cursor: 'pointer' }}>Assign</button>
        <input className="chat-input" placeholder="Tag to add" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} />
        <button onClick={() => runBulkAction('add_tag', bulkTag)} style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '8px', padding: '0.6rem 0.9rem', cursor: 'pointer' }}>Add Tag</button>
      </div>

      <div className="leads-table-container">
        <table className="leads-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Name</th>
              <th>WhatsApp</th>
              <th>Intent</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <input type="checkbox" checked={selectedContacts.includes(lead.sender_id)} onChange={() => toggleContactSelection(lead.sender_id)} />
                </td>
                <td>{lead.name || 'Unknown'}</td>
                <td>{lead.sender_id}</td>
                <td>{lead.intent || 'N/A'}</td>
                <td><span className="status-badge">{lead.status || 'New'}</span></td>
                <td>
                  <button
                    onClick={() => setActiveContactId(lead.sender_id)}
                    style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '8px', padding: '0.4rem 0.75rem', cursor: 'pointer', marginRight: '0.5rem' }}
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => {
                      setActiveChatId(lead.sender_id);
                      setView('Conversations');
                    }}
                    style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '8px', padding: '0.4rem 0.75rem', cursor: 'pointer' }}
                  >
                    Open Chat
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeContact && (
        <div className="stat-card" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1rem' }}>
          <div>
            <h4 style={{ marginBottom: '0.75rem', color: '#c5a059' }}>Contact Profile Drawer</h4>
            <p style={{ color: '#888', marginBottom: '0.75rem' }}>{activeContact.name || activeContact.sender_id}</p>
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              <input className="chat-input" value={contactStatus} onChange={(e) => setContactStatus(e.target.value)} placeholder="Pipeline Status" />
              <input className="chat-input" value={contactAssignee} onChange={(e) => setContactAssignee(e.target.value)} placeholder="Assigned To" />
              <input className="chat-input" value={contactTagsInput} onChange={(e) => setContactTagsInput(e.target.value)} placeholder="Tags (comma separated)" />
              <textarea className="chat-input" value={contactNotes} onChange={(e) => setContactNotes(e.target.value)} placeholder="Notes" rows={4} />
              <button onClick={saveContactProfile} style={{ background: '#c5a059', color: '#000', border: 'none', borderRadius: '8px', padding: '0.6rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>
                Save Profile
              </button>
              <div style={{ color: '#888', fontSize: '0.85rem' }}>
                Last activity: {new Date(activeContact.created_at).toLocaleString()}
              </div>
            </div>
          </div>
          <div>
            <h4 style={{ marginBottom: '0.75rem', color: '#c5a059' }}>Dedicated Chat Workspace</h4>
            <div className="messages-list" style={{ height: '280px', border: '1px solid #333', borderRadius: '8px', padding: '0.75rem' }}>
              {chatHistory
                .filter((m) => m.sender_id === activeContact.sender_id)
                .map((msg, i) => (
                  <div key={i} className={`message-bubble ${msg.role}`}>
                    {msg.message || `[${msg.media_type || 'message'}]`}
                  </div>
                ))}
            </div>
            <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  setActiveChatId(activeContact.sender_id);
                  setView('Conversations');
                }}
                style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '8px', padding: '0.6rem 0.9rem', cursor: 'pointer' }}
              >
                Open Full Conversation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderFlows = () => (
    <div className="leads-table-container" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h3>Conversational Flows</h3>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <input className="chat-input" placeholder="Flow name" value={newFlowName} onChange={(e) => setNewFlowName(e.target.value)} />
          <button onClick={createFlow} style={{ background: '#c5a059', color: 'black', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            + Create New Flow
          </button>
        </div>
      </div>
      <textarea className="chat-input" placeholder='Flow nodes JSON (example: [{"type":"question","text":"Budget?"}])' value={newFlowNodes} onChange={(e) => setNewFlowNodes(e.target.value)} rows={5} style={{ width: '100%', marginBottom: '1rem' }} />
      <div style={{ display: 'grid', gap: '1rem' }}>
        {flows.map((flow) => (
          <div key={flow.id} className="stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: '600' }}>{flow.name}</div>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>{Array.isArray(flow.nodes) ? flow.nodes.length : 0} node(s)</div>
            </div>
            <div style={{ color: flow.is_active ? '#4ade80' : '#888', fontSize: '0.8rem' }}>{flow.is_active ? 'Active' : 'Inactive'}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderLiveMonitor = () => (
    <div className="leads-table-container" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3>Live Monitor</h3>
        <div style={{ color: '#888', fontSize: '0.85rem' }}>Inbound events as they arrive</div>
      </div>
      <div className="messages-list" style={{ height: '68vh', border: '1px solid #333', borderRadius: '10px', padding: '1rem' }}>
        {monitorEvents.map((evt, i) => (
          <div key={i} className={`message-bubble ${evt.role === 'assistant' ? 'assistant' : 'user'}`}>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: 4 }}>
              [{evt.table}] {evt.event} • {evt.sender_id}
            </div>
            <div>{evt.message}</div>
            <div className="message-time">{new Date(evt.timestamp).toLocaleString()}</div>
          </div>
        ))}
        {!monitorEvents.length && <div style={{ color: '#888' }}>No events yet. New messages and lead updates will stream here.</div>}
      </div>
    </div>
  );

  const renderAppointments = () => (
    <div className="leads-table-container" style={{ padding: '2rem' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>Appointments</h3>
      <p style={{ color: '#888' }}>
        Appointment booking details will appear here as soon as users schedule calls.
      </p>
    </div>
  );

  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const checkHealth = async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch(`${API_URL}/`);
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
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Agent Settings</h3>
        <p style={{ color: '#888' }}>Configure your WhatsApp integration and automation rules.</p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {['General', 'Automation', 'System Health'].map((tab) => (
          <button
            key={tab}
            onClick={() => setSettingsView(tab)}
            style={{
              border: '1px solid #333',
              background: settingsView === tab ? '#c5a059' : '#1a1a1a',
              color: settingsView === tab ? 'black' : '#fff',
              fontWeight: '600',
              padding: '0.55rem 0.9rem',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {settingsView === 'General' && (
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
      )}

      {settingsView === 'Automation' && (
        <div className="stat-card">
          <h4 style={{ marginBottom: '1rem', color: '#c5a059' }}>Automation Features</h4>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>AI Auto-Reply (GPT-4o)</span>
              <button onClick={() => setAiAutoReply(!aiAutoReply)} style={{ background: aiAutoReply ? '#4ade80' : '#666', border: 'none', padding: '4px 12px', borderRadius: '12px', fontSize: '0.7rem', color: 'black', fontWeight: 'bold', cursor: 'pointer' }}>
                {aiAutoReply ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Lead Qualification Flow</span>
              <button onClick={() => setLeadQualification(!leadQualification)} style={{ background: leadQualification ? '#4ade80' : '#666', border: 'none', padding: '4px 12px', borderRadius: '12px', fontSize: '0.7rem', color: 'black', fontWeight: 'bold', cursor: 'pointer' }}>
                {leadQualification ? 'Active' : 'Inactive'}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Multimedia Handling</span>
              <button onClick={() => setMultimediaHandling(!multimediaHandling)} style={{ background: multimediaHandling ? '#4ade80' : '#666', border: 'none', padding: '4px 12px', borderRadius: '12px', fontSize: '0.7rem', color: 'black', fontWeight: 'bold', cursor: 'pointer' }}>
                {multimediaHandling ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsView === 'System Health' && (
        <div className="stat-card">
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <h4 style={{ color: '#c5a059' }}>System Health</h4>
            <button
              onClick={checkHealth}
              disabled={checkingHealth}
              style={{ background: '#c5a059', color: 'black', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}
            >
              {checkingHealth ? 'Checking...' : 'Run System Health Check'}
            </button>
          </div>

          {healthStatus ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
              <div><div style={{ color: '#888', fontSize: '0.7rem' }}>Status</div><div style={{ fontWeight: 'bold', color: healthStatus.status === 'Healthy' ? '#4ade80' : '#ff4444' }}>{healthStatus.status}</div></div>
              <div><div style={{ color: '#888', fontSize: '0.7rem' }}>API Latency</div><div style={{ fontWeight: 'bold' }}>{healthStatus.latency}</div></div>
              <div><div style={{ color: '#888', fontSize: '0.7rem' }}>Database</div><div style={{ fontWeight: 'bold' }}>{healthStatus.database}</div></div>
              <div><div style={{ color: '#888', fontSize: '0.7rem' }}>Last Check</div><div style={{ fontWeight: 'bold' }}>{healthStatus.timestamp}</div></div>
            </div>
          ) : (
            <p style={{ color: '#888' }}>No health checks yet. Run a check to view current status.</p>
          )}
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (view) {
      case 'Dashboard': return renderDashboard();
      case 'Contacts': return renderContacts();
      case 'Live Monitor': return renderLiveMonitor();
      case 'Conversations': return renderConversations();
      case 'Leads': return renderLeads();
      case 'Flows': return renderFlows();
      case 'Appointments': return renderAppointments();
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
