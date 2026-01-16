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
    items?: { product: Product; quantity: number; unit_price: number }[];
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
                    <h1 className="text-3xl font-bold text-farm-900 font-serif">Reserva de Produtos</h1>
                    <p className="text-gray-600">Produtos fresquinhos da fazenda para levar para casa</p>
                </div>
                {isAdmin && (
                    <button
                        onClick={() => { setEditingProduct({ name: '', price: 0, category: 'Doces' }); setShowAdminModal(true); }}
                        className="bg-farm-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-farm-700 transition-colors shadow-sm"
                    >
                        + Novo Produto
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Products */}
                <div className="lg:col-span-2 space-y-6">
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filteredProducts.map(product => (
                                <div key={product.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex gap-4">
                                    <div className="w-24 h-24 bg-gray-50 rounded-xl flex-shrink-0 overflow-hidden">
                                        {product.image_url ? (
                                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 flex flex-col justify-between">
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-farm-500">{product.category}</span>
                                            <h3 className="font-bold text-gray-800 leading-tight">{product.name}</h3>
                                            <p className="text-farm-700 font-bold mt-1">
                                                R$ {product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                        <div className="flex items-center justify-between mt-2">
                                            {isAdmin ? (
                                                <button
                                                    onClick={() => { setEditingProduct(product); setShowAdminModal(true); }}
                                                    className="text-gray-400 hover:text-farm-600 transition-colors"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                            ) : <div></div>}
                                            <button
                                                onClick={() => addToCart(product)}
                                                className="bg-farm-50 text-farm-700 p-2 rounded-lg hover:bg-farm-100 transition-colors"
                                                title="Adicionar ao carrinho"
                                            >
                                                <IconShoppingCart className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right Column: Cart */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 sticky top-8">
                        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <IconShoppingCart className="w-6 h-6 text-farm-600" />
                            Seu Carrinho
                        </h2>

                        {cart.length === 0 ? (
                            <div className="text-center py-10">
                                <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <IconShoppingCart className="w-8 h-8 text-gray-300" />
                                </div>
                                <p className="text-gray-400 text-sm">Carrinho vazio.<br />Selecione produtos ao lado.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="max-h-[40vh] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                                    {cart.map(item => (
                                        <div key={item.product.id} className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl group">
                                            <div className="flex-1">
                                                <h4 className="text-sm font-bold text-gray-800 line-clamp-1">{item.product.name}</h4>
                                                <p className="text-xs text-gray-500">R$ {item.product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} un.</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => updateQuantity(item.product.id, -1)}
                                                    className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-gray-500 hover:bg-gray-100"
                                                >-</button>
                                                <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                                                <button
                                                    onClick={() => updateQuantity(item.product.id, 1)}
                                                    className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-gray-500 hover:bg-gray-100"
                                                >+</button>
                                                <button
                                                    onClick={() => removeFromCart(item.product.id)}
                                                    className="ml-2 text-gray-300 hover:text-red-500"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="pt-4 border-t border-gray-100 space-y-4">
                                    <div className="flex justify-between items-center text-lg font-bold">
                                        <span className="text-gray-600">Total</span>
                                        <span className="text-farm-700">R$ {calculateTotal().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>

                                    <form onSubmit={handleCheckout} className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-gray-400 mb-1 tracking-wider">Data de Retirada (na Copa)</label>
                                            <input
                                                type="date"
                                                required
                                                value={pickupDate}
                                                onChange={(e) => setPickupDate(e.target.value)}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-farm-500 focus:bg-white transition-all outline-none"
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="w-full bg-farm-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-farm-700 hover:shadow-xl transform active:scale-[0.98] transition-all disabled:opacity-50"
                                        >
                                            {isSubmitting ? 'Processando...' : 'Confirmar Reserva'}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        )}

                        {message && (
                            <div className={`mt-4 p-4 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                                {message.text}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* User's Reservations Table (Matches Lodging Style) */}
            <div className="mt-12 space-y-6 max-w-4xl mx-auto no-print">
                <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                    <span className="w-2 h-8 bg-farm-500 rounded-full mr-3"></span>
                    Meus Pedidos de Produtos
                </h3>

                {fetchingMyReservations ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-farm-700"></div>
                    </div>
                ) : myReservations.length === 0 ? (
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
                        Você ainda não possui pedidos de produtos.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {myReservations.map((res) => (
                            <div key={res.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-400 uppercase font-bold">Data de Retirada</span>
                                        <p className="font-bold text-gray-800">{new Date(res.pickup_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                                    </div>
                                    <span className="text-[10px] text-gray-400">Ref: #{res.id}</span>
                                </div>

                                <div className="space-y-3">
                                    <div className="bg-gray-50 p-3 rounded-lg">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Itens Solicitados:</p>
                                        <ul className="space-y-1">
                                            {res.items?.map((item, i) => (
                                                <li key={i} className="text-xs text-gray-700 flex justify-between">
                                                    <span>{item.quantity}x {(item as any).products?.name || 'Produto'}</span>
                                                    <span className="text-gray-400">R$ {(item.quantity * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center">
                                            <span className="text-xs font-bold text-gray-800">Total</span>
                                            <span className="text-sm font-bold text-farm-700">R$ {Number(res.total_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>

                                    <div className="pt-3 flex justify-between items-center text-sm">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${res.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                res.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                                                    res.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                        'bg-red-100 text-red-700'
                                            }`}>
                                            {res.status === 'pending' ? 'Aguardando Análise' :
                                                res.status === 'confirmed' ? 'Aprovado' :
                                                    res.status === 'completed' ? 'Entregue' : 'Cancelado'}
                                        </span>
                                        {res.status === 'pending' && (
                                            <button
                                                onClick={() => handleDeleteReservation(res.id)}
                                                className="text-red-400 hover:text-red-600 text-xs font-medium"
                                            >
                                                Cancelar Pedido
                                            </button>
                                        )}
                                    </div>

                                    {res.admin_notes && (
                                        <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-xs">
                                            <p className="font-bold text-red-700 mb-1">Observação da Administração:</p>
                                            <p className="text-red-600 italic">"{res.admin_notes}"</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Reservations List for Admins */}
            {isAdmin && (
                <div className="mt-12 space-y-6 print:m-0 print:p-0">
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        @media print {
                            body * { visibility: hidden; }
                            .print-area, .print-area * { visibility: visible; }
                            .print-area { position: absolute; left: 0; top: 0; width: 100%; }
                            .no-print { display: none !important; }
                        }
                    `}} />

                    <div className="flex items-center justify-between no-print">
                        <h2 className="text-2xl font-bold text-gray-800 font-serif">Gerenciamento de Pedidos</h2>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handlePrint}
                                className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-200 transition-all border border-gray-200"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Imprimir Lista
                            </button>
                            <button
                                onClick={fetchReservations}
                                className="text-xs text-farm-600 hover:underline"
                            >
                                Atualizar lista
                            </button>
                        </div>
                    </div>

                    {reservations.length === 0 ? (
                        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-gray-200 no-print">
                            <p className="text-gray-400">Nenhum pedido de reserva encontrado.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm print-area">
                            <div className="hidden print:block mb-6">
                                <h1 className="text-2xl font-bold text-gray-900 border-b-2 border-farm-800 pb-2">Fazenda São Bento - Reservas de Produtos</h1>
                                <p className="text-sm text-gray-500 mt-1">Relatório gerado em: {new Date().toLocaleString('pt-BR')}</p>
                            </div>
                            <table className="w-full bg-white text-left text-sm">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 font-bold text-gray-700">Sócio</th>
                                        <th className="px-6 py-4 font-bold text-gray-700">Data Retirada</th>
                                        <th className="px-6 py-4 font-bold text-gray-700">Produtos</th>
                                        <th className="px-6 py-4 font-bold text-gray-700">Total</th>
                                        <th className="px-6 py-4 font-bold text-gray-700">Status</th>
                                        <th className="px-6 py-4 font-bold text-gray-700 no-print">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {reservations.map(res => (
                                        <tr key={res.id} className="hover:bg-gray-50/50">
                                            <td className="px-6 py-4 font-medium">
                                                {(() => {
                                                    const profiles = (res as any).profiles;
                                                    if (Array.isArray(profiles)) return profiles[0]?.full_name || 'Usuário';
                                                    return profiles?.full_name || 'Usuário';
                                                })()}
                                            </td>
                                            <td className="px-6 py-4">{new Date(res.pickup_date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                            <td className="px-6 py-4 max-w-xs">
                                                <ul className="text-xs text-gray-500">
                                                    {res.items?.map((item, i) => (
                                                        <li key={i}>{item.quantity}x {(item as any).products?.name || 'Produto'}</li>
                                                    ))}
                                                </ul>
                                            </td>
                                            <td className="px-6 py-4 font-bold">R$ {Number(res.total_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${res.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                    res.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                                                        res.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                            'bg-red-100 text-red-700'
                                                    }`}>
                                                    {res.status === 'pending' ? 'Pendente' :
                                                        res.status === 'confirmed' ? 'Aprovado' :
                                                            res.status === 'completed' ? 'Entregue' : 'Cancelado'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 space-x-2 no-print">
                                                {res.status === 'pending' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleUpdateStatus(res.id, 'confirmed')}
                                                            className="text-blue-600 hover:text-blue-800 font-bold text-xs bg-blue-50 px-2 py-1 rounded border border-blue-100 transition-colors"
                                                            title="Aprovar pedido"
                                                        >
                                                            Aprovar
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setRejectionId(res.id);
                                                                setRejectionReason('');
                                                                setShowRejectionModal(true);
                                                            }}
                                                            className="text-red-600 hover:text-red-800 font-bold text-xs bg-red-50 px-2 py-1 rounded border border-red-100 transition-colors"
                                                            title="Recusar pedido com motivo"
                                                        >
                                                            Recusar
                                                        </button>
                                                    </>
                                                )}
                                                {res.status === 'confirmed' && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(res.id, 'completed')}
                                                        className="text-green-600 hover:text-green-800 font-bold text-xs bg-green-50 px-2 py-1 rounded border border-green-100 transition-colors"
                                                        title="Marcar como entregue"
                                                    >
                                                        Entregar
                                                    </button>
                                                )}
                                                {res.status !== 'pending' && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(res.id, 'pending', null as any)}
                                                        className="text-gray-400 hover:text-gray-600 font-bold text-xs bg-gray-50 px-2 py-1 rounded border border-gray-100 transition-colors"
                                                        title="Reverter para pendente"
                                                    >
                                                        Reverter
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDeleteReservation(res.id)}
                                                    className="text-red-500 hover:text-red-700 bg-red-50 p-1 rounded border border-red-100 transition-colors inline-flex align-middle"
                                                    title="Excluir do sistema"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
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
