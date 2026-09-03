import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chip, ErrorState, LoadingRows, ViewHead } from '../components/Desk';
import { useQuery } from '../lib/api';
import { titleCase } from '../lib/desk';

type Topic={tag:string;event_count:number;source_count:number;latest_subject_date:string|null;max_significance:number};
export function Topics(){
  const result=useQuery<{topics:Topic[]}>('/topics'); const [active,setActive]=useState<string[]>([]); const topics=result.data?.topics??[];
  const allTags=useMemo(()=>['high signal','recent','established'],[]);
  const visible=topics.filter((topic)=>active.length===0||active.some((tag)=>tag==='high signal'?topic.max_significance>=4:tag==='recent'?Boolean(topic.latest_subject_date&&new Date(topic.latest_subject_date).getUTCFullYear()>=new Date().getUTCFullYear()-1):topic.source_count>=2));
  const toggle=(tag:string)=>setActive((current)=>current.includes(tag)?current.filter((item)=>item!==tag):[...current,tag]);
  if(result.loading&&!result.data)return <LoadingRows rows={8}/>; if(result.error)return <ErrorState error={result.error} retry={result.refetch}/>;
  return <section><ViewHead title="Topics"/><div className="mb-5 flex flex-wrap items-center gap-1.5"><Chip active={active.length===0} onClick={()=>setActive([])}>all</Chip>{allTags.map((tag)=><Chip key={tag} active={active.includes(tag)} onClick={()=>toggle(tag)}>{tag}</Chip>)}</div>
    <div className="mb-3 font-mono text-[9.5px] text-dim">{visible.length} of {topics.length} topics{active.length?` · tagged ${active.join(' or ')}`:''}</div>
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visible.map((topic)=><Link key={topic.tag} to={`/topics/${encodeURIComponent(topic.tag)}`} className="group flex flex-col rounded-lg border-2 border-[var(--line-strong)] bg-card p-3.5 transition-colors hover:border-[var(--brass)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brass)]">
      <div className="mb-2.5 flex items-start justify-between gap-2"><h2 className="text-[13px] font-medium leading-tight tracking-tight text-foreground">{titleCase(topic.tag)}</h2><span className={`shrink-0 font-mono text-[9px] tracking-[0.05em] ${topic.max_significance>=4?'text-[var(--rose)]':'text-[var(--sage)]'}`}>{topic.max_significance>=4?'●':'▲'}</span></div>
      <div className="mt-auto flex flex-wrap items-center gap-1"><span className="rounded-[3px] bg-surface-800 px-1.5 py-[2px] font-mono text-[10px] font-medium text-foreground/70">{topic.source_count>1?'multi-source':'single-source'}</span><span className="rounded-[3px] bg-surface-800 px-1.5 py-[2px] font-mono text-[10px] font-medium text-foreground/70">{topic.max_significance>=4?'high signal':'tracked'}</span></div>
      <div className="mt-2.5 flex items-baseline justify-between pt-2"><div className="font-mono text-[9.5px] leading-none text-dim"><b className="font-medium text-muted-foreground">{topic.event_count}</b> claims</div><div className="font-mono text-[9px] tracking-[0.05em] text-dim">{topic.source_count} sources</div></div>
    </Link>)}</div></section>;
}
