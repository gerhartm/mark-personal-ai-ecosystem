import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '../lib/api';

const NAV=[
  {idx:'01',label:'Topics',to:'/',end:true},
  {idx:'02',label:'Timeline',to:'/timeline'},
  {idx:'03',label:'Prep',to:'/prep'},
  {idx:'04',label:'Haseeb bot',to:'/haseeb'},
  {idx:'05',label:'Tarun bot',to:'/tarun'},
];

export function Shell({children}:{children:React.ReactNode}){
  const location=useLocation();
  const brief=useQuery<any>('/brief');
  const [theme,setTheme]=useState<'light'|'dark'>(()=>document.documentElement.dataset.theme==='dark'?'dark':'light');
  useEffect(()=>{window.scrollTo({top:0})},[location.pathname]);
  const toggleTheme=()=>{const next=theme==='dark'?'light':'dark';setTheme(next);document.documentElement.dataset.theme=next;document.documentElement.style.colorScheme=next;localStorage.setItem('theme',next)};
  const counts=brief.data?.counts;
  return <div className="grid min-h-screen grid-cols-1 bg-background font-sans text-foreground md:grid-cols-[206px_1fr]">
    <aside className="flex flex-col border-b border-[var(--line)] bg-background py-5 md:sticky md:top-0 md:h-screen md:border-r md:border-b-0 md:py-[22px]">
      <div className="px-5 pb-4 md:pb-[26px]"><div className="text-sm font-bold tracking-tight">Intel Desk</div><div className="mt-[5px] font-mono text-[9.5px] tracking-[0.09em] uppercase text-dim">Private · single seat</div></div>
      <nav aria-label="Surfaces" className="flex flex-row flex-wrap gap-px px-3.5 md:flex-col md:px-2.5">{NAV.map((item)=><NavLink key={item.to} to={item.to} end={item.end} className={({isActive})=>`flex items-baseline gap-2.5 rounded-lg px-2.5 py-[9px] text-[13.5px] font-medium transition-all duration-200 ${isActive?'bg-[var(--panel-2)] text-foreground shadow-[var(--shadow-card)]':'text-muted-foreground hover:bg-[var(--panel)] hover:text-foreground'}`}>{({isActive})=><><span className={`font-mono text-[9.5px] ${isActive?'text-[var(--brass)]':'text-dim'}`}>{item.idx}</span>{item.label}</>}</NavLink>)}</nav>
      <div className="mt-auto hidden px-5 pt-6 md:block"><div className="border-t border-[var(--line)] pt-3.5 font-mono text-[10px] leading-[1.7] text-dim"><span className="mr-1.5 inline-block h-[5px] w-[5px] rounded-full bg-[var(--cyan)] align-middle"/><strong className="font-medium text-muted-foreground">Telegram bot live</strong>{counts?<><br/>{counts.forwards} forwards · {counts.transcripts} transcripts<br/>→ term {counts.claims} claims</>:<><br/>Reading live corpus</>}<button className="mt-3 flex items-center gap-2 border-0 bg-transparent p-0 font-mono text-[9.5px] text-dim" type="button" onClick={toggleTheme}><span className="inline-block h-[9px] w-4 rounded-full border border-[var(--line-strong)] bg-[var(--panel-2)]"/>{theme==='dark'?'Light mode':'Dark mode'}</button></div></div>
    </aside>
    <main id="main" className="max-w-[1140px] px-5 pt-6 pb-20 md:px-10 md:pt-[34px] md:pb-[90px]"><div className="desk-rise">{children}</div></main>
  </div>;
}
