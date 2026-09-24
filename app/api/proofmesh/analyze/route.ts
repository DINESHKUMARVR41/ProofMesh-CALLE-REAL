import {NextResponse} from 'next/server'
import crypto from 'node:crypto'
import {extractClaims,extractText,inferKind,persistUpload,sha256} from '@/lib/proofmesh/extract'
import {makeCase} from '@/lib/proofmesh/engine'
import {geminiClaims} from '@/lib/proofmesh/gemini'
import {saveCase} from '@/lib/proofmesh/store'
import type {SourceDocument} from '@/lib/proofmesh/types'
export const runtime='nodejs'

export async function POST(req:Request){
 try{
  const form=await req.formData()
  const files=form.getAll('files').filter(x=>x instanceof File) as File[]
  if(!files.length)return NextResponse.json({error:'Upload at least one document.'},{status:400})
  if(files.length>12)return NextResponse.json({error:'Maximum 12 documents per case.'},{status:400})
  const docs:SourceDocument[]=[]
  const allClaims:ReturnType<typeof extractClaims>=[]
  const analysisDocs:Array<{documentId:string;name:string;method:'gemini'|'rules';geminiError?:string}> = []
  const geminiConfigured=Boolean(process.env.GEMINI_API_KEY?.trim())

  for(const file of files){
   const bytes=Buffer.from(await file.arrayBuffer())
   if(bytes.length>15*1024*1024)throw new Error(`${file.name} is larger than 15 MB.`)
   const id=crypto.randomUUID(); const hash=await sha256(bytes)
   let text=''; let pageCount:number|undefined
   try{
    const r=await extractText(file.name,file.type,bytes);text=r.text;pageCount=r.pageCount
   }catch(e){
    if(!geminiConfigured||!file.type.startsWith('image/'))throw e
    const b64=bytes.toString('base64')
    const rr=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL||'gemini-2.5-flash'}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY!.trim())}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{inlineData:{mimeType:file.type,data:b64}},{text:'Transcribe this business document faithfully. Preserve quantities, dates, names, identifiers, prices and totals. Return plain text only.'}]}],generationConfig:{temperature:0}})})
    if(!rr.ok)throw new Error('Gemini image extraction failed: '+await rr.text())
    const jj=await rr.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>}
    text=jj.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||''
   }
   const doc:SourceDocument={id,name:file.name,mimeType:file.type,size:bytes.length,sha256:hash,kind:inferKind(file.name),createdAt:new Date().toISOString(),textPreview:text.replace(/\s+/g,' ').trim().slice(0,900),pageCount}
   docs.push(doc)

   let claims:ReturnType<typeof extractClaims>=[]
   let method:'gemini'|'rules'='rules'
   let geminiError:string|undefined
   if(geminiConfigured){
    try{
     claims=await geminiClaims(doc,text)
     method='gemini'
    }catch(e){
     geminiError=e instanceof Error?e.message:'Gemini extraction failed'
     claims=extractClaims(doc,text)
    }
   }else{
    geminiError='GEMINI_API_KEY is not configured; deterministic extraction was used.'
    claims=extractClaims(doc,text)
   }
   allClaims.push(...claims)
   analysisDocs.push({documentId:id,name:file.name,method,geminiError})
   await persistUpload(id,file.name,bytes)
  }

  const c=makeCase(String(form.get('caseName')||`Evidence case ${new Date().toLocaleString()}`),docs,allClaims)
  const modes=new Set(analysisDocs.map(x=>x.method))
  c.analysis={mode:modes.size===1?(analysisDocs[0]?.method||'rules'):'mixed',documents:analysisDocs,completedAt:new Date().toISOString()}
  await saveCase(c)
  return NextResponse.json(c)
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Analysis failed'},{status:500})}
}
