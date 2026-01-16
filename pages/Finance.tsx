import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const FinancePage: React.FC = () => {
  const [dashboardUrl, setDashboardUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSettings();
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      setIsAdmin(data?.role === 'admin');
    }
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'looker_studio_url')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        let val = data.value;
        if (val.includes('lookerstudio.google.com') && !val.includes('/embed/')) {
          val = val.replace('/reporting/', '/embed/reporting/');
        }
        setDashboardUrl(val);
        setNewUrl(val);
      }
    } catch (err) {
      console.error('Erro ao buscar configurações:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    // Auto-fix URL if it's not the embed version
    let fixedUrl = newUrl.trim();
    if (fixedUrl.includes('lookerstudio.google.com') && !fixedUrl.includes('/embed/')) {
      fixedUrl = fixedUrl.replace('/reporting/', '/embed/reporting/');
    }

    try {
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: 'looker_studio_url', value: fixedUrl }, { onConflict: 'key' });

      if (error) throw error;
      setDashboardUrl(fixedUrl);
      setNewUrl(fixedUrl);
      setIsEditing(false);
    } catch (err) {
      console.error('Erro ao atualizar URL:', err);
      alert('Erro ao atualizar o dashboard.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h2 className="text-3xl font-bold text-farm-900 font-serif">Relatórios Financeiros</h2>
          <p className="text-gray-600 mt-1">Dados detalhados e transparência na gestão da fazenda.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-sm bg-farm-100 text-farm-700 px-4 py-2 rounded-lg font-bold hover:bg-farm-200 transition-colors border border-farm-200"
          >
            {isEditing ? 'Cancelar' : '⚙️ Configurar Dashboard'}
          </button>
        )}
      </div>

      {isEditing && (
        <div className="bg-white p-6 rounded-xl shadow-md border border-farm-200 mb-6 fade-in">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Link de Compartilhamento do Looker Studio</h3>
          <form onSubmit={handleUpdateUrl} className="space-y-4">
            <p className="text-sm text-gray-600">
              Cole o link do seu relatório (pode ser o link do navegador ou o link de incorporação).
            </p>
            <input
              type="url"
              required
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-farm-500 outline-none"
              placeholder="https://lookerstudio.google.com/reporting/..."
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-farm-600 text-white font-bold py-2 rounded-lg hover:bg-farm-700 disabled:opacity-50 transition-all"
            >
              {submitting ? 'Salvando...' : 'Salvar URL do Dashboard'}
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[800px] relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-farm-700"></div>
          </div>
        ) : dashboardUrl ? (
          <iframe
            width="100%"
            height="1200"
            src={dashboardUrl}
            frameBorder="0"
            style={{ border: 0 }}
            allowFullScreen
            sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
          ></iframe>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 px-6 text-center">
            <div className="bg-gray-50 p-8 rounded-full mb-6">
              <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Dashboard não configurado</h3>
            <p className="text-gray-500 max-w-md">
              O dashboard interativo ainda não foi vinculado ao portal.
              {isAdmin ? " Clique no botão de configuração acima para inserir o link do Looker Studio." : " Entre em contato com a administração para mais informações."}
            </p>
          </div>
        )}
      </div>

      <div className="bg-farm-50 border border-farm-100 rounded-xl p-6 text-sm text-farm-800">
        <h4 className="font-bold mb-2 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Sobre os Dados
        </h4>
        <p>Os dados apresentados acima são atualizados mensalmente pela administração e refletem o balanço oficial da Fazenda São Bento. Caso tenha dúvidas sobre algum valor, entre em contato através do formulário de sugestões.</p>
      </div>
    </div>
  );
};