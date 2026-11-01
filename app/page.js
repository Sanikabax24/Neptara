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
  const [profilePicture, setProfilePicture] = useState('');
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
    const savedPicture = window.localStorage.getItem('splitsmart-profile-picture');
    if (savedPicture) setProfilePicture(savedPicture);
    const savedTheme = window.localStorage.getItem('splitsmart-theme');
    if (savedTheme) setTheme(savedTheme);
  }, []);
  useEffect(() => {
    window.localStorage.setItem('splitsmart-theme', theme);
  }, [theme]);
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
    const { error: nameError } = await supabase.from('group_members').update({ display_name: displayName.trim() })
      .eq('group_id', targetGroupId).eq('user_id', session.user.id);
    if (nameError) setError(`Could not save your name: ${nameError.message}`);
  };

  const saveProfileName = async () => {
    if (!session?.user?.id || !displayName.trim()) return;
    const { error: nameError } = await supabase.from('group_members').update({ display_name: displayName.trim() })
      .eq('user_id', session.user.id);
    if (nameError) {
      setError(`Could not save your name: ${nameError.message}`);
      return;
    }
    setMembers((list) => list.map((member) => member.user_id === session.user.id
      ? { ...member, display_name: displayName.trim() }
      : member));
  };

  const uploadProfilePicture = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for your profile picture.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const picture = String(reader.result);
      setProfilePicture(picture);
      window.localStorage.setItem('splitsmart-profile-picture', picture);
    };
    reader.onerror = () => setError('Could not read that image.');
    reader.readAsDataURL(file);
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

  const themeMap = {
    'Ocean Blue': { page: '#dff4ff', surface: '#c9edff', panel: '#eaf9ff', item: '#d5f2ff', text: '#0d1b3e', muted: '#536b8e', line: '#b7dced', accent: '#1c5fd4', colors: ['#1c5fd4', '#26a6d1', '#168aad', '#2f9e75', '#d4a72c', '#7139b7', '#d64b78', '#566176'] },
    Midnight: { page: '#0c1428', surface: '#17233d', panel: '#203252', item: '#263b5c', text: '#f5f8ff', muted: '#b5c4dd', line: '#3b5072', accent: '#9dc7ff', colors: ['#9dc7ff', '#64d8cb', '#c084fc', '#fbbf24', '#fb7185', '#60a5fa', '#a7f3d0', '#e5e7eb'] },
    Galaxy: { page: '#eadfff', surface: '#ddcaff', panel: '#f3edff', item: '#e7d8ff', text: '#24133f', muted: '#725a91', line: '#c8b3e6', accent: '#7139b7', colors: ['#7139b7', '#d64b78', '#f078b5', '#5b4bb7', '#f0a35e', '#38a3a5', '#9d4edd', '#8b5cf6'] },
    Arctic: { page: '#eaf8ff', surface: '#d6f1ff', panel: '#f5fcff', item: '#e0f6ff', text: '#12334a', muted: '#53758b', line: '#b9dbe9', accent: '#2588b8', colors: ['#2588b8', '#4cc9f0', '#4895ef', '#56c596', '#f4b942', '#7b61ff', '#ef709d', '#53758b'] },
    Sunset: { page: '#ffe1d2', surface: '#ffd0bc', panel: '#fff0e8', item: '#ffe0d2', text: '#4b2017', muted: '#8b6559', line: '#edc0ae', accent: '#d8663b', colors: ['#d8663b', '#ef8a4c', '#f2b134', '#d64b78', '#a6537c', '#8b5cf6', '#e76f51', '#9c6644'] },
    Minimal: { page: '#f5f6f8', surface: '#e8ebf0', panel: '#ffffff', item: '#eef1f5', text: '#263044', muted: '#687286', line: '#d4dae4', accent: '#566176', colors: ['#566176', '#78909c', '#90a4ae', '#607d8b', '#8d99ae', '#718096', '#9aa5b1', '#475569'] },
  };
  const currentTheme = themeMap[theme];
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const currentGroup = groups.find((group) => group.id === groupId);
  const settlementRows = expenses.flatMap((expense) => (Array.isArray(expense.split_details) ? expense.split_details : [])
    .filter((detail) => Number(detail.amount) > 0 && detail.name && detail.name.trim() !== (displayName || '').trim())
    .map((detail) => ({ ...detail, expenseName: expense.name, from: detail.name, to: displayName || 'You' })));
  const expenseChart = expenses.reduce((result, expense) => {
    const key = expense.name || 'Other';
    result[key] = (result[key] || 0) + Number(expense.amount || 0);
    return result;
  }, {});
  const chartRows = Object.entries(expenseChart).sort(([, a], [, b]) => b - a).slice(0, 8);
  const chartMax = Math.max(...chartRows.map(([, amount]) => amount), 1);
  const savedSplitNames = expenses.flatMap((expense) => Array.isArray(expense.split_details) ? expense.split_details : [])
    .map((detail) => detail.name?.trim()).filter(Boolean);
  const memberName = (member, index) => member.display_name || savedSplitNames[index] || 'Name not set';
  const chartColors = currentTheme.colors;
  const trendRows = [...expenses].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)).slice(-8);
  const trendMax = Math.max(...trendRows.map((expense) => Number(expense.amount || 0)), 1);
  const trendPoints = trendRows.map((expense, index) => {
    const x = trendRows.length === 1 ? 160 : 16 + (index / (trendRows.length - 1)) * 288;
    const y = 124 - (Number(expense.amount || 0) / trendMax) * 104;
    return { x, y, amount: Number(expense.amount || 0), name: expense.name };
  });
  let pieStart = 0;
  const pieSegments = chartRows.map(([, amount], index) => {
    const end = pieStart + (amount / Math.max(total, 1)) * 360;
    const segment = `${chartColors[index % chartColors.length]} ${pieStart}deg ${end}deg`;
    pieStart = end;
    return segment;
  });
  if (checking) return <main style={styles.page}><div style={styles.card}>Loading…</div></main>;

  if (!session) {
    return (
      <main style={styles.authPage}>
        <div style={styles.authCard}>
          <div style={styles.header}>
            <div style={styles.brand}><img src="/neptara-logo.png" alt="Neptara logo" style={styles.logo} /><div style={styles.brandStack}><div style={styles.productName}>Neptara</div><div style={styles.title}>SplitSmart</div></div></div>
          </div>
          <p style={styles.authHelp}>Enter any details for instant login. No email is sent or verified.</p>
          <input style={styles.authInput} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" aria-label="Your name" />
          <input style={styles.authInput} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Any email (not verified)" />
          <input style={styles.authInput} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Any password (6+ characters)" />
          <button style={styles.authBtn} onClick={signInDemo}>Continue with demo account</button>
          {authMsg && <div style={styles.authMessage} role="alert">{authMsg}</div>}
        </div>
      </main>
    );
  }

  return (
    <main style={{
      ...styles.page,
      background: currentTheme.page,
      '--accent': currentTheme.accent,
      '--surface': currentTheme.surface,
      '--panel': currentTheme.panel,
      '--item': currentTheme.item,
      '--text': currentTheme.text,
      '--muted': currentTheme.muted,
      '--line': currentTheme.line,
    }}>
      <nav style={styles.nav}>
        {['My Groups', 'My Expenses', 'Settlements', 'Statistics', 'Profile & Settings'].map((view) => (
          <button key={view} style={{ ...styles.navBtn, ...(activeView === view ? styles.navBtnActive : {}) }} onClick={() => setActiveView(view)}>{view}</button>
        ))}
      </nav>
      <div style={{ ...styles.card, background: 'var(--surface)' }}>
        <div style={styles.header}>
          <div style={styles.brand}><img src="/neptara-logo.png" alt="Neptara logo" style={styles.logo} /><div style={styles.brandStack}><div style={styles.productName}>Neptara</div><div style={styles.title}>SplitSmart</div></div></div>
          <button style={styles.signout} onClick={signOut}>Sign out</button>
        </div>
        {activeView === 'Profile & Settings' && (
          <div style={styles.settingsPanel}>
            <div style={styles.sectionTitle}>Profile & Settings</div>
            <div style={styles.profileHeader}>
              {profilePicture ? <img src={profilePicture} alt="Profile" style={styles.avatar} /> : <div style={styles.avatarFallback}>{(displayName || 'U').charAt(0).toUpperCase()}</div>}
              <div><b>{displayName || 'Your name'}</b><div style={styles.memberRow}>{inr(total)} total spent</div></div>
            </div>
            <input style={styles.input} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your display name" aria-label="Profile name" />
            <label style={styles.uploadLabel}>Upload profile picture<input type="file" accept="image/*" onChange={uploadProfilePicture} style={styles.fileInput} /></label>
            <button style={styles.gbtn} onClick={saveProfileName}>Save profile</button>
            <div style={styles.themeLabel}>Theme</div>
            <select style={styles.select} value={theme} onChange={(event) => setTheme(event.target.value)}>
              {Object.keys(themeMap).map((name) => <option key={name}>{name}</option>)}
            </select>
          </div>
        )}
        {activeView === 'Settlements' && (
          <div style={styles.settlementPanel}>
            <div style={styles.sectionTitle}>Settlement</div>
            {settlementRows.length === 0 && <div style={styles.empty}>No outstanding custom payments.</div>}
            {settlementRows.map((row, index) => <div style={styles.settlementRow} key={`${row.expenseName}-${index}`}><b>{row.from} owes {row.to}</b><strong>{inr(row.amount)}</strong><span style={styles.settlementReason}>Reason: {row.reason || row.expenseName}</span></div>)}
          </div>
        )}
        {activeView === 'Statistics' && (
          <div style={styles.infoPanel}>
            <div style={styles.sectionTitle}>Statistics</div>
            <div style={styles.statsGrid}><div style={styles.statsGridItem}><b>{inr(total)}</b><span>Total spent</span></div><div style={styles.statsGridItem}><b>{expenses.length}</b><span>Expenses</span></div><div style={styles.statsGridItem}><b>{expenses.length ? inr(total / expenses.length) : inr(0)}</b><span>Average expense</span></div></div>
            {!chartRows.length && <div style={styles.empty}>Add expenses to see your chart.</div>}
            {chartRows.length > 0 && <div style={styles.graphGrid}>
              <div>
                <div style={styles.chartTitle}>Spending breakdown</div>
                <div style={{ ...styles.pieChart, background: `conic-gradient(${pieSegments.join(', ')})` }}><div style={styles.pieHole}>{inr(total)}</div></div>
                <div style={styles.legend}>{chartRows.map(([name, amount], index) => <div style={styles.legendRow} key={`legend-${name}`}><span style={{ ...styles.legendDot, background: chartColors[index % chartColors.length] }} /><span>{name}</span><b>{Math.round(amount / total * 100)}%</b></div>)}</div>
              </div>
              <div>
                <div style={styles.chartTitle}>Bar graph</div>
                {chartRows.map(([name, amount], index) => <div style={styles.chartRow} key={name}><div style={styles.chartLabel}><span>{name}</span><b>{inr(amount)}</b></div><div style={styles.chartTrack}><div style={{ ...styles.chartBar, background: chartColors[index % chartColors.length], width: `${Math.max(4, amount / chartMax * 100)}%` }} /></div></div>)}
              </div>
            </div>}
            {chartRows.length > 0 && <div style={styles.analysis}>Your largest expense is <b>{chartRows[0][0]}</b> at <b>{inr(chartRows[0][1])}</b>. This is {Math.round(chartRows[0][1] / total * 100)}% of your recorded spending.</div>}
            {trendRows.length > 0 && <div style={styles.lineGraph}>
              <div style={styles.chartTitle}>Spending trend</div>
              <svg viewBox="0 0 320 150" role="img" aria-label="Line graph of expenses over time" style={styles.chartSvg}>
                <line x1="16" y1="124" x2="304" y2="124" stroke="var(--line)" strokeWidth="1" />
                <line x1="16" y1="72" x2="304" y2="72" stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" />
                <line x1="16" y1="20" x2="304" y2="20" stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" />
                <polyline fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={trendPoints.map((point) => `${point.x},${point.y}`).join(' ')} />
                {trendPoints.map((point, index) => <circle key={`${point.name}-${index}`} cx={point.x} cy={point.y} r="4" fill="var(--accent)" stroke="var(--panel)" strokeWidth="2"><title>{point.name}: {inr(point.amount)}</title></circle>)}
              </svg>
              <div style={styles.lineLabels}>{trendPoints.map((point, index) => <span key={`label-${point.name}-${index}`}>{index + 1}</span>)}</div>
              <div style={styles.lineHint}>Each point represents an expense in chronological order.</div>
            </div>}
          </div>
        )}
        {activeView === 'My Groups' && <div style={styles.groupBar}>
          <button style={styles.gbtn} onClick={() => openGroupDialog('create')}>+ New</button>
          <button style={styles.gbtn} onClick={() => openGroupDialog('join')}>Join</button>
        </div>}
        {activeView === 'My Expenses' && groupId && <div style={styles.groupBar}>
          <select style={styles.select} value={groupId} onChange={(event) => setGroupId(event.target.value)} aria-label="Select group">
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </div>}
        {activeView === 'My Groups' && <div style={styles.groupTable}>
          <div style={styles.tableHeader}><span>Group name</span><span>Invite code</span><span>Status</span></div>
          {groups.map((group) => <button key={group.id} style={styles.tableRow} onClick={() => setGroupId(group.id)}><span>{group.name}</span><span>{group.join_code}</span><span>{group.id === groupId ? 'Selected' : 'Open'}</span></button>)}
          {!groups.length && <div style={styles.empty}>No groups yet.</div>}
        </div>}
        {(activeView === 'My Groups' || activeView === 'My Expenses') && currentGroup && <div style={styles.codeLine}>Invite code: <b>{currentGroup.join_code}</b></div>}
        {(activeView === 'My Groups' || activeView === 'My Expenses') && groupId && <div style={styles.memberPanel}>
          <div style={styles.memberTitle}>People in this group ({members.length})</div>
          {members.map((member, index) => <div key={member.user_id} style={styles.memberRow}>{memberName(member, index)}{member.user_id === session.user.id ? ' (you)' : ''}</div>)}
        </div>}
        {(activeView === 'My Groups' || activeView === 'My Expenses') && groupId && <div style={styles.addRow}>
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
        {(activeView === 'My Groups' || activeView === 'My Expenses') && groupId && <button style={styles.customBtn} onClick={() => { setShowCustomSplit((visible) => !visible); setError(''); }}>+ Custom split</button>}
        {(activeView === 'My Groups' || activeView === 'My Expenses') && groupId && showCustomSplit && (
          <form style={styles.customPanel} onSubmit={addCustomExpense}>
            <div style={styles.dialogTitle}>Custom expense split</div>
            <input style={styles.input2} value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Expense name" aria-label="Expense name" />
            <input style={styles.input2} type="number" min="1" step="1" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} placeholder="Total amount" aria-label="Total amount" />
            <label style={styles.fieldLabel}>How many people are splitting this?</label>
            <input style={styles.input2} type="number" min="2" max="20" step="1" value={customPeopleCount} onChange={(event) => updateCustomPeopleCount(event.target.value)} aria-label="Number of people" />
            <div style={styles.customPeopleList}>
              {customPeople.map((person, index) => (
                <div style={styles.personBox} key={index}>
                  <div style={styles.personLabel}>{memberName(members[index] || {}, index)}</div>
                  <input style={styles.input2} value={person.name} onChange={(event) => updateCustomPerson(index, 'name', event.target.value)} placeholder="Person name" aria-label="Person name" />
                  <div style={styles.splitInputs}>
                    <input style={styles.percentInput} type="number" min="0" step="1" value={person.paidAmount} onChange={(event) => updateCustomPerson(index, 'paidAmount', event.target.value)} placeholder="Amount paid" aria-label={`${person.name || 'Person'} amount paid`} />
                    <input style={styles.reasonInput} value={person.reason} onChange={(event) => updateCustomPerson(index, 'reason', event.target.value)} placeholder="Reason for this split" aria-label="Reason for this split" />
                  </div>
                </div>
              ))}
            </div>
            <div style={styles.percentTotal}>Allocated: {inr(customPeople.reduce((sum, person) => sum + (Number(person.paidAmount) || 0), 0))} of {inr(Number(customAmount) || 0)}</div>
            <button type="submit" style={styles.authBtn}>Save custom split</button>
          </form>
        )}
        {(activeView === 'My Groups' || activeView === 'My Expenses') && !groupId && <div style={styles.empty}>Create a group or join one with an invite code.</div>}
        {error && <div style={styles.error} role="alert">{error}</div>}
        {(activeView === 'My Groups' || activeView === 'My Expenses') && <div style={styles.list}>
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
        </div>}
        {(activeView === 'My Groups' || activeView === 'My Expenses') && <div style={styles.total}>Total {inr(total)}</div>}
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
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px 48px', color: 'var(--text)' },
  authPage: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'linear-gradient(145deg, #d9f3ff 0%, #72c9f5 48%, #2874d8 100%)' },
  authCard: { width: '100%', maxWidth: 420, background: 'rgba(239, 250, 255, .96)', color: '#000', borderRadius: 24, boxShadow: '0 24px 60px -24px rgba(13, 61, 130, .45)', border: '1px solid rgba(255,255,255,.8)', padding: 20 },
  authHelp: { color: '#000', fontSize: 14, marginBottom: 16 },
  authMessage: { marginTop: 12, fontSize: 13, color: '#000' },
  authInput: { width: '100%', border: '1px solid #9aa8b5', borderRadius: 12, padding: '12px 14px', fontSize: 15, outline: 'none', background: '#fff', color: '#000', marginBottom: 10, boxSizing: 'border-box' },
  nav: { width: '100%', maxWidth: 420, display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 0 10px' },
  navBtn: { flex: 'none', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', background: 'var(--panel)', color: 'var(--text)', fontSize: 11, fontWeight: 800, cursor: 'pointer' },
  navBtnActive: { background: 'var(--accent)', color: '#fff' },
  card: { width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: 24, boxShadow: '0 24px 60px -24px rgba(13,27,62,.28)', border: '1px solid var(--line)', padding: 20, marginTop: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  brandStack: { display: 'flex', flexDirection: 'column', lineHeight: 1.05 },
  productName: { fontSize: 24, fontWeight: 900, letterSpacing: '.01em' },
  logo: { width: 46, height: 46, borderRadius: 12, objectFit: 'cover', display: 'block', border: '1px solid var(--line)' },
  title: { fontSize: 20, fontWeight: 800 },
  help: { color: 'var(--muted)', fontSize: 14, marginBottom: 16 },
  input: { flex: 1, border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px', fontSize: 15, outline: 'none', background: 'var(--panel)', color: 'var(--text)' },
  input2: { width: '100%', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', fontSize: 15, outline: 'none', background: 'var(--panel)', color: 'var(--text)', marginBottom: 10, boxSizing: 'border-box' },
  authRow: { display: 'flex', gap: 10, marginTop: 6 },
  authBtn: { flex: 1, border: 'none', borderRadius: 12, padding: 12, color: '#fff', fontSize: 15, fontWeight: 800, background: 'var(--accent)', cursor: 'pointer' },
  authBtnAlt: { flex: 1, border: '1px solid var(--line)', borderRadius: 12, padding: 12, color: 'var(--text)', fontSize: 15, fontWeight: 800, background: 'var(--panel)', cursor: 'pointer' },
  demoBtn: { width: '100%', border: '1px dashed var(--blue)', borderRadius: 12, padding: 11, marginTop: 10, color: 'var(--blue)', fontSize: 14, fontWeight: 800, background: '#fff', cursor: 'pointer' },
  signout: { border: '1px solid var(--line)', background: 'var(--panel)', borderRadius: 10, padding: '7px 13px', fontSize: 13, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer' },
  addRow: { display: 'flex', gap: 10, marginBottom: 16 },
  groupBar: { display: 'flex', gap: 8, marginBottom: 8 },
  select: { flex: 1, border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', fontSize: 14, fontWeight: 700, background: 'var(--panel)', color: 'var(--text)' },
  gbtn: { flex: 'none', border: '1px solid var(--line)', background: 'var(--panel)', borderRadius: 12, padding: '0 12px', fontSize: 13.5, fontWeight: 800, color: 'var(--accent)', cursor: 'pointer' },
  codeLine: { fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 },
  memberPanel: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 12px', marginBottom: 12 },
  memberTitle: { fontSize: 13, fontWeight: 800, marginBottom: 6 },
  memberRow: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6 },
  customBtn: { width: '100%', border: '1px dashed var(--accent)', borderRadius: 12, padding: 10, marginBottom: 14, color: 'var(--accent)', fontWeight: 800, background: 'var(--panel)', cursor: 'pointer' },
  customPanel: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 14, marginBottom: 14 },
  fieldLabel: { display: 'block', color: 'var(--muted)', fontSize: 12.5, fontWeight: 700, marginBottom: 6 },
  customPeopleList: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 },
  personBox: { background: 'var(--item)', border: '1px solid var(--line)', borderRadius: 12, padding: 10 },
  personLabel: { color: 'var(--text)', fontSize: 13, fontWeight: 800, marginBottom: 8 },
  splitInputs: { display: 'flex', gap: 8 },
  percentInput: { width: 76, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 8px', fontSize: 14, outline: 'none' },
  reasonInput: { flex: 1, minWidth: 0, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 8px', fontSize: 14, outline: 'none' },
  percentTotal: { color: 'var(--accent)', fontSize: 13, fontWeight: 800, marginBottom: 10 },
  settingsPanel: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, marginBottom: 14 },
  settlementPanel: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, marginBottom: 14 },
  infoPanel: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, marginBottom: 14, lineHeight: 1.8 },
  sectionTitle: { fontSize: 18, fontWeight: 800, marginBottom: 10 },
  settlementRow: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, padding: '10px 0', borderTop: '1px solid var(--line)' },
  settlementReason: { gridColumn: '1 / -1', color: 'var(--muted)', fontSize: 12.5 },
  addBtn: { flex: 'none', width: 48, borderRadius: 14, border: 'none', color: '#fff', fontSize: 24, fontWeight: 700, background: 'var(--accent)', cursor: 'pointer' },
  error: { color: '#b42318', fontSize: 13, margin: '-4px 0 14px' },
  message: { marginTop: 12, fontSize: 13, color: 'var(--blue)' },
  list: { display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 },
  empty: { color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' },
  item: { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--item)', border: '1px solid var(--line)', borderRadius: 16, padding: '12px 14px' },
  itemEmoji: { width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--panel)', border: '1px solid var(--line)', fontSize: 19, flex: 'none' },
  itemMain: { flex: 1, minWidth: 0 },
  itemName: { fontWeight: 700, fontSize: 15 },
  itemPaid: { color: 'var(--muted)', fontSize: 12.5, marginTop: 1 },
  itemAmount: { fontWeight: 800, fontSize: 15.5 },
  remove: { flex: 'none', width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' },
  total: { textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)', fontWeight: 800, fontSize: 16 },
  dialogBackdrop: { position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(13,27,62,.35)', zIndex: 10 },
  dialog: { width: '100%', maxWidth: 360, background: 'var(--panel)', borderRadius: 18, padding: 18, boxShadow: '0 20px 50px rgba(13,27,62,.25)' },
  dialogTitle: { fontWeight: 800, fontSize: 17, marginBottom: 14 },
  groupTable: { border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 14 },
  tableHeader: { display: 'grid', gridTemplateColumns: '1.3fr 1fr .7fr', gap: 8, padding: '9px 10px', background: 'var(--item)', color: 'var(--muted)', fontSize: 11, fontWeight: 800 },
  tableRow: { width: '100%', display: 'grid', gridTemplateColumns: '1.3fr 1fr .7fr', gap: 8, padding: '11px 10px', border: 0, borderTop: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--text)', textAlign: 'left', fontSize: 12, cursor: 'pointer' },
  profileHeader: { display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, marginBottom: 12, borderBottom: '1px solid var(--line)' },
  avatar: { width: 58, height: 58, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent)' },
  avatarFallback: { width: 58, height: 58, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: '#fff', fontSize: 24, fontWeight: 800 },
  uploadLabel: { display: 'block', border: '1px dashed var(--accent)', borderRadius: 10, padding: 10, marginBottom: 10, color: 'var(--accent)', fontSize: 13, fontWeight: 700, textAlign: 'center', cursor: 'pointer' },
  fileInput: { display: 'none' },
  themeLabel: { margin: '14px 0 6px', fontSize: 13, fontWeight: 800 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 18 },
  statsGridItem: { background: 'var(--item)', borderRadius: 10, padding: 8 },
  chartTitle: { fontSize: 14, fontWeight: 800, marginBottom: 10 },
  graphGrid: { display: 'grid', gridTemplateColumns: 'minmax(130px, .9fr) minmax(0, 1.1fr)', gap: 16, alignItems: 'start' },
  pieChart: { width: 132, height: 132, borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '4px auto 12px' },
  pieHole: { width: 74, height: 74, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--panel)', color: 'var(--text)', fontSize: 12, fontWeight: 800, textAlign: 'center', padding: 6 },
  legend: { display: 'flex', flexDirection: 'column', gap: 5 },
  legendRow: { display: 'grid', gridTemplateColumns: '9px 1fr auto', alignItems: 'center', gap: 5, color: 'var(--muted)', fontSize: 10.5 },
  legendDot: { width: 8, height: 8, borderRadius: '50%' },
  chartRow: { marginBottom: 10 },
  chartLabel: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 },
  chartTrack: { height: 10, borderRadius: 99, background: 'var(--item)', overflow: 'hidden' },
  chartBar: { height: '100%', borderRadius: 99, background: 'var(--accent)' },
  lineGraph: { marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' },
  chartSvg: { width: '100%', height: 'auto', display: 'block', overflow: 'visible' },
  lineLabels: { display: 'flex', justifyContent: 'space-between', padding: '0 5%', color: 'var(--muted)', fontSize: 10 },
  lineHint: { color: 'var(--muted)', fontSize: 11, marginTop: 8 },
  analysis: { marginTop: 16, padding: 10, borderRadius: 10, background: 'var(--item)', color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.5 },
};
