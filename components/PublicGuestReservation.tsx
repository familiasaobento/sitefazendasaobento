import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { IconCalendar, IconUser, IconPhone, IconMail, IconPlus, IconCheck, IconLoader, IconZap } from './Icons';

interface PublicGuestReservationProps {
  onBack: () => void;
  onSuccess: () => void;
}

export const PublicGuestReservation: React.FC<PublicGuestReservationProps> = ({ onBack, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    cpf: '',
    birth_date: '',
    host_member_name: '',
    check_in: '',
    check_out: '',
    num_guests: 0,
    preferred_accommodation: '',
    arrival_time: '',
    departure_time: '',
    notes: ''
  });
  const [guestsDetails, setGuestsDetails] = useState<any[]>([{ name: '', age: '' }]);

  const calculateAge = (dob: string) => {
    if (!dob) return '';
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  // Auto-sync first guest with main applicant data
  React.useEffect(() => {
    const updated = [...guestsDetails];
    if (updated.length > 0) {
      updated[0] = { 
        name: formData.full_name, 
        age: calculateAge(formData.birth_date) 
      };
      setGuestsDetails(updated);
    }
  }, [formData.full_name, formData.birth_date]);

  const handleNumGuestsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) || 1;
    setFormData({ ...formData, num_guests: val });
    
    if (val > guestsDetails.length) {
      const needed = val - guestsDetails.length;
      setGuestsDetails([...guestsDetails, ...Array(needed).fill({ name: '', age: '' })]);
    } else {
      setGuestsDetails(guestsDetails.slice(0, val));
    }
  };

  const handleGuestDetailChange = (index: number, field: string, value: string) => {
    const updated = [...guestsDetails];
    updated[index] = { ...updated[index], [field]: value };
    setGuestsDetails(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('guest_reservations')
        .insert([{
          ...formData,
          cpf: formData.cpf.replace(/\D/g, ''),
          guests_details: guestsDetails
        }]);

      if (error) throw error;
      
      // Notify Admin via Edge Function - ID is not available without .select() because of RLS
      // We rely on the Postgres trigger/webhook (if configured) or we'll use email-based notification later
      
      onSuccess();
    } catch (err: any) {
      alert('Erro ao enviar solicitação: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6 p-4 bg-farm-50 rounded-2xl border border-farm-100 italic">
          <IconZap className="w-5 h-5 text-farm-600" />
          <p className="text-xs text-farm-800 leading-relaxed">
            Preencha seus dados e as datas desejadas. Sua solicitação será avaliada pela administração e você receberá o voucher por e-mail.
          </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Seus Dados</label>
            <div className="space-y-3">
              <input
                type="text"
                required
                placeholder="Nome Completo"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                value={formData.full_name}
                onChange={e => setFormData({...formData, full_name: e.target.value})}
              />
              <input
                type="email"
                required
                placeholder="E-mail principal"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Telefone/WhatsApp"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                />
                <input
                  type="text"
                  required
                  placeholder="CPF"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                  value={formData.cpf}
                  onChange={e => setFormData({...formData, cpf: e.target.value})}
                />
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">NASCIM.:</span>
                  <input
                    type="date"
                    required
                    className="w-full pl-16 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                    value={formData.birth_date}
                    onChange={e => setFormData({...formData, birth_date: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Informações da Reserva</label>
            <div className="space-y-3">
              <input
                type="text"
                required
                placeholder="Nome do Sócio Anfitrião"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                value={formData.host_member_name}
                onChange={e => setFormData({...formData, host_member_name: e.target.value})}
              />
              <select
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm appearance-none"
                value={formData.preferred_accommodation}
                onChange={e => setFormData({...formData, preferred_accommodation: e.target.value})}
              >
                <option value="" disabled>Onde ficará hospedado?</option>
                <option value="Casa Grande / Chalés">Casa Grande / Chalés</option>
                <option value="Casa de Sócio">Casa de Sócio</option>
              </select>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">IN:</span>
                    <input
                      type="date"
                      required
                      className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-xs"
                      value={formData.check_in}
                      onChange={e => setFormData({...formData, check_in: e.target.value})}
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">HORA IN:</span>
                    <select
                      className="w-full pl-20 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-xs appearance-none"
                      value={formData.arrival_time}
                      onChange={e => setFormData({...formData, arrival_time: e.target.value})}
                    >
                      <option value="">--:--</option>
                      {Array.from({length: 24}).map((_, i) => {
                        const h = i.toString().padStart(2, '0');
                        return <option key={h} value={`${h}:00`}>{h}:00</option>
                      })}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">OUT:</span>
                    <input
                      type="date"
                      required
                      className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-xs"
                      value={formData.check_out}
                      onChange={e => setFormData({...formData, check_out: e.target.value})}
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">HORA OUT:</span>
                    <select
                      className="w-full pl-20 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-xs appearance-none"
                      value={formData.departure_time}
                      onChange={e => setFormData({...formData, departure_time: e.target.value})}
                    >
                      <option value="">--:--</option>
                      {Array.from({length: 24}).map((_, i) => {
                        const h = i.toString().padStart(2, '0');
                        return <option key={h} value={`${h}:00`}>{h}:00</option>
                      })}
                    </select>
                  </div>
                </div>
              </div>
              <input
                type="number"
                min="1"
                required
                placeholder="Quantos visitantes no total (incluindo você)?"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
                value={formData.num_guests || ''}
                onChange={handleNumGuestsChange}
              />
            </div>
          </div>

          {(formData.num_guests > 1 || (formData.num_guests === 1 && formData.full_name)) && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-2xl border border-gray-100 max-h-48 overflow-y-auto overflow-x-hidden custom-scrollbar">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Confirmação de Hóspedes ({formData.num_guests})</p>
              {guestsDetails.map((guest, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    required
                    readOnly={idx === 0}
                    placeholder={idx === 0 ? "Nome" : `Acompanhante ${idx + 1}`}
                    className={`flex-[3] px-3 py-2 border rounded-lg text-xs ${idx === 0 ? 'bg-farm-50 border-farm-100 text-farm-900 font-bold' : 'bg-white border-gray-200'}`}
                    value={guest.name}
                    onChange={e => handleGuestDetailChange(idx, 'name', e.target.value)}
                  />
                  <input
                    type="number"
                    required
                    readOnly={idx === 0}
                    placeholder="Anos"
                    className={`flex-1 px-3 py-2 border rounded-lg text-xs ${idx === 0 ? 'bg-farm-50 border-farm-100 text-farm-900 font-bold' : 'bg-white border-gray-200'}`}
                    value={guest.age}
                    onChange={e => handleGuestDetailChange(idx, 'age', e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <textarea
              placeholder="Alguma observação especial?"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none text-sm"
              rows={2}
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
            />
          </div>
        </div>

        <div className="pt-4 space-y-3">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-farm-700 text-white font-bold py-4 px-6 rounded-2xl hover:bg-farm-800 transition-all shadow-xl shadow-farm-100 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <IconLoader className="w-5 h-5 animate-spin" /> : <IconCheck className="w-5 h-5" />}
            Enviar Solicitação de Reserva
          </button>
          <button
            type="button"
            onClick={onBack}
            className="w-full text-gray-500 font-bold py-2 text-xs hover:underline"
          >
            Voltar para Login
          </button>
        </div>
      </form>
    </div>
  );
};
