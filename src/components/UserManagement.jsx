import React, { useState, useEffect, useMemo } from 'react';
import Toast from './Toast';
import {
  getAppUsers,
  getShops,
  updateAppUser,
  deleteAppUser,
  adminCreateUser,
  DEFAULT_OPERATOR_ACCESS,
  DEFAULT_ADMIN_ACCESS
} from '../services/dbService';

// Granular permission groups for access control configuration
const SYSTEM_PERMISSION_GROUPS = [
  {
    title: 'Daily Entry Dashboard & Forms',
    permissions: [
      { id: 'entry_dashboard', label: 'Daily Entry Dashboard Logs' },
      { id: 'entry_purchases', label: 'Purchase Form Entry' },
      { id: 'entry_closing', label: 'Closing Stock Form Entry' },
      { id: 'entry_cashtally', label: 'Cash Tally Form Entry' }
    ]
  },
  {
    title: 'Stock Ledger & Audits',
    permissions: [
      { id: 'ledger_table', label: 'Ledger Table View' },
      { id: 'ledger_reports', label: 'Valuation Reports & Charts' },
      { id: 'ledger_purchases', label: 'Purchase Audit Logs' },
      { id: 'ledger_sales', label: 'Sales History Logs' },
      { id: 'ledger_closing', label: 'Current Stock Audit Logs' },
      { id: 'manager_report', label: 'Manager Report' }
    ]
  },
  {
    title: 'Master Catalog Directory',
    permissions: [
      { id: 'master_items', label: 'Master Items Catalog' },
      { id: 'master_vendors', label: 'Vendors Directory' }
    ]
  },
  {
    title: 'User Management',
    permissions: [
      { id: 'users_management', label: 'User Directory & Access Controls' }
    ]
  }
];

// Helper to group allowed permissions into a clean summary list for table display
const getGroupedAccessSummary = (allowedPages) => {
  const summary = [];
  const groups = [
    {
      key: 'entry',
      name: 'Daily Entry',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      total: 4,
      keys: ['entry_dashboard', 'entry_purchases', 'entry_closing', 'entry_cashtally']
    },
    {
      key: 'ledger',
      name: 'Stock Ledger',
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      total: 6,
      keys: [
        'ledger_table',
        'ledger_reports',
        'ledger_purchases',
        'ledger_sales',
        'ledger_closing',
        'manager_report'
      ]
    },
    {
      key: 'master',
      name: 'Master Catalog',
      color: 'bg-purple-50 text-purple-700 border-purple-200',
      total: 2,
      keys: ['master_items', 'master_vendors']
    },
    {
      key: 'users',
      name: 'Users',
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      total: 1,
      keys: ['users_management']
    }
  ];

  const allowed = allowedPages || [];
  groups.forEach(g => {
    const count = g.keys.filter(k => allowed.includes(k)).length;
    if (count > 0) {
      const label = count === g.total ? `${g.name} (Full)` : `${g.name} (${count}/${g.total})`;
      summary.push({ label, color: g.color, key: g.key });
    }
  });

  return summary;
};

