import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { IconCamera, IconX, IconLoader, IconCheck } from './Icons';

interface BiometricSimulatorProps {
    onClose: () => void;
}

export const BiometricSimulator: React.FC<BiometricSimulatorProps> = ({ onClose }) => {
    const [deviceId, setDeviceId] = useState('9999');
    const [userId, setUserId] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSimulate = async () => {
        if (!userId.trim()) {
            setStatus('error');
            setMessage('Digite o Face ID.');
            return;
        }

        setLoading(true);
        setStatus('idle');
        setMessage('');

        try {
            // Chamada direta para a Edge Function
            const { data, error } = await supabase.functions.invoke('controlid-webhook', {
                body: {
                    device_id: parseInt(deviceId),
                    access_logs: [
                        {
                            user_id: userId.trim(),
                            time: Math.floor(Date.now() / 1000),
                            event: 7
                        }
                    ]
                }
            });

            if (error) throw error;

            setStatus('success');
            setMessage('Rosto simulado com sucesso na nuvem!');
            
            // Apaga o formulário após sucesso para novo teste
            setTimeout(() => {
                setUserId('');
                setStatus('idle');
            }, 3000);

        } catch (err: any) {
            console.error('Erro no simulador:', err);
            setStatus('error');
            setMessage(err.message || 'Erro de comunicação com o servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative">
                
                {/* Header */}
                <div className="bg-farm-900 p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                            <IconCamera className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg">Simulador Biométrico</h2>
                            <p className="text-farm-300 text-xs uppercase tracking-widest font-black">Control iD Dev Tools</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-full hover:bg-red-500 hover:text-white text-white/70 transition-colors">
                        <IconX className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 bg-gray-50">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 uppercase tracking-wide">1. Escolha o Aparelho</label>
                        <select 
                            value={deviceId}
                            onChange={(e) => setDeviceId(e.target.value)}
                            className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-farm-500 focus:ring-4 focus:ring-farm-100 outline-none transition-all font-medium text-gray-800 bg-white"
                        >
                            <option value="9999">Restaurante (Almoço/Jantar)</option>
                            <option value="8888">Escritório (Relógio de Ponto)</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 uppercase tracking-wide">2. Face ID do Hóspede/Funcionário</label>
                        <input 
                            type="text"
                            placeholder="Ex: 12345"
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-farm-500 focus:ring-4 focus:ring-farm-100 outline-none transition-all text-xl font-bold text-center tracking-widest bg-white"
                        />
                    </div>

                    {status === 'success' && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 animate-fade-in">
                            <div className="bg-green-500 text-white p-1 rounded-full"><IconCheck className="w-4 h-4"/></div>
                            <p className="text-green-700 font-bold text-sm">{message}</p>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 animate-fade-in">
                            <div className="text-4xl">❌</div>
                            <p className="text-red-700 font-bold text-sm">{message}</p>
                        </div>
                    )}

                    <button 
                        onClick={handleSimulate}
                        disabled={loading}
                        className="w-full bg-farm-600 hover:bg-farm-700 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <><IconLoader className="w-5 h-5 animate-spin" /> Processando...</>
                        ) : (
                            'Enviar Rosto'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
