'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function Home() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [members, setMembers] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [activeView, setActiveView] = useState('My Groups');
  const [theme, setTheme] = useState('Ocean Blue');
  const [authMsg, setAuthMsg] = useState('');
  const [error, setError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [groupDialog, setGroupDialog] = useState(null);
  const [groupDialogValue, setGroupDialogValue] = useState('');
  const [customName, setCustomName] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customPeopleCount, setCustomPeopleCount] = useState(2);
  const [customPeople, setCustomPeople] = useState([
    { name: '', paidAmount: '', reason: '' },
    { name: '', paidAmount: '', reason: '' },
  ]);
  const [showCustomSplit, setShowCustomSplit] = useState(false);
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

  useEffect(() => {
    if (!session || !groupId) {
      setMembers([]);
      return;
    }
    let active = true;
    supabase.from('group_members').select('user_id, display_name, joined_at').eq('group_id', groupId).order('joined_at')
      .then(({ data, error: memberError }) => {
        if (!active) return;
        if (memberError) setError(`Could not load group members: ${memberError.message}`);
        else setMembers(data || []);
      });
    return () => { active = false; };
  }, [session, groupId]);

  const signInDemo = async () => {
    if (!supabase) return;
    if (!email.trim() || password.length < 6) {
      setAuthMsg('Enter any email and a password with at least 6 characters. No email will be sent.');
      return;
    }
    setAuthMsg('');
    const { error: signInError } = await supabase.auth.signInAnonymously({ options: { data: { display_name: displayName.trim() } } });
    if (signInError) setAuthMsg(`Could not start instant login: ${signInError.message}`);
  };

  const updateMemberName = async (targetGroupId) => {
    if (!session?.user?.id || !displayName.trim()) return;
    await supabase.from('group_members').update({ display_name: displayName.trim() })
      .eq('group_id', targetGroupId).eq('user_id', session.user.id);
  };

  const signOut = async () => {
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) setError(`Could not sign out: ${signOutError.message}`);
  };

  const createGroup = async (name) => {
    name = name.trim();
    if (!name) return;
    const { data: groupIdFromRpc, error: createError } = await supabase.rpc('create_group', { group_name: name });
    if (createError) {
      setError(`Could not create group: ${createError.message}`);
      return;
    }
    await loadGroups();
    await updateMemberName(groupIdFromRpc);
    setGroupId(groupIdFromRpc);
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
    await updateMemberName(joinedId);
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

  const addCustomExpense = async (event) => {
    event.preventDefault();
    const amount = Number(customAmount);
    const paidAmounts = customPeople.map((person) => Number(person.paidAmount));
    const paidTotal = paidAmounts.reduce((sum, value) => sum + value, 0);
    if (!customName.trim() || !Number.isFinite(amount) || amount <= 0 || Math.abs(paidTotal - amount) > 0.01 || customPeople.some((person) => !person.name.trim() || !Number.isFinite(Number(person.paidAmount)) || Number(person.paidAmount) < 0)) {
      setError('Enter a name, total amount, every person name, and paid amounts that add up to the total.');
      return;
    }
    const splitDetails = customPeople.map((person, index) => ({
      user_id: members[index]?.user_id || null,
      name: person.name.trim(),
      reason: person.reason.trim(),
      percentage: Number((paidAmounts[index] / amount * 100).toFixed(2)),
      amount: Number(paidAmounts[index].toFixed(2)),
    }));
    const { data: row, error: insertError } = await supabase.from('expenses').insert({
      user_id: session.user.id,
      group_id: groupId,
      name: customName.trim(),
      paid_by: 'custom split',
      amount,
      split_details: splitDetails,
    }).select().single();
    if (insertError) {
      setError(`Could not save custom expense: ${insertError.message}`);
      return;
    }
    setExpenses((list) => [...list, row]);
    setShowCustomSplit(false);
    setCustomName('');
    setCustomAmount('');
    setCustomPeopleCount(2);
    setCustomPeople([
      { name: '', paidAmount: '', reason: '' },
      { name: '', paidAmount: '', reason: '' },
    ]);
    setError('');
  };

  const updateCustomPeopleCount = (value) => {
    const count = Math.max(2, Math.min(20, Number(value) || 2));
    setCustomPeopleCount(count);
    setCustomPeople((current) => Array.from({ length: count }, (_, index) => current[index] || { name: '', paidAmount: '', reason: '' }));
  };

  const updateCustomPerson = (index, field, value) => {
    setCustomPeople((current) => current.map((person, personIndex) => personIndex === index ? { ...person, [field]: value } : person));
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
  const settlementRows = expenses.flatMap((expense) => (Array.isArray(expense.split_details) ? expense.split_details : [])
    .filter((detail) => detail.user_id && detail.user_id !== session?.user?.id && Number(detail.amount) > 0)
    .map((detail) => ({ ...detail, expenseName: expense.name, from: detail.name || 'Member', to: displayName || 'You' })));
  const themeMap = {
    'Ocean Blue': { card: '#dff4ff', accent: '#1c5fd4' },
    Midnight: { card: '#17233d', accent: '#9dc7ff' },
    Galaxy: { card: '#eadfff', accent: '#7139b7' },
    Arctic: { card: '#eaf8ff', accent: '#2588b8' },
    Sunset: { card: '#ffe1d2', accent: '#d8663b' },
    Minimal: { card: '#f5f6f8', accent: '#566176' },
  };
  const currentTheme = themeMap[theme];

  if (checking) return <main style={styles.page}><div style={styles.card}>Loading…</div></main>;

  if (!session) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.brand}><div style={styles.logo}>S</div><div style={styles.title}>SplitSmart</div></div>
          </div>
          <p style={styles.help}>Enter any details for instant login. No email is sent or verified.</p>
          <input style={styles.input2} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" aria-label="Your name" />
          <input style={styles.input2} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Any email (not verified)" />
          <input style={styles.input2} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Any password (6+ characters)" />
          <button style={styles.authBtn} onClick={signInDemo}>Continue with demo account</button>
          {authMsg && <div style={styles.message} role="alert">{authMsg}</div>}
        </div>
      </main>
    );
  }

  return (
    <main style={{ ...styles.page, '--accent': currentTheme.accent }}>
      <nav style={styles.nav}>
        {['My Groups', 'My Expenses', 'Settlements', 'Statistics', 'Notifications', 'Profile & Settings'].map((view) => (
          <button key={view} style={{ ...styles.navBtn, ...(activeView === view ? styles.navBtnActive : {}) }} onClick={() => setActiveView(view)}>{view}</button>
        ))}
      </nav>
      <div style={{ ...styles.card, background: currentTheme.card }}>
        <div style={styles.header}>
          <div style={styles.brand}><div style={styles.logo}>S</div><div style={styles.title}>SplitSmart</div></div>
          <button style={styles.signout} onClick={signOut}>Sign out</button>
        </div>
        {activeView === 'Profile & Settings' && (
          <div style={styles.settingsPanel}>
            <div style={styles.dialogTitle}>Customisable Themes</div>
            <select style={styles.select} value={theme} onChange={(event) => setTheme(event.target.value)}>
              {Object.keys(themeMap).map((name) => <option key={name}>{name}</option>)}
            </select>
            <div style={styles.dialogHint}>Ocean Blue, Midnight, Galaxy, Arctic, Sunset, and Minimal.</div>
          </div>
        )}
        {activeView === 'Settlements' && (
          <div style={styles.settlementPanel}>
            <div style={styles.sectionTitle}>Settlement</div>
            {settlementRows.length === 0 && <div style={styles.empty}>No outstanding custom payments.</div>}
            {settlementRows.map((row, index) => <div style={styles.settlementRow} key={`${row.expenseName}-${index}`}><b>{row.from} → {row.to}</b><strong>{inr(row.amount)}</strong><span>{row.reason || row.expenseName}</span></div>)}
          </div>
        )}
        {activeView === 'Statistics' && <div style={styles.infoPanel}><div style={styles.sectionTitle}>Statistics</div><div>Total group spending: <b>{inr(total)}</b></div><div>Expenses recorded: <b>{expenses.length}</b></div></div>}
        {activeView === 'Notifications' && <div style={styles.infoPanel}><div style={styles.sectionTitle}>Notifications</div><div>No new notifications.</div></div>}
        {activeView === 'My Groups' && <div style={styles.groupBar}>
          <select style={styles.select} value={groupId} onChange={(event) => setGroupId(event.target.value)} aria-label="Select group">
            {!groups.length && <option value="">No groups yet</option>}
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <button style={styles.gbtn} onClick={() => openGroupDialog('create')}>+ New</button>
          <button style={styles.gbtn} onClick={() => openGroupDialog('join')}>Join</button>
        </div>}
        {(activeView === 'My Groups' || activeView === 'My Expenses') && groupId && <div style={styles.groupBar}>
          <select style={styles.select} value={groupId} onChange={(event) => setGroupId(event.target.value)} aria-label="Select group">
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </div>}
        {currentGroup && <div style={styles.codeLine}>Invite code: <b>{currentGroup.join_code}</b></div>}
        {groupId && <div style={styles.memberPanel}>
          <div style={styles.memberTitle}>People in this group ({members.length})</div>
          {members.map((member, index) => <div key={member.user_id} style={styles.memberRow}>{member.display_name || `Member ${index + 1}`}{member.user_id === session.user.id ? ' (you)' : ''}</div>)}
        </div>}
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
        {groupId && <button style={styles.customBtn} onClick={() => { setShowCustomSplit((visible) => !visible); setError(''); }}>+ Custom split</button>}
        {groupId && showCustomSplit && (
          <form style={styles.customPanel} onSubmit={addCustomExpense}>
            <div style={styles.dialogTitle}>Custom expense split</div>
            <input style={styles.input2} value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Expense name" aria-label="Expense name" />
            <input style={styles.input2} type="number" min="1" step="1" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} placeholder="Total amount" aria-label="Total amount" />
            <label style={styles.fieldLabel}>How many people are splitting this?</label>
            <input style={styles.input2} type="number" min="2" max="20" step="1" value={customPeopleCount} onChange={(event) => updateCustomPeopleCount(event.target.value)} aria-label="Number of people" />
            <div style={styles.customPeopleList}>
              {customPeople.map((person, index) => (
                <div style={styles.personBox} key={index}>
                  <div style={styles.personLabel}>{members[index]?.display_name || `Person ${index + 1}`}</div>
                  <input style={styles.input2} value={person.name} onChange={(event) => updateCustomPerson(index, 'name', event.target.value)} placeholder="Person name" aria-label={`Person ${index + 1} name`} />
                  <div style={styles.splitInputs}>
                    <input style={styles.percentInput} type="number" min="0" step="1" value={person.paidAmount} onChange={(event) => updateCustomPerson(index, 'paidAmount', event.target.value)} placeholder="Amount paid" aria-label={`${person.name || `Person ${index + 1}`} amount paid`} />
                    <input style={styles.reasonInput} value={person.reason} onChange={(event) => updateCustomPerson(index, 'reason', event.target.value)} placeholder="Reason for this split" aria-label={`Person ${index + 1} reason`} />
                  </div>
                </div>
              ))}
            </div>
            <div style={styles.percentTotal}>Allocated: {inr(customPeople.reduce((sum, person) => sum + (Number(person.paidAmount) || 0), 0))} of {inr(Number(customAmount) || 0)}</div>
            <button type="submit" style={styles.authBtn}>Save custom split</button>
          </form>
        )}
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
  nav: { width: '100%', maxWidth: 420, display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 0 10px' },
  navBtn: { flex: 'none', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', background: 'rgba(255,255,255,.75)', color: 'var(--ink)', fontSize: 11, fontWeight: 800, cursor: 'pointer' },
  navBtnActive: { background: 'var(--accent)', color: '#fff' },
  card: { width: '100%', maxWidth: 420, background: '#dff4ff', borderRadius: 24, boxShadow: '0 24px 60px -24px rgba(13,27,62,.28)', border: '1px solid #b9e4f7', padding: 20, marginTop: 12 },
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
  memberPanel: { background: '#f7f9fc', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 12px', marginBottom: 12 },
  memberTitle: { fontSize: 13, fontWeight: 800, marginBottom: 6 },
  memberRow: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6 },
  customBtn: { width: '100%', border: '1px dashed var(--blue)', borderRadius: 12, padding: 10, marginBottom: 14, color: 'var(--blue)', fontWeight: 800, background: '#fff', cursor: 'pointer' },
  customPanel: { background: 'rgba(255,255,255,.62)', border: '1px solid #b9e4f7', borderRadius: 16, padding: 14, marginBottom: 14 },
  fieldLabel: { display: 'block', color: 'var(--muted)', fontSize: 12.5, fontWeight: 700, marginBottom: 6 },
  customPeopleList: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 },
  personBox: { background: '#fff', border: '1px solid #b9e4f7', borderRadius: 12, padding: 10 },
  personLabel: { color: 'var(--ink)', fontSize: 13, fontWeight: 800, marginBottom: 8 },
  splitInputs: { display: 'flex', gap: 8 },
  percentInput: { width: 76, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 8px', fontSize: 14, outline: 'none' },
  reasonInput: { flex: 1, minWidth: 0, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 8px', fontSize: 14, outline: 'none' },
  percentTotal: { color: 'var(--blue)', fontSize: 13, fontWeight: 800, marginBottom: 10 },
  dialogHint: { color: 'var(--muted)', fontSize: 12, margin: '-4px 0 10px' },
  settingsPanel: { background: 'rgba(255,255,255,.65)', borderRadius: 14, padding: 12, marginBottom: 14 },
  settlementPanel: { background: 'rgba(255,255,255,.65)', borderRadius: 14, padding: 12, marginBottom: 14 },
  infoPanel: { background: 'rgba(255,255,255,.65)', borderRadius: 14, padding: 14, marginBottom: 14, lineHeight: 1.8 },
  sectionTitle: { fontSize: 18, fontWeight: 800, marginBottom: 10 },
  settlementRow: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, padding: '10px 0', borderTop: '1px solid var(--line)' },
  settlementReason: { gridColumn: '1 / -1', color: 'var(--muted)', fontSize: 12.5 },
  addBtn: { flex: 'none', width: 48, borderRadius: 14, border: 'none', color: '#fff', fontSize: 24, fontWeight: 700, background: 'linear-gradient(135deg, var(--blue), var(--cyan))', cursor: 'pointer' },
  error: { color: '#b42318', fontSize: 13, margin: '-4px 0 14px' },
  message: { marginTop: 12, fontSize: 13, color: 'var(--blue)' },
  list: { display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 },
  empty: { color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' },
  item: { display: 'flex', alignItems: 'center', gap: 12, background: '#dff4ff', border: '1px solid #b9e4f7', borderRadius: 16, padding: '12px 14px' },
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