export default function UserManagement({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [shops, setShops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);

  // New User Form State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [newShopId, setNewShopId] = useState('');
  const [newIsApproved, setNewIsApproved] = useState(true);
  const [newPageAccess, setNewPageAccess] = useState(DEFAULT_OPERATOR_ACCESS); // Defaults to standard operator access
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Inline Edit User State
  const [editingUserId, setEditingUserId] = useState(null);
  const [editUserValues, setEditUserValues] = useState({ role: 'operator', shop_id: '', is_approved: false, page_access: [] });

  // Delete User Confirmation Modal State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, username }
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      loadData();
    }
  }, [currentUser]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedUsers, fetchedShops] = await Promise.all([
        getAppUsers(),
        getShops()
      ]);
      setUsers(fetchedUsers);
      setShops(fetchedShops);
    } catch (err) {
      console.error('Failed to load user management data:', err);
      showToast('Failed to load users and outlets data.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = users.length;
    const pending = users.filter(u => !u.is_approved).length;
    const admins = users.filter(u => u.role === 'admin' && u.is_approved).length;
    const operators = users.filter(u => u.role === 'operator' && u.is_approved).length;
    return { total, pending, admins, operators };
  }, [users]);

  // Search filter
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(u =>
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q)) ||
      (u.shop_name && u.shop_name.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  // Toggle Page Permissions in Create Form
  const handleTogglePageAccessNew = (pageId) => {
    setNewPageAccess(prev =>
      prev.includes(pageId)
        ? prev.filter(id => id !== pageId)
        : [...prev, pageId]
    );
  };

  // Toggle Page Permissions in Inline Edit Mode
  const handleTogglePageAccessEdit = (pageId) => {
    setEditUserValues(prev => {
      const current = prev.page_access || [];
      const updated = current.includes(pageId)
        ? current.filter(id => id !== pageId)
        : [...current, pageId];
      return { ...prev, page_access: updated };
    });
  };

  // Add User Handler
  const handleCreateUserSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    const errors = {};

    if (!newUsername.trim()) {
      errors.username = 'Username is required.';
    }
    if (!newPassword) {
      errors.password = 'Password is required.';
    }
    if (newRole === 'operator' && !newShopId) {
      errors.shopId = 'Operator must be assigned to a specific shop outlet.';
    }
    if (newPageAccess.length === 0) {
      errors.pageAccess = 'You must grant access to at least one page.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      await adminCreateUser(
        newUsername.trim(),
        newPassword,
        newRole,
        newRole === 'admin' ? null : newShopId,
        newIsApproved,
        newPageAccess
      );

      // Fetch fresh list to ensure shop names join correctly
      const freshUsers = await getAppUsers();
      setUsers(freshUsers);

      // Reset form
      setNewUsername('');
      setNewPassword('');
      setNewRole('operator');
      setNewShopId('');
      setNewIsApproved(true);
      setNewPageAccess(DEFAULT_OPERATOR_ACCESS);
      showToast(`User account "${newUsername.trim()}" generated successfully.`);
    } catch (err) {
      console.error('Failed to generate user:', err);
      showToast(err.message || 'Failed to create user account.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Inline Edit Handlers
  const handleStartUserEdit = (user) => {
    setEditingUserId(user.id);
    setEditUserValues({
      role: user.role,
      shop_id: user.shop_id ? user.shop_id.toString() : '',
      is_approved: user.is_approved,
      page_access: user.page_access || DEFAULT_OPERATOR_ACCESS
    });
  };

  const handleSaveUserEdit = async (userId) => {
    if (editUserValues.page_access.length === 0) {
      showToast('You must grant access to at least one page.', 'error');
      return;
    }

    try {
      const updated = await updateAppUser(userId, {
        role: editUserValues.role,
        shop_id: editUserValues.role === 'admin' ? null : (editUserValues.shop_id ? parseInt(editUserValues.shop_id, 10) : null),
        is_approved: editUserValues.is_approved,
        page_access: editUserValues.page_access
      });

      // Update state with updated details
      setUsers(prev => prev.map(u => {
        if (u.id === userId) {
          const matchedShop = shops.find(s => s.id.toString() === editUserValues.shop_id);
          return {
            ...u,
            role: updated.role,
            shop_id: updated.shop_id,
            shop_name: updated.role === 'admin' ? 'Global / All Shops' : (matchedShop ? matchedShop.shop_name : 'Global / All Shops'),
            is_approved: updated.is_approved,
            page_access: updated.page_access
          };
        }
        return u;
      }));

      setEditingUserId(null);
      showToast('User access permissions updated successfully.');
    } catch (err) {
      console.error('Failed to save user edit:', err);
      showToast(`Failed to update user: ${err.message}`, 'error');
    }
  };

  // Delete Handlers
  const confirmDeleteUser = (id, username) => {
    setDeleteTarget({ id, username });
    setShowDeleteConfirm(true);
  };

  const handleDeleteExecute = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteAppUser(deleteTarget.id);
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      showToast(`User account "${deleteTarget.username}" deleted successfully.`);
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete user:', err);
      showToast(`Deletion failed: ${err.message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Autocomplete Page Grants for Admin Role
  const handleRoleChangeNew = (role) => {
    setNewRole(role);
    setFormErrors({});
    if (role === 'admin') {
      setNewPageAccess(DEFAULT_ADMIN_ACCESS);
    } else {
      setNewPageAccess(DEFAULT_OPERATOR_ACCESS);
    }
  };

  const handleRoleChangeEdit = (role) => {
    setEditUserValues(prev => {
      const updatedAccess = role === 'admin'
        ? DEFAULT_ADMIN_ACCESS
        : DEFAULT_OPERATOR_ACCESS;
      return {
        ...prev,
        role: role,
        page_access: updatedAccess
      };
    });
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl max-w-lg mx-auto mt-10">
        <svg className="w-12 h-12 text-rose-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h3 className="text-lg font-extrabold text-slate-900">Restricted Access</h3>
        <p className="text-sm text-slate-500 mt-2">This page is only accessible to system administrators.</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-6 max-w-7xl mx-auto pb-12">
      <Toast notification={notification} onClose={() => setNotification(null)} />

      {/* Banner Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="inline-flex items-center justify-center p-4 bg-amber-500 text-slate-950 rounded-2xl shadow-md shadow-amber-500/10">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">System User Management</h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">Create new credentials, assign outlet restrictions, and configure granular page permissions.</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto">
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-center min-w-28">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Users</p>
            <p className="text-lg font-black text-slate-800 font-mono mt-0.5">{stats.total}</p>
          </div>
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl px-4 py-2.5 text-center min-w-28">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Admins</p>
            <p className="text-lg font-black text-emerald-700 font-mono mt-0.5">{stats.admins}</p>
          </div>
          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-2.5 text-center min-w-28">
            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Operators</p>
            <p className="text-lg font-black text-indigo-700 font-mono mt-0.5">{stats.operators}</p>
          </div>
          <div className={`rounded-xl px-4 py-2.5 text-center min-w-28 border ${stats.pending > 0 ? 'bg-amber-50 border-amber-200 animate-pulse' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${stats.pending > 0 ? 'text-amber-700' : 'text-slate-400'}`}>Pending</p>
            <p className={`text-lg font-black font-mono mt-0.5 ${stats.pending > 0 ? 'text-amber-800' : 'text-slate-800'}`}>{stats.pending}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Create / Generate User Form */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm self-start space-y-5">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Generate Credentials</h2>
            <p className="text-xs text-slate-500 mt-0.5">Directly create a new console operator or administrator.</p>
          </div>

          <form onSubmit={handleCreateUserSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Username</label>
              <input
                type="text"
                required
                placeholder="e.g. rohit_snacks"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                disabled={isSubmitting}
                className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${formErrors.username ? 'border-rose-500' : 'border-slate-300 focus:border-amber-500'}`}
              />
              {formErrors.username && <span className="text-[10px] text-rose-500 mt-1 block font-medium">{formErrors.username}</span>}
            </div>

            {/* Plain Text Password */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Password (Raw Plain Text)</label>
              <input
                type="text"
                required
                placeholder="e.g. rohitPass123"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isSubmitting}
                className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${formErrors.password ? 'border-rose-500' : 'border-slate-300 focus:border-amber-500'}`}
              />
              {formErrors.password && <span className="text-[10px] text-rose-500 mt-1 block font-medium">{formErrors.password}</span>}
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Role Privilege</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleRoleChangeNew('operator')}
                  disabled={isSubmitting}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${newRole === 'operator'
                    ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  Operator
                </button>
                <button
                  type="button"
                  onClick={() => handleRoleChangeNew('admin')}
                  disabled={isSubmitting}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${newRole === 'admin'
                    ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  Administrator
                </button>
              </div>
            </div>

            {/* Shop Scope Selection (Operators only) */}
            {newRole === 'operator' && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Assigned Shop Outlet</label>
                <select
                  value={newShopId}
                  onChange={(e) => { setNewShopId(e.target.value); setFormErrors({}); }}
                  required
                  disabled={isSubmitting}
                  className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer ${formErrors.shopId ? 'border-rose-500' : 'border-slate-300 focus:border-amber-500'}`}
                >
                  <option value="" className="text-slate-800">-- Choose Assigned Shop --</option>
                  {shops.map(s => (
                    <option key={s.id} value={s.id} className="text-slate-800">
                      {s.shop_name}
                    </option>
                  ))}
                </select>
                {formErrors.shopId && <span className="text-[10px] text-rose-500 mt-1 block font-medium">{formErrors.shopId}</span>}
                <span className="block text-[10px] text-slate-400 mt-1.5 italic">
                  * Operators are strictly locked to their assigned shop across all screens.
                </span>
              </div>
            )}

            {/* Granular Page Access Control */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Configure Tab Access</label>
              <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-[320px] overflow-y-auto">
                {SYSTEM_PERMISSION_GROUPS.map(group => (
                  <div key={group.title} className="space-y-1.5">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">{group.title}</h4>
                    <div className="space-y-1 pl-1">
                      {group.permissions.map(perm => {
                        const isChecked = newPageAccess.includes(perm.id);
                        return (
                          <label key={perm.id} className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none py-0.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleTogglePageAccessNew(perm.id)}
                              disabled={isSubmitting}
                              className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-500/20 border-slate-300 cursor-pointer"
                            />
                            <span>{perm.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {formErrors.pageAccess && <span className="text-[10px] text-rose-500 mt-1 block font-medium">{formErrors.pageAccess}</span>}
            </div>

            {/* Auto-Approve Switch */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800">Activate Instantly</span>
                <span className="text-[10px] text-slate-400">Skip administrator approval gate</span>
              </div>
              <button
                type="button"
                onClick={() => setNewIsApproved(!newIsApproved)}
                disabled={isSubmitting}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-all duration-300 cursor-pointer ${newIsApproved ? 'bg-amber-500 justify-end' : 'bg-slate-300 justify-start'}`}
              >
                <span className="bg-white w-4 h-4 rounded-full shadow-md transform transition-all" />
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center items-center py-3.5 px-4 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-98 focus:outline-none transition-all cursor-pointer shadow-md disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-4.5 w-4.5 text-slate-950" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Generating Account...</span>
                </div>
              ) : (
                <span>Generate Credentials</span>
              )}
            </button>
          </form>
        </div>

        {/* Right Side: Users Directory Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Header & Search */}
          <div className="p-5 border-b border-slate-200 bg-slate-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Users Directory</h2>
              <p className="text-xs text-slate-500">Manage, edit roles, assign outlets, approve or suspend accounts.</p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:max-w-xs">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search users by username, shop..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl pl-9.5 pr-3 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
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
          </div>

          {/* Directory Table */}
          <div className="overflow-x-auto flex-1">
            {isLoading ? (
              <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center">
                <svg className="animate-spin h-8 w-8 text-amber-500 mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Syncing user database...</span>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-2 py-1">User Details</th>
                    <th className="px-2 py-1 w-30">Password</th>
                    <th className="px-2 py-1 w-24">Role</th>
                    <th className="px-2 py-1 w-130">Page Access Permissions</th>
                    <th className="px-2 py-1 w-44">Shop Outlet Scope</th>
                    <th className="px-2 py-1 w-5 text-center">Status</th>
                    <th className="px-2 py-1 w-28 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-slate-400 italic">
                        No user records matching the query.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const isSelf = user.username === currentUser.username;
                      const isEditing = editingUserId === user.id;
                      const allowedPages = user.page_access || DEFAULT_OPERATOR_ACCESS;

                      return (
                        <tr key={user.id} className="hover:bg-slate-50/35 transition-colors">
                          {/* Username info */}
                          <td className="px-5 py-3.5 font-medium">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black shrink-0 border border-slate-200">
                                {user.username.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-800 truncate">{user.username}</p>
                                <p className="text-[9px] text-slate-400 mt-0.5">Created: {new Date(user.created_at).toLocaleDateString()}</p>
                              </div>
                              {isSelf && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                                  You
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Raw plain text password */}
                          <td className="px-5 py-3.5 font-mono text-xs text-slate-500 select-all">
                            {user.password}
                          </td>

                          {/* Role */}
                          <td className="px-5 py-3.5">
                            {isEditing ? (
                              <select
                                value={editUserValues.role}
                                onChange={(e) => handleRoleChangeEdit(e.target.value)}
                                className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer font-bold"
                              >
                                <option value="operator">operator</option>
                                <option value="admin">admin</option>
                              </select>
                            ) : (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black border ${user.role === 'admin'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}>
                                {user.role}
                              </span>
                            )}
                          </td>

                          {/* Page Access JSON Permissions */}
                          <td className="px-5 py-3.5">
                            {isEditing ? (
                              <div className="flex flex-col gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 max-w-xs max-h-[240px] overflow-y-auto">
                                {SYSTEM_PERMISSION_GROUPS.map(group => (
                                  <div key={group.title} className="space-y-1">
                                    <span className="text-[9px] font-extrabold uppercase text-slate-400 block tracking-wider">{group.title}</span>
                                    <div className="flex flex-wrap gap-1">
                                      {group.permissions.map(perm => {
                                        const isChecked = editUserValues.page_access.includes(perm.id);
                                        return (
                                          <button
                                            key={perm.id}
                                            type="button"
                                            onClick={() => handleTogglePageAccessEdit(perm.id)}
                                            className={`px-2 py-0.5 rounded text-[8px] font-bold border transition-all cursor-pointer ${isChecked
                                              ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-sm'
                                              : 'bg-white text-slate-450 border-slate-200 hover:bg-slate-100'
                                              }`}
                                            title={perm.label}
                                          >
                                            {perm.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {getGroupedAccessSummary(allowedPages).map((group, idx) => (
                                  <span
                                    key={idx}
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${group.color}`}
                                  >
                                    {group.label}
                                  </span>
                                ))}
                                {allowedPages.length === 0 && (
                                  <span className="text-slate-450 italic text-[9px]">No Access Granted</span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Assigned Shop Scope */}
                          <td className="px-5 py-3.5">
                            {isEditing ? (
                              <select
                                value={editUserValues.shop_id}
                                onChange={(e) => setEditUserValues(prev => ({ ...prev, shop_id: e.target.value }))}
                                disabled={editUserValues.role === 'admin'}
                                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed font-medium"
                              >
                                <option value="">Global / All Shops</option>
                                {shops.map(s => (
                                  <option key={s.id} value={s.id}>{s.shop_name}</option>
                                ))}
                              </select>
                            ) : (
                              <span>
                                {user.role === 'admin' || !user.shop_id ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
                                    Global (All Shops)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                    {user.shop_name}
                                  </span>
                                )}
                              </span>
                            )}
                          </td>

                          {/* Approval Status */}
                          <td className="px-5 py-3.5 text-center">
                            {isEditing ? (
                              <button
                                type="button"
                                onClick={() => setEditUserValues(prev => ({ ...prev, is_approved: !prev.is_approved }))}
                                className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border ${editUserValues.is_approved
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100 animate-pulse'
                                  }`}
                              >
                                {editUserValues.is_approved ? 'Approved' : 'Pending'}
                              </button>
                            ) : (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${user.is_approved
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                                }`}>
                                {user.is_approved ? 'Approved' : 'Pending'}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            {isSelf ? (
                              <span className="text-[10px] text-slate-400 italic">Self Protected</span>
                            ) : isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleSaveUserEdit(user.id)}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold rounded-lg shadow-sm cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingUserId(null)}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[9px] font-bold rounded-lg border border-slate-200 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleStartUserEdit(user)}
                                  className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title="Edit User Permissions"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => confirmDeleteUser(user.id, user.username)}
                                  className="p-1.5 text-slate-450 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Account"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Delete User Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full shadow-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="inline-flex items-center justify-center p-3.5 bg-rose-50 text-rose-600 rounded-full mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Delete User Account?</h3>
              <p className="text-xs text-slate-500 mt-2">
                Are you sure you want to permanently delete the user account <strong className="text-slate-800 font-extrabold">"{deleteTarget?.username}"</strong>? This action is irreversible and they will lose console access instantly.
              </p>
            </div>
            <div className="px-6 py-4.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteExecute}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Delete Account'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
