import {NextResponse} from 'next/server'
import crypto from 'node:crypto'
import {getCase,saveCase} from '@/lib/proofmesh/store'
export const runtime='nodejs'
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const c=await getCase(id)
  if(!c)return NextResponse.json({error:'Case not found'},{status:404})
  const investigationId=new URL(req.url).searchParams.get('investigationId')
  const inv=investigationId?c.investigations.find(x=>x.id===investigationId):c.investigations.at(-1)
  if(!inv?.callId||!process.env.CALLE_API_KEY)return NextResponse.json({case:c,investigation:inv})
  const res=await fetch(`https://api.heycall-e.com/v1/calls/${inv.callId}`,{headers:{Authorization:`Bearer ${process.env.CALLE_API_KEY}`}})
  if(!res.ok)return NextResponse.json({error:await res.text()},{status:502})
  const task=await res.json()
  inv.status=task.status==='completed'?'completed':task.status==='in_progress'?'in_progress':task.status==='failed'?'failed':'queued'
  if(task.structured_result){
    const nextClaim=String(task.structured_result.supplier_claim||task.summary||'').trim()
    inv.supplierClaim=nextClaim
    inv.requestedEvidence=task.structured_result.requested_evidence||[]
    if(nextClaim&&!c.claims.some(x=>x.type==='supplier_statement'&&x.sourceId===inv.id))c.claims.push({id:crypto.randomUUID(),sourceId:inv.id,sourceName:`CALL-E · ${inv.contactName}`,type:'supplier_statement',subject:'supplier',predicate:'statement',value:nextClaim,confidence:Math.min(.35,Number(task.structured_result.confidence)||.35),extractedBy:'call'})
  }
  const attempt=task.recipients?.[0]?.attempts?.at(-1)
  if(attempt?.transcript_turns)inv.transcript=attempt.transcript_turns.map((x:any)=>({role:x.speaker==='bot'?'agent':'human',text:x.text,timestampSeconds:x.offset_seconds}))
  await saveCase(c)
  return NextResponse.json({case:c,investigation:inv})
}
