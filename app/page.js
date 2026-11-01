'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function Home() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [text, setText] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [error, setError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [groupDialog, setGroupDialog] = useState(null);
  const [groupDialogValue, setGroupDialogValue] = useState('');
  useEffect(() => {
    if (!supabase) {
      setAuthMsg('Authentication is not configured.');
      setChecking(false);
      return undefined;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) setAuthMsg(sessionError.message);
      setSession(data.session);
      setChecking(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const loadGroups = async () => {
    const { data, error: loadError } = await supabase.from('groups').select('*').order('created_at');
    if (loadError) {
      setError(`Could not load groups: ${loadError.message}`);
      return;
    }
    setGroups(data || []);
    setGroupId((current) => data?.some((group) => group.id === current) ? current : data?.[0]?.id || '');
  };

  useEffect(() => {
    if (!session) {
      setGroups([]);
      setGroupId('');
      return;
    }
    loadGroups();
  }, [session]);

  useEffect(() => {
    if (!session || !groupId) {
      setExpenses([]);
      return;
    }
    let active = true;
    supabase.from('expenses').select('*').eq('group_id', groupId).order('created_at')
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(`Could not load group expenses: ${loadError.message}`);
        else setExpenses(data || []);
      });
    return () => { active = false; };
  }, [session, groupId]);

  const signInDemo = async () => {
    if (!supabase) return;
    setAuthMsg('');
    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) setAuthMsg(`Could not start instant login: ${signInError.message}`);
  };

  const signOut = async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(`Could not sign out: ${signOutError.message}`);
  };

  const createGroup = async (name) => {
    name = name.trim();
    if (!name) return;
    const { data: group, error: createError } = await supabase.from('groups')
      .insert({ name, created_by: session.user.id }).select().single();
    if (createError) {
      setError(`Could not create group: ${createError.message}`);
      return;
    }
    const { error: memberError } = await supabase.from('group_members')
      .insert({ group_id: group.id, user_id: session.user.id });
    if (memberError) {
      setError(`Could not add group membership: ${memberError.message}`);
      return;
    }
    await loadGroups();
    setGroupId(group.id);
  };

  const joinGroup = async (code) => {
    code = code.trim();
    if (!code) return;
    const { data: joinedId, error: joinError } = await supabase.rpc('join_group', { code });
    if (joinError) {
      setError(`Could not join group: ${joinError.message}`);
      return;
    }
    await loadGroups();
    setGroupId(joinedId);
  };

  const openGroupDialog = (type) => {
    setGroupDialog(type);
    setGroupDialogValue('');
    setError('');
  };

  const submitGroupDialog = async (event) => {
    event.preventDefault();
    const value = groupDialogValue.trim();
    if (groupDialog === 'create') await createGroup(value);
    else await joinGroup(value);
    setGroupDialog(null);
    setGroupDialogValue('');
  };

  const addExpense = async () => {
    const sentence = text.trim();
    if (!sentence || isAdding || !session || !groupId) return;

    setIsAdding(true);
    setError('');
    try {
      const response = await fetch('/api/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to parse that expense');

      const expense = {
        id: 'e-' + Date.now(),
        group_id: groupId,
        name: result.description || sentence,
        paid_by: `split ${inr(result.amount)} among ${result.people}`,
        amount: result.each,
        emoji: '🧾',
        created_at: new Date().toISOString(),
      };
      const { data: row, error: insertError } = await supabase.from('expenses')
        .insert({ user_id: session.user.id, group_id: groupId, name: expense.name, paid_by: expense.paid_by, amount: expense.amount })
        .select()
        .single();
      if (insertError) throw new Error(`Could not save expense: ${insertError.message}`);
      setExpenses((list) => [...list, row]);
      setText('');
    } catch (addError) {
      setError(addError.message);
    } finally {
      setIsAdding(false);
    }
  };

  const removeExpense = async (id) => {
    if (!supabase || !session) return;
    setError('');
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', id);
    if (deleteError) {
      setError(`Could not remove expense: ${deleteError.message}`);
      return;
    }
    setExpenses((list) => list.filter((expense) => expense.id !== id));
  };

  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const currentGroup = groups.find((group) => group.id === groupId);

  if (checking) return <main style={styles.page}><div style={styles.card}>Loading…</div></main>;

  if (!session) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.brand}><div style={styles.logo}>S</div><div style={styles.title}>SplitSmart</div></div>
          </div>
          <p style={styles.help}>Use a local demo account. No email is sent and no real account is created.</p>
          <button style={styles.authBtn} onClick={signInDemo}>Continue with demo account</button>
          {authMsg && <div style={styles.message} role="alert">{authMsg}</div>}
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.brand}><div style={styles.logo}>S</div><div style={styles.title}>SplitSmart</div></div>
          <button style={styles.signout} onClick={signOut}>Sign out</button>
        </div>
        <div style={styles.groupBar}>
          <select style={styles.select} value={groupId} onChange={(event) => setGroupId(event.target.value)} aria-label="Select group">
            {!groups.length && <option value="">No groups yet</option>}
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <button style={styles.gbtn} onClick={() => openGroupDialog('create')}>+ New</button>
          <button style={styles.gbtn} onClick={() => openGroupDialog('join')}>Join</button>
        </div>
        {currentGroup && <div style={styles.codeLine}>Invite code: <b>{currentGroup.join_code}</b></div>}
        {groupId && <div style={styles.addRow}>
          <input
            style={styles.input}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && addExpense()}
            placeholder="Dinner ₹1200 split with 3 friends"
            aria-label="Add an expense"
          />
          <button style={styles.addBtn} onClick={addExpense} disabled={isAdding} aria-label="Add">
            {isAdding ? '…' : '+'}
          </button>
        </div>}
        {!groupId && <div style={styles.empty}>Create a group or join one with an invite code.</div>}
        {error && <div style={styles.error} role="alert">{error}</div>}
        <div style={styles.list}>
          {expenses.length === 0 && <div style={styles.empty}>No expenses yet — add your first one above.</div>}
          {expenses.map((expense) => (
            <div key={expense.id} style={styles.item}>
              <div style={styles.itemEmoji}>{expense.emoji || '🧾'}</div>
              <div style={styles.itemMain}>
                <div style={styles.itemName}>{expense.name}</div>
                <div style={styles.itemPaid}>paid by {expense.paid_by}</div>
              </div>
              <div style={styles.itemAmount}>{inr(expense.amount)}</div>
              <button style={styles.remove} onClick={() => removeExpense(expense.id)} aria-label={`Remove ${expense.name}`}>×</button>
            </div>
          ))}
        </div>
        <div style={styles.total}>Total {inr(total)}</div>
        {groupDialog && (
          <div style={styles.dialogBackdrop}>
            <form style={styles.dialog} onSubmit={submitGroupDialog}>
              <div style={styles.dialogTitle}>{groupDialog === 'create' ? 'Create a group' : 'Join a group'}</div>
              <input
                autoFocus
                style={styles.input2}
                value={groupDialogValue}
                onChange={(event) => setGroupDialogValue(event.target.value)}
                placeholder={groupDialog === 'create' ? 'Group name' : 'Invite code'}
                aria-label={groupDialog === 'create' ? 'Group name' : 'Invite code'}
              />
              <div style={styles.authRow}>
                <button type="button" style={styles.authBtnAlt} onClick={() => setGroupDialog(null)}>Cancel</button>
                <button type="submit" style={styles.authBtn}>{groupDialog === 'create' ? 'Create' : 'Join'}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px 48px' },
  card: { width: '100%', maxWidth: 420, background: 'var(--card)', borderRadius: 24, boxShadow: '0 24px 60px -24px rgba(13,27,62,.28)', border: '1px solid var(--line)', padding: 20, marginTop: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 18, background: 'linear-gradient(135deg, var(--blue), var(--cyan))' },
  title: { fontSize: 20, fontWeight: 800 },
  help: { color: 'var(--muted)', fontSize: 14, marginBottom: 16 },
  input: { flex: 1, border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px', fontSize: 15, outline: 'none', background: '#f7f9fc' },
  input2: { width: '100%', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', fontSize: 15, outline: 'none', background: '#f7f9fc', marginBottom: 10, boxSizing: 'border-box' },
  authRow: { display: 'flex', gap: 10, marginTop: 6 },
  authBtn: { flex: 1, border: 'none', borderRadius: 12, padding: 12, color: '#fff', fontSize: 15, fontWeight: 800, background: 'linear-gradient(135deg, var(--blue), var(--cyan))', cursor: 'pointer' },
  authBtnAlt: { flex: 1, border: '1px solid var(--line)', borderRadius: 12, padding: 12, color: 'var(--ink)', fontSize: 15, fontWeight: 800, background: '#fff', cursor: 'pointer' },
  demoBtn: { width: '100%', border: '1px dashed var(--blue)', borderRadius: 12, padding: 11, marginTop: 10, color: 'var(--blue)', fontSize: 14, fontWeight: 800, background: '#fff', cursor: 'pointer' },
  signout: { border: '1px solid var(--line)', background: '#fff', borderRadius: 10, padding: '7px 13px', fontSize: 13, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer' },
  addRow: { display: 'flex', gap: 10, marginBottom: 16 },
  groupBar: { display: 'flex', gap: 8, marginBottom: 8 },
  select: { flex: 1, border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', fontSize: 14, fontWeight: 700, background: '#f7f9fc', color: 'var(--ink)' },
  gbtn: { flex: 'none', border: '1px solid var(--line)', background: '#fff', borderRadius: 12, padding: '0 12px', fontSize: 13.5, fontWeight: 800, color: 'var(--blue)', cursor: 'pointer' },
  codeLine: { fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 },
  addBtn: { flex: 'none', width: 48, borderRadius: 14, border: 'none', color: '#fff', fontSize: 24, fontWeight: 700, background: 'linear-gradient(135deg, var(--blue), var(--cyan))', cursor: 'pointer' },
  error: { color: '#b42318', fontSize: 13, margin: '-4px 0 14px' },
  message: { marginTop: 12, fontSize: 13, color: 'var(--blue)' },
  list: { display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 },
  empty: { color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' },
  item: { display: 'flex', alignItems: 'center', gap: 12, background: '#f7f9fc', border: '1px solid var(--line)', borderRadius: 16, padding: '12px 14px' },
  itemEmoji: { width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: '#fff', border: '1px solid var(--line)', fontSize: 19, flex: 'none' },
  itemMain: { flex: 1, minWidth: 0 },
  itemName: { fontWeight: 700, fontSize: 15 },
  itemPaid: { color: 'var(--muted)', fontSize: 12.5, marginTop: 1 },
  itemAmount: { fontWeight: 800, fontSize: 15.5 },
  remove: { flex: 'none', width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' },
  total: { textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)', fontWeight: 800, fontSize: 16 },
  dialogBackdrop: { position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(13,27,62,.35)', zIndex: 10 },
  dialog: { width: '100%', maxWidth: 360, background: 'var(--card)', borderRadius: 18, padding: 18, boxShadow: '0 20px 50px rgba(13,27,62,.25)' },
  dialogTitle: { fontWeight: 800, fontSize: 17, marginBottom: 14 },
};
