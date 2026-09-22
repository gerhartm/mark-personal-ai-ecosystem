import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chip, ErrorState, LoadingRows, ViewHead } from '../components/Desk';
import { useQuery } from '../lib/api';
import { titleCase } from '../lib/desk';

type Topic={tag:string;title?:string;event_count:number;claim_count:number;category_count:number;source_count:number;position_count:number;latest_subject_date:string|null;max_significance:number;tags:string[]};
export function Topics(){
  const result=useQuery<{topics:Topic[]}>('/topics', [], 10_000); const [active,setActive]=useState<string[]>([]); const [search,setSearch]=useState(''); const topics=result.data?.topics??[];
  const allTags=useMemo(()=>Array.from(new Set(topics.flatMap((topic)=>topic.tags))).sort((a,b)=>titleCase(a).localeCompare(titleCase(b))),[topics]);
  const visible=topics.filter((topic)=>(active.length===0||active.some((tag)=>topic.tags.includes(tag)))&&`${topic.title||topic.tag} ${topic.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const toggle=(tag:string)=>setActive((current)=>current.includes(tag)?current.filter((item)=>item!==tag):[...current,tag]);
  if(result.loading&&!result.data)return <LoadingRows rows={8}/>; if(result.error)return <ErrorState error={result.error} retry={result.refetch}/>;
  return <section><ViewHead title="Topics" actions={<input aria-label="Find topics" placeholder="Find a topic" value={search} onChange={event=>setSearch(event.target.value)} className="rounded border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[12px] text-foreground"/>}/><div className="mb-5 flex flex-wrap items-center gap-1.5"><Chip active={active.length===0} onClick={()=>setActive([])}>all</Chip>{allTags.map((tag)=><Chip key={tag} active={active.includes(tag)} onClick={()=>toggle(tag)}>{titleCase(tag)}</Chip>)}</div>
    <div className="mb-3 font-mono text-[9.5px] text-dim">{visible.length} of {topics.length} topics{active.length?` · tagged ${active.join(' or ')}`:''}</div>
    <p className="mb-4 font-mono text-[10px] text-dim">Updates as source processing completes. <Link className="text-[var(--brass)]" to="/sources">View sources and processing</Link></p>
    {!visible.length ? <p>No topics match these filters.</p> : null}
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visible.map((topic)=><Link key={topic.tag} to={`/topics/${encodeURIComponent(topic.tag)}`} className="group flex flex-col rounded-lg border-2 border-[var(--line-strong)] bg-card p-3.5 transition-colors hover:border-[var(--brass)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brass)]">
      <div className="mb-2.5 flex items-start justify-between gap-2"><h2 className="text-[13px] font-medium leading-tight tracking-tight text-foreground">{topic.title??titleCase(topic.tag)}</h2><span className={`shrink-0 font-mono text-[9px] tracking-[0.05em] ${topic.max_significance>=4?'text-[var(--rose)]':'text-[var(--sage)]'}`}>{topic.max_significance>=4?'●':'▲'}</span></div>
      <div className="mt-auto flex flex-wrap items-center gap-1">{topic.tags.slice(0,2).map((tag)=><span key={tag} className="rounded-[3px] bg-surface-800 px-1.5 py-[2px] font-mono text-[10px] font-medium text-foreground/70">{titleCase(tag)}</span>)}</div>
      <div className="mt-2.5 flex items-baseline justify-between pt-2"><div className="font-mono text-[9.5px] leading-none text-dim"><b className="font-medium text-muted-foreground">{topic.claim_count}</b> {topic.claim_count===1?'claim':'claims'}</div><div className="font-mono text-[9px] tracking-[0.05em] text-dim">{topic.source_count} {topic.source_count===1?'source':'sources'}</div></div>
    </Link>)}</div></section>;
}
