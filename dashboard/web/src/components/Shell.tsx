import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { IconSettings } from './icons';

const NAV=[
  {idx:'01',label:'Topics',to:'/',end:true},
  {idx:'02',label:'Timeline',to:'/timeline'},
  {idx:'03',label:'Prep',to:'/prep'},
  {idx:'04',label:'Haseeb bot',to:'/haseeb'},
  {idx:'05',label:'Tarun bot',to:'/tarun'},
];
const UTILITY=[
  {to:'/sources',label:'Sources and imports'},
  {to:'/saved',label:'Saved work'},
];
const pageLabel=(path:string)=>{
  if(path==='/'||path.startsWith('/topics/'))return 'Topics';
  return [...NAV,...UTILITY,{to:'/control-center',label:'Control center'}].find((item)=>item.to!=='/'&&path.startsWith(item.to))?.label;
};

type TelegramSync = {
  received: number;
  synced: number;
  ready: number;
  processing: number;
  failed: number;
  updated_at: string | null;
  configured: boolean;
};

type BriefResponse = {
  telegram_sync: TelegramSync;
  evidence_processing: { ready: number; processing: number; failed: number };
};

export function Shell({children}:{children:React.ReactNode}){
  const location=useLocation();
  const brief=useQuery<BriefResponse>('/brief');
  const [theme,setTheme]=useState<'light'|'dark'>(()=>document.documentElement.dataset.theme==='dark'?'dark':'light');
  const [menuOpen,setMenuOpen]=useState(false);
  useEffect(()=>{window.scrollTo({top:0});setMenuOpen(false)},[location.pathname]);
  useEffect(()=>{
    if(!menuOpen)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenuOpen(false)};
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[menuOpen]);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==='visible')brief.refetch()};
    const timer=window.setInterval(refresh,5_000);
    document.addEventListener('visibilitychange',refresh);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh)};
  },[brief.refetch]);
  const toggleTheme=()=>{const next=theme==='dark'?'light':'dark';setTheme(next);document.documentElement.dataset.theme=next;document.documentElement.style.colorScheme=next;localStorage.setItem('theme',next)};
  const sync=brief.data?.telegram_sync;
  const evidence=brief.data?.evidence_processing;
  const syncState=brief.error||sync?.configured===false
    ?{label:'Telegram sync unavailable',color:'var(--dim)'}
    :(sync?.failed || evidence?.failed)
      ?{label:'Sources need attention',color:'var(--rose)'}
      :(sync?.processing || evidence?.processing)
        ?{label:'Source processing active',color:'var(--brass)'}
        :sync
          ?{label:'Sources processed',color:'var(--cyan)'}
          :{label:'Reading live sync',color:'var(--dim)'};
  const current=pageLabel(location.pathname);
  return <div className="grid min-h-screen grid-cols-1 bg-background font-sans text-foreground md:grid-cols-[206px_1fr]">
    <aside className="sticky top-0 z-30 flex flex-col border-b border-[var(--line)] bg-background md:h-screen md:border-r md:border-b-0 md:py-[22px]">
      {/* On phones the sidebar collapses into a top bar with a menu. */}
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 md:block md:min-h-0 md:px-5 md:pb-[26px]">
        <div className="min-w-0"><div className="text-sm font-bold tracking-tight">Intel Desk{current?<span className="font-normal text-dim md:hidden"> / {current}</span>:null}</div><div className="mt-[5px] hidden font-mono text-[11px] tracking-[0.09em] uppercase text-dim md:block">Private · single seat</div></div>
        <button type="button" aria-expanded={menuOpen} aria-controls="site-menu" onClick={()=>setMenuOpen((open)=>!open)} className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--line-strong)] px-3 text-[13px] font-medium md:hidden">
          <span>{menuOpen?'Close':'Menu'}</span>
          <span aria-hidden="true" className="font-mono text-[15px] leading-none">{menuOpen?'×':'≡'}</span>
        </button>
      </div>
      <div id="site-menu" className={`${menuOpen?'flex':'hidden'} max-h-[calc(100dvh-3.5rem)] flex-col overflow-y-auto border-t border-[var(--line)] pt-2 pb-4 md:flex md:max-h-none md:flex-1 md:overflow-visible md:border-t-0 md:p-0`}>
      <nav aria-label="Surfaces" className="flex flex-col gap-px px-2.5">{NAV.map((item)=><NavLink key={item.to} to={item.to} end={item.end} className={({isActive})=>`flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-[14px] font-medium transition-all duration-200 md:min-h-0 md:items-baseline md:text-[13.5px] ${isActive?'bg-[var(--panel-2)] text-foreground shadow-[var(--shadow-card)]':'text-muted-foreground hover:bg-[var(--panel)] hover:text-foreground'}`}>{({isActive})=><><span className={`font-mono text-[11px] ${isActive?'text-[var(--accent-text)]':'text-dim'}`}>{item.idx}</span>{item.label}</>}</NavLink>)}</nav>
      <div className="mt-4 px-2.5 md:mt-auto md:pt-5">
        <div className="mb-2 flex flex-col gap-px">{UTILITY.map(item => <NavLink key={item.to} to={item.to} className={({isActive})=>`flex min-h-11 items-center rounded-lg px-2.5 py-2 text-[13px] md:min-h-0 md:text-[12.5px] ${isActive?'bg-[var(--panel-2)] text-foreground':'text-muted-foreground hover:bg-[var(--panel)]'}`}>{item.label}</NavLink>)}</div>
        <div className="border-t border-[var(--line)] pt-3">
          <NavLink aria-label="Control center" to="/control-center" className={({isActive})=>`flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium no-underline transition-all duration-200 ${isActive?'bg-[var(--panel-2)] text-foreground shadow-[var(--shadow-card)]':'text-muted-foreground hover:bg-[var(--panel)] hover:text-foreground'}`}>
            {({isActive})=><><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${isActive?'border-[var(--brass)] text-[var(--accent-text)]':'border-[var(--line)] text-dim'}`}><IconSettings/></span><span className="min-w-0"><span className="block leading-tight">Control center</span><span className="mt-1 block whitespace-nowrap font-mono text-[11px] font-normal uppercase tracking-[0.04em] text-dim">Page instructions</span></span></>}
          </NavLink>
        </div>
        <div aria-live="polite" className="mt-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-3 shadow-[var(--shadow-card)] " data-testid="telegram-sync-status">
          <div className="flex items-center gap-2 font-mono text-[11px]"><span className="inline-block h-[6px] w-[6px] shrink-0 rounded-full" style={{backgroundColor:syncState.color}}/><strong className="font-medium text-muted-foreground">{syncState.label}</strong></div>
          {sync?<dl className="mt-2.5 grid grid-cols-4 md:grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--line)] pt-2.5 font-mono"><div><dd className="text-[13px] font-medium tabular-nums text-foreground">{sync.received}</dd><dt className="mt-0.5 text-[10px] md:text-[11px] uppercase tracking-[0.05em] text-dim">received</dt></div><div><dd className="text-[13px] font-medium tabular-nums text-foreground">{evidence?.ready ?? 0}</dd><dt className="mt-0.5 text-[10px] md:text-[11px] uppercase tracking-[0.05em] text-dim">processed</dt></div><div><dd className="text-[13px] font-medium tabular-nums text-foreground">{sync.processing + (evidence?.processing ?? 0)}</dd><dt className="mt-0.5 text-[10px] md:text-[11px] uppercase tracking-[0.05em] text-dim">processing</dt></div><div><dd className="text-[13px] font-medium tabular-nums text-foreground">{sync.failed + (evidence?.failed ?? 0)}</dd><dt className="mt-0.5 text-[10px] md:text-[11px] uppercase tracking-[0.05em] text-dim">failed</dt></div></dl>:<div className="mt-2.5 border-t border-[var(--line)] pt-2.5 font-mono text-[11px] leading-relaxed text-dim">Waiting for current status</div>}
        </div>
        <button aria-label="Dark mode" aria-pressed={theme==='dark'} className="mt-1.5 flex min-h-11 w-full items-center justify-between rounded-lg border-0 bg-transparent px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-[var(--panel)] hover:text-foreground" type="button" onClick={toggleTheme}><span>Dark mode</span><span aria-hidden="true" className={`flex h-5 w-9 items-center rounded-full border p-[2px] ${theme==='dark'?'justify-end border-[var(--brass)] bg-[color-mix(in_srgb,var(--brass)_18%,transparent)]':'justify-start border-[var(--line-strong)] bg-[var(--panel-2)]'}`}><span className={`block h-[14px] w-[14px] rounded-full ${theme==='dark'?'bg-[var(--brass)]':'bg-[var(--dim)]'}`}/></span></button>
      </div>
      </div>
    </aside>
    <main id="main" className="min-w-0 max-w-[1140px] px-5 pt-6 pb-20 md:px-10 md:pt-[34px] md:pb-[90px]"><div className="desk-rise">{children}</div></main>
  </div>;
}
