
import React, { useState, useEffect, useMemo } from 'react';
import { Individual, Family, GedcomData, parseGedcom } from '../lib/gedcom';
import { IconUser, IconPlus, IconLoader, IconSearch, IconChevronRight } from './Icons';

interface FamilyTreeProps {
  gedcomUrl: string;
}

export const FamilyTree: React.FC<FamilyTreeProps> = ({ gedcomUrl }) => {
  const [data, setData] = useState<GedcomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(gedcomUrl);
        if (!response.ok) throw new Error('Falha ao baixar arquivo GEDCOM');
        const text = await response.text();
        const parsed = parseGedcom(text);
        setData(parsed);
        
        // Use the first individual as default focus
        const firstId = Object.keys(parsed.individuals)[0];
        if (firstId) setFocusId(firstId);
      } catch (err: any) {
        console.error('Error loading tree:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [gedcomUrl]);

  const focusIndData = useMemo(() => {
    if (!data || !focusId) return null;
    return data.individuals[focusId];
  }, [data, focusId]);

  const relatives = useMemo(() => {
    if (!data || !focusId || !focusIndData) return null;

    const parents: Individual[] = [];
    focusIndData.familiesAsChild.forEach(famId => {
      const fam = data.families[famId];
      if (fam) {
        if (fam.husbandId && data.individuals[fam.husbandId]) parents.push(data.individuals[fam.husbandId]);
        if (fam.wifeId && data.individuals[fam.wifeId]) parents.push(data.individuals[fam.wifeId]);
      }
    });

    const spouses: Individual[] = [];
    const children: Individual[] = [];
    focusIndData.familiesAsSpouse.forEach(famId => {
      const fam = data.families[famId];
      if (fam) {
        const spouseId = fam.husbandId === focusId ? fam.wifeId : fam.husbandId;
        if (spouseId && data.individuals[spouseId]) spouses.push(data.individuals[spouseId]);
        
        fam.childrenIds.forEach(childId => {
          if (data.individuals[childId]) children.push(data.individuals[childId]);
        });
      }
    });

    return { parents, spouses, children };
  }, [data, focusId, focusIndData]);

  const searchResults = useMemo(() => {
    if (!data || searchTerm.length < 2) return [];
    return Object.values(data.individuals)
      .filter(ind => ind.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .slice(0, 10);
  }, [data, searchTerm]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-farm-900/10 rounded-3xl border border-farm-200">
        <IconLoader className="w-12 h-12 text-farm-600 animate-spin mb-4" />
        <p className="text-farm-800 font-medium font-serif">Processando árvore da família...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-red-50 text-red-700 rounded-3xl border border-red-200 text-center">
        <p className="font-bold mb-2">Erro ao carregar árvore</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!focusIndData || !relatives) return null;

  return (
    <div className="bg-farm-900 rounded-[2.5rem] shadow-2xl border border-farm-800 p-6 md:p-10 space-y-8 relative">
      {/* Background patterns wrapper to handle clipping */}
      <div className="absolute inset-0 rounded-[2.5rem] overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-farm-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-farm-800/20 rounded-full -ml-48 -mb-48 blur-3xl"></div>
      </div>

      {/* Header / Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-50">
        <div>
          <h3 className="text-3xl font-serif font-bold text-farm-50 mb-1">Explorador da Linhagem</h3>
          <p className="text-farm-300 text-sm">Navegue pelas conexões da família São Bento</p>
        </div>
        
        <div className="relative w-full md:w-72">
          <div className="relative">
            <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-farm-300" />
            <input 
              type="text"
              placeholder="Buscar parente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#163329] border border-farm-700 text-white placeholder-farm-400 rounded-2xl py-3 pl-12 pr-4 text-sm focus:ring-2 focus:ring-farm-500 outline-none transition-all"
            />
          </div>
          
          {searchTerm.length >= 2 && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-farm-800 border border-farm-700 rounded-2xl shadow-2xl overflow-hidden z-[100]">
              {searchResults.map(ind => (
                <button
                  key={ind.id}
                  onClick={() => {
                    setFocusId(ind.id);
                    setSearchTerm('');
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-farm-700 text-white text-sm transition-colors border-b border-farm-700 last:border-0"
                >
                  {ind.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tree Visualization */}
      <div className="grid grid-cols-1 gap-12 relative z-10">
        
        {/* Parents Row */}
        <div className="flex justify-center gap-6 md:gap-12">
          {relatives.parents.length > 0 ? (
            relatives.parents.map(parent => (
              <PersonNode key={parent.id} ind={parent} type="parent" onClick={() => setFocusId(parent.id)} />
            ))
          ) : (
            <div className="w-40 h-24 border-2 border-dashed border-farm-700 rounded-3xl flex items-center justify-center p-4 text-center">
              <span className="text-farm-500 text-[10px] uppercase font-bold tracking-widest leading-tight">Antepassados não registrados</span>
            </div>
          )}
        </div>

        {/* Central Row: Focus + Spouse */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 relative">
           {/* Visual Lines for connection */}
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[100%] w-0.5 h-12 bg-farm-700"></div>
           
           <PersonNode ind={focusIndData} type="focus" isCurrent />
           
           {relatives.spouses.map(spouse => (
             <React.Fragment key={spouse.id}>
               <div className="hidden md:block w-12 h-0.5 bg-farm-700"></div>
               <PersonNode ind={spouse} type="spouse" onClick={() => setFocusId(spouse.id)} />
             </React.Fragment>
           ))}
        </div>

        {/* Children Row */}
        <div className="flex flex-wrap justify-center gap-4 md:gap-8 pt-4">
           {/* Visual Line for children */}
           <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full w-0.5 h-8 bg-farm-700"></div>
           
          {relatives.children.length > 0 ? (
            relatives.children.map(child => (
              <PersonNode key={child.id} ind={child} type="child" onClick={() => setFocusId(child.id)} />
            ))
          ) : (
            <div className="text-farm-500 text-[10px] uppercase font-bold tracking-widest">Nenhum descendente direto listado</div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="pt-8 border-t border-farm-800 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-farm-300"></span>
            <span className="text-farm-400">Clique para navegar</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-farm-100"></span>
            <span className="text-farm-400">Raízes Históricas</span>
          </div>
        </div>
        <p className="text-farm-600 uppercase font-black tracking-tighter">Fazenda São Bento Heritage Project</p>
      </div>
    </div>
  );
};

interface PersonNodeProps {
  ind: Individual;
  type: 'parent' | 'focus' | 'spouse' | 'child';
  isCurrent?: boolean;
  onClick?: () => void;
}

const PersonNode: React.FC<PersonNodeProps> = ({ ind, type, isCurrent, onClick }) => {
  const isMale = ind.gender === 'M';
  
  return (
    <div 
      onClick={onClick}
      className={`
        group relative transition-all duration-300 transform
        ${isCurrent ? 'scale-110 z-20' : 'hover:scale-105 cursor-pointer hover:-translate-y-1'}
        ${type === 'parent' ? 'w-40 md:w-48' : type === 'child' ? 'w-36 md:w-44' : 'w-48 md:w-56'}
      `}
    >
      <div className={`
        relative rounded-3xl p-4 border overflow-hidden
        ${isCurrent ? 'bg-farm-50 border-farm-200 shadow-farm-500/30 shadow-2xl' : 'bg-farm-800 border-farm-700 shadow-lg'}
      `}>
        {/* Role tag */}
        <span className={`
          absolute top-0 right-0 px-3 py-1 text-[8px] font-black uppercase tracking-[0.2em] rounded-bl-xl
          ${isCurrent ? 'bg-farm-600 text-white' : 'bg-farm-700 text-farm-300'}
        `}>
          {type === 'focus' ? 'Foco' : type === 'spouse' ? 'Cônjuge' : type === 'parent' ? (isMale ? 'Pai' : 'Mãe') : 'Filho(a)'}
        </span>

        <div className="flex items-center gap-3">
          <div className={`
            w-10 h-10 rounded-2xl flex items-center justify-center shrink-0
            ${isCurrent ? 'bg-farm-100 text-farm-700' : 'bg-farm-900 text-farm-400'}
          `}>
             <IconUser className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className={`text-xs font-bold truncate ${isCurrent ? 'text-farm-900' : 'text-farm-50'}`}>{ind.name}</h4>
            <p className={`text-[10px] mt-0.5 ${isCurrent ? 'text-farm-600' : 'text-farm-400'}`}>
              {ind.birthDate ? ind.birthDate : '---'} 
              {ind.deathDate ? ` - ${ind.deathDate}` : ''}
            </p>
          </div>
        </div>
        
        {!isCurrent && (
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <IconChevronRight className="w-4 h-4 text-farm-500" />
          </div>
        )}
      </div>
    </div>
  );
};
