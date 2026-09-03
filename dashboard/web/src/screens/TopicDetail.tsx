import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Chip, EmptyState, ErrorState, Eyebrow, LoadingRows, Provenance } from '../components/Desk';
import { useQuery } from '../lib/api';
import { compact, formatDate, sourceKind, titleCase } from '../lib/desk';
import './topics.css';

type Claim = { event_id:string; position:number; text:string; primary_category:string; significance:number; subject_date:string; source_id:string; source_title?:string; source_label?:string; source_channel?:string; source_type?:string };

export function TopicDetail(){
  const {tag=''}=useParams(); const topic=decodeURIComponent(tag); const result=useQuery<any>(`/topics?tag=${encodeURIComponent(topic)}`,[topic]);
  const [sourceType,setSourceType]=useState('All'); const [window,setWindow]=useState('All time');
  const claims:Claim[]=result.data?.claims??[];
  const sourceTypes=useMemo(()=>['All',...new Set(claims.map((claim)=>sourceKind(claim.source_type)))],[claims]);
  const visible=claims.filter((claim)=>{if(sourceType!=='All'&&sourceKind(claim.source_type)!==sourceType)return false;if(window==='Last 30d'||window==='Last 90d'){const days=window==='Last 30d'?30:90;return Date.now()-new Date(`${claim.subject_date}T00:00:00Z`).getTime()<=days*86400000}return true});
  const groups=useMemo(()=>Array.from(new Set(visible.map((claim)=>claim.primary_category))).map((category)=>({category,items:visible.filter((claim)=>claim.primary_category===category)})),[visible]);
  if(result.loading&&!result.data)return <LoadingRows rows={7}/>; if(result.error)return <ErrorState error={result.error} retry={result.refetch}/>;
  return <section><Link className="topic-back" to="/">← all topics</Link>
    <div className="topic-exact-head"><h1>{titleCase(topic)}</h1><p>{claims.length} claims · {new Set(claims.map((item)=>item.source_channel||item.source_label)).size} speakers · {result.data?.sources?.length??0} sources</p></div>
    <div className="topic-exact-layout"><div><Eyebrow>Where the argument sits</Eyebrow><div className="topic-stance-bar">{groups.map((group,index)=><span key={group.category} style={{width:`${Math.max(8,group.items.length/Math.max(1,visible.length)*100)}%`}}>{String.fromCharCode(65+index)} · {Math.round(group.items.length/Math.max(1,visible.length)*100)}%</span>)}</div><p className="topic-stance-note">Share of filed claims per position.</p>
      {visible.length===0?<EmptyState title="No claims match those filters">Choose another window or source type.</EmptyState>:groups.map((group)=><div className="topic-position" key={group.category}><h2>{titleCase(group.category)}</h2><p className="topic-position-meta">{group.items.length} claims · grounded in stored sources</p>{group.items.map((claim)=><article key={`${claim.event_id}-${claim.position}`}><p>{claim.text}</p><Provenance source={claim.source_channel||claim.source_label||compact(claim.source_title,56)} kind={sourceKind(claim.source_type)} when={formatDate(claim.subject_date)}/></article>)}</div>)}
    </div><aside><Filter label="Window" values={['All time','Last 30d','Last 90d']} active={window} setActive={setWindow}/><Filter label="Source type" values={sourceTypes} active={sourceType} setActive={setSourceType}/></aside></div>
  </section>;
}
function Filter({label,values,active,setActive}:{label:string;values:string[];active:string;setActive:(value:string)=>void}){return <div className="topic-exact-filter"><Eyebrow>{label}</Eyebrow>{values.map((value)=><Chip key={value} active={active===value} onClick={()=>setActive(value)}>{value}</Chip>)}</div>}
