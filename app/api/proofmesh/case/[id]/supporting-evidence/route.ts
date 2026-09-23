import {NextResponse} from 'next/server'
import crypto from 'node:crypto'
import {getCase,saveCase} from '@/lib/proofmesh/store'
import {extractClaims,extractText,inferKind,persistUpload,sha256} from '@/lib/proofmesh/extract'
import {geminiClaims} from '@/lib/proofmesh/gemini'
import type {SourceDocument} from '@/lib/proofmesh/types'
export const runtime='nodejs'
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params;const c=await getCase(id);if(!c)return NextResponse.json({error:'Case not found'},{status:404});const form=await req.formData();const files=form.getAll('files').filter(x=>x instanceof File) as File[];if(!files.length)return NextResponse.json({error:'Upload at least one supporting document.'},{status:400});if(files.length>5)return NextResponse.json({error:'Maximum 5 supporting documents at once.'},{status:400});
  const added:SourceDocument[]=[];const claims= [] as ReturnType<typeof extractClaims>;for(const file of files){const bytes=Buffer.from(await file.arrayBuffer());if(bytes.length>15*1024*1024)throw new Error(`${file.name} is larger than 15 MB.`);const hash=await sha256(bytes);if(c.documents.some(d=>d.sha256===hash))continue;const docId=crypto.randomUUID();let text='';let pageCount:number|undefined;const extracted=await extractText(file.name,file.type,bytes);text=extracted.text;pageCount=extracted.pageCount;const doc:SourceDocument={id:docId,name:file.name,mimeType:file.type,size:bytes.length,sha256:hash,kind:inferKind(file.name),createdAt:new Date().toISOString(),textPreview:text.replace(/\s+/g,' ').trim().slice(0,900),pageCount};added.push(doc);const ai=await geminiClaims(doc,text).catch(()=>[]);claims.push(...(ai.length?ai:extractClaims(doc,text)));await persistUpload(docId,file.name,bytes)}
  c.documents.push(...added);c.claims.push(...claims);await saveCase(c);return NextResponse.json({case:c,added:added.length,message:added.length?`${added.length} supporting document${added.length===1?'':'s'} added.`:'Duplicate documents were skipped.'})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Supporting evidence upload failed'},{status:500})}
}
