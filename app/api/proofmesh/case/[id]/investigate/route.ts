import {NextResponse} from 'next/server'
import crypto from 'node:crypto'
import {getCase,saveCase} from '@/lib/proofmesh/store'
import type {Investigation} from '@/lib/proofmesh/types'
export const runtime='nodejs'

const schema={
  type:'object',
  additionalProperties:false,
  required:['supplier_claim','requested_evidence','confidence'],
  properties:{
    supplier_claim:{type:'string',description:'The contact explanation as a claim, not verified evidence.'},
    requested_evidence:{type:'string',description:'A concise semicolon-separated list of documents or records that could verify the claim.'},
    confidence:{type:'string',description:'Low, medium, or high confidence in the supplier statement.'}
  }
}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const{id}=await params
  const c=await getCase(id)
  if(!c)return NextResponse.json({error:'Case not found'},{status:404})
  const body=await req.json()
  const finding=c.findings.find(f=>f.id===body.findingId)
  if(!finding)return NextResponse.json({error:'Finding not found'},{status:404})
  const active=c.investigations.find(i=>i.findingId===finding.id&&['draft','approved','queued','in_progress'].includes(i.status))
  if(active)return NextResponse.json({error:'An investigation is already active for this finding.',case:c,investigation:active},{status:409})
  const phone=String(body.phone||'').trim()
  if(!/^\+[1-9][0-9]{7,14}$/.test(phone))return NextResponse.json({error:'Enter an authorized E.164 phone number, for example +919876543210.'},{status:400})

  const investigation:Investigation={
    id:crypto.randomUUID(),findingId:finding.id,phone,contactName:String(body.contactName||'supplier contact'),status:'draft',
    goal:`Investigate ProofMesh finding: ${finding.title}. Explain the discrepancy using only facts available to you. If you claim that additional goods/documents exist, identify the document or record that can prove it. Do not claim the issue is verified. Missing evidence: ${finding.missingEvidence.join('; ')}`,
    createdAt:new Date().toISOString()
  }
  c.investigations.push(investigation)
  finding.status='investigating';c.status='investigating';c.summary.unresolved=c.findings.filter(f=>f.status==='unresolved'||f.status==='investigating').length
  await saveCase(c)

  const key=process.env.CALLE_API_KEY?.trim()
  if(!key){
    investigation.status='failed';await saveCase(c)
    return NextResponse.json({error:'CALL-E is not configured on the server. Set CALLE_API_KEY in Render Environment.',case:c,investigation},{status:503})
  }

  try{
    // CALL-E production API uses /v2/calls. The older /v1/calls recipient payload
    // is no longer the current wire contract.
    const res=await fetch('https://api.heycall-e.com/v2/calls',{
      method:'POST',
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`proofmesh-${investigation.id}`},
      body:JSON.stringify({
        task:investigation.goal,
        phone,
        region:String(body.region||'IN'),
        locale:String(body.locale||'en-IN'),
        result_schema:schema,
        metadata:{proofmesh_case_id:c.id,finding_id:finding.id,investigation_id:investigation.id}
      })
    })
    const raw=await res.text()
    if(!res.ok){
      let detail=raw
      try{const parsed=JSON.parse(raw);detail=JSON.stringify(parsed)}catch{}
      throw new Error(`HTTP ${res.status}: ${detail}`)
    }
    const task=JSON.parse(raw) as {id?:string;status?:string}
    if(!task.id)throw new Error('CALL-E accepted the request but returned no call id.')
    investigation.status=task.status==='completed'?'completed':task.status==='in_progress'?'in_progress':'queued'
    investigation.callId=task.id
    await saveCase(c)
    return NextResponse.json({case:c,investigation})
  }catch(e){
    investigation.status='failed';await saveCase(c)
    return NextResponse.json({error:`CALL-E request failed: ${e instanceof Error?e.message:'unknown error'}`,case:c,investigation},{status:502})
  }
}
