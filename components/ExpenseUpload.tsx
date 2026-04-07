import React, { useState, useRef } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from '../lib/supabase';
import { IconCamera, IconLoader, IconCheck, IconFileText, IconPlus, IconTrash, IconZap } from './Icons';

interface ExtractedData {
    dataEmissao: string;
    valorTotal: number;
    cnpjEmitente: string;
    itens: { descricao: string; valor: number }[];
}

interface PurchaseRequest {
    id: number;
    descricao: string;
    valor_estimado: number;
    status: string;
}

export const ExpenseUpload: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
    const [suggestedRC, setSuggestedRC] = useState<PurchaseRequest | null>(null);
    const [isConfirmed, setIsConfirmed] = useState(false);
    const [projects, setProjects] = useState<{id: number, nome: string}[]>([]);
    const [tags, setTags] = useState<{id: number, nome: string}[]>([]);
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedTag, setSelectedTag] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        const fetchMeta = async () => {
            const { data: p } = await supabase.from('finance_projects').select('id, nome').eq('ativo', true).order('nome');
            const { data: t } = await supabase.from('finance_tags').select('id, nome').order('nome');
            if (p) setProjects(p);
            if (t) setTags(t);
        };
        fetchMeta();
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setExtractedData(null);
            setSuggestedRC(null);
            setIsConfirmed(false);
        }
    };

    const processFile = async () => {
        if (!file) return;

        setLoading(true);
        try {
            // 1. Initialize Gemini
            const genAI = new GoogleGenerativeAI((process.env.GEMINI_API_KEY || ""));
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            // Convert file to base64
            const base64Data = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.readAsDataURL(file);
            });

            const prompt = "Analise esta Nota Fiscal e extraia os seguintes dados em formato JSON: dataEmissao (YYYY-MM-DD), valorTotal (number), cnpjEmitente (string), e itens (array de objetos com descricao e valor). Se não encontrar algo, retorne null no campo. Responda APENAS o JSON puro.";

            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: file.type
                    }
                }
            ]);

            const responseText = result.response.text();
            // Clean common markdown output if any
            const jsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
            const data: ExtractedData = JSON.parse(jsonStr);
            setExtractedData(data);

            // 2. Search for suggested Purchase Request (RC)
            if (data.valorTotal) {
                const { data: rcs, error } = await supabase
                    .from('requisicoes_compra')
                    .select('*')
                    .eq('status', 'aprovada')
                    .gte('valor_estimado', data.valorTotal * 0.9)
                    .lte('valor_estimado', data.valorTotal * 1.1)
                    .limit(1);

                if (!error && rcs && rcs.length > 0) {
                    setSuggestedRC(rcs[0]);
                }
            }

        } catch (err) {
            console.error('Erro ao processar nota:', err);
            alert('Erro ao analisar a nota fiscal. Verifique se o arquivo é nítido e tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    const confirmEntry = async () => {
        if (!extractedData) return;

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            // 1. Insert into fluxo_caixa
            const { error: entryError } = await supabase
                .from('fluxo_caixa')
                .insert([{
                    data_pagamento: extractedData.dataEmissao || new Date().toISOString().split('T')[0],
                    descricao: `Despesa NF: ${extractedData.cnpjEmitente} - ${extractedData.itens[0]?.descricao || 'Diverso'}`,
                    tipo: 'saida',
                    valor: extractedData.valorTotal,
                    cnpj_fornecedor: extractedData.cnpjEmitente,
                    categoria: 'Diversos', // Default category
                    meio_pagamento: 'Banco',
                    projeto: selectedProject || null,
                    tags: selectedTag || null
                }]);

            if (entryError) throw entryError;

            // 2. Update Purchase Request status if linked
            if (suggestedRC) {
                await supabase
                    .from('requisicoes_compra')
                    .update({ status: 'comprada' })
                    .eq('id', suggestedRC.id);
            }

            setIsConfirmed(true);
            alert('Despesa lançada com sucesso no fluxo de caixa!');
        } catch (err: any) {
            alert('Erro ao salvar despesa: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-3xl shadow-xl border border-farm-100 overflow-hidden fade-in">
            <div className="bg-farm-800 p-6 text-white flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-2xl">
                    <IconCamera className="w-8 h-8" />
                </div>
                <div>
                    <h3 className="text-xl font-bold font-serif">Upload de Nota Fiscal Intelligence</h3>
                    <p className="text-farm-100 text-sm italic">O robô lê a nota e você só confirma.</p>
                </div>
            </div>

            <div className="p-8 space-y-6">
                {!extractedData ? (
                    <div className="text-center space-y-6">
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-4 border-dashed border-gray-100 rounded-3xl p-12 hover:border-farm-300 hover:bg-farm-50 transition-all cursor-pointer group"
                        >
                            <input
                                type="file"
                                hidden
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept="image/*,application/pdf"
                            />
                            {file ? (
                                <div className="space-y-2">
                                    <IconCheck className="w-12 h-12 text-farm-600 mx-auto" />
                                    <p className="font-bold text-gray-800">{file.name}</p>
                                    <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-red-500 text-sm font-bold">Remover</button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto group-hover:bg-white group-hover:shadow-md transition-all">
                                        <IconPlus className="w-10 h-10 text-gray-300 group-hover:text-farm-500" />
                                    </div>
                                    <p className="text-gray-400 font-medium">Clique para selecionar PDF ou Foto da Nota</p>
                                </div>
                            )}
                        </div>

                        {file && (
                            <button
                                onClick={processFile}
                                disabled={loading}
                                className="w-full bg-farm-700 text-white py-4 rounded-2xl font-bold shadow-xl hover:bg-farm-800 transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? <IconLoader className="w-6 h-6 animate-spin" /> : <IconZap className="w-6 h-6" />}
                                Analisar com Inteligência Artificial
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6 animate-fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">VALOR TOTAL</span>
                                <span className="text-2xl font-black text-gray-800">R$ {extractedData.valorTotal?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">DATA</span>
                                <span className="text-lg font-bold text-gray-800">{extractedData.dataEmissao ? new Date(extractedData.dataEmissao).toLocaleDateString('pt-BR') : 'Não detectada'}</span>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">CNPJ</span>
                                <span className="text-xs font-mono text-gray-800">{extractedData.cnpjEmitente || 'Não detectado'}</span>
                            </div>
                        </div>

                        {suggestedRC ? (
                            <div className="bg-blue-50 border-2 border-blue-200 p-6 rounded-3xl flex items-center gap-4">
                                <div className="bg-blue-500 text-white p-3 rounded-2xl shadow-lg">
                                    <IconCheck className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-blue-900">Sugestão de Conciliação</h4>
                                    <p className="text-blue-800 text-sm">
                                        Esta nota de R$ {extractedData.valorTotal?.toFixed(2)} corresponde à Requisição:
                                        <span className="font-bold underline ml-1">"{suggestedRC.descricao}"</span>?
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-2xl text-yellow-800 text-sm flex gap-2">
                                <span>⚠️</span>
                                <span>Nenhuma requisição de compra aprovada correspondente foi encontrada. Esta será lançada como despesa direta.</span>
                            </div>
                        )}

                        <div className="border border-gray-100 rounded-2xl overflow-hidden text-sm">
                            <div className="bg-gray-50 px-4 py-2 font-bold text-gray-400 uppercase text-[10px] tracking-widest">ITENS DETECTADOS</div>
                            <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                                {extractedData.itens?.map((item, idx) => (
                                    <div key={idx} className="px-4 py-3 flex justify-between">
                                        <span className="text-gray-700">{item.descricao}</span>
                                        <span className="font-bold text-gray-900">R$ {item.valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-amber-700 mb-1 tracking-widest">🏗️ Atribuir a Projeto</label>
                                <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="w-full px-4 py-2 border rounded-xl outline-none bg-amber-50 text-amber-900 font-bold border-amber-100">
                                    <option value="">-- NENHUM PROJETO --</option>
                                    {projects.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-indigo-700 mb-1 tracking-widest">📌 Atribuir a Área (Tag)</label>
                                <select value={selectedTag} onChange={e => setSelectedTag(e.target.value)} className="w-full px-4 py-2 border rounded-xl outline-none bg-indigo-50 text-indigo-900 font-bold border-indigo-100">
                                    <option value="">-- NENHUMA ÁREA --</option>
                                    {tags.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setExtractedData(null)}
                                className="flex-1 py-4 font-bold text-gray-400 hover:bg-gray-50 rounded-2xl transition-all"
                            >
                                Recomeçar
                            </button>
                            <button
                                onClick={confirmEntry}
                                disabled={loading || isConfirmed}
                                className="flex-[2] bg-farm-800 text-white py-4 rounded-2xl font-bold shadow-xl hover:bg-farm-900 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isConfirmed ? <><IconCheck className="w-5 h-5" /> Confirmado</> : 'Confirmar e Lançar no Financeiro'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
