import {NextResponse} from 'next/server'; import {getCase} from '@/lib/proofmesh/store'
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const{id}=await params;const c=await getCase(id);return c?NextResponse.json(c):NextResponse.json({error:'Case not found'},{status:404})}
