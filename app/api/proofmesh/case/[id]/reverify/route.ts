import {NextResponse} from 'next/server'
import {getCase,saveCase} from '@/lib/proofmesh/store'
import {buildGraph,verify} from '@/lib/proofmesh/engine'
export const runtime='nodejs'
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const c=await getCase(id)
  if(!c)return NextResponse.json({error:'Case not found'},{status:404})
  const previous=c.findings
  const {nodes,edges}=buildGraph(c.documents,c.claims)
  const next=verify(c.documents,c.claims)
  for(const old of previous){
    const replacement=next.find(f=>f.type===old.type)
    if(!replacement&&old.status!=='rejected'){
      old.status='resolved'
      old.resolution='The latest evidence no longer reproduces this finding.'
    }
  }
  for(const f of next){
    const old=previous.find(x=>x.type===f.type)
    if(old){f.id=old.id;f.status=old.status==='rejected'?'rejected':old.status;f.resolution=old.resolution}
  }
  const resolvedPrevious=previous.filter(old=>old.status!=='rejected'&&!next.some(f=>f.type===old.type)).map(old=>({...old,status:'resolved' as const,resolution:old.resolution||'Resolved because the latest documentary evidence no longer reproduces this contradiction.'}))
  c.nodes=nodes; c.edges=edges; c.findings=[...next,...resolvedPrevious]
  c.summary={
    totalClaims:c.claims.length,
    findings:c.findings.length,
    unresolved:c.findings.filter(x=>x.status==='unresolved'||x.status==='investigating').length,
    verified:c.findings.filter(x=>x.status==='resolved').length
  }
  c.status=c.summary.unresolved?'investigating':'resolved'
  await saveCase(c)
  return NextResponse.json({case:c})
}
