'use client'

import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Users,
  Calendar,
  MessageSquare,
  TrendingUp,
  Search,
  Home,
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
  { id: 'Properties', label: 'Properties', icon: Home },
  { id: 'Flows', label: 'Flows', icon: GitBranch },
  { id: 'Appointments', label: 'Appointments', icon: Calendar },
];

export default function DashboardPage() {
  const [view, setView] = useState('Dashboard');
  const [leads, setLeads] = useState<any[]>([]);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [flows, setFlows] = useState<any[]>([]);
  const [backendCapabilities, setBackendCapabilities] = useState({ chatAll: true, properties: true });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [properties, setProperties] = useState<any[]>([]);
  const [isNewPropertyModalOpen, setIsNewPropertyModalOpen] = useState(false);
  const [newProperty, setNewProperty] = useState({ title: '', area: '', price: '', description: '', type: 'Apartment' });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copyStatus, setCopyStatus] = useState('');
  
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://qatar-real-estate-bot.vercel.app';
  const webhookUrl = `${backendUrl}/webhook`;
  const verifyToken = 'qatar_re_verify_2026';

  // Chat state
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isNewContactModalOpen, setIsNewContactModalOpen] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", sender_id: "", intent: "Buy" });
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    (async () => {
      const capabilities = await detectBackendCapabilities();
      setBackendCapabilities(capabilities);
      fetchLeads();
      fetchChatHistory(capabilities);
      fetchFlows();
      fetchProperties(capabilities);
    })();

    let leadsSubscription: any = null;
    let chatSubscription: any = null;
    let flowsSubscription: any = null;

    if (supabase) {
      leadsSubscription = supabase
        .channel('leads-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
          console.log('Leads updated:', payload);
          fetchLeads(true);
        })
        .subscribe((status) => {
          console.log('Leads subscription status:', status);
        });

      chatSubscription = supabase
        .channel('chat-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_history' }, (payload) => {
          console.log('Chat history updated:', payload);
          fetchChatHistory(backendCapabilities);
        })
        .subscribe((status) => {
          console.log('Chat subscription status:', status);
        });

      flowsSubscription = supabase
        .channel('flows-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'flows' }, (payload) => {
          console.log('Flows updated:', payload);
          fetchFlows();
        })
        .subscribe((status) => {
          console.log('Flows subscription status:', status);
        });
    }

    return () => {
      if (supabase) {
        if (leadsSubscription) supabase.removeChannel(leadsSubscription);
        if (chatSubscription) supabase.removeChannel(chatSubscription);
        if (flowsSubscription) supabase.removeChannel(flowsSubscription);
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, activeChatId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchLeads(true);
      fetchChatHistory(backendCapabilities);
      if (view === 'Properties') {
        fetchProperties(backendCapabilities);
      }
    }, 8000);

    return () => clearInterval(timer);
  }, [autoRefresh, backendCapabilities, view]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const normalizeMessages = (rows: any[]) => {
    return [...(rows || [])].sort((a, b) => (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ));
  };

  async function detectBackendCapabilities() {
    try {
      const response = await fetch(`${backendUrl}/openapi.json`);
      if (!response.ok) {
        return { chatAll: false, properties: false };
      }

      const schema = await response.json();
      const paths = schema?.paths || {};

      return {
        chatAll: Boolean(paths['/api/chat/all'] || paths['/chat/all']),
        properties: Boolean(paths['/api/properties']),
      };
    } catch (err) {
      console.warn('Failed to detect backend capabilities, using Supabase fallback.');
      return { chatAll: false, properties: false };
    }
  }

  async function fetchLeads(silent = false) {
    if (!supabase) return;
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/contacts`);
      if (response.ok) {
        const data = await response.json();
        setLeads(data || []);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    }
    if (!silent) setLoading(false);
  }

  async function fetchChatHistory(capabilities = backendCapabilities) {
    try {
      if (capabilities.chatAll) {
        const response = await fetch(`${backendUrl}/api/chat/all`);
        if (response.ok) {
          const data = await response.json();
          setChatHistory(normalizeMessages(data));
          return;
        }
      }

      if (supabase) {
        const { data, error } = await supabase
          .from('chat_history')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);

        if (!error) {
          setChatHistory(normalizeMessages(data));
        }
      }
    } catch (err) {
      console.error('Error fetching chat history:', err);
    }
  }

  async function fetchFlows() {
    if (!supabase) return;
    try {
      const response = await fetch(`${backendUrl}/api/flows`) ;
      if (!response.ok) throw new Error('Failed to fetch flows');
      const data = await response.json();
      setFlows(data || []);
    } catch (err) {
      console.error('Error fetching flows from Supabase:', err);
    }
  }

  async function fetchProperties(capabilities = backendCapabilities) {
    try {
      if (capabilities.properties) {
        const response = await fetch(`${backendUrl}/api/properties`);
        if (response.ok) {
          const data = await response.json();
          setProperties(data || []);
          return;
        }
      }

      if (supabase) {
        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error) {
          setProperties(data || []);
        } else {
          setError(`Failed to load properties: ${error.message}`);
        }
      }
    } catch (err) {
      console.error('Error fetching properties:', err);
    }
  }

  const handleCreateContact = async () => {
    if (!newContact.name || !newContact.sender_id || !supabase) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('leads')
        .insert([
          {
            name: newContact.name,
            sender_id: newContact.sender_id,
            intent: newContact.intent,
            status: 'Contact',
            created_at: new Date().toISOString()
          }
        ]);
      
      if (error) throw error;

      setIsNewContactModalOpen(false);
      setNewContact({ name: '', sender_id: '', intent: 'Buy' });
      fetchLeads();
    } catch (err) { 
      console.error('Error creating contact in Supabase:', err); 
    }
    setLoading(false);
  };

  const sendTemplate = async (templateName: string) => {
    if (!activeChatId) return;
    setIsTemplateMenuOpen(false);
    try {
      await fetch(`${backendUrl}/api/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_number: activeChatId,
          template_name: templateName,
          language_code: 'en_US'
        }),
      });
    } catch (err) { console.error(err); }
  };

  const handleSendMessage = async () => {
    if (!activeChatId) return;

    const textMessage = messageInput.trim();
    if (!textMessage && !selectedFile) return;

    if (selectedFile) {
      setSendingAttachment(true);
      try {
        const formData = new FormData();
        formData.append('recipient_number', activeChatId);
        formData.append('caption', textMessage);
        formData.append('file', selectedFile);

        const response = await fetch(`${backendUrl}/api/send-media`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Media endpoint unavailable. Redeploy backend to enable file sending.');
        }

        setSelectedFile(null);
        setMessageInput('');
        return;
      } catch (err: any) {
        setError(err?.message || 'Error sending file. Please try again.');
        return;
      } finally {
        setSendingAttachment(false);
      }
    }

    if (!textMessage) {
      setMessageInput('');
      return;
    }

    const message = textMessage;
    setMessageInput('');

    try {
      const response = await fetch(`${backendUrl}/api/send-message`, {
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
      const lastMsg = chatHistory.filter(m => m.sender_id === lead.sender_id).at(-1);
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
      { label: 'Total AI Cost', value: `$${leads.reduce((acc, lead) => acc + (lead.total_cost || 0), 0).toFixed(4)}`, icon: MessageSquare },
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
                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1a1a1a', padding: '0.4rem 0.8rem', borderRadius: '20px', border: '1px solid #333' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: activeLead?.ai_enabled !== false ? '#4ade80' : '#888' }}>
                      {activeLead?.ai_enabled !== false ? 'AI ON' : 'AI OFF'}
                    </span>
                <button
                  onClick={async () => {
                        const newState = activeLead?.ai_enabled === false;
                        try {
                          const response = await fetch(`${backendUrl}/api/contacts/${activeChatId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ai_enabled: newState }),
                          });

                          if (!response.ok) {
                            throw new Error('Backend update failed');
                          }
                        } catch (err) {
                          if (supabase) {
                            const { error } = await supabase
                              .from('leads')
                              .update({ ai_enabled: newState })
                              .eq('sender_id', activeChatId);

                            if (error) {
                              setError(`Failed to update AI toggle: ${error.message}`);
                              return;
                            }
                          }
                        }
                        fetchLeads(true);
                      }}
                      style={{
                        width: '36px',
                        height: '18px',
                        background: activeLead?.ai_enabled !== false ? '#4ade80' : '#333',
                        borderRadius: '10px',
                        position: 'relative',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{
                        width: '14px',
                        height: '14px',
                        background: 'white',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '2px',
                        left: activeLead?.ai_enabled !== false ? '20px' : '2px',
                        transition: 'left 0.2s'
                      }} />
                    </button>
                  </div>
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
                    {msg.media_url && msg.media_type === 'video' && (
                      <video src={msg.media_url} controls className="media-preview" />
                    )}
                    {msg.media_url && msg.media_type === 'audio' && (
                      <audio src={msg.media_url} controls />
                    )}
                    {msg.media_url && msg.media_type === 'document' && (
                      <a href={msg.media_url} target="_blank" rel="noreferrer">Open document</a>
                    )}
                    {msg.message && <div>{msg.message}</div>}
                    {!msg.message && msg.media_type && msg.media_type !== 'text' && !msg.media_url && (
                      <div>[{msg.media_type}]</div>
                    )}
                    <div className="message-time">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input-area">
                <button className="icon-button"><Smile size={22} /></button>
                <button
                  className="icon-button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file"
                >
                  <Paperclip size={22} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.xlsx,.xls,.ppt,.pptx"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setSelectedFile(file);
                  }}
                />
                <input 
                  className="chat-input" 
                  placeholder={selectedFile ? `File selected: ${selectedFile.name}` : 'Type a message...'}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button 
                  className="icon-button" 
                  style={{ color: '#c5a059' }}
                  disabled={sendingAttachment}
                  onClick={handleSendMessage}
                >
                  {sendingAttachment ? '...' : <Send size={22} />}
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
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>All Leads</h3>
        <button onClick={() => setIsNewContactModalOpen(true)} style={{ background: '#c5a059', color: 'black', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>+ New Contact</button>
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

  const handleCreateProperty = async () => {
    if (!newProperty.title) return;
    setLoading(true);
    setError('');
    try {
      const parsedPriceRaw = (newProperty.price || '').toString().replace(/,/g, '').trim();
      const parsedPrice = parsedPriceRaw ? Number(parsedPriceRaw) : null;
      const payload = {
        title: newProperty.title.trim(),
        area: newProperty.area?.trim() || null,
        price: Number.isFinite(parsedPrice as number) ? parsedPrice : null,
        description: newProperty.description?.trim() || null,
        type: newProperty.type || null,
        bedrooms: null as number | null,
        images: [] as string[],
      };

      let created = false;

      if (backendCapabilities.properties) {
        const response = await fetch(`${backendUrl}/api/properties`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        created = response.ok;
      }

      if (!created && supabase) {
        const { error } = await supabase.from('properties').insert([
          {
            id: crypto.randomUUID(),
            title: payload.title,
            area: payload.area,
            price: Number.isFinite(parsedPrice as number) ? parsedPrice : null,
            description: payload.description,
            type: payload.type,
            bedrooms: payload.bedrooms,
            images: payload.images,
            metadata: { source: 'dashboard' },
            created_at: new Date().toISOString(),
          },
        ]);
        if (!error) {
          created = true;
        } else {
          setError(`Could not create property: ${error.message}`);
        }
      }

      if (created) {
        setIsNewPropertyModalOpen(false);
        setNewProperty({ title: '', area: '', price: '', description: '', type: 'Apartment' });
        fetchProperties();
      } else {
        setError('Could not create property. Check backend/Supabase policies and try again.');
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const renderProperties = () => (
    <div className="leads-table-container">
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Property Listings (RAG Knowledge Base)</h3>
        <button onClick={() => setIsNewPropertyModalOpen(true)} style={{ background: '#c5a059', color: 'black', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>+ Add Property</button>
      </div>
      <table className="leads-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Area</th>
            <th>Price (QAR)</th>
            <th>Type</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((prop) => (
            <tr key={prop.id}>
              <td style={{ fontWeight: '500' }}>{prop.title}</td>
              <td>{prop.area}</td>
              <td>{prop.price?.toLocaleString()}</td>
              <td>{prop.type}</td>
              <td>
                <button
                  onClick={async () => {
                    if (backendCapabilities.properties) {
                      const response = await fetch(`${backendUrl}/api/properties/${prop.id}`, { method: 'DELETE' });
                      if (!response.ok && supabase) {
                        await supabase.from('properties').delete().eq('id', prop.id);
                      }
                    } else if (supabase) {
                      await supabase.from('properties').delete().eq('id', prop.id);
                    }
                    fetchProperties();
                  }}
                  style={{ background: 'transparent', color: '#ff4444', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  Delete
                </button>
              </td>
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
  const [aiSettings, setAiSettings] = useState({
    provider: 'groq',
    model: 'llama-3.3-70b-versatile'
  });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();
      
      if (!error && data) {
        setAiSettings({ provider: data.provider, model: data.model });
      }
    }
    loadSettings();
  }, []);

  const saveSettings = async (settings: any) => {
    if (!supabase) return;
    setSavingSettings(true);
    try {
      const response = await fetch(`${backendUrl}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (response.ok) {
        setAiSettings(settings);
        setCopyStatus('Settings saved!');
        setTimeout(() => setCopyStatus(''), 2000);
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    }
    setSavingSettings(false);
  };

  const checkHealth = async () => {
    setCheckingHealth(true);
    const startTime = Date.now();
    try {
      const res = await fetch(`${backendUrl}/`);
      const data = await res.json();
      const latency = Date.now() - startTime;
      setHealthStatus({
        status: data.status === 'online' ? 'Healthy' : 'Degraded',
        latency: `${latency}ms`,
        backend: 'Connected',
        database: data.database || 'Unknown',
        ai_agent: data.ai_agent || 'Unknown',
        timestamp: new Date(data.timestamp).toLocaleTimeString()
      });
    } catch (err) {
      setHealthStatus({ status: 'Offline', backend: 'Error', database: 'Disconnected', ai_agent: 'Offline', timestamp: new Date().toLocaleTimeString() });
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
              <div><div style={{ color: '#888', fontSize: '0.7rem' }}>Status</div><div style={{ fontWeight: 'bold' }}>{healthStatus.status}</div></div>
              <div><div style={{ color: '#888', fontSize: '0.7rem' }}>API Latency</div><div style={{ fontWeight: 'bold' }}>{healthStatus.latency}</div></div>
              <div><div style={{ color: '#888', fontSize: '0.7rem' }}>Database</div><div style={{ fontWeight: 'bold' }}>{healthStatus.database}</div></div>
              <div><div style={{ color: '#888', fontSize: '0.7rem' }}>AI Agent</div><div style={{ fontWeight: 'bold' }}>{healthStatus.ai_agent}</div></div>
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
          <h4 style={{ marginBottom: '1rem', color: '#c5a059' }}>AI Model Selection</h4>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.4rem' }}>Provider</div>
              <select 
                value={aiSettings.provider}
                onChange={(e) => saveSettings({ ...aiSettings, provider: e.target.value })}
                style={{ width: '100%', background: '#0d0d0d', color: 'white', border: '1px solid #333', padding: '0.6rem', borderRadius: '8px', fontSize: '0.9rem' }}
              >
                <option value="groq">Groq (Fastest)</option>
                <option value="openai">OpenAI (GPT-4o)</option>
                <option value="anthropic">Anthropic (Claude 3.5)</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.4rem' }}>Model</div>
              <input 
                value={aiSettings.model}
                onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                onBlur={() => saveSettings(aiSettings)}
                placeholder="e.g. gpt-4o"
                style={{ width: '100%', background: '#0d0d0d', color: 'white', border: '1px solid #333', padding: '0.6rem', borderRadius: '8px', fontSize: '0.9rem' }}
              />
            </div>
            {savingSettings && <div style={{ fontSize: '0.75rem', color: '#c5a059' }}>Saving changes...</div>}
          </div>
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
      case 'Properties': return renderProperties();
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
      {isNewContactModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '12px', width: '400px', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', color: '#c5a059' }}>Create New Contact</h2>
            <div style={{ display: 'grid', gap: '1.25rem' }}>
              <input className="chat-input" value={newContact.name} onChange={e => setNewContact({...newContact, name: e.target.value})} placeholder="Full Name" style={{ width: '100%' }} />
              <input className="chat-input" value={newContact.sender_id} onChange={e => setNewContact({...newContact, sender_id: e.target.value})} placeholder="Phone Number" style={{ width: '100%' }} />
              <select className="chat-input" value={newContact.intent} onChange={e => setNewContact({...newContact, intent: e.target.value})} style={{ width: '100%', background: '#000', color: 'white' }}>
                <option value="Buy">Buy</option><option value="Rent">Rent</option><option value="Sell">Sell</option><option value="Invest">Invest</option>
              </select>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button onClick={() => setIsNewContactModalOpen(false)} style={{ flex: 1, background: 'transparent', color: '#888', border: '1px solid #333', padding: '0.75rem', borderRadius: '8px' }}>Cancel</button>
                <button onClick={handleCreateContact} style={{ flex: 1, background: '#c5a059', color: 'black', border: 'none', padding: '0.75rem', borderRadius: '8px', fontWeight: 'bold' }}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isNewPropertyModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '12px', width: '500px', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', color: '#c5a059' }}>Add New Property</h2>
            <div style={{ display: 'grid', gap: '1.25rem' }}>
              <input className="chat-input" value={newProperty.title} onChange={e => setNewProperty({...newProperty, title: e.target.value})} placeholder="Property Title (e.g. Luxury 3BR Villa)" style={{ width: '100%' }} />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <input className="chat-input" value={newProperty.area} onChange={e => setNewProperty({...newProperty, area: e.target.value})} placeholder="Area (e.g. The Pearl)" style={{ flex: 1 }} />
                <input className="chat-input" type="number" value={newProperty.price} onChange={e => setNewProperty({...newProperty, price: e.target.value})} placeholder="Price (QAR)" style={{ flex: 1 }} />
              </div>
              <select className="chat-input" value={newProperty.type} onChange={e => setNewProperty({...newProperty, type: e.target.value})} style={{ width: '100%', background: '#000', color: 'white' }}>
                <option value="Apartment">Apartment</option><option value="Villa">Villa</option><option value="Penthouse">Penthouse</option><option value="Townhouse">Townhouse</option>
              </select>
              <textarea
                className="chat-input"
                value={newProperty.description}
                onChange={e => setNewProperty({...newProperty, description: e.target.value})}
                placeholder="Detailed description for AI training..."
                style={{ width: '100%', height: '100px', resize: 'none' }}
              />
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button onClick={() => setIsNewPropertyModalOpen(false)} style={{ flex: 1, background: 'transparent', color: '#888', border: '1px solid #333', padding: '0.75rem', borderRadius: '8px' }}>Cancel</button>
                <button onClick={handleCreateProperty} style={{ flex: 1, background: '#c5a059', color: 'black', border: 'none', padding: '0.75rem', borderRadius: '8px', fontWeight: 'bold' }}>Add Property</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
