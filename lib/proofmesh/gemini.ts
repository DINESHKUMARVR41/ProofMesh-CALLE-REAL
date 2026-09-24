import crypto from 'node:crypto'
import type {Claim,ClaimType,SourceDocument} from './types'

type GeminiPart={text?:string}
type GeminiResponse={candidates?:Array<{content?:{parts?:GeminiPart[]}}>}
type RawClaim={type?:unknown;subject?:unknown;predicate?:unknown;value?:unknown;unit?:unknown;confidence?:unknown}
function isRawClaim(x:unknown):x is RawClaim{return typeof x==='object'&&x!==null}
function isClaimType(x:unknown):x is ClaimType{return typeof x==='string'&&['entity','quantity','price','total','date','validity','identifier','text'].includes(x)}
function isValidClaim(x:RawClaim):x is RawClaim&{type:ClaimType;predicate:string;value:unknown}{return isClaimType(x.type)&&typeof x.predicate==='string'&&x.predicate.length>0&&x.value!==undefined}
const MODEL=process.env.GEMINI_MODEL||'gemini-2.5-flash'
export async function geminiClaims(doc:SourceDocument,text:string):Promise<Claim[]>{
 const key=process.env.GEMINI_API_KEY;if(!key)return[]
 const prompt=`You are the extraction layer of ProofMesh. Extract only explicit business-document claims from the supplied text. Do not infer. Return JSON array with objects: type (entity|quantity|price|total|date|validity|identifier|text), subject, predicate, value, unit optional, confidence 0..1. Keep values exact. Document: ${doc.name}\nTEXT:\n${text.slice(0,30000)}`
 const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json'}})})
 if(!r.ok)throw new Error(`Gemini extraction failed: ${await r.text()}`)
 const j=await r.json() as GeminiResponse;const raw=j.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'[]';let arr:unknown[]=[];try{const parsed:unknown=JSON.parse(raw);arr=Array.isArray(parsed)?parsed:[]}catch{arr=[]}
 return arr.filter(isRawClaim).filter(isValidClaim).map(x=>({id:crypto.randomUUID(),sourceId:doc.id,sourceName:doc.name,type:x.type,subject:String(x.subject||'document'),predicate:String(x.predicate),value:typeof x.value==='number'?x.value:String(x.value),unit:x.unit?String(x.unit):undefined,confidence:Math.max(0,Math.min(1,Number(x.confidence??.8))),extractedBy:'gemini' as const}))
}
