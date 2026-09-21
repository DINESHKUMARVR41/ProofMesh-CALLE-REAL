import fs from 'node:fs/promises'; import path from 'node:path'; import type {ProofCase} from './types'
const ROOT=path.join(process.cwd(),'data','proofmesh')
async function ensure(){await fs.mkdir(ROOT,{recursive:true})}
export async function saveCase(c:ProofCase){await ensure();await fs.writeFile(path.join(ROOT,`${c.id}.json`),JSON.stringify(c,null,2),'utf8');return c}
export async function getCase(id:string){await ensure();try{return JSON.parse(await fs.readFile(path.join(ROOT,`${id}.json`),'utf8')) as ProofCase}catch{return null}}
