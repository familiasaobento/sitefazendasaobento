import React, { useState, useEffect } from 'react';
import { IconBook, IconUser, IconPlus, IconLoader, IconCheck } from '../components/Icons';
import { supabase } from '../lib/supabase';

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
      <section className="relative h-[400px] rounded-3xl overflow-hidden shadow-2xl">
        <img 
          src="/fazenda_heritage_hero_1776033769361.png" 
          alt="Herança Fazenda São Bento" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-12">
          <h1 className="text-5xl font-serif font-bold text-white mb-4">Nossa História</h1>
          <p className="text-farm-100 text-xl max-w-2xl font-light leading-relaxed">
            Preservando o legado da Família São Bento e honrando as raízes que construíram nossa fazenda.
          </p>
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

      {/* Legacy Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-10 rounded-3xl shadow-sm border border-farm-100 relative overflow-hidden">
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
                Fundada com o propósito de ser um refúgio para os descendentes e um símbolo de nossa resiliência, 
                a fazenda atravessou décadas mantendo viva a tradição e os valores que nos definem.
              </p>
              <p>
                Este espaço dedicado à nossa Memória é um convite para que cada sócio e familiar explore suas raízes, 
                conheça os antepassados que vieram antes de nós e contribua para o futuro desta herança.
              </p>
            </div>
          </div>

          {/* Family Tree Integration Mockup */}
          <div className="bg-farm-900 text-white p-10 rounded-3xl shadow-xl space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-serif font-bold mb-2 text-farm-50">Árvore Genealógica</h2>
                <p className="text-farm-300 text-sm">
                  {gedcomUrl ? 'Arquivo local disponível' : 'Atualizado via MyHeritage'}
                </p>
              </div>
              <div className="flex gap-4">
                {gedcomUrl && (
                  <button 
                    onClick={() => alert('Visualizador interativo em fase de desenvolvimento. Por enquanto, use o MyHeritage para uma experiência completa.')}
                    className="bg-farm-50 text-farm-900 px-6 py-3 rounded-xl transition-all shadow-lg flex items-center gap-2 font-bold"
                  >
                    Abrir Árvore Local
                  </button>
                )}
                <a 
                  href="https://www.myheritage.com.br" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-farm-700 hover:bg-farm-600 text-white px-6 py-3 rounded-xl transition-all shadow-lg flex items-center gap-2 font-medium"
                >
                  Ir para MyHeritage
                </a>
              </div>
            </div>

            <div className="aspect-video bg-farm-800/50 rounded-2xl border border-farm-700 flex items-center justify-center p-8 relative group cursor-pointer overflow-hidden">
               {/* Visual representation of a tree */}
               <div className="absolute inset-0 opacity-20 pointer-events-none">
                  {/* Fake tree lines/nodes */}
                  <div className="w-full h-full flex flex-col items-center justify-center gap-10">
                    <div className="w-32 h-16 border-2 border-farm-400 rounded-lg"></div>
                    <div className="flex gap-20">
                      <div className="w-32 h-16 border-2 border-farm-400 rounded-lg"></div>
                      <div className="w-32 h-16 border-2 border-farm-400 rounded-lg"></div>
                    </div>
                  </div>
               </div>
               
               <div className="relative text-center space-y-4 z-10">
                 <div className="w-20 h-20 bg-farm-700 rounded-full flex items-center justify-center mx-auto shadow-2xl mb-4">
                    <IconUser className="w-10 h-10 text-white" />
                 </div>
                 <h3 className="text-xl font-bold">Visualização da Árvore</h3>
                 <p className="text-farm-300 max-w-md mx-auto">
                    {gedcomUrl 
                      ? 'O arquivo GEDCOM mais recente foi carregado. Em breve você poderá navegar por ele diretamente nesta tela.' 
                      : 'A árvore completa, com todos os ramos e conexões históricas, é gerenciada no MyHeritage para garantir a integridade dos dados da família.'}
                 </p>
               </div>
            </div>
          </div>
        </div>


        {/* Sidebar / Trivia */}
        <div className="space-y-8">
          <div className="bg-farm-50 border border-farm-100 p-8 rounded-3xl shadow-sm">
            <h3 className="text-xl font-bold text-farm-900 mb-6 font-serif">Nossos Valores</h3>
            <ul className="space-y-6">
              <li className="flex gap-4">
                <div className="w-10 h-10 bg-farm-200 rounded-xl flex items-center justify-center flex-shrink-0 text-farm-700 font-bold">01</div>
                <div>
                  <h4 className="font-bold text-farm-800 text-sm italic">União Familiar</h4>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">Manter a família conectada indepedente da distância física.</p>
                </div>
              </li>
              <li className="flex gap-4">
                <div className="w-10 h-10 bg-farm-200 rounded-xl flex items-center justify-center flex-shrink-0 text-farm-700 font-bold">02</div>
                <div>
                   <h4 className="font-bold text-farm-800 text-sm italic">Respeito à Terra</h4>
                   <p className="text-sm text-gray-600 mt-1 leading-relaxed">Cuidar da fazenda como um recurso que pertence às futuras gerações.</p>
                </div>
              </li>
              <li className="flex gap-4">
                <div className="w-10 h-10 bg-farm-200 rounded-xl flex items-center justify-center flex-shrink-0 text-farm-700 font-bold">03</div>
                <div>
                   <h4 className="font-bold text-farm-800 text-sm italic">Memória Viva</h4>
                   <p className="text-sm text-gray-600 mt-1 leading-relaxed">Celebrar as conquistas de quem construiu este caminho.</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="bg-white p-2 rounded-3xl shadow-sm border border-farm-100 overflow-hidden group transition-transform hover:scale-[1.02]">
            <img 
               src="/logo.jpg" 
               alt="Brasão" 
               className="w-full h-auto grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-700"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
