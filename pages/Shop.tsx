import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IconShoppingCart, IconLoader } from '../components/Icons';

interface Product {
    id: number;
    name: string;
    description: string;
    price: number;
    image_url: string;
    category: string;
    is_active: boolean;
}

interface CartItem {
    product: Product;
    quantity: number;
}

interface ProductReservation {
    id: number;
    pickup_date: string;
    total_price: number;
    status: string;
    admin_notes: string | null;
    created_at: string;
    user_profiles?: { full_name: string };
    items?: { id: number; product: Product; quantity: number; unit_price: number; products?: { name: string } }[];
}

export const ShopPage: React.FC<{ isAdmin?: boolean }> = ({ isAdmin }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [pickupDate, setPickupDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [activeCategory, setActiveCategory] = useState('Todos');

    // Admin states
    const [showAdminModal, setShowAdminModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [reservations, setReservations] = useState<ProductReservation[]>([]);
    const [myReservations, setMyReservations] = useState<ProductReservation[]>([]);
    const [fetchingMyReservations, setFetchingMyReservations] = useState(false);

    // Rejection Modal state
    const [showRejectionModal, setShowRejectionModal] = useState(false);
    const [rejectionId, setRejectionId] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const categories = ['Todos', 'Doces', 'Laticínios', 'Padaria', 'Hortifruti'];

    useEffect(() => {
        fetchProducts();
        fetchMyReservations();
        if (isAdmin) {
            fetchReservations();
        }
    }, [isAdmin]);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('name');

            if (error) throw error;
            setProducts(data || []);
        } catch (err) {
            console.error('Error fetching products:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchReservations = async () => {
        try {
            const { data, error } = await supabase
                .from('product_reservations')
                .select(`
                    *,
                    profiles:profiles!user_id(full_name),
                    items:product_reservation_items(
                        id,
                        quantity,
                        unit_price,
                        products:products!product_id(name)
                    )
                `)
                .order('pickup_date', { ascending: true });

            if (error) throw error;
            setReservations(data || []);
        } catch (err) {
            console.error('Error fetching reservations:', err);
        }
    };

    const fetchMyReservations = async () => {
        try {
            setFetchingMyReservations(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('product_reservations')
                .select(`
                    *,
                    items:product_reservation_items(
                        id,
                        quantity,
                        unit_price,
                        products:products!product_id(name)
                    )
                `)
                .eq('user_id', user.id)
                .order('pickup_date', { ascending: false });

            if (error) throw error;
            setMyReservations(data || []);
        } catch (err) {
            console.error('Error fetching my reservations:', err);
        } finally {
            setFetchingMyReservations(false);
        }
    };

    const handleUpdateStatus = async (id: number, newStatus: string, adminNotes?: string) => {
        try {
            const updateData: any = { status: newStatus };
            if (adminNotes !== undefined) updateData.admin_notes = adminNotes;

            const { error } = await supabase
                .from('product_reservations')
                .update(updateData)
                .eq('id', id);

            if (error) throw error;
            fetchReservations();
            fetchMyReservations();
        } catch (err: any) {
            alert('Erro ao atualizar status: ' + err.message);
        }
    };

    const handleDeleteReservation = async (id: number) => {
        if (!confirm('Tem certeza que deseja excluir esta reserva permanentemente?')) return;

        try {
            const { error } = await supabase
                .from('product_reservations')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchReservations();
            fetchMyReservations();
        } catch (err: any) {
            alert('Erro ao excluir reserva: ' + err.message);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleCancelItem = async (reservationId: number, itemId: number, itemName: string, itemTotal: number) => {
        const reason = prompt(`Motivo da remoção do item "${itemName}" (ex: Em falta):`);
        if (reason === null) return; // User cancelled prompt

        const finalReason = reason.trim() || 'Indisponível';

        try {
            // 1. Delete the item
            const { error: deleteError } = await supabase
                .from('product_reservation_items')
                .delete()
                .eq('id', itemId);

            if (deleteError) throw deleteError;

            // 2. Update reservation total AND append note
            const reservation = reservations.find(r => r.id === reservationId);
            if (reservation) {
                const newTotal = Math.max(0, reservation.total_price - itemTotal);

                // Append to existing notes or create new
                const currentNotes = reservation.admin_notes ? reservation.admin_notes + '\n' : '';
                const newNote = `${currentNotes}* Item "${itemName}" removido. Motivo: ${finalReason}`;

                const { error: updateError } = await supabase
                    .from('product_reservations')
                    .update({
                        total_price: newTotal,
                        admin_notes: newNote
                    })
                    .eq('id', reservationId);

                if (updateError) throw updateError;
            }

            fetchReservations();
            fetchMyReservations();
        } catch (err: any) {
            alert('Erro ao remover item: ' + err.message);
        }
    };

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.product.id === product.id);
            if (existing) {
                return prev.map(item =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, { product, quantity: 1 }];
        });
    };

    const removeFromCart = (productId: number) => {
        setCart(prev => prev.filter(item => item.product.id !== productId));
    };

    const updateQuantity = (productId: number, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.product.id === productId) {
                const newQuantity = Math.max(1, item.quantity + delta);
                return { ...item, quantity: newQuantity };
            }
            return item;
        }));
    };

    const calculateTotal = () => {
        return cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    };

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (cart.length === 0) return;
        if (!pickupDate) {
            setMessage({ type: 'error', text: 'Por favor, selecione uma data para a retirada.' });
            return;
        }

        setIsSubmitting(true);
        setMessage(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado');

            // Create reservation header
            const { data: reservation, error: resError } = await supabase
                .from('product_reservations')
                .insert({
                    user_id: user.id,
                    pickup_date: pickupDate,
                    total_price: calculateTotal(),
                    status: 'pending'
                })
                .select()
                .single();

            if (resError) throw resError;

            // Create reservation items
            const itemsToInsert = cart.map(item => ({
                reservation_id: reservation.id,
                product_id: item.product.id,
                quantity: item.quantity,
                unit_price: item.product.price
            }));

            const { error: itemsError } = await supabase
                .from('product_reservation_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;

            setMessage({ type: 'success', text: 'Pedido de reserva realizado com sucesso! Aguarde a aprovação da administração.' });
            setCart([]);
            setPickupDate('');
            fetchMyReservations();
            if (isAdmin) fetchReservations();
        } catch (err: any) {
            console.error('Error during checkout:', err);
            setMessage({ type: 'error', text: 'Erro ao processar reserva: ' + err.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProduct) return;

        try {
            if (editingProduct.id) {
                const { error } = await supabase
                    .from('products')
                    .update(editingProduct)
                    .eq('id', editingProduct.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('products')
                    .insert(editingProduct);
                if (error) throw error;
            }
            setShowAdminModal(false);
            setEditingProduct(null);
            fetchProducts();
        } catch (err: any) {
            alert('Erro ao salvar produto: ' + err.message);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingImage(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `product-images/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('products')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('products')
                .getPublicUrl(filePath);

            setEditingProduct(prev => ({ ...prev, image_url: publicUrl }));
        } catch (err: any) {
            alert('Erro no upload: ' + err.message);
        } finally {
            setUploadingImage(false);
        }
    };

    const filteredProducts = activeCategory === 'Todos'
        ? products
        : products.filter(p => p.category === activeCategory);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-farm-900 font-serif">Produtos da Fazenda</h1>
                    <p className="text-gray-600">Conheça os produtos frescos produzidos em nossa terra.</p>
                </div>
                {isAdmin && (
                    <button
                        onClick={() => { setEditingProduct({ name: '', price: 0, category: 'Doces' }); setShowAdminModal(true); }}
                        className="bg-farm-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-farm-700 transition-colors shadow-sm"
                    >
                        + Gerenciar Produtos
                    </button>
                )}
            </div>

            <div className="space-y-6">
                {/* Categories */}
                <div className="flex flex-wrap gap-2">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeCategory === cat
                                ? 'bg-farm-600 text-white shadow-md scale-105'
                                : 'bg-white text-gray-600 hover:bg-farm-50 border border-gray-100'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <IconLoader className="w-10 h-10 text-farm-600 animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredProducts.map(product => (
                            <div key={product.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all group flex flex-col h-full">
                                <div className="aspect-square bg-gray-50 relative overflow-hidden">
                                    {product.image_url ? (
                                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-200">
                                            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                    )}
                                    <div className="absolute top-3 left-3">
                                        <span className="bg-white/90 backdrop-blur-sm text-farm-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-sm border border-farm-100">
                                            {product.category}
                                        </span>
                                    </div>
                                </div>
                                <div className="p-5 flex-1 flex flex-col">
                                    <div className="flex-1">
                                        <h3 className="font-bold text-gray-900 text-lg leading-tight mb-1">{product.name}</h3>
                                        <p className="text-gray-500 text-sm line-clamp-2 italic">{product.description || 'Produto natural da Fazenda São Bento.'}</p>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-xs text-gray-400 font-medium">Preço médio</span>
                                            <span className="text-xl font-bold text-farm-800">
                                                R$ {product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        {isAdmin && (
                                            <button
                                                onClick={() => { setEditingProduct(product); setShowAdminModal(true); }}
                                                className="bg-gray-50 text-gray-400 p-2 rounded-lg hover:bg-farm-100 hover:text-farm-600 transition-all border border-gray-100"
                                                title="Editar produto"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {!isAdmin && (
                <div className="bg-farm-50 border border-farm-100 p-6 rounded-2xl text-center space-y-2">
                    <p className="text-farm-800 font-medium">Os produtos acima estão disponíveis para aquisição diretamente na sede da fazenda.</p>
                    <p className="text-farm-600 text-sm italic">* A reserva online está temporariamente desabilitada. Consulte a disponibilidade durante sua visita.</p>
                </div>
            )}

            {/* Rejection Modal */}
            {showRejectionModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 bg-gray-50">
                            <h3 className="text-xl font-bold text-gray-800">Recusar Pedido</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Motivo da Recusa</label>
                                <textarea
                                    value={rejectionReason}
                                    onChange={e => setRejectionReason(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none h-32 resize-none"
                                    placeholder="Informe o motivo para o sócio..."
                                />
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowRejectionModal(false)}
                                    className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                                >Cancelar</button>
                                <button
                                    onClick={() => {
                                        if (rejectionId) handleUpdateStatus(rejectionId, 'rejected', rejectionReason);
                                        setShowRejectionModal(false);
                                    }}
                                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-red-600 text-white shadow-lg hover:bg-red-700 transition-colors"
                                >Recusar Pedido</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Admin Modal for Product Edit */}
            {showAdminModal && editingProduct && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-xl font-bold text-gray-800">{editingProduct.id ? 'Editar Produto' : 'Novo Produto'}</h3>
                            <button onClick={() => setShowAdminModal(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleSaveProduct} className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Nome do Produto</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingProduct.name}
                                        onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Preço (R$)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            required
                                            value={editingProduct.price}
                                            onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) })}
                                            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Categoria</label>
                                        <select
                                            value={editingProduct.category}
                                            onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })}
                                            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none bg-white"
                                        >
                                            {categories.filter(c => c !== 'Todos').map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Descrição</label>
                                    <textarea
                                        value={editingProduct.description || ''}
                                        onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 outline-none h-20 resize-none bg-white"
                                        placeholder="Ex: Doce de leite caseiro feito no fogão a lenha..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Foto do Produto</label>
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl overflow-hidden flex-shrink-0 relative">
                                            {editingProduct.image_url ? (
                                                <img src={editingProduct.image_url} alt="Preview" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                                </div>
                                            )}
                                            {uploadingImage && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><IconLoader className="w-5 h-5 animate-spin text-farm-600" /></div>}
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageUpload}
                                            className="text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-farm-50 file:text-farm-700 hover:file:bg-farm-100"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAdminModal(false)}
                                    className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                                >Cancelar</button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-farm-600 text-white shadow-lg hover:bg-farm-700 transition-colors"
                                >Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
