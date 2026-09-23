import crypto from 'node:crypto'
import type {Claim, Finding, GraphEdge, GraphNode, ProofCase, SourceDocument} from './types'

export function buildGraph(docs: SourceDocument[], claims: Claim[]) {
  const nodes: GraphNode[] = docs.map(d => ({ id:d.id, label:d.name, type:d.kind, sourceId:d.id }))
  const edges: GraphEdge[] = []
  for (const c of claims) {
    // CALL-E statements are evidence claims, but their source is an investigation rather than a document.
    if (c.type === 'supplier_statement') {
      nodes.push({ id:`call-${c.sourceId}`, label:c.sourceName, type:'supplier_statement' })
      edges.push({ source:`call-${c.sourceId}`, target:`claim-${c.id}`, label:'supplier statement' })
    }
    nodes.push({ id:`claim-${c.id}`, label:`${c.predicate}: ${c.value}`, type:'claim', sourceId:c.sourceId })
    if (c.type !== 'supplier_statement') edges.push({ source:c.sourceId, target:`claim-${c.id}`, label:c.predicate })
  }
  const entities = [...new Set(claims.filter(c => c.type === 'entity').map(c => String(c.value)))]
  for (const entity of entities) {
    const id = `entity-${crypto.createHash('sha1').update(entity.toLowerCase()).digest('hex').slice(0,8)}`
    nodes.push({ id, label:entity, type:'entity' })
    for (const c of claims.filter(x => x.type === 'entity' && String(x.value) === entity)) edges.push({ source:id, target:c.sourceId, label:'appears in' })
  }
  return { nodes, edges }
}

function finding(base: Omit<Finding,'id'|'createdAt'>): Finding {
  return { ...base, id:crypto.randomUUID(), createdAt:new Date().toISOString() }
}

export function verify(docs: SourceDocument[], claims: Claim[]): Finding[] {
  const findings: Finding[] = []
  const quantityClaims = claims.filter(c => c.type === 'quantity' && typeof c.value !== 'undefined')
  const byKind = (kind: SourceDocument['kind']) => {
    const doc = docs.find(d => d.kind === kind)
    return doc ? quantityClaims.find(c => c.sourceId === doc.id) : undefined
  }
  const po = byKind('purchase_order')
  const amendmentDocs = docs.filter(d => d.kind === 'purchase_order_amendment')
  const amendmentClaims = quantityClaims.filter(c => amendmentDocs.some(d => d.id === c.sourceId))
  const invoice = byKind('invoice')
  const delivery = byKind('delivery_note')
  const invoiceSupportedByAmendment = !!invoice && amendmentClaims.some(c => Number(c.value) === Number(invoice.value))

  if (po && invoice && Number(po.value) !== Number(invoice.value) && !invoiceSupportedByAmendment) {
    const delta = Number(invoice.value) - Number(po.value)
    findings.push(finding({
      type:'quantity_invoice_po', title:'Invoice quantity differs from purchase order', severity:'critical', status:'unresolved',
      explanation:`The invoice lists ${invoice.value} units while the purchase order lists ${po.value} units. The invoice is ${delta > 0 ? '+' : ''}${delta} units versus the PO baseline.`,
      claimIds:[po.id, invoice.id], missingEvidence:['Approved purchase-order amendment explaining the invoice quantity'], recommendedAction:'Hold payment for the quantity difference until an approved amendment or equivalent supporting evidence is reviewed.'
    }))
  }
  if (po && delivery && Number(po.value) !== Number(delivery.value)) {
    const delta = Number(delivery.value) - Number(po.value)
    findings.push(finding({
      type:'quantity_po_delivery', title:'Delivered quantity differs from purchase order', severity:'critical', status:'unresolved',
      explanation:`The delivery note records ${delivery.value} units while the purchase order lists ${po.value} units. Delivery is ${delta > 0 ? '+' : ''}${delta} units versus the PO baseline.`,
      claimIds:[po.id, delivery.id], missingEvidence:['Approved delivery reconciliation or amendment for the quantity difference'], recommendedAction:'Reconcile delivered quantity against the PO before accepting the invoice quantity.'
    }))
  }
  if (invoice && delivery && Number(invoice.value) !== Number(delivery.value)) {
    const delta = Number(invoice.value) - Number(delivery.value)
    findings.push(finding({
      type:'quantity_invoice_delivery', title:'Invoice quantity differs from delivery evidence', severity:'warning', status:'unresolved',
      explanation:`The invoice lists ${invoice.value} units while the delivery note records ${delivery.value} units, a ${delta > 0 ? '+' : ''}${delta}-unit gap between billing and delivery evidence.`,
      claimIds:[invoice.id, delivery.id], missingEvidence:['Delivery reconciliation or supporting dispatch record'], recommendedAction:'Confirm why the billed quantity differs from the documented delivered quantity.'
    }))
  } else if (quantityClaims.length > 1 && !po && !invoice && !delivery) {
    const values = quantityClaims.map(c => Number(c.value)); const min = Math.min(...values); const max = Math.max(...values)
    if (min !== max) findings.push(finding({type:'quantity_inconsistency', title:'Quantity inconsistency', severity:'critical', status:'unresolved', explanation:`The supplied documents contain different quantities (${quantityClaims.map(c => `${c.sourceName}: ${c.value}`).join(' · ')}). Range: ${max-min} units.`, claimIds:quantityClaims.map(c => c.id), missingEvidence:['Supporting reconciliation for the quantity difference'], recommendedAction:'Review the source documents and request supporting evidence for the discrepancy.'}))
  }

  const entities = claims.filter(c => c.type === 'entity').map(c => String(c.value).trim().toLowerCase())
  if (new Set(entities).size > 1) findings.push(finding({type:'entity_mismatch', title:'Entity name mismatch', severity:'warning', status:'unresolved', explanation:'Documents use different supplier/company names. Human verification is required to establish whether they refer to the same legal entity.', claimIds:claims.filter(c => c.type === 'entity').map(c => c.id), missingEvidence:['Company registration or authoritative legal-entity record'], recommendedAction:'Confirm the legal entity before relying on cross-document evidence.'}))

  const hasInvoice = docs.some(d => d.kind === 'invoice'), hasPO = docs.some(d => d.kind === 'purchase_order'), hasDelivery = docs.some(d => d.kind === 'delivery_note')
  if (hasInvoice && !hasPO) findings.push(finding({type:'missing_evidence', title:'Purchase order missing', severity:'warning', status:'unresolved', explanation:'An invoice was supplied but the purchase order needed for cross-document verification is absent.', claimIds:[], missingEvidence:['Purchase order'], recommendedAction:'Request the purchase order before approving the invoice.'}))
  if (hasInvoice && !hasDelivery) findings.push(finding({type:'missing_evidence', title:'Delivery evidence missing', severity:'warning', status:'unresolved', explanation:'An invoice was supplied but delivery evidence is absent, so delivered quantity cannot be independently reconciled.', claimIds:[], missingEvidence:['Delivery note / dispatch record'], recommendedAction:'Request delivery evidence before relying on the billed quantity.'}))
  return findings
}

export function makeCase(name:string, docs: SourceDocument[], claims: Claim[]): ProofCase {
  const {nodes,edges}=buildGraph(docs,claims); const findings=verify(docs,claims)
  return {id:crypto.randomUUID(),name,status:findings.length?'ready':'resolved',createdAt:new Date().toISOString(),documents:docs,claims,nodes,edges,findings,investigations:[],summary:{totalClaims:claims.length,findings:findings.length,unresolved:findings.filter(f=>f.status==='unresolved'||f.status==='investigating').length,verified:0}}
}
