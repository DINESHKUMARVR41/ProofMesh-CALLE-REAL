import {getCase} from '@/lib/proofmesh/store'
import {notFound} from 'next/navigation'
import {ProofCaseClient} from '@/components/proof-case-client'

export default async function CasePage({params}:{params:Promise<{id:string}>}){
  const {id}=await params
  const c=await getCase(id)
  if(!c)return notFound()
  return <ProofCaseClient initialCase={c}/>
}
