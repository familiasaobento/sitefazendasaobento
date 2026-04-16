import React, { useState, useEffect } from 'react';
import { IconBook, IconUser, IconPlus, IconLoader, IconCheck } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { FamilyTree } from '../components/FamilyTree';

interface HistoryPageProps {
  userRole: string;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ userRole }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [gedcomUrl, setGedcomUrl] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  useEffect(() => {
    setIsAdmin(['admin', 'site_admin'].includes(userRole));
    fetchGedcomUrl();
  }, [userRole]);

  const fetchGedcomUrl = async () => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'gedcom_file_url')
      .maybeSingle();
    
    if (data) setGedcomUrl(data.value);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadSuccess(false);

    try {
      // 1. Upload to Storage
      const fileExt = 'ged';
      const fileName = `family_tree_${Date.now()}.${fileExt}`;
      const filePath = `gedcom/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('family-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('family-assets')
        .getPublicUrl(filePath);

      // 2. Update site_settings
      const { error: settingsError } = await supabase
        .from('site_settings')
        .upsert({ key: 'gedcom_file_url', value: publicUrl }, { onConflict: 'key' });

      if (settingsError) throw settingsError;

      setGedcomUrl(publicUrl);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (error: any) {
      console.error('Error uploading GEDCOM:', error);
      alert('Erro ao fazer upload: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-12 animate-fade-in pb-20">
      {/* Hero Section */}
      <section className="relative h-[480px] rounded-[3rem] overflow-hidden shadow-2xl group">
        <img 
          src="/historia-topo.jpg" 
          alt="Herança Fazenda São Bento" 
          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-12 md:p-20">
          <div className="relative">
            <span className="inline-block px-4 py-1.5 bg-farm-500/20 backdrop-blur-md border border-farm-400/30 rounded-full text-farm-300 text-[10px] font-black uppercase tracking-[0.3em] mb-4">
              Desde 1923
            </span>
            <h1 className="text-6xl md:text-7xl font-serif font-bold text-white mb-6 tracking-tight">Nossa História</h1>
            <p className="text-farm-100 text-xl md:text-2xl max-w-3xl font-light leading-relaxed italic opacity-90">
              "Preservando o legado da Família São Bento e honrando as raízes que construíram nossa fazenda."
            </p>
          </div>
        </div>
      </section>

      {/* Admin Upload Section */}
      {isAdmin && (
        <section className="bg-blue-50 border border-blue-200 p-8 rounded-3xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-lg">
              <IconPlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-blue-900 font-serif">Área do Administrador</h3>
              <p className="text-blue-700 text-sm">Atualize o arquivo GEDCOM do MyHeritage aqui.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {gedcomUrl && (
               <a 
                 href={gedcomUrl} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="text-blue-600 hover:text-blue-900 text-sm underline font-medium"
               >
                 Ver arquivo atual
               </a>
            )}
            <label className={`
              relative cursor-pointer px-6 py-3 rounded-xl font-bold transition-all shadow-md flex items-center gap-2
              ${isUploading ? 'bg-gray-400' : uploadSuccess ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'} text-white
            `}>
              {isUploading ? <IconLoader className="w-5 h-5 animate-spin" /> : uploadSuccess ? <IconCheck className="w-5 h-5" /> : <IconPlus className="w-5 h-5" />}
              {isUploading ? 'Subindo...' : uploadSuccess ? 'Sucesso!' : 'Upload GEDCOM'}
              <input type="file" accept=".ged" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
            </label>
          </div>
        </section>
      )}

      {/* Legacy Content: Text + Values */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
        <div className="lg:col-span-2">
          <div className="bg-white p-10 rounded-3xl shadow-sm border border-farm-100 relative overflow-hidden h-full">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <IconBook className="w-40 h-40 text-farm-900" />
            </div>
            <h2 className="text-3xl font-serif font-bold text-farm-900 mb-6 flex items-center gap-3">
              <span className="w-10 h-1px bg-farm-300"></span>
              O Legado São Bento
            </h2>
            <div className="prose prose-farm max-w-none text-gray-700 leading-relaxed space-y-4 text-lg">
              <p>
                A Fazenda São Bento não é apenas uma propriedade; é o coração pulsante de gerações da nossa família. 
                Desde os seus primórdios, cada hectare desta terra conta uma história de trabalho, união e celebração.
              </p>
              <p>
                Este espaço dedicado à nossa Memória é um convite para que cada sócio e familiar explore suas raízes, 
                conheça os antepassados que vieram antes de nós e contribua para o futuro desta herança.
              </p>
              
              <div className="mt-8 pt-8 border-t border-farm-100 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-farm-900 mb-1">Árvore Genealógica Oficial</p>
                  <p className="text-xs text-gray-500">Colabore e ajude a manter nossos registros atualizados</p>
                </div>
                <a 
                  href="https://www.myheritage.com.br/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-orange-200 transition-all text-sm w-full md:w-auto shrink-0"
                >
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M13 7h-2v5.41l4.29 4.29 1.41-1.41L13 11.59z"/></svg>
                  Acessar MyHeritage
                  <svg className="w-4 h-4 ml-1 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-farm-50 border border-farm-100 p-10 rounded-3xl shadow-sm h-full flex flex-col justify-center">
            <h3 className="text-xl font-bold text-farm-900 mb-6 font-serif uppercase tracking-widest text-center">Nossos Valores</h3>
            <div className="grid grid-cols-1 gap-6">
              {[
                { n: '01', v: 'União Familiar', d: 'Manter a família conectada.' },
                { n: '02', v: 'Respeito à Terra', d: 'Cuidar para as futuras gerações.' },
                { n: '03', v: 'Memória Viva', d: 'Celebrar quem construiu o caminho.' }
              ].map(val => (
                <div key={val.n} className="flex gap-4">
                  <div className="w-8 h-8 bg-farm-200 rounded-lg flex items-center justify-center flex-shrink-0 text-farm-700 font-bold text-xs">{val.n}</div>
                  <div>
                    <h4 className="font-bold text-farm-800 text-sm italic">{val.v}</h4>
                    <p className="text-[11px] text-gray-600 leading-tight">{val.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Family Tree Section - Full Width */}
      <div className="w-full">
        {gedcomUrl ? (
          <FamilyTree gedcomUrl={gedcomUrl} />
        ) : (
          <div className="aspect-video bg-farm-800/50 rounded-[2.5rem] border border-farm-700 flex items-center justify-center p-8 relative group overflow-hidden shadow-2xl">
            {/* ... placeholder ... */}
            <div className="relative text-center space-y-4 z-10">
              <div className="w-20 h-20 bg-farm-700 rounded-full flex items-center justify-center mx-auto shadow-2xl mb-4">
                  <IconUser className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white">Visualização da Árvore</h3>
              <p className="text-farm-300 max-w-md mx-auto">
                A árvore completa é gerenciada no MyHeritage. Suba o arquivo GEDCOM para visualizar uma versão interativa aqui no portal.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
