import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
    IconMail, 
    IconUser, 
    IconCalendar, 
    IconLoader, 
    IconTrash, 
    IconCheck, 
    IconSearch, 
    IconRefresh, 
    IconClock, 
    IconAlertTriangle, 
    IconChevronRight 
} from '../components/Icons';

export interface MessageReply {
    id: number;
    message_id: number;
    user_id: string;
    message: string;
    created_at: string;
    profiles?: {
        id?: string;
        full_name: string;
        role: string;
    };
}

export interface Message {
    id: number;
    user_id: string;
    type: string;
    subject: string;
    message: string;
    created_at: string;
    updated_at?: string;
    department?: string;
    status: 'aberta' | 'respondida' | 'fechada';
    hidden_by_admin?: boolean;
    hidden_by_user?: boolean;
    profiles?: {
        id?: string;
        full_name: string;
        role?: string;
        email?: string;
    };
    contact_message_replies?: MessageReply[];
}

export const ContactPage: React.FC<{
    userRole: string;
    userName?: string;
    canViewMessages: boolean;
}> = ({ userRole, userName, canViewMessages }) => {
    // Current user state
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // Messages state
    const [messages, setMessages] = useState<Message[]>([]);
    const [fetchingMessages, setFetchingMessages] = useState(false);

    // Tab state: 'inbox' (recebidas - gestores), 'my_messages' (enviadas pelo usuário), 'send' (novo contato)
    const [activeTab, setActiveTab] = useState<'inbox' | 'my_messages' | 'send'>(
        canViewMessages ? 'inbox' : 'my_messages'
    );

    // Filter and search state
    const [statusFilter, setStatusFilter] = useState<'todas' | 'aberta' | 'respondida' | 'fechada' | 'removidas'>('todas');
    const [deptFilter, setDeptFilter] = useState<string>('todos');
    const [searchTerm, setSearchTerm] = useState('');

    // Accordion / Expanded conversation
    const [expandedMessageId, setExpandedMessageId] = useState<number | null>(null);

    // Reply form state per message
    const [replyDrafts, setReplyDrafts] = useState<{ [messageId: number]: string }>({});
    const [submittingReplyId, setSubmittingReplyId] = useState<number | null>(null);
    const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

    // New message form state
    const [type, setType] = useState('Sugestão');
    const [department, setDepartment] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        initCurrentUser();
    }, []);

    const initCurrentUser = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setCurrentUserId(user.id);
            }
        } catch (err) {
            console.error('Erro ao obter usuário atual:', err);
        }
        fetchMessages();
    };

    const fetchMessages = async () => {
        setFetchingMessages(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from('contact_messages')
                .select(`
                    *,
                    profiles ( id, full_name, role, email ),
                    contact_message_replies (
                        id,
                        message_id,
                        user_id,
                        message,
                        created_at,
                        profiles ( id, full_name, role )
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const formattedMessages: Message[] = (data || []).map((msg: any) => ({
                ...msg,
                status: msg.status || 'aberta',
                hidden_by_admin: !!msg.hidden_by_admin,
                hidden_by_user: !!msg.hidden_by_user,
                profiles: Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles,
                contact_message_replies: (msg.contact_message_replies || []).map((rep: any) => ({
                    ...rep,
                    profiles: Array.isArray(rep.profiles) ? rep.profiles[0] : rep.profiles
                })).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            }));

            setMessages(formattedMessages);
        } catch (err: any) {
            console.error('Erro ao carregar mensagens:', err);
            setError(`Erro ao carregar mensagens: ${err.message}`);
        } finally {
            setFetchingMessages(false);
        }
    };

    // Submitting a new reply to a message thread
    const handleSendReply = async (messageItem: Message) => {
        const text = replyDrafts[messageItem.id]?.trim();
        if (!text) return;

        setSubmittingReplyId(messageItem.id);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado.');

            // 1. Insert reply
            const { error: replyErr } = await supabase
                .from('contact_message_replies')
                .insert([{
                    message_id: messageItem.id,
                    user_id: user.id,
                    message: text
                }]);

            if (replyErr) throw replyErr;

            // 2. Determine new status:
            // If the sender is management responding to a member, mark as 'respondida'.
            // If the sender is the original member adding a follow-up (réplica), mark as 'aberta' again.
            const isOriginalAuthor = user.id === messageItem.user_id;
            const newStatus = isOriginalAuthor ? 'aberta' : 'respondida';

            const { error: updateErr } = await supabase
                .from('contact_messages')
                .update({ 
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', messageItem.id);

            if (updateErr) console.warn('Aviso ao atualizar status da mensagem:', updateErr);

            // 3. Clear draft and refresh
            setReplyDrafts(prev => ({ ...prev, [messageItem.id]: '' }));
            await fetchMessages();
        } catch (err: any) {
            console.error('Erro ao enviar resposta:', err);
            alert(`Erro ao enviar resposta: ${err.message || 'Tente novamente.'}`);
        } finally {
            setSubmittingReplyId(null);
        }
    };

    // Quick status toggle (e.g. Encerrar ou Reabrir)
    const handleUpdateStatus = async (messageId: number, nextStatus: 'aberta' | 'respondida' | 'fechada') => {
        setUpdatingStatusId(messageId);
        try {
            const { error } = await supabase
                .from('contact_messages')
                .update({ 
                    status: nextStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', messageId);

            if (error) throw error;
            await fetchMessages();
        } catch (err: any) {
            console.error('Erro ao atualizar status:', err);
            alert(`Erro ao alterar status: ${err.message}`);
        } finally {
            setUpdatingStatusId(null);
        }
    };

    // Soft delete for Admin: removes from management inbox, preserves for the member
    const handleHideMessageFromAdmin = async (id: number) => {
        if (!confirm('Deseja remover esta mensagem da Caixa de Entrada da administração? (O sócio continuará com o registro preservado em "Minhas Mensagens")')) return;

        try {
            const { error } = await supabase
                .from('contact_messages')
                .update({ hidden_by_admin: true })
                .eq('id', id);

            if (error) throw error;
            await fetchMessages();
            if (expandedMessageId === id) setExpandedMessageId(null);
        } catch (err: any) {
            console.error('Erro ao remover mensagem:', err);
            alert('Erro ao remover mensagem.');
        }
    };

    // Restore message to Admin inbox
    const handleRestoreMessageForAdmin = async (id: number) => {
        try {
            const { error } = await supabase
                .from('contact_messages')
                .update({ hidden_by_admin: false })
                .eq('id', id);

            if (error) throw error;
            await fetchMessages();
        } catch (err: any) {
            console.error('Erro ao restaurar mensagem:', err);
            alert('Erro ao restaurar mensagem.');
        }
    };

    // Soft delete for Member: hides from member's list, preserves for administration
    const handleHideMessageFromUser = async (id: number) => {
        if (!confirm('Deseja ocultar esta mensagem do seu histórico? (A administração continuará com a cópia registrada)')) return;

        try {
            const { error } = await supabase
                .from('contact_messages')
                .update({ hidden_by_user: true })
                .eq('id', id);

            if (error) throw error;
            await fetchMessages();
            if (expandedMessageId === id) setExpandedMessageId(null);
        } catch (err: any) {
            console.error('Erro ao ocultar mensagem:', err);
            alert('Erro ao ocultar mensagem.');
        }
    };

    // Hard delete (only when admin explicitly chooses to delete permanently from trash)
    const handleDeletePermanent = async (id: number) => {
        if (!confirm('ATENÇÃO: Deseja EXCLUIR DEFINITIVAMENTE este chamado do banco de dados? Isso apagará a mensagem para todos, inclusive para o sócio.')) return;

        try {
            const { error } = await supabase
                .from('contact_messages')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setMessages(prev => prev.filter(msg => msg.id !== id));
            if (expandedMessageId === id) setExpandedMessageId(null);
        } catch (err: any) {
            console.error('Erro ao excluir definitivamente:', err);
            alert('Erro ao excluir definitivamente.');
        }
    };

    // Submitting a brand new message/ticket
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado.');

            const { error: insertError } = await supabase
                .from('contact_messages')
                .insert([{
                    user_id: user.id,
                    type,
                    subject,
                    message,
                    department: department || null,
                    status: 'aberta',
                    hidden_by_admin: false,
                    hidden_by_user: false
                }]);

            if (insertError) throw insertError;

            setSubmitted(true);
            setSubject('');
            setMessage('');
            setDepartment('');
            await fetchMessages();

            // Auto-redirect to my messages after 3 seconds
            setTimeout(() => {
                setSubmitted(false);
                setActiveTab('my_messages');
            }, 3000);
        } catch (err: any) {
            console.error('Erro ao enviar mensagem:', err);
            setError('Ocorreu um erro ao enviar sua mensagem. Tente novamente mais tarde.');
        } finally {
            setLoading(false);
        }
    };

    // Categorized lists
    // Sócio only sees messages not hidden by the user, unaffected by whether admin hid it
    const myMessagesList = messages.filter(m => m.user_id === currentUserId && !m.hidden_by_user);
    
    // For management inbox, respect hidden_by_admin filter
    const inboxMessagesList = messages.filter(m => {
        // Trash/Archived vs Active inbox
        if (statusFilter === 'removidas') {
            if (!m.hidden_by_admin) return false;
        } else {
            if (m.hidden_by_admin) return false;
        }

        // Status filter
        if (statusFilter !== 'todas' && statusFilter !== 'removidas' && m.status !== statusFilter) return false;
        // Department filter (for admin)
        if (deptFilter !== 'todos' && m.department !== deptFilter) return false;
        // Search term
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            const author = (m.profiles?.full_name || '').toLowerCase();
            const subj = (m.subject || '').toLowerCase();
            const msg = (m.message || '').toLowerCase();
            if (!author.includes(term) && !subj.includes(term) && !msg.includes(term)) {
                return false;
            }
        }
        return true;
    });

    const pendingInboxCount = messages.filter(m => m.status === 'aberta' && !m.hidden_by_admin).length;
    const removedAdminCount = messages.filter(m => m.hidden_by_admin).length;

    // Helpers for badges
    const getDepartmentLabel = (dept?: string) => {
        switch (dept) {
            case 'consu':
                return { label: 'CONSU', className: 'bg-teal-100 text-teal-800 border-teal-200' };
            case 'financeiro':
                return { label: 'Financeiro', className: 'bg-purple-100 text-purple-800 border-purple-200' };
            case 'manutencao':
                return { label: 'Manutenção', className: 'bg-amber-100 text-amber-800 border-amber-200' };
            default:
                return { label: 'Geral', className: 'bg-gray-100 text-gray-700 border-gray-200' };
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'aberta':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        Aguardando Resposta
                    </span>
                );
            case 'respondida':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Respondida
                    </span>
                );
            case 'fechada':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                        <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                        Encerrada
                    </span>
                );
            default:
                return null;
        }
    };

    const getRoleName = (role?: string) => {
        switch (role) {
            case 'consu': return 'Conselheiro (CONSU)';
            case 'admin': return 'Administrador';
            case 'site_admin': return 'Administrador do Site';
            case 'finance':
            case 'finance_manager':
            case 'accounting': return 'Financeiro';
            case 'manutencao': return 'Manutenção';
            case 'member': return 'Sócio';
            case 'visitor': return 'Visitante';
            default: return 'Usuário';
        }
    };

    // Render conversation thread item
    const renderMessageCard = (msg: Message, isMyMessageView: boolean) => {
        const isExpanded = expandedMessageId === msg.id;
        const deptInfo = getDepartmentLabel(msg.department);
        const replies = msg.contact_message_replies || [];

        // Can the current user act as management to reply officially?
        const isManagerForThis = canViewMessages && (
            userRole === 'admin' || 
            userRole === 'site_admin' || 
            (userRole === 'consu' && msg.department === 'consu') ||
            (['finance', 'finance_manager', 'accounting'].includes(userRole) && msg.department === 'financeiro') ||
            (userRole === 'manutencao' && msg.department === 'manutencao')
        );

        return (
            <div 
                key={msg.id} 
                className={`bg-white rounded-2xl shadow-sm border transition-all ${
                    isExpanded ? 'border-farm-400 shadow-md ring-1 ring-farm-200' : 'border-gray-100 hover:border-gray-200 hover:shadow'
                }`}
            >
                {/* Header / Summary Bar */}
                <div 
                    onClick={() => setExpandedMessageId(isExpanded ? null : msg.id)}
                    className="p-6 cursor-pointer select-none"
                >
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-farm-50 rounded-full flex items-center justify-center text-farm-700 font-bold">
                                <IconUser className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="font-bold text-gray-900">
                                        {msg.profiles?.full_name || 'Usuário Desconhecido'}
                                    </p>
                                    {msg.profiles?.role && (
                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                                            ({getRoleName(msg.profiles.role)})
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-0.5">
                                    <span className="flex items-center gap-1">
                                        <IconCalendar className="w-3.5 h-3.5 text-gray-400" />
                                        {new Date(msg.created_at).toLocaleString('pt-BR')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {getStatusBadge(msg.status)}
                            <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] border ${deptInfo.className}`}>
                                {deptInfo.label}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                msg.type === 'Elogio' ? 'bg-green-100 text-green-700' :
                                msg.type === 'Crítica/Reclamação' ? 'bg-red-100 text-red-700' :
                                'bg-blue-100 text-blue-700'
                            }`}>
                                {msg.type}
                            </span>

                            {/* Actions per view */}
                            {isMyMessageView ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleHideMessageFromUser(msg.id);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all ml-2"
                                    title="Ocultar esta mensagem do meu histórico"
                                >
                                    <IconTrash className="w-4 h-4" />
                                </button>
                            ) : (
                                (userRole === 'admin' || userRole === 'site_admin') && (
                                    msg.hidden_by_admin ? (
                                        <div className="flex items-center gap-1 ml-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRestoreMessageForAdmin(msg.id);
                                                }}
                                                className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-full transition-all"
                                                title="Restaurar para a Caixa de Entrada"
                                            >
                                                <IconRefresh className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeletePermanent(msg.id);
                                                }}
                                                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full transition-all"
                                                title="Excluir Definitivamente do Banco de Dados"
                                            >
                                                <IconTrash className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleHideMessageFromAdmin(msg.id);
                                            }}
                                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all ml-2"
                                            title="Remover da Caixa de Entrada da Administração (Preserva para o sócio)"
                                        >
                                            <IconTrash className="w-4 h-4" />
                                        </button>
                                    )
                                )
                            )}
                        </div>
                    </div>

                    <div className="mt-2 flex items-start justify-between gap-4">
                        <div>
                            <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                {msg.subject}
                            </h4>
                            {!isExpanded && (
                                <p className="text-gray-600 text-sm mt-1 line-clamp-2">
                                    {msg.message}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {replies.length > 0 && (
                                <span className="bg-farm-100 text-farm-800 text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
                                    <IconMail className="w-3.5 h-3.5" />
                                    {replies.length} {replies.length === 1 ? 'resposta' : 'respostas'}
                                </span>
                            )}
                            <div className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-farm-600' : ''}`}>
                                <IconChevronRight className="w-5 h-5" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Expanded Conversation Details */}
                {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/50 p-6 space-y-6 animate-fade-in">
                        {/* 1. Original Message Content */}
                        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs">
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-2 pb-2 border-b border-gray-100">
                                <span className="font-bold text-gray-700 flex items-center gap-1.5">
                                    <IconMail className="w-4 h-4 text-farm-600" />
                                    Mensagem Original de {msg.profiles?.full_name || 'Sócio'}
                                </span>
                                <span>{new Date(msg.created_at).toLocaleString('pt-BR')}</span>
                            </div>
                            <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-sm">
                                {msg.message}
                            </p>
                        </div>

                        {/* 2. Replies Timeline */}
                        {replies.length > 0 ? (
                            <div className="space-y-4 pt-2">
                                <div className="flex items-center gap-2">
                                    <div className="h-px flex-1 bg-gray-200"></div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 bg-white px-3 py-1 rounded-full border border-gray-200">
                                        Histórico da Conversa ({replies.length})
                                    </span>
                                    <div className="h-px flex-1 bg-gray-200"></div>
                                </div>

                                {replies.map((reply) => {
                                    const replyAuthorRole = reply.profiles?.role;
                                    const isFromManagement = ['consu', 'admin', 'site_admin', 'finance', 'finance_manager', 'accounting', 'manutencao'].includes(replyAuthorRole || '');
                                    const isMe = reply.user_id === currentUserId;

                                    return (
                                        <div 
                                            key={reply.id} 
                                            className={`p-5 rounded-2xl border transition-all ${
                                                isFromManagement 
                                                    ? 'bg-teal-50/70 border-teal-200/80 shadow-xs ml-2 sm:ml-6' 
                                                    : 'bg-white border-blue-200 shadow-xs mr-2 sm:mr-6'
                                            }`}
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-black/5">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2.5 h-2.5 rounded-full ${isFromManagement ? 'bg-teal-600' : 'bg-blue-500'}`}></span>
                                                    <span className="font-bold text-gray-900 text-sm">
                                                        {reply.profiles?.full_name || 'Usuário'}
                                                    </span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                        isFromManagement 
                                                            ? 'bg-teal-600 text-white' 
                                                            : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {isFromManagement 
                                                            ? `Resposta Oficial (${getRoleName(replyAuthorRole)})` 
                                                            : 'Réplica do Sócio'}
                                                    </span>
                                                    {isMe && (
                                                        <span className="text-[10px] text-gray-400 font-medium">(você)</span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                                    <IconClock className="w-3 h-3 text-gray-400" />
                                                    {new Date(reply.created_at).toLocaleString('pt-BR')}
                                                </span>
                                            </div>
                                            <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-sm font-sans">
                                                {reply.message}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-6 bg-white/70 rounded-xl border border-dashed border-gray-200 text-gray-500 text-sm">
                                Nenhuma resposta registrada até o momento.
                            </div>
                        )}

                        {/* 3. Reply and Action Area */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h5 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                    <IconMail className="w-4 h-4 text-farm-700" />
                                    {isManagerForThis 
                                        ? `Responder como ${getDepartmentLabel(msg.department).label} (${userName || 'Gestor'})` 
                                        : 'Enviar Réplica / Esclarecimento'}
                                </h5>

                                {/* Status controls */}
                                <div className="flex items-center gap-2">
                                    {msg.status !== 'fechada' ? (
                                        <button
                                            disabled={updatingStatusId === msg.id}
                                            onClick={() => handleUpdateStatus(msg.id, 'fechada')}
                                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-all flex items-center gap-1"
                                            title="Encerrar este chamado caso já tenha sido esclarecido"
                                        >
                                            {updatingStatusId === msg.id ? <IconLoader className="w-3.5 h-3.5 animate-spin" /> : <IconCheck className="w-3.5 h-3.5 text-gray-500" />}
                                            Encerrar Chamado
                                        </button>
                                    ) : (
                                        <button
                                            disabled={updatingStatusId === msg.id}
                                            onClick={() => handleUpdateStatus(msg.id, 'aberta')}
                                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all flex items-center gap-1"
                                            title="Reabrir este chamado"
                                        >
                                            {updatingStatusId === msg.id ? <IconLoader className="w-3.5 h-3.5 animate-spin" /> : <IconRefresh className="w-3.5 h-3.5 text-amber-600" />}
                                            Reabrir Chamado
                                        </button>
                                    )}
                                </div>
                            </div>

                            <textarea
                                rows={3}
                                value={replyDrafts[msg.id] || ''}
                                onChange={(e) => setReplyDrafts({ ...replyDrafts, [msg.id]: e.target.value })}
                                placeholder={isManagerForThis 
                                    ? "Digite a resposta oficial do setor ao sócio..." 
                                    : "Ficou com alguma dúvida ou precisa complementar sua mensagem? Digite aqui..."}
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm resize-none"
                            />

                            <div className="flex justify-end">
                                <button
                                    disabled={submittingReplyId === msg.id || !replyDrafts[msg.id]?.trim()}
                                    onClick={() => handleSendReply(msg)}
                                    className={`px-5 py-2.5 rounded-xl font-bold text-sm text-white shadow-sm transition-all flex items-center gap-2 ${
                                        isManagerForThis 
                                            ? 'bg-teal-700 hover:bg-teal-800' 
                                            : 'bg-farm-700 hover:bg-farm-800'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    {submittingReplyId === msg.id ? (
                                        <>
                                            <IconLoader className="w-4 h-4 animate-spin" />
                                            Enviando...
                                        </>
                                    ) : (
                                        <>
                                            <IconMail className="w-4 h-4" />
                                            {isManagerForThis ? 'Enviar Resposta Oficial' : 'Enviar Réplica'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-8 max-w-6xl mx-auto pb-12">
            {/* Page Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm">
                <div>
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900 font-serif">Contatos e Mensagens</h1>
                    <p className="text-gray-500 mt-1 text-base md:text-lg">
                        {canViewMessages 
                            ? 'Comunicação oficial e acompanhamento de chamados com os sócios.'
                            : 'Canal direto com a diretoria, CONSU e setores da Fazenda São Bento.'}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchMessages}
                        disabled={fetchingMessages}
                        className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-xl font-semibold text-sm transition-all flex items-center gap-2"
                        title="Atualizar mensagens"
                    >
                        <IconRefresh className={`w-4 h-4 ${fetchingMessages ? 'animate-spin text-farm-600' : ''}`} />
                        Atualizar
                    </button>
                </div>
            </header>

            {/* Main Tabs Navigation */}
            <div className="flex flex-wrap bg-white p-1.5 rounded-2xl shadow-sm border border-gray-200 w-full sm:w-fit gap-1">
                {canViewMessages && (
                    <button
                        onClick={() => setActiveTab('inbox')}
                        className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                            activeTab === 'inbox' 
                                ? 'bg-farm-700 text-white shadow-md' 
                                : 'text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        <span>Mensagens Recebidas</span>
                        {pendingInboxCount > 0 && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                activeTab === 'inbox' ? 'bg-amber-400 text-amber-950' : 'bg-amber-100 text-amber-800'
                            }`}>
                                {pendingInboxCount}
                            </span>
                        )}
                    </button>
                )}

                <button
                    onClick={() => setActiveTab('my_messages')}
                    className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'my_messages' 
                            ? 'bg-farm-700 text-white shadow-md' 
                            : 'text-gray-600 hover:bg-gray-50'
                    }`}
                >
                    <span>Minhas Mensagens</span>
                    {myMessagesList.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            activeTab === 'my_messages' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>
                            {myMessagesList.length}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => setActiveTab('send')}
                    className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'send' 
                            ? 'bg-farm-700 text-white shadow-md' 
                            : 'text-gray-600 hover:bg-gray-50'
                    }`}
                >
                    <span>Nova Mensagem</span>
                </button>
            </div>

            {/* Error Notification */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                    <IconAlertTriangle className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Loading Indicator */}
            {fetchingMessages && messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 bg-white rounded-3xl border border-gray-100">
                    <IconLoader className="w-12 h-12 text-farm-700 animate-spin mb-4" />
                    <p className="text-gray-500 font-medium">Carregando mensagens...</p>
                </div>
            ) : (
                <>
                    {/* TAB 1: INBOX (GESTÃO / CONSU / SETORES) */}
                    {activeTab === 'inbox' && canViewMessages && (
                        <div className="space-y-6">
                            {/* Filter Bar */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
                                {/* Search */}
                                <div className="relative flex-1">
                                    <IconSearch className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Buscar por sócio, assunto ou texto..."
                                        className="w-full pl-11 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                                    />
                                </div>

                                {/* Filters */}
                                <div className="flex flex-wrap items-center gap-3">
                                    {/* Department filter (admins only) */}
                                    {(userRole === 'admin' || userRole === 'site_admin') && (
                                        <select
                                            value={deptFilter}
                                            onChange={(e) => setDeptFilter(e.target.value)}
                                            className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none bg-white font-medium text-gray-700 focus:ring-2 focus:ring-farm-500"
                                        >
                                            <option value="todos">Todos os Setores</option>
                                            <option value="consu">CONSU</option>
                                            <option value="financeiro">Financeiro</option>
                                            <option value="manutencao">Manutenção</option>
                                        </select>
                                    )}

                                    {/* Status filter */}
                                    <div className="flex flex-wrap bg-gray-100 p-1 rounded-xl gap-0.5">
                                        <button
                                            onClick={() => setStatusFilter('todas')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                statusFilter === 'todas' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            Todas
                                        </button>
                                        <button
                                            onClick={() => setStatusFilter('aberta')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                                statusFilter === 'aberta' ? 'bg-white shadow text-amber-800' : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                            Pendentes
                                        </button>
                                        <button
                                            onClick={() => setStatusFilter('respondida')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                                statusFilter === 'respondida' ? 'bg-white shadow text-emerald-800' : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                            Respondidas
                                        </button>
                                        <button
                                            onClick={() => setStatusFilter('fechada')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                statusFilter === 'fechada' ? 'bg-white shadow text-gray-700' : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            Encerradas
                                        </button>
                                        {(userRole === 'admin' || userRole === 'site_admin' || removedAdminCount > 0) && (
                                            <button
                                                onClick={() => setStatusFilter('removidas')}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                                    statusFilter === 'removidas' ? 'bg-white shadow text-red-700' : 'text-gray-500 hover:text-gray-900'
                                                }`}
                                                title="Mensagens removidas da Caixa de Entrada da administração"
                                            >
                                                <IconTrash className="w-3 h-3" />
                                                Lixeira ({removedAdminCount})
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* List */}
                            {inboxMessagesList.length === 0 ? (
                                <div className="bg-white rounded-3xl shadow-sm p-16 text-center border border-gray-100">
                                    <IconMail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                    <h3 className="text-xl font-medium text-gray-700">Nenhuma mensagem encontrada</h3>
                                    <p className="text-gray-400 text-sm mt-1">
                                        {statusFilter === 'removidas' 
                                            ? 'A lixeira da administração está vazia.' 
                                            : 'Não há mensagens correspondentes aos filtros selecionados.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {inboxMessagesList.map(msg => renderMessageCard(msg, false))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: MINHAS MENSAGENS (DO SÓCIO LOGADO) */}
                    {activeTab === 'my_messages' && (
                        <div className="space-y-6">
                            {myMessagesList.length === 0 ? (
                                <div className="bg-white rounded-3xl shadow-sm p-16 text-center border border-gray-100">
                                    <div className="w-16 h-16 bg-farm-50 rounded-full flex items-center justify-center mx-auto mb-4 text-farm-600">
                                        <IconMail className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-800">Você ainda não enviou mensagens</h3>
                                    <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">
                                        Tem alguma sugestão, dúvida ou crítica para o CONSU, Financeiro ou Manutenção? Envie uma nova mensagem e acompanhe a resposta por aqui.
                                    </p>
                                    <button
                                        onClick={() => setActiveTab('send')}
                                        className="mt-6 px-6 py-2.5 bg-farm-600 hover:bg-farm-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm"
                                    >
                                        Enviar Mensagem Agora
                                    </button>
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-900 flex items-center justify-between">
                                        <span>
                                            💡 <strong>Dica:</strong> Clique em uma mensagem para abrir o histórico e visualizar a resposta oficial do setor ou enviar uma réplica.
                                        </span>
                                    </div>
                                    {myMessagesList.map(msg => renderMessageCard(msg, true))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: NOVA MENSAGEM */}
                    {activeTab === 'send' && (
                        submitted ? (
                            <div className="max-w-2xl mx-auto text-center py-16 bg-white rounded-3xl border border-gray-100 shadow-sm p-8 animate-fade-in">
                                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
                                    <IconCheck className="w-10 h-10" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900 font-serif mb-2">Mensagem Registrada com Sucesso!</h2>
                                <p className="text-gray-600 max-w-md mx-auto leading-relaxed">
                                    Sua mensagem foi entregue ao setor responsável. Você poderá acompanhar a resposta e o andamento na aba <strong>"Minhas Mensagens"</strong>.
                                </p>
                                <div className="mt-8 flex justify-center gap-4">
                                    <button
                                        onClick={() => {
                                            setSubmitted(false);
                                            setActiveTab('my_messages');
                                        }}
                                        className="px-6 py-2.5 bg-farm-600 hover:bg-farm-700 text-white font-bold text-sm rounded-xl transition-all shadow-md"
                                    >
                                        Ver Minhas Mensagens
                                    </button>
                                    <button
                                        onClick={() => setSubmitted(false)}
                                        className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm rounded-xl transition-all"
                                    >
                                        Enviar Outra Mensagem
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="p-8 border-b border-gray-100 bg-farm-50/70">
                                    <h2 className="text-2xl font-bold text-farm-900 font-serif">Novo Contato / Sugestão</h2>
                                    <p className="text-gray-600 text-sm mt-1">
                                        Envie sua mensagem direta para os conselheiros ou para a administração da fazenda.
                                    </p>
                                </div>

                                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">
                                                Enviar para (Setor de Destino) *
                                            </label>
                                            <select
                                                value={department}
                                                onChange={(e) => setDepartment(e.target.value)}
                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none bg-white transition-all text-sm font-medium"
                                                required
                                            >
                                                <option value="">Selecione o setor...</option>
                                                <option value="consu">CONSU (Conselho da Família)</option>
                                                <option value="financeiro">Financeiro</option>
                                                <option value="manutencao">Manutenção e Obras</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">
                                                Tipo de Mensagem *
                                            </label>
                                            <select
                                                value={type}
                                                onChange={(e) => setType(e.target.value)}
                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none bg-white transition-all text-sm font-medium"
                                            >
                                                <option>Sugestão</option>
                                                <option>Crítica/Reclamação</option>
                                                <option>Elogio</option>
                                                <option>Outro</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">
                                            Assunto *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={subject}
                                            onChange={(e) => setSubject(e.target.value)}
                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all text-sm"
                                            placeholder="Ex: Sugestão para a horta ou Iluminação do quiosque"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">
                                            Mensagem Detalhada *
                                        </label>
                                        <textarea
                                            required
                                            rows={6}
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none transition-all resize-none text-sm font-sans"
                                            placeholder="Descreva detalhadamente sua solicitação..."
                                        ></textarea>
                                    </div>

                                    <div className="pt-2">
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full bg-farm-600 hover:bg-farm-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {loading ? (
                                                <>
                                                    <IconLoader className="w-5 h-5 animate-spin" />
                                                    Enviando Mensagem...
                                                </>
                                            ) : (
                                                <>
                                                    <IconMail className="w-5 h-5" />
                                                    Enviar Mensagem
                                                </>
                                            )}
                                        </button>
                                        <p className="text-xs text-gray-400 text-center mt-3">
                                            Sua mensagem será recebida pelo setor e você poderá acompanhar e responder pela aba <strong>Minhas Mensagens</strong>.
                                        </p>
                                    </div>
                                </form>
                            </div>
                        )
                    )}
                </>
            )}
        </div>
    );
};
