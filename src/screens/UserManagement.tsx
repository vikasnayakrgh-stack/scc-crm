import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchUsers,
  createUser,
  updateUserProfile,
  changeUserRole,
  setUserActive,
  resetUserPasswordDirect,
  sendPasswordResetEmail,
  fetchUserActivityLogs,
  UserActivityLog,
} from '../lib/userManagement';
import { UserProfile, AppRole } from '../types';
import { Button, Input, Modal, Badge } from '../components/ui';
import { toast } from 'react-hot-toast';
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  KeyRound,
  Mail,
  Phone,
  Edit2,
  UserCheck,
  UserX,
  History,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  ArrowUpDown,
  Briefcase,
} from 'lucide-react';

export const UserManagement: React.FC = () => {
  const { user, profile, isAdmin } = useAuth();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AppRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);

  // Selected user for actions
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Form states
  const [formLoading, setFormLoading] = useState(false);

  // Add User Form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('recruiter');
  const [newPhone, setNewPhone] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Edit User Form
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Change Role Form
  const [targetRole, setTargetRole] = useState<AppRole>('recruiter');

  // Reset Password Form
  const [resetType, setResetType] = useState<'direct' | 'email'>('direct');
  const [tempPassword, setTempPassword] = useState('');
  const [showTempPassword, setShowTempPassword] = useState(false);

  // Activity Logs
  const [activityLogs, setActivityLogs] = useState<UserActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Load Users
  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await fetchUsers();
    if (error) {
      toast.error(error.message || 'Failed to load user directory.');
    } else if (data) {
      setUsers(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        u.display_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.phone?.toLowerCase().includes(q);

      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && u.is_active) ||
        (statusFilter === 'inactive' && !u.is_active);

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = users.length;
    const activeAdmins = users.filter((u) => u.role === 'admin' && u.is_active).length;
    const managers = users.filter((u) => u.role === 'manager' && u.is_active).length;
    const recruiters = users.filter((u) => u.role === 'recruiter' && u.is_active).length;
    const inactive = users.filter((u) => !u.is_active).length;
    return { total, activeAdmins, managers, recruiters, inactive };
  }, [users]);

  // Handlers
  const handleOpenAdd = () => {
    setNewEmail('');
    setNewPassword('SccStaff@' + Math.floor(1000 + Math.random() * 9000));
    setNewDisplayName('');
    setNewRole('recruiter');
    setNewPhone('');
    setShowNewPassword(false);
    setAddModalOpen(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    const { data, error } = await createUser({
      email: newEmail,
      password: newPassword,
      display_name: newDisplayName,
      role: newRole,
      phone: newPhone,
    });

    setFormLoading(false);
    if (error) {
      toast.error(error.message || 'Failed to create user account.');
    } else {
      toast.success(`User account created successfully for ${newEmail}!`);
      setAddModalOpen(false);
      loadUsers();
    }
  };

  const handleOpenEdit = (target: UserProfile) => {
    setSelectedUser(target);
    setEditDisplayName(target.display_name || '');
    setEditPhone(target.phone || '');
    setEditModalOpen(true);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormLoading(true);

    const { error } = await updateUserProfile(selectedUser.id, {
      display_name: editDisplayName,
      phone: editPhone,
    });

    setFormLoading(false);
    if (error) {
      toast.error(error.message || 'Failed to update user details.');
    } else {
      toast.success('User profile updated successfully.');
      setEditModalOpen(false);
      loadUsers();
    }
  };

  const handleOpenRole = (target: UserProfile) => {
    setSelectedUser(target);
    setTargetRole(target.role);
    setRoleModalOpen(true);
  };

  const handleChangeRole = async () => {
    if (!selectedUser) return;
    setFormLoading(true);

    const { error } = await changeUserRole(selectedUser.id, targetRole);
    setFormLoading(false);

    if (error) {
      toast.error(error.message || 'Failed to change role.');
    } else {
      toast.success(`Role updated to ${targetRole.toUpperCase()} successfully.`);
      setRoleModalOpen(false);
      loadUsers();
    }
  };

  const handleOpenStatus = (target: UserProfile) => {
    setSelectedUser(target);
    setStatusModalOpen(true);
  };

  const handleToggleStatus = async () => {
    if (!selectedUser) return;
    setFormLoading(true);

    const newActive = !selectedUser.is_active;
    const { error } = await setUserActive(selectedUser.id, newActive);
    setFormLoading(false);

    if (error) {
      toast.error(error.message || 'Failed to update account status.');
    } else {
      toast.success(
        newActive
          ? `Account ${selectedUser.email} has been reactivated.`
          : `Account ${selectedUser.email} has been deactivated.`
      );
      setStatusModalOpen(false);
      loadUsers();
    }
  };

  const handleOpenPassword = (target: UserProfile) => {
    setSelectedUser(target);
    setTempPassword('TempPass@' + Math.floor(1000 + Math.random() * 9000));
    setResetType('direct');
    setPasswordModalOpen(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormLoading(true);

    if (resetType === 'direct') {
      const { success, error } = await resetUserPasswordDirect(selectedUser.id, tempPassword);
      setFormLoading(false);
      if (error || !success) {
        toast.error(error?.message || 'Failed to reset password.');
      } else {
        toast.success(`Temporary password set successfully for ${selectedUser.email}.`);
        setPasswordModalOpen(false);
      }
    } else {
      const { success, error } = await sendPasswordResetEmail(selectedUser.email);
      setFormLoading(false);
      if (error || !success) {
        toast.error(error?.message || 'Failed to dispatch reset email.');
      } else {
        toast.success(`Password reset link dispatched to ${selectedUser.email}.`);
        setPasswordModalOpen(false);
      }
    }
  };

  const handleOpenLogs = async () => {
    setLogsModalOpen(true);
    setLogsLoading(true);
    const { data, error } = await fetchUserActivityLogs();
    if (error) {
      toast.error('Failed to load audit history.');
    } else if (data) {
      setActivityLogs(data);
    }
    setLogsLoading(false);
  };

  // Security Gate: Non-Admin Access Warning
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center shadow-xs">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
            <ShieldAlert size={28} />
          </div>
          <h2 className="text-xl font-bold text-red-950 mb-2">Access Restricted</h2>
          <p className="text-sm text-red-700 max-w-md mx-auto leading-relaxed">
            User Management and staff role allocation requires verified <strong>Administrator</strong> privileges.
            Your account is currently assigned the <strong>{profile?.role || 'recruiter'}</strong> role.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs shadow-blue-500/20">
              <ShieldCheck size={22} />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Staff & User Management</h1>
          </div>
          <p className="text-xs text-slate-500">
            Provision staff credentials, manage RBAC permissions, and audit security events.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={handleOpenLogs} className="gap-2">
            <History size={15} />
            <span>Audit History</span>
          </Button>

          <Button variant="primary" size="md" onClick={handleOpenAdd} className="gap-2">
            <UserPlus size={15} />
            <span>Add Staff Member</span>
          </Button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500 mb-1">Total Staff</p>
          <p className="text-2xl font-black text-slate-900">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-purple-600 mb-1">Administrators</p>
          <p className="text-2xl font-black text-purple-900">{stats.activeAdmins}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-indigo-600 mb-1">Managers</p>
          <p className="text-2xl font-black text-indigo-900">{stats.managers}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-blue-600 mb-1">Recruiters</p>
          <p className="text-2xl font-black text-blue-900">{stats.recruiters}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-400 mb-1">Deactivated</p>
          <p className="text-2xl font-black text-slate-600">{stats.inactive}</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-lg text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
            <Filter size={14} />
            <span>Filter:</span>
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">All Roles</option>
            <option value="admin">Administrators</option>
            <option value="manager">Managers</option>
            <option value="recruiter">Recruiters</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Deactivated Only</option>
          </select>

          <button
            onClick={loadUsers}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Refresh Users"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Registered Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-blue-600" />
                    Loading staff directory...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">
                    No staff members match the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = u.id === user?.id;
                  const initials = (u.display_name || u.email)
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase();

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                            {initials}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900">{u.display_name}</span>
                              {isCurrent && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-bold">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                              <span className="flex items-center gap-1">
                                <Mail size={11} />
                                {u.email}
                              </span>
                              {u.phone && (
                                <span className="flex items-center gap-1 text-slate-400">
                                  • <Phone size={11} /> {u.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {u.role === 'admin' ? (
                          <Badge variant="info">
                            <span className="font-bold">Admin</span>
                          </Badge>
                        ) : u.role === 'manager' ? (
                          <Badge variant="primary">
                            <span className="font-bold">Manager</span>
                          </Badge>
                        ) : (
                          <Badge variant="neutral">
                            <span className="font-bold">Recruiter</span>
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                            <CheckCircle2 size={12} />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-700 font-semibold text-[11px] bg-red-50 px-2 py-0.5 rounded-full border border-red-200/60">
                            <XCircle size={12} />
                            Deactivated
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {new Date(u.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit details"
                          >
                            <Edit2 size={14} />
                          </button>

                          <button
                            onClick={() => handleOpenRole(u)}
                            className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                            title="Change role"
                          >
                            <Shield size={14} />
                          </button>

                          <button
                            onClick={() => handleOpenPassword(u)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            title="Reset password"
                          >
                            <KeyRound size={14} />
                          </button>

                          <button
                            onClick={() => handleOpenStatus(u)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              u.is_active
                                ? 'text-slate-500 hover:text-red-600 hover:bg-red-50'
                                : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={u.is_active ? 'Deactivate account' : 'Reactivate account'}
                          >
                            {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Add New User */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Create New Staff Account" maxWidth="md">
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            label="Display Name"
            type="text"
            required
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            placeholder="e.g. Ramesh Sharma"
          />

          <Input
            label="Email Address"
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="e.g. ramesh@sccjobs.in"
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Temporary Password (min. 8 characters)
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              User will log in with this password. Keep it secure and share directly.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as AppRole)}
              className="w-full px-3 py-2 text-xs md:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            >
              <option value="recruiter">Recruiter (Default: Leads, Candidates & Interviews)</option>
              <option value="manager">Manager (Operational leader: Placements & Verification)</option>
              <option value="admin">Administrator (Complete system & security authority)</option>
            </select>
          </div>

          <Input
            label="Mobile Number (Optional)"
            type="tel"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="+91 98765 43210"
          />

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddModalOpen(false)} disabled={formLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={formLoading}>
              {formLoading ? 'Creating User...' : 'Create Account'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Edit User Profile */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Staff Details" maxWidth="sm">
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">Staff Email</p>
            <p className="text-sm font-bold text-slate-800">{selectedUser?.email}</p>
          </div>

          <Input
            label="Display Name"
            type="text"
            required
            value={editDisplayName}
            onChange={(e) => setEditDisplayName(e.target.value)}
          />

          <Input
            label="Mobile Number"
            type="tel"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
            placeholder="+91 98765 43210"
          />

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditModalOpen(false)} disabled={formLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={formLoading}>
              {formLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 3: Change Role */}
      <Modal isOpen={roleModalOpen} onClose={() => setRoleModalOpen(false)} title="Change User Role" maxWidth="sm">
        <div className="space-y-4">
          <div>
            <p className="text-xs text-slate-500">Selected Staff Member</p>
            <p className="text-sm font-bold text-slate-800">
              {selectedUser?.display_name} ({selectedUser?.email})
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select New Role</label>
            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value as AppRole)}
              className="w-full px-3 py-2 text-xs md:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
            >
              <option value="recruiter">Recruiter (Frontline telecalling & interviews)</option>
              <option value="manager">Manager (Approve placements & team overview)</option>
              <option value="admin">Administrator (Complete access & user management)</option>
            </select>
          </div>

          {selectedUser?.id === user?.id && targetRole !== 'admin' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Warning:</strong> You are modifying your own role. Demoting yourself will remove your access to this page.
              </span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRoleModalOpen(false)} disabled={formLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleChangeRole} disabled={formLoading}>
              {formLoading ? 'Updating Role...' : 'Update Role'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal 4: Account Deactivation Confirmation */}
      <Modal
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title={selectedUser?.is_active ? 'Deactivate Staff Account' : 'Reactivate Staff Account'}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
            <div className={`p-2 rounded-lg text-white ${selectedUser?.is_active ? 'bg-red-600' : 'bg-emerald-600'}`}>
              {selectedUser?.is_active ? <UserX size={18} /> : <UserCheck size={18} />}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{selectedUser?.display_name}</p>
              <p className="text-xs text-slate-500">{selectedUser?.email}</p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {selectedUser?.is_active ? (
              <>
                Deactivating this account will <strong>immediately revoke CRM access</strong> and bar them from logging in or querying the database.
                Past call logs, candidate submissions, and audit trails remain permanently intact.
              </>
            ) : (
              <>
                Reactivating this account will restore their login access and allow them to resume CRM operations with their assigned role.
              </>
            )}
          </p>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStatusModalOpen(false)} disabled={formLoading}>
              Cancel
            </Button>
            <Button
              variant={selectedUser?.is_active ? 'danger' : 'success'}
              onClick={handleToggleStatus}
              disabled={formLoading}
            >
              {formLoading
                ? 'Processing...'
                : selectedUser?.is_active
                ? 'Confirm Deactivation'
                : 'Confirm Reactivation'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal 5: Password Reset */}
      <Modal isOpen={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} title="Reset Account Password" maxWidth="sm">
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <p className="text-xs text-slate-500">Staff Account</p>
            <p className="text-sm font-bold text-slate-800">{selectedUser?.email}</p>
          </div>

          <div className="flex border-b border-slate-200 gap-4 text-xs font-bold">
            <button
              type="button"
              onClick={() => setResetType('direct')}
              className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                resetType === 'direct'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Direct Password
            </button>
            <button
              type="button"
              onClick={() => setResetType('email')}
              className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                resetType === 'email'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Send Recovery Email
            </button>
          </div>

          {resetType === 'direct' ? (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">New Temporary Password</label>
              <div className="relative">
                <input
                  type={showTempPassword ? 'text' : 'password'}
                  required
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs md:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowTempPassword(!showTempPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showTempPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Immediately updates the account password in the database.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed">
              Dispatches a secure password reset link to <strong>{selectedUser?.email}</strong> via Supabase Auth.
            </p>
          )}

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPasswordModalOpen(false)} disabled={formLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={formLoading}>
              {formLoading ? 'Resetting...' : resetType === 'direct' ? 'Set Password' : 'Send Reset Email'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 6: Audit History */}
      <Modal isOpen={logsModalOpen} onClose={() => setLogsModalOpen(false)} title="User Management Audit Log" maxWidth="lg">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Immutable log of role updates, staff provisioning, and security status modifications.
          </p>

          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
            {logsLoading ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                <RefreshCw size={16} className="animate-spin mx-auto mb-2 text-blue-600" />
                Loading audit trail...
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No user management events recorded in audit log.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {activityLogs.map((log) => (
                  <div key={log.id} className="p-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Shield size={12} className="text-blue-600" />
                        {log.action}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(log.created_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Target ID: <code className="bg-slate-100 px-1 rounded">{log.entity_id}</code>
                    </div>
                    {log.details && (
                      <pre className="mt-1.5 p-2 bg-slate-50 rounded text-[10px] text-slate-700 font-mono overflow-x-auto border border-slate-100">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <Button variant="secondary" onClick={() => setLogsModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UserManagement;
