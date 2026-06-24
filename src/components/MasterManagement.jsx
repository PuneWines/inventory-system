import React, { useState, useEffect, useMemo } from 'react';
import Toast from './Toast';
import {
  getItems,
  getVendors,
  getShops,
  addItem,
  updateItem,
  deleteItem,
  addVendor,
  updateVendor,
  deleteVendor,
  addShop,
  updateShop,
  deleteShop
} from '../services/dbService';

export default function MasterManagement({ currentUser }) {
  const [activeTab, setActiveTab] = useState(() => {
    const allowed = currentUser?.page_access || [];
    if (allowed.includes('master_items')) return 'items';
    if (allowed.includes('master_vendors')) return 'vendors';
    return 'items';
  });
  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [shops, setShops] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);

  // Modals state
  const [showItemModal, setShowItemModal] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Edit / Add state
  const [currentEditItem, setCurrentEditItem] = useState(null);
  const [itemName, setItemName] = useState('');
  const [itemMrp, setItemMrp] = useState('');
  const [itemShopId, setItemShopId] = useState('');

  const [currentEditVendor, setCurrentEditVendor] = useState(null);
  const [vendorName, setVendorName] = useState('');
  const [vendorContact, setVendorContact] = useState('');
  const [vendorShopId, setVendorShopId] = useState('');

  const [currentEditShop, setCurrentEditShop] = useState(null);
  const [shopName, setShopName] = useState('');

  // Delete target state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form errors
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedItems, fetchedVendors, fetchedShops] = await Promise.all([
        getItems(),
        getVendors(),
        getShops()
      ]);
      setItems(fetchedItems);
      setVendors(fetchedVendors);
      setShops(fetchedShops);
    } catch (err) {
      console.error('Failed to fetch master directory data:', err);
      showToast('Failed to load catalog data.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  // Filtered lists based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(item =>
      (item.item_name && item.item_name.toLowerCase().includes(q)) ||
      (item.id && item.id.toString().includes(q))
    );
  }, [items, searchQuery]);

  const filteredVendors = useMemo(() => {
    if (!searchQuery.trim()) return vendors;
    const q = searchQuery.toLowerCase();
    return vendors.filter(vendor =>
      (vendor.vendor_name && vendor.vendor_name.toLowerCase().includes(q)) ||
      (vendor.contact_number && vendor.contact_number.toLowerCase().includes(q)) ||
      (vendor.id && vendor.id.toString().includes(q))
    );
  }, [vendors, searchQuery]);

  const filteredShops = useMemo(() => {
    if (!searchQuery.trim()) return shops;
    const q = searchQuery.toLowerCase();
    return shops.filter(shop =>
      (shop.shop_name && shop.shop_name.toLowerCase().includes(q)) ||
      (shop.id && shop.id.toString().includes(q))
    );
  }, [shops, searchQuery]);

  // Open Item Modal
  const openItemModal = (item = null) => {
    setFormErrors({});
    if (item) {
      setCurrentEditItem(item);
      setItemName(item.item_name || '');
      setItemMrp(item.mrp !== undefined && item.mrp !== null ? item.mrp.toString() : '');
      setItemShopId(item.shop_id ? item.shop_id.toString() : '');
    } else {
      setCurrentEditItem(null);
      setItemName('');
      setItemMrp('');
      setItemShopId('');
    }
    setShowItemModal(true);
  };

  // Open Vendor Modal
  const openVendorModal = (vendor = null) => {
    setFormErrors({});
    if (vendor) {
      setCurrentEditVendor(vendor);
      setVendorName(vendor.vendor_name || '');
      setVendorContact(vendor.contact_number || '');
      setVendorShopId(vendor.shop_id ? vendor.shop_id.toString() : '');
    } else {
      setCurrentEditVendor(null);
      setVendorName('');
      setVendorContact('');
      setVendorShopId('');
    }
    setShowVendorModal(true);
  };

  // Open Shop Modal
  const openShopModal = (shop = null) => {
    setFormErrors({});
    if (shop) {
      setCurrentEditShop(shop);
      setShopName(shop.shop_name || '');
    } else {
      setCurrentEditShop(null);
      setShopName('');
    }
    setShowShopModal(true);
  };

  // Open Delete Confirmation
  const confirmDelete = (type, id, name) => {
    setDeleteTarget({ type, id, name });
    setShowDeleteConfirm(true);
  };

  // Handle Item Form Submit
  const handleItemSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    const errors = {};

    if (!itemName.trim()) errors.name = 'Item Name is required';
    if (itemMrp === '' || isNaN(parseFloat(itemMrp)) || parseFloat(itemMrp) < 0) {
      errors.mrp = 'MRP Rate must be a valid positive number';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const shopIdVal = itemShopId ? parseInt(itemShopId, 10) : null;

    try {
      if (currentEditItem) {
        // Edit Mode
        const updated = await updateItem(currentEditItem.id, itemName.trim(), parseFloat(itemMrp), shopIdVal);
        setItems(prev => prev.map(i => i.id === currentEditItem.id ? { ...i, ...updated } : i));
        showToast(`Item "${itemName.trim()}" updated successfully.`);
      } else {
        // Add Mode
        const newItem = await addItem(itemName.trim(), parseFloat(itemMrp), shopIdVal);
        setItems(prev => [newItem, ...prev].sort((a, b) => a.item_name.localeCompare(b.item_name)));
        showToast(`Item "${itemName.trim()}" added to master list.`);
      }
      setShowItemModal(false);
    } catch (err) {
      console.error(err);
      showToast(`Operation failed: ${err.message || 'Server error'}`, 'error');
    }
  };

  // Handle Vendor Form Submit
  const handleVendorSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    const errors = {};

    if (!vendorName.trim()) errors.name = 'Vendor Name is required';
    if (vendorContact && vendorContact.length !== 10) {
      errors.contact = 'Contact number must be exactly 10 digits';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const shopIdVal = vendorShopId ? parseInt(vendorShopId, 10) : null;

    try {
      if (currentEditVendor) {
        // Edit Mode
        const updated = await updateVendor(currentEditVendor.id, vendorName.trim(), vendorContact.trim(), shopIdVal);
        setVendors(prev => prev.map(v => v.id === currentEditVendor.id ? { ...v, ...updated } : v));
        showToast(`Vendor "${vendorName.trim()}" updated successfully.`);
      } else {
        // Add Mode
        const newVendor = await addVendor(vendorName.trim(), vendorContact.trim(), shopIdVal);
        setVendors(prev => [newVendor, ...prev].sort((a, b) => a.vendor_name.localeCompare(b.vendor_name)));
        showToast(`Vendor "${vendorName.trim()}" registered successfully.`);
      }
      setShowVendorModal(false);
    } catch (err) {
      console.error(err);
      showToast(`Operation failed: ${err.message || 'Server error'}`, 'error');
    }
  };

  // Handle Shop Form Submit
  const handleShopSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    const errors = {};

    if (!shopName.trim()) {
      errors.name = 'Shop Name is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      if (currentEditShop) {
        // Edit Mode
        const updated = await updateShop(currentEditShop.id, shopName.trim());
        setShops(prev => prev.map(s => s.id === currentEditShop.id ? { ...s, ...updated } : s));
        showToast(`Shop "${shopName.trim()}" updated successfully.`);
      } else {
        // Add Mode
        const newShop = await addShop(shopName.trim());
        setShops(prev => [newShop, ...prev].sort((a, b) => a.shop_name.localeCompare(b.shop_name)));
        showToast(`Shop "${shopName.trim()}" added successfully.`);
      }
      setShowShopModal(false);
    } catch (err) {
      console.error(err);
      showToast(`Operation failed: ${err.message || 'Server error'}`, 'error');
    }
  };

  // Handle Delete execution
  const handleDeleteExecute = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'item') {
        await deleteItem(deleteTarget.id);
        setItems(prev => prev.filter(i => i.id !== deleteTarget.id));
        showToast(`Item "${deleteTarget.name}" deleted successfully.`);
      } else if (deleteTarget.type === 'vendor') {
        await deleteVendor(deleteTarget.id);
        setVendors(prev => prev.filter(v => v.id !== deleteTarget.id));
        showToast(`Vendor "${deleteTarget.name}" deleted successfully.`);
      } else if (deleteTarget.type === 'shop') {
        await deleteShop(deleteTarget.id);
        setShops(prev => prev.filter(s => s.id !== deleteTarget.id));
        showToast(`Shop "${deleteTarget.name}" deleted successfully.`);
      }
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      const msg = err.message || '';
      if (msg.includes('foreign key') || msg.includes('violates foreign key constraint') || msg.includes('conflict')) {
        showToast(`Cannot delete "${deleteTarget.name}" because it is referenced in transactions. You can modify its name instead.`, 'error');
      } else {
        showToast(`Deletion failed: ${msg}`, 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative">
      <Toast notification={notification} onClose={() => setNotification(null)} />

      <div className="max-w-6xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-none overflow-hidden mb-10">
        {/* Banner Section */}
        <div className="p-6 md:p-8 border-b border-slate-200 bg-slate-50/55 text-center relative overflow-hidden">
          <div className="inline-flex items-center justify-center p-3.5 bg-indigo-600 rounded-2xl ring-1 ring-indigo-400/20 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Master Catalog Directory</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Add, modify, and manage inventory items and registered vendors</p>
        </div>

        {/* Navigation Tab & Search bar wrapper */}
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/20">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1.5 rounded-xl self-start">
            {currentUser?.page_access?.includes('master_items') && (
              <button
                onClick={() => { setActiveTab('items'); setSearchQuery(''); }}
                className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'items'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                Master Items
              </button>
            )}
            {currentUser?.page_access?.includes('master_vendors') && (
              <button
                onClick={() => { setActiveTab('vendors'); setSearchQuery(''); }}
                className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'vendors'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                Vendors Directory
              </button>
            )}
            {(currentUser?.role === 'admin' || currentUser?.page_access?.includes('master_items') || currentUser?.page_access?.includes('master_vendors')) && (
              <button
                onClick={() => { setActiveTab('shops'); setSearchQuery(''); }}
                className={`px-4.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'shops'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                Shop
              </button>
            )}
          </div>

          {/* Search and Add button */}
          <div className="flex flex-1 sm:max-w-md items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder={
                  activeTab === 'items'
                    ? 'Search items by name or ID...'
                    : activeTab === 'vendors'
                      ? 'Search vendors by name, contact, ID...'
                      : 'Search shops by name or ID...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl pl-9.5 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <button
              onClick={() => {
                if (activeTab === 'items') openItemModal();
                else if (activeTab === 'vendors') openVendorModal();
                else openShopModal();
              }}
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              {activeTab === 'items' ? 'New Item' : activeTab === 'vendors' ? 'New Vendor' : 'New Shop'}
            </button>
          </div>
        </div>

        {/* Content Table view */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center">
              <svg className="animate-spin h-8 w-8 text-indigo-500 mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs font-semibold uppercase tracking-wider">Syncing database entries...</span>
            </div>
          ) : activeTab === 'items' && currentUser?.page_access?.includes('master_items') ? (
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 w-28">ID</th>
                  <th className="px-6 py-4">Item Name</th>
                  <th className="px-6 py-4 w-52">Shop Scope</th>
                  <th className="px-6 py-4 w-48 text-right">MRP Rate (₹)</th>
                  <th className="px-6 py-4 w-32 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                      No items matching search query found.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const linkedShopObj = shops.find(s => s.id === item.shop_id);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-slate-400 font-semibold">#{item.id}</td>
                        <td className="px-6 py-4 font-bold text-slate-800">{item.item_name}</td>
                        <td className="px-6 py-4">
                          {linkedShopObj ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                              {linkedShopObj.shop_name}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
                              Global (All Shops)
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-extrabold text-right text-slate-900 font-mono">
                          ₹{(parseFloat(item.mrp) || 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-right flex items-center justify-end space-x-1">
                          <button
                            onClick={() => openItemModal(item)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Edit Item"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => confirmDelete('item', item.id, item.item_name)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Item"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : activeTab === 'vendors' && currentUser?.page_access?.includes('master_vendors') ? (
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 w-28">ID</th>
                  <th className="px-6 py-4">Vendor Name</th>
                  <th className="px-6 py-4 w-52">Contact Number</th>
                  <th className="px-6 py-4 w-52">Shop Scope</th>
                  <th className="px-6 py-4 w-32 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredVendors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                      No vendors matching search query found.
                    </td>
                  </tr>
                ) : (
                  filteredVendors.map((vendor) => {
                    const linkedShopObj = shops.find(s => s.id === vendor.shop_id);
                    return (
                      <tr key={vendor.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-slate-400 font-semibold">#{vendor.id}</td>
                        <td className="px-6 py-4 font-bold text-slate-800">{vendor.vendor_name}</td>
                        <td className="px-6 py-4 font-medium text-slate-655 font-mono text-xs">
                          {vendor.contact_number || <span className="text-slate-350 italic">None Provided</span>}
                        </td>
                        <td className="px-6 py-4">
                          {linkedShopObj ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                              {linkedShopObj.shop_name}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
                              Global (All Shops)
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right flex items-center justify-end space-x-1">
                          <button
                            onClick={() => openVendorModal(vendor)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Edit Vendor"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => confirmDelete('vendor', vendor.id, vendor.vendor_name)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Vendor"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : activeTab === 'shops' && (currentUser?.role === 'admin' || currentUser?.page_access?.includes('master_items') || currentUser?.page_access?.includes('master_vendors')) ? (
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 w-28">ID</th>
                  <th className="px-6 py-4">Shop Name</th>

                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredShops.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic">
                      No shops matching search query found.
                    </td>
                  </tr>
                ) : (
                  filteredShops.map((shop) => {
                    return (
                      <tr key={shop.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-slate-400 font-semibold">#{shop.id}</td>
                        <td className="px-6 py-4 font-bold text-slate-800">{shop.shop_name}</td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <div className="p-16 text-center text-slate-450 italic font-semibold">
              No accessible directory tabs available.
            </div>
          )}
        </div>
      </div>

      {/* MODAL: ADD/EDIT SHOP */}
      {showShopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                {currentEditShop ? 'Modify Shop Info' : 'Add New Shop Outlet'}
              </h3>
              <button
                onClick={() => setShowShopModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleShopSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Shop Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vishal Shop, Station Road"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${formErrors.name ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'}`}
                />
                {formErrors.name && <span className="text-[10px] text-rose-500 mt-1 block font-medium">{formErrors.name}</span>}
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowShopModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
                >
                  Save Shop
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD/EDIT ITEM */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                {currentEditItem ? 'Modify Item Info' : 'Add New Catalog Item'}
              </h3>
              <button
                onClick={() => setShowItemModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleItemSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Special Sev 200g"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${formErrors.name ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'}`}
                />
                {formErrors.name && <span className="text-[10px] text-rose-500 mt-1 block font-medium">{formErrors.name}</span>}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">MRP Rate (₹)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  placeholder="0.00"
                  value={itemMrp}
                  onChange={(e) => setItemMrp(e.target.value)}
                  className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${formErrors.mrp ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'}`}
                />
                {formErrors.mrp && <span className="text-[10px] text-rose-500 mt-1 block font-medium">{formErrors.mrp}</span>}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Shop Location Scope</label>
                <select
                  value={itemShopId}
                  onChange={(e) => setItemShopId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                >
                  <option value="">Global / Available for All Shops</option>
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>{s.shop_name}</option>
                  ))}
                </select>
                <span className="block text-[10px] text-slate-400 mt-1.5 italic">
                  * If associated with a specific shop, this item will only show up under that shop's transactions.
                </span>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD/EDIT VENDOR */}
      {showVendorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                {currentEditVendor ? 'Modify Vendor Info' : 'Register New Vendor'}
              </h3>
              <button
                onClick={() => setShowVendorModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleVendorSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Vendor Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Balaji Foods Pune"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${formErrors.name ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'}`}
                />
                {formErrors.name && <span className="text-[10px] text-rose-500 mt-1 block font-medium">{formErrors.name}</span>}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Contact Number</label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  maxLength={10}
                  value={vendorContact}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setVendorContact(val);
                  }}
                  className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${formErrors.contact ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'}`}
                />
                {formErrors.contact && <span className="text-[10px] text-rose-500 mt-1 block font-medium">{formErrors.contact}</span>}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Shop Location Scope</label>
                <select
                  value={vendorShopId}
                  onChange={(e) => setVendorShopId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                >
                  <option value="">Global / Available for All Shops</option>
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>{s.shop_name}</option>
                  ))}
                </select>
                <span className="block text-[10px] text-slate-400 mt-1.5 italic">
                  * If associated with a specific shop, this vendor will only show up under that shop's transactions.
                </span>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowVendorModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
                >
                  Save Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {showDeleteConfirm && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full shadow-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 flex items-start space-x-4">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Confirm Deletion</h4>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Are you sure you want to permanently delete the {deleteTarget.type === 'item' ? 'item' : 'vendor'}{' '}
                  <strong className="text-slate-800">"{deleteTarget.name}"</strong> from the master records?
                </p>
                <div className="mt-3.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 text-[10px] text-slate-400 italic">
                  ⚠️ Note: If this {deleteTarget.type === 'item' ? 'item' : 'vendor'} is already linked to historic purchases or transactions, the database will block this deletion to preserve transaction history.
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-150 flex items-center justify-end space-x-2">
              <button
                disabled={isDeleting}
                onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-150 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isDeleting}
                onClick={handleDeleteExecute}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer inline-flex items-center"
              >
                {isDeleting ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 mr-1.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Delete Record'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}