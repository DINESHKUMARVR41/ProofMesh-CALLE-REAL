import {NextResponse} from 'next/server'
import crypto from 'node:crypto'
import {getCase,saveCase} from '@/lib/proofmesh/store'
export const runtime='nodejs'

function parseRequestedEvidence(value:unknown):string[]{
  if(Array.isArray(value))return value.map(String).map(x=>x.trim()).filter(Boolean)
  if(typeof value==='string')return value.split(';').map(x=>x.trim()).filter(Boolean)
  return []
}

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const c=await getCase(id)
  if(!c)return NextResponse.json({error:'Case not found'},{status:404})
  const investigationId=new URL(req.url).searchParams.get('investigationId')
  const inv=investigationId?c.investigations.find(x=>x.id===investigationId):c.investigations.at(-1)
  if(!inv?.callId||!process.env.CALLE_API_KEY)return NextResponse.json({case:c,investigation:inv})

  const res=await fetch(`https://api.heycall-e.com/v2/calls/${encodeURIComponent(inv.callId)}`,{headers:{Authorization:`Bearer ${process.env.CALLE_API_KEY.trim()}`}})
  const raw=await res.text()
  if(!res.ok)return NextResponse.json({error:`CALL-E status request failed: HTTP ${res.status}: ${raw}`,case:c,investigation:inv},{status:502})
  const task=JSON.parse(raw) as {
    status?:string; result_status?:string; result?:Record<string,unknown>|null; error?:unknown;
    transcript?:Array<{speaker?:string;text?:string;occurred_at?:string}>
  }
  inv.status=task.status==='completed'?'completed':task.status==='in_progress'?'in_progress':task.status==='failed'?'failed':task.status==='canceled'?'failed':'queued'

  const result=task.result||null
  if(result){
    const nextClaim=String(result.supplier_claim||'').trim()
    inv.supplierClaim=nextClaim
    inv.requestedEvidence=parseRequestedEvidence(result.requested_evidence)
    if(nextClaim&&!c.claims.some(x=>x.type==='supplier_statement'&&x.sourceId===inv.id))c.claims.push({id:crypto.randomUUID(),sourceId:inv.id,sourceName:`CALL-E · ${inv.contactName}`,type:'supplier_statement',subject:'supplier',predicate:'statement',value:nextClaim,confidence:.35,extractedBy:'call'})
  }

  if(Array.isArray(task.transcript)){
    inv.transcript=task.transcript.map((x,i)=>({role:x.speaker==='assistant'||x.speaker==='agent'?'agent':'human',text:x.text??'',timestampSeconds:x.occurred_at?Math.max(0,(Date.parse(x.occurred_at)-Date.parse(inv.createdAt))/1000):i}))
  }
  if(task.result_status==='unavailable'&&inv.status!=='failed')inv.status='failed'
  await saveCase(c)
  return NextResponse.json({case:c,investigation:inv,call:{status:task.status,resultStatus:task.result_status,error:task.error||null}})
}
